import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';

const subscriptionId = '00000000-0000-0000-0000-000000000000';
const groupName = 'history-check';
const group = `/subscriptions/${subscriptionId}/resourceGroups/${groupName}`;
const account = `${group}/providers/Microsoft.Storage/storageAccounts/historystorage`;
const deployment = `${group}/providers/Microsoft.Resources/deployments/retained-failure`;

async function fixture(t) {
  const store = new ResourceStore();
  store.putResourceGroup(subscriptionId, groupName, { location: 'westus2' });
  const server = createArmServer({ store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  async function request(method, path, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}?api-version=2025-04-01`, {
      method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  return { request, store };
}

test('failed Event Grid deployments retain successful and failed operations and accept corrected retries', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('PUT', account, { location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: {} })).status, 202);
  for (let i = 0; i < 6; i++) await request('GET', account);
  const template = JSON.parse(await readFile(new URL('../../../experiments/production-scenarios/evidence/blob-events-fc6c225/template.json', import.meta.url)));
  const parameters = Object.fromEntries(Object.entries({ accountName: 'historystorage', topicName: 'history-topic',
    roleName: '11111111-2222-4333-8444-555555555555', runId: 'history', location: 'westus2',
  }).map(([key, value]) => [key, { value }]));
  const missingRole = structuredClone(template);
  missingRole.resources = missingRole.resources.filter(resource => resource.type !== 'Microsoft.Authorization/roleAssignments');
  const child = missingRole.resources.find(resource => resource.type.endsWith('/eventSubscriptions'));
  child.dependsOn = child.dependsOn.filter(value => !value.includes('roleAssignments'));
  const failed = await request('PUT', deployment, { properties: { template: missingRole, parameters } });
  assert.equal(failed.status, 409, JSON.stringify(failed.body));
  assert.equal(failed.body.error.code, 'Managed Identity Authorization Error');
  const history = await request('GET', deployment);
  assert.equal(history.body.properties.provisioningState, 'Failed');
  assert.deepEqual(history.body.properties.error, failed.body.error);
  const records = (await request('GET', `${deployment}/operations`)).body.value;
  assert.equal(records.length, 3);
  assert.deepEqual(records.map(record => record.properties.provisioningState), ['Succeeded', 'Succeeded', 'Failed']);
  const rejected = records.at(-1);
  assert.equal(rejected.properties.statusCode, 'Conflict');
  assert.equal(rejected.properties.targetResource.resourceType, 'Microsoft.EventGrid/systemTopics/eventSubscriptions');
  assert.equal(rejected.properties.targetResource.resourceName, 'history-topic/blob-arrivals');
  assert.deepEqual(rejected.properties.statusMessage.error, failed.body.error);
  assert.equal((await request('GET', rejected.properties.targetResource.id)).status, 404);
  for (const record of records) assert.deepEqual((await request('GET', record.id)).body, record);
  assert.equal((await request('GET', `${deployment}/operations/unknown`)).status, 404);
  assert.ok((await request('GET', `${deployment}/operations/unknown/extra`)).status >= 400);
  assert.equal((await request('GET', `${deployment}-missing/operations`)).status, 404);

  const retry = await request('PUT', deployment, { properties: { template, parameters } });
  assert.equal(retry.status, 201, JSON.stringify(retry.body));
  assert.equal(retry.body.properties.provisioningState, 'Succeeded');
  const retriedRecords = (await request('GET', `${deployment}/operations`)).body.value;
  assert.equal(retriedRecords.length, 4);
  assert.ok(retriedRecords.every(record => record.properties.provisioningState === 'Succeeded'));
  const role = retriedRecords.find(record => record.properties.targetResource.resourceType === 'Microsoft.Authorization/roleAssignments');
  assert.equal(role.properties.targetResource.resourceName, parameters.roleName.value);
  assert.equal((await request('GET', rejected.id)).status, 404);
  assert.equal((await request('DELETE', deployment)).status, 202);
  assert.equal((await request('GET', `${deployment}/operations`)).status, 404);
  assert.equal((await request('GET', account)).status, 200, 'history deletion must preserve deployed resources');
});

test('output evaluation failure retains created resources and subscription deployment history', async t => {
  const { request, store } = await fixture(t);
  const route = `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/subscription-history`;
  const template = { resources: [{ type: 'Microsoft.Resources/resourceGroups', apiVersion: '2022-09-01', name: 'created-group', location: 'westus2' }],
    outputs: { broken: { type: 'string', value: "[reference('/missing', '2025-04-01', 'Full').id]" } } };
  assert.equal((await request('PUT', route, { location: 'westus2', properties: { template } })).status, 404);
  assert.equal((await request('GET', route)).body.properties.provisioningState, 'Failed');
  const records = (await request('GET', `${route}/operations`)).body.value;
  assert.equal(records.length, 1);
  assert.equal(records[0].properties.targetResource.resourceType, 'Microsoft.Resources/resourceGroups');
  assert.equal(records[0].properties.targetResource.resourceName, 'created-group');
  assert.ok(store.getResourceGroup(subscriptionId, 'created-group'));
  assert.equal((await request('DELETE', route)).status, 202);
  assert.equal((await request('GET', `${route}/operations`)).status, 404);
});

test('deferred provider failures cannot become successful deployment history', async t => {
  const { request } = await fixture(t);
  const resource = { type: 'Microsoft.ContainerService/managedClusters', apiVersion: '2024-10-01', name: 'bad-cluster',
    location: 'westus2', identity: { type: 'SystemAssigned' }, properties: { servicePrincipalProfile: { clientId: 'msi' }, dnsPrefix: 'history', agentPoolProfiles: [{ name: 'agentpool', count: 1, vmSize: 'Standard_DS2_v2', mode: 'System' }], networkProfile: { networkPlugin: 'invalid' } } };
  const result = await request('PUT', deployment, { properties: { template: { resources: [resource] } } });
  assert.equal(result.status, 409, JSON.stringify(result.body));
  assert.equal(result.body.error.code, 'InvalidParameter');
  assert.equal((await request('GET', deployment)).body.properties.provisioningState, 'Failed');
  const records = (await request('GET', `${deployment}/operations`)).body.value;
  assert.equal(records.length, 1);
  assert.equal(records[0].properties.provisioningState, 'Failed');
  assert.equal((await request('GET', records[0].properties.targetResource.id)).body.properties.provisioningState, 'Failed');
});

test('resource group deletion clears deployment operations and store reads are isolated copies', async t => {
  const { request, store } = await fixture(t);
  const template = { resources: [{ type: 'Microsoft.EventGrid/systemTopics', apiVersion: '2025-02-15', name: 'retained-topic',
    location: 'westus2', properties: { topicType: 'Microsoft.Storage.StorageAccounts', source: account } }] };
  assert.equal((await request('PUT', deployment, { properties: { template } })).status, 201);
  const route = { subscriptionId, resourceGroupName: groupName, deploymentName: 'retained-failure' };
  const records = store.listDeploymentOperations(route);
  assert.equal(records.length, 1);
  records[0].properties.provisioningState = 'corrupted';
  assert.equal(store.listDeploymentOperations(route)[0].properties.provisioningState, 'Succeeded');
  store.deleteResourceGroup(subscriptionId, groupName);
  assert.deepEqual(store.listDeploymentOperations(route), []);
  assert.equal((await request('GET', `${deployment}/operations`)).status, 404);
});


test('unwrapped provider errors retain failed history instead of reporting success', async t => {
  const { request } = await fixture(t);
  const resource = { type: 'Microsoft.ContainerService/managedClusters', apiVersion: '2024-10-01', name: 'missing-identity',
    location: 'westus2', properties: {} };
  const result = await request('PUT', deployment, { properties: { template: { resources: [resource] } } });
  assert.equal(result.status, 400);
  assert.equal(result.body.code, 'InvalidParameter');
  const history = (await request('GET', deployment)).body;
  assert.equal(history.properties.provisioningState, 'Failed');
  assert.deepEqual(history.properties.error, result.body);
  const records = (await request('GET', `${deployment}/operations`)).body.value;
  assert.equal(records[0].properties.provisioningState, 'Failed');
  assert.deepEqual(records[0].properties.statusMessage.error, result.body);
});

test('deployment output type casing matches retained Azure responses on create and read', async t => {
  const capture = JSON.parse(await readFile(new URL('../../../experiments/production-scenarios/evidence/document-foundation-after-53b8218/result.json', import.meta.url)));
  const outputs = capture.exchanges.find(item => item.target === 'azure' && item.command)?.body.properties.outputs;
  assert.ok(outputs);
  const { request } = await fixture(t);
  const result = await request('PUT', deployment, { properties: { template: { resources: [], outputs: {
    text: { type: 'string', value: 'independent-output' },
    items: { type: 'array', value: ['first', 'second'] },
  } } } });
  assert.equal(result.status, 201);
  for (const response of [result, await request('GET', deployment)]) {
    assert.equal(response.body.properties.outputs.text.type, outputs.networkId.type);
    assert.equal(response.body.properties.outputs.items.type, outputs.workloadIdentities.type);
    assert.equal(response.body.properties.outputs.text.value, 'independent-output');
    assert.deepEqual(response.body.properties.outputs.items.value, ['first', 'second']);
  }
});
