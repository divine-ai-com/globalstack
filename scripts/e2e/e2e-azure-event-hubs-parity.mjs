import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEventHubsRouter, createEventHubsRouterServer } from '../../packages/azure-data-plane/src/event-hubs-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-event-hubs-parity');
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

async function withEventHubsRouter(fn) {
  const router = createEventHubsRouter();
  const server = createEventHubsRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port, router);
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2024-01-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function namespaceBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'robotics-telemetry-streaming' },
    sku: { name: 'Standard', tier: 'Standard', capacity: 1, ...(overrides.sku ?? {}) },
    properties: {
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function eventHubBody(overrides = {}) {
  return {
    properties: {
      partitionCount: 2,
      messageRetentionInDays: 1,
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody(namespaceName, eventHubName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.EventHub/namespaces',
            apiVersion: '2024-01-01',
            name: namespaceName,
            location: 'eastus',
            sku: { name: 'Standard', tier: 'Standard', capacity: 1 },
            properties: {},
          },
          {
            type: 'Microsoft.EventHub/namespaces/eventhubs',
            apiVersion: '2024-01-01',
            name: `${namespaceName}/${eventHubName}`,
            properties: { partitionCount: 2, messageRetentionInDays: 1 },
          },
        ],
        outputs: {
          namespaceName: { type: 'string', value: namespaceName },
          eventHubName: { type: 'string', value: eventHubName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-eventhubs-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-eventhubs-missing-${suffix}`;
  const namespaceName = `ehns${suffix}`.slice(0, 50);
  const missingNamespaceName = `ehmissing${suffix}`.slice(0, 50);
  const eventHubName = `telemetry-${suffix}`;
  const namespaceBase = `namespaces/${namespaceName}`;
  const missingNamespaceBase = `namespaces/${missingNamespaceName}`;
  const eventHubPath = `${namespaceBase}/eventhubs/${eventHubName}`;

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

  await withEventHubsRouter(async (eventHubsPort, eventHubsRouter) => {
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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.EventHub', namespaceBase), namespaceBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(missingResourceGroup, 'Microsoft.EventHub', namespaceBase), namespaceBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane unknown namespace is not found', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}`);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'NamespaceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-event-hubs-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('namespace collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', 'namespaces'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('namespace delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.EventHub', missingNamespaceBase));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('event hub create before namespace reports missing parent', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventHub', eventHubPath), eventHubBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('event hub list before namespace reports missing parent', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', `${namespaceBase}/eventhubs`));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['namespace empty body is rejected', namespaceBase, {}, 'LocationRequired'],
      ['namespace invalid location is rejected', namespaceBase, namespaceBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['namespace invalid name is rejected', 'namespaces/1bad', namespaceBody(), 'BadRequest'],
      ['namespace invalid sku is rejected', namespaceBase, namespaceBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } }), 'ValidateResourceInfoFailedWithInvalidSkuName'],
      ['namespace invalid capacity is rejected', namespaceBase, namespaceBody({ sku: { capacity: 0 } }), 'BadRequest'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventHub', pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('namespace create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventHub', namespaceBase), namespaceBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.serviceBusEndpoint, `https://${namespaceName}.servicebus.windows.net:443/`);
      assert.equal(result.body.properties.status, 'Active');
      assert.equal(result.body.globalstack.capabilityId, 'event-hubs-streams');
      eventHubsRouter.registerNamespace({
        namespaceName,
        serviceBusEndpoint: result.body.properties.serviceBusEndpoint,
      });
      return { status: result.status, endpoint: result.body.properties.serviceBusEndpoint };
    });

    await record('local data-plane unknown event hub is not found', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}`);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'EventHubNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', namespaceBase));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status };
    });

    await record('namespace update preserves endpoint and tags', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventHub', namespaceBase), namespaceBody({ tags: { workload: 'ai-mlops-streaming' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'ai-mlops-streaming');
      assert.equal(result.body.properties.serviceBusEndpoint, `https://${namespaceName}.servicebus.windows.net:443/`);
      return { status: result.status };
    });

    await record('namespace list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', 'namespaces'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === namespaceName));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['event hub invalid name is rejected', `${namespaceBase}/eventhubs/bad_`, eventHubBody(), 'BadRequest'],
      ['event hub invalid partition count is rejected', eventHubPath, eventHubBody({ properties: { partitionCount: 0 } }), 'BadRequest'],
      ['event hub invalid retention is rejected', eventHubPath, eventHubBody({ properties: { messageRetentionInDays: 30 } }), 'BadRequest'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventHub', pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('event hub collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', `${namespaceBase}/eventhubs`));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('event hub delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.EventHub', `${namespaceBase}/eventhubs/missing-${suffix}`));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('event hub create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventHub', eventHubPath), eventHubBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.partitionCount, 2);
      assert.deepEqual(result.body.properties.partitionIds, ['0', '1']);
      assert.equal(result.body.globalstack.capabilityId, 'event-hubs-streams');
      eventHubsRouter.registerEventHub({
        namespaceName,
        eventHubName,
        partitionCount: result.body.properties.partitionCount,
        messageRetentionInDays: result.body.properties.messageRetentionInDays,
      });
      return { status: result.status };
    });

    await record('event hub get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', eventHubPath));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.messageRetentionInDays, 1);
      return { status: result.status };
    });

    await record('event hub update can change retention', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventHub', eventHubPath), eventHubBody({ properties: { messageRetentionInDays: 2 } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.messageRetentionInDays, 2);
      eventHubsRouter.registerEventHub({
        namespaceName,
        eventHubName,
        partitionCount: result.body.properties.partitionCount,
        messageRetentionInDays: result.body.properties.messageRetentionInDays,
      });
      return { status: result.status };
    });

    await record('event hub list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', `${namespaceBase}/eventhubs`));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${namespaceName}/${eventHubName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('local data-plane event hub metadata succeeds', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}`);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.partitionIds, ['0', '1']);
      assert.equal(result.body.messageRetentionInDays, 2);
      return { status: result.status, partitionCount: result.body.partitionIds.length };
    });

    await record('local data-plane partitions list succeeds', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/partitions`);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value.map(item => item.partitionId), ['0', '1']);
      return { status: result.status, count: result.body.value.length };
    });

    await record('local data-plane publish missing body is rejected', async () => {
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane publish invalid properties is rejected', async () => {
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        body: { telemetry: 'invalid-properties' },
        properties: ['not-an-object'],
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane batch publish invalid event is rejected', async () => {
      const before = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=0`);
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        events: [
          { body: { telemetry: 'valid' } },
          { properties: { missing: 'body' } },
        ],
      });
      const after = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=0`);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadParameter');
      assert.equal(after.body.value.length, before.body.value.length);
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane publish invalid partition is rejected', async () => {
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        partitionId: '9',
        body: { telemetry: 'bad-partition' },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'PartitionNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane publish to explicit partition succeeds', async () => {
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        partitionId: '1',
        messageId: 'robotics-telemetry-1',
        body: { robotId: 'arm-1', reading: 42 },
        properties: { source: 'robotics' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.partitionId, '1');
      assert.equal(result.body.sequenceNumber, 0);
      return { status: result.status, partitionId: result.body.partitionId, sequenceNumber: result.body.sequenceNumber };
    });

    await record('local data-plane publish with partition key succeeds', async () => {
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        partitionKey: 'device-42',
        body: { deviceId: 'device-42', status: 'ok' },
      });
      assert.equal(result.status, 201);
      assert.ok(['0', '1'].includes(result.body.partitionId));
      assert.equal(result.body.partitionKey, 'device-42');
      return { status: result.status, partitionId: result.body.partitionId, sequenceNumber: result.body.sequenceNumber };
    });

    await record('local data-plane same partition key routes consistently', async () => {
      const first = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        partitionKey: 'drone-fleet-7',
        body: { deviceId: 'drone-fleet-7', sample: 1 },
      });
      const second = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        partitionKey: 'drone-fleet-7',
        body: { deviceId: 'drone-fleet-7', sample: 2 },
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.equal(second.body.partitionId, first.body.partitionId);
      assert.equal(second.body.sequenceNumber, first.body.sequenceNumber + 1);
      return { status: second.status, partitionId: second.body.partitionId, sequenceNumber: second.body.sequenceNumber };
    });

    await record('local data-plane duplicate message ids are accepted', async () => {
      const first = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        partitionId: '1',
        messageId: 'duplicate-event-id',
        body: { sample: 'first' },
      });
      const second = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        partitionId: '1',
        messageId: 'duplicate-event-id',
        body: { sample: 'second' },
      });
      assert.equal(first.status, 201);
      assert.equal(second.status, 201);
      assert.equal(first.body.messageId, second.body.messageId);
      assert.equal(second.body.sequenceNumber, first.body.sequenceNumber + 1);
      return { status: second.status, partitionId: second.body.partitionId, sequenceNumber: second.body.sequenceNumber };
    });

    await record('local data-plane batch publish succeeds', async () => {
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events`, {
        events: [
          { partitionId: '0', messageId: 'batch-event-0', body: { frame: 0 }, properties: { source: 'vision' } },
          { partitionId: '0', messageId: 'batch-event-1', body: { frame: 1 }, properties: { source: 'vision' } },
        ],
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.value.length, 2);
      assert.deepEqual(result.body.value.map(item => item.messageId), ['batch-event-0', 'batch-event-1']);
      assert.equal(result.body.value[1].sequenceNumber, result.body.value[0].sequenceNumber + 1);
      return { status: result.status, count: result.body.value.length };
    });

    await record('local data-plane read from sequence succeeds', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=1&fromSequenceNumber=0`);
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.messageId === 'robotics-telemetry-1'));
      return { status: result.status, count: result.body.value.length };
    });

    await record('local data-plane read from later sequence skips older events', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=1&fromSequenceNumber=2`);
      assert.equal(result.status, 200);
      assert.ok(result.body.value.length > 0);
      assert.ok(result.body.value.every(item => item.sequenceNumber >= 2));
      assert.ok(!result.body.value.some(item => item.messageId === 'robotics-telemetry-1'));
      return { status: result.status, count: result.body.value.length };
    });

    await record('local data-plane read maxEvents limits result set', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=0&fromSequenceNumber=0&maxEvents=1`);
      assert.equal(result.status, 200);
      assert.equal(result.body.value.length, 1);
      return { status: result.status, count: result.body.value.length };
    });

    await record('local data-plane read remains stable across repeated queries', async () => {
      const first = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=1&fromSequenceNumber=0`);
      assert.equal(first.status, 200);
      const second = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=1&fromSequenceNumber=0`);
      assert.equal(second.status, 200);
      assert.deepEqual(second.body.value, first.body.value);
      return { status: second.status, count: second.body.value.length };
    });

    await record('local data-plane read invalid sequence is rejected', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=1&fromSequenceNumber=-1`);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane read invalid maxEvents is rejected', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=0&maxEvents=0`);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane read invalid partition is rejected', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=9`);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'PartitionNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local data-plane unsupported action fails closed', async () => {
      const result = await httpJson(eventHubsPort, 'POST', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/checkpoint`, {});
      assert.equal(result.status, 405);
      assert.equal(errorCode(result), 'MethodNotAllowed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, method, path] of [
      ['unsupported namespace authorization rule action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.EventHub', `${namespaceBase}/authorizationRules/root/listKeys`)],
      ['unsupported event hub consumer group route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', `${eventHubPath}/consumerGroups/$Default`)],
      ['unsupported event hub authorization rule route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', `${eventHubPath}/authorizationRules/root`)],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, method === 'POST' ? {} : undefined);
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create namespace and event hub', async () => {
      const deploymentName = `eventhubs-deploy-${suffix}`;
      const deploymentNamespace = `ehdst${suffix}`.slice(0, 50);
      const deploymentHub = `events-${suffix}`;
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentNamespace, deploymentHub),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/namespaces/${deploymentNamespace}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/eventhubs/${deploymentHub}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('event hub delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.EventHub', eventHubPath));
      assert.equal(result.status, 200);
      eventHubsRouter.unregisterEventHub({ namespaceName, eventHubName });
      return { status: result.status };
    });

    await record('local data-plane read after event hub delete is not found', async () => {
      const result = await httpJson(eventHubsPort, 'GET', `/_globalstack/event-hubs/namespaces/${namespaceName}/eventhubs/${eventHubName}/events?partitionId=1`);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'EventHubNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('event hub get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', eventHubPath));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.EventHub', namespaceBase));
      assert.equal(result.status, 200);
      eventHubsRouter.unregisterNamespace(namespaceName);
      return { status: result.status };
    });

    await record('namespace get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventHub', namespaceBase));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
    });
  });

  const failed = cases.filter(item => !item.ok);
  const dataPlaneCaseNames = new Set([
    'local data-plane unknown namespace is not found',
    'local data-plane unknown event hub is not found',
    'local data-plane event hub metadata succeeds',
    'local data-plane partitions list succeeds',
    'local data-plane publish missing body is rejected',
    'local data-plane publish invalid properties is rejected',
    'local data-plane batch publish invalid event is rejected',
    'local data-plane publish invalid partition is rejected',
    'local data-plane publish to explicit partition succeeds',
    'local data-plane publish with partition key succeeds',
    'local data-plane same partition key routes consistently',
    'local data-plane duplicate message ids are accepted',
    'local data-plane batch publish succeeds',
    'local data-plane read from sequence succeeds',
    'local data-plane read from later sequence skips older events',
    'local data-plane read maxEvents limits result set',
    'local data-plane read remains stable across repeated queries',
    'local data-plane read invalid sequence is rejected',
    'local data-plane read invalid maxEvents is rejected',
    'local data-plane read invalid partition is rejected',
    'local data-plane unsupported action fails closed',
    'local data-plane read after event hub delete is not found',
  ]);
  const dataPlaneCases = cases.filter(item => dataPlaneCaseNames.has(item.name));
  const dataPlaneFailed = dataPlaneCases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    namespaceName,
    eventHubName,
    cases,
    dataPlane: {
      ok: dataPlaneFailed.length === 0,
      total: dataPlaneCases.length,
      failedCount: dataPlaneFailed.length,
      cases: dataPlaneCases,
    },
  };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return { ok: true, skipped: true, reason: '--skip-platforms was provided', expectedPlatforms: azurePlatforms.length, results: [] };
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
    '# Azure Event Hubs Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Namespace under test: ${report.controlPlane.namespaceName}`,
    `- Event hub under test: ${report.controlPlane.eventHubName}`,
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
  lines.push('');
  lines.push('| Case | Status | HTTP | Error Code |');
  lines.push('|---|---|---:|---|');
  for (const item of report.dataPlane.cases) {
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Event Hubs namespace and event hub ARM lifecycle, stricter parameter rejection, local publish/read partition facade behavior, unsupported route fail-closed behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Event Hubs as 99%-complete or cloudValidated for AMQP/Kafka protocol semantics, Azure SDK producer/consumer compatibility, full partition assignment, consumer groups, checkpoints, throughput-unit limits, capture, RBAC, private link, throttling, or exact Azure service runtime behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && controlPlane.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Event Hubs namespace and event hub ARM lifecycle, validation, local publish/read partition facade checks, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Event Hubs cloudValidated claim.',
  controlPlane,
  dataPlane: controlPlane.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Event Hubs parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
