import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

const subscriptionPath = '/subscriptions/00000000-0000-0000-0000-000000000000';

function httpJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        authorization: 'Bearer globalstack-local-token',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        let parsed = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // keep text
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withServer(fn) {
  const server = createArmServer({ persist: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('storage account child lifecycle requires parent and supports create/get/list/delete', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-life?api-version=2021-04-01`, { location: 'eastus' });

    const childBeforeParent = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None' } },
    );
    assert.equal(childBeforeParent.status, 404);
    assert.equal(childBeforeParent.body.error.code, 'ParentResourceNotFound');

    const parent = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore?api-version=2023-01-01`,
      { location: 'eastus', sku: { name: 'Standard_LRS' }, kind: 'StorageV2', properties: { allowBlobPublicAccess: false } },
    );
    assert.equal(parent.status, 202);

    const childBeforeParentReady = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None' } },
    );
    assert.equal(childBeforeParentReady.status, 409);
    assert.equal(childBeforeParentReady.body.error.code, 'StorageAccountIsNotProvisioned');

    const parentReads = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      parentReads.push(await httpJson(
        port,
        'GET',
        `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore?api-version=2023-01-01`,
      ));
    }
    assert.equal(parentReads.at(-1).body.properties.provisioningState, 'Succeeded');

    const child = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None' } },
    );
    assert.equal(child.status, 201);
    assert.equal(child.body.type, 'Microsoft.Storage/storageAccounts/blobServices/containers');

    const idempotent = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None', metadata: { owner: 'tests' } } },
    );
    assert.equal(idempotent.status, 200);
    assert.equal(idempotent.body.properties.metadata.owner, 'tests');

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.name, 'lifestore/default/raw');

    const list = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers?api-version=2023-01-01`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);
    assert.equal(list.body.value[0].name, 'lifestore/default/raw');

    const del = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
    );
    assert.equal(del.status, 200);

    const getAfterDelete = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
    );
    assert.equal(getAfterDelete.status, 404);
    assert.equal(getAfterDelete.body.error.code, 'ContainerNotFound');
  });
});

test('event hubs namespace lifecycle supports child list and delete', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-events?api-version=2021-04-01`, { location: 'eastus' });
    const ns = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub?api-version=2024-01-01`,
      { location: 'eastus', sku: { name: 'Standard', tier: 'Standard', capacity: 1 }, properties: {} },
    );
    assert.equal(ns.status, 201);

    const hub = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs/telemetry?api-version=2024-01-01`,
      { properties: { partitionCount: 2, messageRetentionInDays: 1 } },
    );
    assert.equal(hub.status, 201);

    const list = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs?api-version=2024-01-01`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);

    const del = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs/telemetry?api-version=2024-01-01`,
    );
    assert.equal(del.status, 200);
    const listAfterDelete = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs?api-version=2024-01-01`,
    );
    assert.equal(listAfterDelete.status, 200);
    assert.equal(listAfterDelete.body.value.length, 0);
  });
});
