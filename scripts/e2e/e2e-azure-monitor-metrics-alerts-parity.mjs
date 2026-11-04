import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-monitor-metrics-alerts-parity');
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
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const server = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
    metricStore: runtime.metricStore,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ armPort: port, runtime, store });
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

function actionGroupPath(resourceGroup, actionGroupName, apiVersion = '2023-01-01') {
  return providerPath(resourceGroup, 'Microsoft.Insights', `actionGroups/${actionGroupName}`, apiVersion);
}

function metricAlertPath(resourceGroup, metricAlertName, apiVersion = '2018-03-01') {
  return providerPath(resourceGroup, 'Microsoft.Insights', `metricAlerts/${metricAlertName}`, apiVersion);
}

function actionGroupBody(overrides = {}) {
  return {
    location: 'global',
    tags: { purpose: 'monitor-metrics-alerts-parity' },
    properties: {
      groupShortName: 'gsmma',
      enabled: true,
      emailReceivers: [
        {
          name: 'ops',
          emailAddress: 'ops@example.com',
          useCommonAlertSchema: true,
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function metricAlertBody({ actionGroupId, resourceGroup, overrides = {} }) {
  return {
    location: 'global',
    tags: { workload: 'ai-mlops-observability' },
    properties: {
      description: 'GlobalStack parity smoke metric alert',
      severity: 3,
      enabled: true,
      scopes: [
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`,
      ],
      evaluationFrequency: 'PT1M',
      windowSize: 'PT5M',
      criteria: {
        'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria',
        allOf: [
          {
            name: 'HighCpu',
            metricName: 'Percentage CPU',
            metricNamespace: 'Microsoft.Compute/virtualMachines',
            operator: 'GreaterThan',
            threshold: 80,
            timeAggregation: 'Average',
            criterionType: 'StaticThresholdCriterion',
          },
        ],
      },
      actions: [
        {
          actionGroupId,
          webhookProperties: {
            source: 'globalstack-parity',
          },
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody({ actionGroupName, metricAlertName, resourceGroup }) {
  const actionGroupId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/actionGroups/${actionGroupName}`;
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Insights/actionGroups',
            apiVersion: '2023-01-01',
            name: actionGroupName,
            location: 'global',
            properties: actionGroupBody().properties,
          },
          {
            type: 'Microsoft.Insights/metricAlerts',
            apiVersion: '2018-03-01',
            name: metricAlertName,
            location: 'global',
            properties: metricAlertBody({ actionGroupId, resourceGroup }).properties,
          },
        ],
        outputs: {
          metricAlertName: { type: 'string', value: metricAlertName },
          actionGroupName: { type: 'string', value: actionGroupName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const controlCases = [];
  const dataPlaneCases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-metrics-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-metrics-missing-${suffix}`;
  const actionGroupName = `ag-${suffix}`.slice(0, 40);
  const metricAlertName = `alert-${suffix}`.slice(0, 40);
  const missingActionGroupName = `ag-missing-${suffix}`.slice(0, 40);
  const missingMetricAlertName = `alert-missing-${suffix}`.slice(0, 40);
  let actionGroupId = null;

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      controlCases.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
      console.log(`PASS ${name}`);
    } catch (error) {
      controlCases.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function recordDataPlane(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      dataPlaneCases.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
      console.log(`PASS ${name}`);
    } catch (error) {
      dataPlaneCases.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await withArmServer(async ({ armPort, runtime }) => {
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
        providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Insights', `metricAlerts/${metricAlertName}`),
        metricAlertBody({ actionGroupId: 'local', resourceGroup }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('action group create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', actionGroupPath(missingResourceGroup, actionGroupName), actionGroupBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert create requires an existing resource group', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        metricAlertPath(missingResourceGroup, metricAlertName),
        metricAlertBody({ actionGroupId: 'local', resourceGroup: missingResourceGroup }),
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
        location: 'eastus',
        tags: { purpose: 'globalstack-monitor-metrics-alerts-parity', ttl: 'ephemeral' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.name, resourceGroup);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('action group collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Insights', 'actionGroups', '2023-01-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('metric alert collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Insights', 'metricAlerts', '2018-03-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('action group delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', actionGroupPath(resourceGroup, missingActionGroupName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('metric alert delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', metricAlertPath(resourceGroup, missingMetricAlertName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('action group empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', actionGroupPath(resourceGroup, actionGroupName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', metricAlertPath(resourceGroup, metricAlertName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('action group missing short name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', actionGroupPath(resourceGroup, actionGroupName), actionGroupBody({
        properties: { groupShortName: '' },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('action group invalid enabled type is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', actionGroupPath(resourceGroup, actionGroupName), actionGroupBody({
        properties: { enabled: 'true' },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('action group invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', actionGroupPath(resourceGroup, actionGroupName), actionGroupBody({
        location: 'globalstack-invalid-location',
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert missing severity is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', metricAlertPath(resourceGroup, metricAlertName), metricAlertBody({
        actionGroupId: 'local',
        resourceGroup,
        overrides: { properties: { severity: undefined } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert invalid severity is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', metricAlertPath(resourceGroup, metricAlertName), metricAlertBody({
        actionGroupId: 'local',
        resourceGroup,
        overrides: { properties: { severity: 9 } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert missing scopes is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', metricAlertPath(resourceGroup, metricAlertName), metricAlertBody({
        actionGroupId: 'local',
        resourceGroup,
        overrides: { properties: { scopes: [] } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert missing criteria is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', metricAlertPath(resourceGroup, metricAlertName), metricAlertBody({
        actionGroupId: 'local',
        resourceGroup,
        overrides: { properties: { criteria: {} } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert invalid enabled type is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', metricAlertPath(resourceGroup, metricAlertName), metricAlertBody({
        actionGroupId: 'local',
        resourceGroup,
        overrides: { properties: { enabled: 'true' } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', metricAlertPath(resourceGroup, metricAlertName), metricAlertBody({
        actionGroupId: 'local',
        resourceGroup,
        overrides: { location: 'globalstack-invalid-location' },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('action group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', actionGroupPath(resourceGroup, actionGroupName), actionGroupBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Insights/actionGroups');
      assert.equal(result.body.properties.groupShortName, 'gsmma');
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.globalstack.capabilityId, 'monitor-metrics-alerts');
      actionGroupId = result.body.id;
      return { status: result.status, resourceId: result.body.id };
    });

    await record('action group get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', actionGroupPath(resourceGroup, actionGroupName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, actionGroupName);
      assert.equal(result.body.properties.emailReceivers[0].emailAddress, 'ops@example.com');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('action group update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', actionGroupPath(resourceGroup, actionGroupName), actionGroupBody({
        properties: {
          groupShortName: 'gsops',
          enabled: false,
          emailReceivers: [
            {
              name: 'robotics',
              emailAddress: 'robotics@example.com',
              useCommonAlertSchema: true,
            },
          ],
        },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.groupShortName, 'gsops');
      assert.equal(result.body.properties.enabled, false);
      assert.equal(result.body.properties.emailReceivers[0].name, 'robotics');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('metric alert create succeeds', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        metricAlertPath(resourceGroup, metricAlertName),
        metricAlertBody({ actionGroupId, resourceGroup }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Insights/metricAlerts');
      assert.equal(result.body.properties.severity, 3);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.globalstack.capabilityId, 'monitor-metrics-alerts');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('metric alert get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', metricAlertPath(resourceGroup, metricAlertName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, metricAlertName);
      assert.equal(result.body.properties.actions[0].actionGroupId, actionGroupId);
      assert.equal(result.body.tags.workload, 'ai-mlops-observability');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('local metric alert data-plane evaluator starts resolved before metric ingestion', async () => {
      const state = runtime.metricStore.getAlertState(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/metricAlerts/${metricAlertName}`);
      assert.ok(state);
      assert.equal(state.status, 'Resolved');
      return { status: state.status };
    });

    await recordDataPlane('metric alert status route starts resolved before metric ingestion', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Insights', `metricAlerts/${metricAlertName}/status`, '2018-03-01'),
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.status, 'Resolved');
      return { status: result.status, alertStatus: result.body.properties.status };
    });

    await record('metric alert update preserves metadata', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        metricAlertPath(resourceGroup, metricAlertName),
        metricAlertBody({
          actionGroupId,
          resourceGroup,
          overrides: {
            tags: { workload: 'robotics-fleet-alerting' },
            properties: { severity: 2, windowSize: 'PT10M' },
          },
        }),
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.severity, 2);
      assert.equal(result.body.properties.windowSize, 'PT10M');
      assert.equal(result.body.tags.workload, 'robotics-fleet-alerting');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('local metric alert data-plane evaluator fires after metric ingestion', async () => {
      runtime.metricStore.ingestMetric({
        scope: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`,
        metricNamespace: 'Microsoft.Compute/virtualMachines',
        metricName: 'Percentage CPU',
        value: 95,
        timestamp: '2026-01-01T00:00:00.000Z',
      });
      const state = runtime.metricStore.evaluateAlert(
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/metricAlerts/${metricAlertName}`,
        { now: '2026-01-01T00:01:00.000Z' },
      );
      assert.ok(state);
      assert.equal(state.status, 'Fired');
      assert.equal(state.lastMetricValue, 95);
      return { status: state.status, lastMetricValue: state.lastMetricValue };
    });

    await record('local metric alert data-plane evaluator invokes configured action group on transition', async () => {
      const invocations = runtime.metricStore.listActionInvocations(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/metricAlerts/${metricAlertName}`);
      assert.equal(invocations.length, 1);
      assert.equal(invocations[0].actionGroupId, actionGroupId.toLowerCase());
      return { status: 200, actionGroupName: invocations[0].actionGroupName };
    });

    await recordDataPlane('metric alert status route reflects fired alert state', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Insights', `metricAlerts/${metricAlertName}/status`, '2018-03-01'),
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.status, 'Fired');
      assert.equal(result.body.properties.lastMetricValue, 95);
      return { status: result.status, alertStatus: result.body.properties.status };
    });

    await recordDataPlane('metric query extension route returns ingested metric samples', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/metricAlerts/${metricAlertName}/providers/Microsoft.Insights/metrics?api-version=2018-01-01&metricnames=Percentage%20CPU&metricnamespace=Microsoft.Compute%2FvirtualMachines&timespan=2026-01-01T00:00:00.000Z/2026-01-01T00:10:00.000Z&aggregation=Average`,
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.value[0].name.value, 'Percentage CPU');
      assert.ok(result.body.value[0].timeseries[0].data.some(point => point.average === 95));
      return { status: result.status, sampleCount: result.body.value[0].timeseries[0].data.length };
    });

    await record('local metric alert data-plane evaluator resolves after healthy metric ingestion', async () => {
      runtime.metricStore.ingestMetric({
        scope: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`,
        metricNamespace: 'Microsoft.Compute/virtualMachines',
        metricName: 'Percentage CPU',
        value: 20,
        timestamp: '2026-01-01T00:20:00.000Z',
      });
      const state = runtime.metricStore.evaluateAlert(
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/metricAlerts/${metricAlertName}`,
        { now: '2026-01-01T00:21:00.000Z' },
      );
      assert.ok(state);
      assert.equal(state.status, 'Resolved');
      assert.equal(state.lastMetricValue, 20);
      return { status: state.status, lastMetricValue: state.lastMetricValue };
    });

    await record('local metric alert data-plane evaluator stays resolved across repeated evaluations', async () => {
      const first = runtime.metricStore.evaluateAlert(
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/metricAlerts/${metricAlertName}`,
        { now: '2026-01-01T00:22:00.000Z' },
      );
      const second = runtime.metricStore.evaluateAlert(
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Insights/metricAlerts/${metricAlertName}`,
        { now: '2026-01-01T00:23:00.000Z' },
      );
      assert.equal(first.status, 'Resolved');
      assert.equal(second.status, 'Resolved');
      return { status: second.status, lastMetricValue: second.lastMetricValue };
    });

    await record('action group list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Insights', 'actionGroups', '2023-01-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === actionGroupName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('metric alert list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Insights', 'metricAlerts', '2018-03-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === metricAlertName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('action group unsupported receiver action fails closed', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.Insights', `actionGroups/${actionGroupName}/enableReceiver/action`, '2023-01-01'),
        {},
      );
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create action group and metric alert', async () => {
      const deploymentName = `metrics-deploy-${suffix}`;
      const deploymentActionGroup = `agd-${suffix}`.slice(0, 40);
      const deploymentMetricAlert = `alertd-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({
          actionGroupName: deploymentActionGroup,
          metricAlertName: deploymentMetricAlert,
          resourceGroup,
        }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/actionGroups/${deploymentActionGroup}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/metricAlerts/${deploymentMetricAlert}`)));
      return { status: result.status, deploymentName };
    });

    await record('metric alert delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', metricAlertPath(resourceGroup, metricAlertName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('metric alert get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', metricAlertPath(resourceGroup, metricAlertName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('metric alert list after delete excludes resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Insights', 'metricAlerts', '2018-03-01'));
      assert.equal(result.status, 200);
      assert.ok(!result.body.value.some(item => item.name === metricAlertName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('metric alert delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', metricAlertPath(resourceGroup, metricAlertName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('action group delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', actionGroupPath(resourceGroup, actionGroupName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('action group get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', actionGroupPath(resourceGroup, actionGroupName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('action group list after delete excludes resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Insights', 'actionGroups', '2023-01-01'));
      assert.equal(result.status, 200);
      assert.ok(!result.body.value.some(item => item.name === actionGroupName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('action group delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', actionGroupPath(resourceGroup, actionGroupName));
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

  const failed = controlCases.filter(item => !item.ok);
  const dataPlaneFailed = dataPlaneCases.filter(item => !item.ok);
  return {
    controlPlane: {
      ok: failed.length === 0,
      total: controlCases.length,
      failedCount: failed.length,
      resourceGroup,
      metricAlertName,
      actionGroupName,
      cases: controlCases,
    },
    dataPlane: {
      ok: dataPlaneFailed.length === 0,
      total: dataPlaneCases.length,
      failedCount: dataPlaneFailed.length,
      metricAlertName,
      cases: dataPlaneCases,
    },
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
    '# Azure Monitor Metrics/Alerts Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Action group under test: ${report.controlPlane.actionGroupName}`,
    `- Metric alert under test: ${report.controlPlane.metricAlertName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Data Plane');
  lines.push('');
  lines.push(`- Passed: ${report.dataPlane.total - report.dataPlane.failedCount}/${report.dataPlane.total}`);
  lines.push(`- Metric alert under test: ${report.dataPlane.metricAlertName}`);
  lines.push('');
  lines.push('| Case | Status | HTTP | Error |');
  lines.push('|---|---|---:|---|');
  for (const item of report.dataPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.alertStatus ?? item.error ?? ''} |`);
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Monitor action group and metric alert ARM lifecycle, stricter parameter rejection, bounded local metric ingestion and evaluator state transitions, metric alert status inspection, metric query extension reads, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Azure Monitor Metrics or Alerts as 99%-complete or cloudValidated for full metrics ingestion, metric definitions, action execution, dynamic thresholds, dimensions, common alert schema delivery, throttling, RBAC, private link, or exact Azure Monitor data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const parity = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: parity.controlPlane.ok && parity.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Monitor action group and metric alert ARM lifecycle, bounded metric query and alert status behavior, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local metric alert evaluator, status, and metric-query evidence for the enumerated cases only; not a full Azure Monitor Metrics/Alerts cloudValidated claim.',
  controlPlane: parity.controlPlane,
  dataPlane: parity.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Monitor Metrics/Alerts parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
