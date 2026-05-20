import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import { createWorkflowRunner } from '../packages/azure-data-plane/src/workflow-runner.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-logic-workflows-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const token = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
const authHeader = `Bearer ${token}`;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124 });
    }, options.timeoutMs ?? 900000);
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ code: 127, error: error.message });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1 });
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function withArmServer(fn) {
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function httpJson(port, method, path, body, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(options.auth === false ? {} : { authorization: authHeader }),
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code ?? result.body?.Code ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function workflowPath(resourceGroup, workflowName, apiVersion = '2019-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}`, apiVersion);
}

function workflowDefinition(overrides = {}) {
  return {
    $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    contentVersion: '1.0.0.0',
    triggers: {
      manual: {
        type: 'Request',
        kind: 'Http',
        inputs: { schema: {} },
      },
    },
    actions: {},
    outputs: {},
    ...overrides,
  };
}

function workflowBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'robotics-orchestration' },
    properties: {
      state: 'Enabled',
      definition: workflowDefinition(),
      parameters: {},
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody(workflowName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Logic/workflows',
            apiVersion: '2019-05-01',
            name: workflowName,
            location: 'eastus',
            properties: workflowBody().properties,
          },
        ],
        outputs: {
          workflowName: { type: 'string', value: workflowName },
        },
      },
    },
  };
}

