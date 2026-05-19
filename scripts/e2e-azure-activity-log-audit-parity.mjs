import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-activity-log-audit-parity');
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2022-06-15') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function systemTopicPath(resourceGroup, systemTopicName, apiVersion = '2022-06-15') {
  return providerPath(resourceGroup, 'Microsoft.EventGrid', `systemTopics/${systemTopicName}`, apiVersion);
}

function diagnosticPath(resourceGroup, diagnosticName, apiVersion = '2021-05-01-preview') {
  return providerPath(resourceGroup, 'Microsoft.Insights', `diagnosticSettings/${diagnosticName}`, apiVersion);
}

function systemTopicBody(sourceId, overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'audit-log-routing' },
    properties: {
      source: sourceId,
      topicType: 'Microsoft.Resources.ResourceGroups',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function diagnosticBody(workspaceResourceId) {
  return {
    properties: {
      workspaceId: workspaceResourceId,
      logs: [{ category: 'Administrative', enabled: true }],
    },
  };
}

function deploymentBody(systemTopicName, sourceId) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.EventGrid/systemTopics',
            apiVersion: '2022-06-15',
            name: systemTopicName,
            location: 'eastus',
            properties: {
              source: sourceId,
              topicType: 'Microsoft.Resources.ResourceGroups',
            },
          },
        ],
        outputs: {
          systemTopicName: { type: 'string', value: systemTopicName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-audit-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-audit-missing-${suffix}`;
  const systemTopicName = `audit-${suffix}`.slice(0, 50);
  const missingSystemTopicName = `missing-${suffix}`;
  const diagnosticName = `diag-${suffix}`;
  const sourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`;
  const workspaceResourceId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.OperationalInsights/workspaces/ws-${suffix}`;

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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.EventGrid', `systemTopics/${systemTopicName}`), systemTopicBody(sourceId));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('system topic create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', systemTopicPath(missingResourceGroup, systemTopicName), systemTopicBody(sourceId));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-activity-log-audit-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('system topic collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventGrid', 'systemTopics'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('system topic delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', systemTopicPath(resourceGroup, missingSystemTopicName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    for (const [name, topicName, body, expectedCode] of [
      ['system topic empty body is rejected', systemTopicName, {}, 'LocationRequired'],
      ['system topic invalid location is rejected', systemTopicName, systemTopicBody(sourceId, { location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['system topic invalid name is rejected', `bad-${suffix}-`, systemTopicBody(sourceId), 'BadRequest'],
      ['system topic missing source is rejected', systemTopicName, systemTopicBody(sourceId, { properties: { source: undefined } }), 'InvalidRequest'],
      ['system topic missing topic type is rejected', systemTopicName, systemTopicBody(sourceId, { properties: { topicType: undefined } }), 'InvalidRequest'],
      ['system topic invalid topic type is rejected', systemTopicName, systemTopicBody(sourceId, { properties: { topicType: 'GlobalStack.InvalidTopicType' } }), 'InvalidRequest'],
      ['system topic invalid identity shape is rejected', systemTopicName, systemTopicBody(sourceId, { properties: { identity: 'SystemAssigned' } }), 'InvalidRequest'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', systemTopicPath(resourceGroup, topicName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('system topic create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', systemTopicPath(resourceGroup, systemTopicName), systemTopicBody(sourceId));
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.EventGrid/systemTopics');
      assert.equal(result.body.properties.topicType, 'Microsoft.Resources.ResourceGroups');
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('system topic get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', systemTopicPath(resourceGroup, systemTopicName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, systemTopicName);
      assert.equal(result.body.properties.source, sourceId);
      return { status: result.status };
    });

    await record('system topic update can change tags', async () => {
      const result = await httpJson(armPort, 'PUT', systemTopicPath(resourceGroup, systemTopicName), systemTopicBody(sourceId, { tags: { workload: 'audit-log-routing', owner: 'mlops' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.owner, 'mlops');
      return { status: result.status };
    });

    await record('system topic list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventGrid', 'systemTopics'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === systemTopicName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('diagnostic setting create preserves captured unsupported root-scope behavior', async () => {
      const result = await httpJson(armPort, 'PUT', diagnosticPath(resourceGroup, diagnosticName), diagnosticBody(workspaceResourceId));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ResourceTypeNotSupported');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('diagnostic setting empty body is rejected before captured root-scope behavior', async () => {
      const result = await httpJson(armPort, 'PUT', diagnosticPath(resourceGroup, diagnosticName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('diagnostic setting get preserves captured unsupported root-scope behavior', async () => {
      const result = await httpJson(armPort, 'GET', diagnosticPath(resourceGroup, diagnosticName));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ResourceTypeNotSupported');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, method, path] of [
      ['unsupported system topic event subscription route fails closed', 'PUT', providerPath(resourceGroup, 'Microsoft.EventGrid', `systemTopics/${systemTopicName}/eventSubscriptions/sub-${suffix}`)],
      ['unsupported system topic list event subscriptions action fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.EventGrid', `systemTopics/${systemTopicName}/eventSubscriptions`)],
      ['unsupported system topic regenerate key action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.EventGrid', `systemTopics/${systemTopicName}/regenerateKey`)],
      ['unsupported diagnostic setting child route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.Insights', `diagnosticSettings/${diagnosticName}/categories`, '2021-05-01-preview')],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, method === 'POST' || method === 'PUT' ? {} : undefined);
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create system topic', async () => {
      const deploymentName = `audit-deploy-${suffix}`;
      const deploymentSystemTopic = `auditdeploy-${suffix}`.slice(0, 50);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentSystemTopic, sourceId),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/systemTopics/${deploymentSystemTopic}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('system topic delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', systemTopicPath(resourceGroup, systemTopicName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('system topic get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', systemTopicPath(resourceGroup, systemTopicName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return { ok: failed.length === 0, total: cases.length, failedCount: failed.length, resourceGroup, systemTopicName, cases };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return { ok: true, skipped: true, reason: '--skip-platforms was provided', expectedPlatforms: azurePlatforms.length, results: [] };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-activity-log-audit-parity-local-token',
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
    '# Azure Activity Log Audit Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- System topic under test: ${report.controlPlane.systemTopicName}`,
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
  lines.push('This run proves local GlobalStack handling for Azure Event Grid system-topic ARM lifecycle, stricter parameter rejection, diagnostic-setting root-scope rejection captured from existing conformance evidence, unsupported audit child/action routes failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Activity Log, tenant audit retention, diagnostic fanout, Event Grid delivery, RBAC, policy integration, immutable storage, throttling, or exact Azure event schema behavior as cloudValidated.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Activity Log audit system-topic ARM lifecycle, diagnostic-setting captured rejection, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Activity Log or Event Grid delivery cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Activity Log Audit parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
