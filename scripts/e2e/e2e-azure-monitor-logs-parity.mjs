import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createLogAnalyticsStore } from '../../packages/azure-data-plane/src/log-analytics-store.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-monitor-logs-parity');
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
    const timeoutMs = options.timeoutMs ?? 900000;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124 });
    }, timeoutMs);
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2022-10-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function workspacePath(resourceGroup, workspaceName, apiVersion = '2022-10-01') {
  return providerPath(resourceGroup, 'Microsoft.OperationalInsights', `workspaces/${workspaceName}`, apiVersion);
}

function diagnosticPath(resourceGroup, diagnosticName, apiVersion = '2021-05-01-preview') {
  return providerPath(resourceGroup, 'Microsoft.Insights', `diagnosticSettings/${diagnosticName}`, apiVersion);
}

function workspaceBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: {
      retentionInDays: 30,
      publicNetworkAccessForIngestion: 'Enabled',
      publicNetworkAccessForQuery: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function diagnosticBody(workspaceResourceId, overrides = {}) {
  return {
    properties: {
      workspaceId: workspaceResourceId,
      logs: [
        {
          category: 'AuditEvent',
          enabled: true,
        },
      ],
      metrics: [
        {
          category: 'AllMetrics',
          enabled: true,
        },
      ],
      ...overrides.properties,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody(workspaceName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.OperationalInsights/workspaces',
            apiVersion: '2022-10-01',
            name: workspaceName,
            location: 'eastus',
            properties: {
              retentionInDays: 30,
              publicNetworkAccessForIngestion: 'Enabled',
              publicNetworkAccessForQuery: 'Enabled',
            },
          },
        ],
        outputs: {
          workspaceName: { type: 'string', value: workspaceName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const logStore = createLogAnalyticsStore();
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-logs-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-logs-missing-${suffix}`;
  const workspaceName = `ws-${suffix}`.slice(0, 40);
  const missingWorkspaceName = `missing-${suffix}`.slice(0, 40);
  const diagnosticName = `diag-${suffix}`.slice(0, 40);
  let workspaceResourceId = null;

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      cases.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await withArmServer(async (armPort) => {
    await record('unauthenticated ARM request is rejected', async () => {
      const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}`, undefined, { auth: false });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('malformed bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}`, undefined, {
        auth: false,
        headers: { authorization: 'token globalstack-local-token' },
      });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('wrong bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}`, undefined, {
        headers: { authorization: 'Bearer wrong-globalstack-token' },
      });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription mismatch is rejected', async () => {
      const result = await httpJson(armPort, 'GET', '/subscriptions/11111111-1111-1111-1111-111111111111');
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPathWithoutApiVersion(resourceGroup, 'Microsoft.OperationalInsights', `workspaces/${workspaceName}`),
        workspaceBody(),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workspace create requires an existing resource group', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        workspacePath(missingResourceGroup, workspaceName),
        workspaceBody(),
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
        location: 'eastus',
        tags: { purpose: 'globalstack-monitor-logs-parity', ttl: 'ephemeral' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.name, resourceGroup);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('workspace collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.OperationalInsights', 'workspaces'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('workspace delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', workspacePath(resourceGroup, missingWorkspaceName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('workspace empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', workspacePath(resourceGroup, workspaceName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workspace invalid location is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        workspacePath(resourceGroup, workspaceName),
        workspaceBody({ location: 'globalstack-invalid-location' }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workspace create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', workspacePath(resourceGroup, workspaceName), workspaceBody({
        tags: { workload: 'ai-observability' },
      }));
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.OperationalInsights/workspaces');
      assert.equal(result.body.location, 'eastus');
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.globalstack.capabilityId, 'monitor-logs');
      workspaceResourceId = result.body.id;
      logStore.registerWorkspace({ workspaceName });
      return { status: result.status, resourceId: result.body.id };
    });

    await record('workspace get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', workspacePath(resourceGroup, workspaceName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, workspaceName);
      assert.equal(result.body.tags.workload, 'ai-observability');
      assert.equal(result.body.properties.retentionInDays, 30);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('workspace update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', workspacePath(resourceGroup, workspaceName), workspaceBody({
        tags: { workload: 'robotics-telemetry' },
        properties: { retentionInDays: 60 },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'robotics-telemetry');
      assert.equal(result.body.properties.retentionInDays, 60);
      assert.equal(result.body.globalstack.capabilityId, 'monitor-logs');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('workspace list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.OperationalInsights', 'workspaces'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === workspaceName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('local log store missing workspace query is not found', async () => {
      const result = logStore.query({ workspaceName: missingWorkspaceName, query: 'RobotTelemetry | take 1' });
      assert.equal(result.error.status, 404);
      assert.equal(result.error.code, 'WorkspaceNotFound');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local log store invalid table ingest is rejected', async () => {
      const result = logStore.ingest({ workspaceName, tableName: '1BadTable', records: [{ Message: 'bad' }] });
      assert.equal(result.error.status, 400);
      assert.equal(result.error.code, 'InvalidTableName');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local log store empty ingest is rejected', async () => {
      const result = logStore.ingest({ workspaceName, tableName: 'RobotTelemetry', records: [] });
      assert.equal(result.error.status, 400);
      assert.equal(result.error.code, 'InvalidLogRecords');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local log store ingests telemetry records', async () => {
      const result = logStore.ingest({
        workspaceName,
        tableName: 'RobotTelemetry',
        records: [
          { RobotId: 'robot-1', Severity: 'Info', BatteryPercent: 91 },
          { RobotId: 'robot-2', Severity: 'Warning', BatteryPercent: 18 },
        ],
      });
      assert.equal(result.status, 202);
      assert.equal(result.body.accepted, 2);
      return { status: result.status, accepted: result.body.accepted };
    });

    await record('local log store query take returns rows', async () => {
      const result = logStore.query({ workspaceName, query: 'RobotTelemetry | take 1' });
      assert.equal(result.status, 200);
      assert.equal(result.body.tables[0].rows.length, 1);
      return { status: result.status, rowCount: result.body.tables[0].rows.length };
    });

    await record('local log store query where count returns filtered count', async () => {
      const result = logStore.query({ workspaceName, query: 'RobotTelemetry | where Severity == "Warning" | count' });
      assert.equal(result.status, 200);
      assert.equal(result.body.tables[0].rows[0][0], 1);
      return { status: result.status, count: result.body.tables[0].rows[0][0] };
    });

    await record('local log store repeated query remains stable across repeated reads', async () => {
      const first = logStore.query({ workspaceName, query: 'RobotTelemetry | where Severity == "Warning" | count' });
      const second = logStore.query({ workspaceName, query: 'RobotTelemetry | where Severity == "Warning" | count' });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(second.body.tables[0].rows, first.body.tables[0].rows);
      return { status: second.status, count: second.body.tables[0].rows[0][0] };
    });

    await record('local log store unsupported KQL is rejected', async () => {
      const result = logStore.query({ workspaceName, query: 'RobotTelemetry | join kind=inner Other on RobotId' });
      assert.equal(result.error.status, 400);
      assert.equal(result.error.code, 'UnsupportedKqlOperator');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('workspace unsupported shared keys action fails closed', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.OperationalInsights', `workspaces/${workspaceName}/sharedKeys/action`),
        {},
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'GlobalStackRouteNotImplemented');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workspace unsupported search action fails closed', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.OperationalInsights', `workspaces/${workspaceName}/search`),
        { query: 'Heartbeat | take 1' },
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'GlobalStackRouteNotImplemented');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('diagnostic setting create succeeds for resource group scope', async () => {
      const result = await httpJson(armPort, 'PUT', diagnosticPath(resourceGroup, diagnosticName), diagnosticBody(workspaceResourceId));
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Insights/diagnosticSettings');
      assert.equal(result.body.name, diagnosticName);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('diagnostic setting empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', diagnosticPath(resourceGroup, diagnosticName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('diagnostic setting get succeeds for resource group scope', async () => {
      const result = await httpJson(armPort, 'GET', diagnosticPath(resourceGroup, diagnosticName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, diagnosticName);
      assert.equal(result.body.properties.workspaceId, workspaceResourceId);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('diagnostic setting list includes created resource group setting', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Insights', 'diagnosticSettings', '2021-05-01-preview'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === diagnosticName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('diagnostic setting delete succeeds for resource group scope', async () => {
      const result = await httpJson(armPort, 'DELETE', diagnosticPath(resourceGroup, diagnosticName));
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Deleted');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('ARM template deployment can create workspace', async () => {
      const deploymentName = `logs-deploy-${suffix}`;
      const deploymentWorkspace = `wsd-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentWorkspace),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/workspaces/${deploymentWorkspace}`)));
      return { status: result.status, deploymentName };
    });

    await record('workspace delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', workspacePath(resourceGroup, workspaceName));
      assert.equal(result.status, 200);
      logStore.unregisterWorkspace({ workspaceName });
      return { status: result.status };
    });

    await record('local log store query after workspace delete is not found', async () => {
      const result = logStore.query({ workspaceName, query: 'RobotTelemetry | count' });
      assert.equal(result.error.status, 404);
      assert.equal(result.error.code, 'WorkspaceNotFound');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('workspace get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', workspacePath(resourceGroup, workspaceName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workspace list after delete excludes resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.OperationalInsights', 'workspaces'));
      assert.equal(result.status, 200);
      assert.ok(!result.body.value.some(item => item.name === workspaceName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('workspace delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', workspacePath(resourceGroup, workspaceName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('resource group delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', resourceGroupPath(resourceGroup));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('resource group get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    workspaceName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-monitor-logs-parity-local-token',
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
    '# Azure Monitor Logs Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Workspace under test: ${report.controlPlane.workspaceName}`,
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
    lines.push('');
    lines.push('| Platform | Status | Final Stage | Provisioning State |');
    lines.push('|---|---|---|---|');
    for (const item of report.platformMatrix.results) {
      lines.push(`| ${item.platformId} | ${item.ok ? 'pass' : 'fail'} | ${item.finalStage ?? ''} | ${item.provisioningState ?? ''} |`);
    }
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Log Analytics workspace ARM lifecycle, bounded local log ingestion/query behavior, captured diagnostic-setting rejection behavior, unsupported workspace actions failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Azure Monitor Logs as 99%-complete or cloudValidated for full KQL, production ingestion APIs, table schemas, retention enforcement, diagnostic setting fanout, query errors, throttling, RBAC, private link, or exact Azure Monitor data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Monitor Logs workspace ARM lifecycle, bounded local log ingestion/query checks, captured diagnostic-setting rejection, unsupported workspace action fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Monitor Logs cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Monitor Logs parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