function runnerErrorCode(result) {
  return result.error?.code ?? null;
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-logic-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-logic-missing-${suffix}`;
  const workflowName = `workflow-${suffix}`.slice(0, 40);
  const missingWorkflowName = `workflow-missing-${suffix}`.slice(0, 40);

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      cases.push({ name, ok: true, durationMs: Date.now() - startedAt, ...detail });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error?.stack ?? String(error) });
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  const workflowRunner = createWorkflowRunner();

  await withArmServer(async (armPort) => {
    await record('unauthenticated ARM request is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { auth: false });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('malformed bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Token bad' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('wrong bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Bearer wrong-token' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription mismatch is rejected', async () => {
      const path = `/subscriptions/99999999-9999-9999-9999-999999999999/resourceGroups/${resourceGroup}?api-version=2021-04-01`;
      const result = await httpJson(armPort, 'GET', path);
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}`), workflowBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workflow create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', workflowPath(missingResourceGroup, workflowName), workflowBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-logic-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('workflow collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Logic', 'workflows', '2019-05-01'));
      assert.equal(result.status, 200);
      assert.equal(result.body.value.length, 0);
      return { status: result.status, count: result.body.value.length };
    });

    await record('workflow delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', workflowPath(resourceGroup, missingWorkflowName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['workflow empty body is rejected', workflowName, {}, 'LocationRequired'],
      ['workflow invalid location is rejected', workflowName, workflowBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['workflow invalid name is rejected', `-bad-${suffix}`, workflowBody(), 'InvalidWorkflowName'],
      ['workflow missing definition is rejected', workflowName, workflowBody({ properties: { definition: undefined } }), 'InvalidWorkflow'],
      ['workflow missing triggers is rejected', workflowName, workflowBody({ properties: { definition: workflowDefinition({ triggers: undefined }) } }), 'InvalidWorkflow'],
      ['workflow missing actions is rejected', workflowName, workflowBody({ properties: { definition: workflowDefinition({ actions: undefined }) } }), 'InvalidWorkflow'],
      ['workflow invalid state is rejected', workflowName, workflowBody({ properties: { state: 'Paused' } }), 'InvalidWorkflowState'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('workflow create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, workflowName), workflowBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.name, workflowName);
      assert.equal(result.body.properties.state, 'Enabled');
      assert.equal(result.body.properties.accessEndpoint, `https://logic.azure.com/workflows/${workflowName}`);
      workflowRunner.registerWorkflow({ workflowName, properties: result.body.properties });
      return { status: result.status };
    });

    await record('local workflow runner missing workflow is not found', async () => {
      const result = workflowRunner.invoke({
        workflowName: missingWorkflowName,
        triggerName: 'manual',
        body: { robotId: 'arm-1' },
      });
      assert.equal(result.error.status, 404);
      assert.equal(runnerErrorCode(result), 'WorkflowNotFound');
      return { status: result.error.status, errorCode: runnerErrorCode(result) };
    });

    await record('local workflow runner missing trigger is not found', async () => {
      const result = workflowRunner.invoke({
        workflowName,
        triggerName: 'missing',
        body: { robotId: 'arm-1' },
      });
      assert.equal(result.error.status, 404);
      assert.equal(runnerErrorCode(result), 'TriggerNotFound');
      return { status: result.error.status, errorCode: runnerErrorCode(result) };
    });

    await record('local workflow runner request trigger succeeds', async () => {
      const result = workflowRunner.invoke({
        workflowName,
        triggerName: 'manual',
        body: { robotId: 'arm-1', task: 'calibrate' },
      });
      assert.equal(result.status, 202);
      assert.equal(result.body.status, 'Succeeded');
      assert.deepEqual(result.body.input, { robotId: 'arm-1', task: 'calibrate' });
      const run = workflowRunner.getRun({ workflowName, runId: result.body.id });
      assert.equal(run.status, 200);
      assert.equal(run.body.status, 'Succeeded');
      return { status: result.status, runId: result.body.id };
    });

    await record('workflow get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', workflowPath(resourceGroup, workflowName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.properties.state, 'Enabled');
      return { status: result.status };
    });

    await record('workflow update can disable workflow', async () => {
      const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, workflowName), workflowBody({ properties: { state: 'Disabled' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.state, 'Disabled');
      workflowRunner.registerWorkflow({ workflowName, properties: result.body.properties });
      return { status: result.status };
    });

    await record('local workflow runner disabled workflow is rejected', async () => {
      const result = workflowRunner.invoke({
        workflowName,
        triggerName: 'manual',
        body: { robotId: 'arm-1' },
      });
      assert.equal(result.error.status, 409);
      assert.equal(runnerErrorCode(result), 'WorkflowDisabled');
      return { status: result.error.status, errorCode: runnerErrorCode(result) };
    });

    await record('workflow list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Logic', 'workflows', '2019-05-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === workflowName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('unsupported workflow trigger route fails closed', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}/triggers/manual/run`, '2019-05-01'), {});
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('unsupported workflow versions route fails closed', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}/versions`, '2019-05-01'));
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create workflow resource', async () => {
      const deploymentName = `logic-deploy-${suffix}`;
      const deploymentWorkflow = `workflow-deploy-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentWorkflow),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/workflows/${deploymentWorkflow}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('workflow delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', workflowPath(resourceGroup, workflowName));
      assert.equal(result.status, 200);
      workflowRunner.unregisterWorkflow(workflowName);
      return { status: result.status };
    });

    await record('workflow get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', workflowPath(resourceGroup, workflowName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workflow delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', workflowPath(resourceGroup, workflowName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    workflowName,
    cases,
  };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return {
      ok: true,
      skipped: true,
      reason: '--skip-platforms was provided',
      expectedPlatforms: azurePlatforms.length,
      results: [],
    };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-logic-parity-local-token',
    PROVIDER: 'GlobalStack',
    CLOUD_PROVIDER: 'GlobalStack',
  };
  const result = await run('npm', ['run', 'smoke:platform-runners'], { env, timeoutMs: 1800000 });
  const resultsPath = join(root, 'dist', 'platform-lifecycle-smoke-results.json');
  const summary = await readJson(resultsPath).catch(() => ({ generatedAt: null, results: [] }));
  const failed = (summary.results ?? []).filter(item => !item.ok);
  return {
    ok: result.code === 0 && failed.length === 0 && (summary.results ?? []).length === azurePlatforms.length,
    skipped: false,
    exitCode: result.code,
    expectedPlatforms: azurePlatforms.length,
    passedCount: (summary.results ?? []).length - failed.length,
    failedCount: failed.length,
    resultsPath,
    results: summary.results ?? [],
  };
}

function markdown(report) {
  const lines = [
    '# Azure Logic Workflows Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Workflow under test: ${report.controlPlane.workflowName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Platform Matrix');
  lines.push('');
  if (report.platformMatrix.skipped) {
    lines.push(`- Skipped: ${report.platformMatrix.reason}`);
  } else {
    lines.push(`- Passed: ${report.platformMatrix.passedCount}/${report.platformMatrix.expectedPlatforms}`);
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Azure Logic Apps workflow ARM lifecycle, definition validation, local request-trigger runner success and failure behavior, unsupported workflow route fail-closed behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Logic Apps as 99%-complete or cloudValidated for connector runtime behavior, Azure-hosted trigger execution, retries, full run history, long-running orchestration, RBAC, private link, throttling, or exact Azure workflow data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Logic Apps workflow ARM lifecycle, definition validation, local request-trigger runner checks, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Logic Apps cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Logic Workflows parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
