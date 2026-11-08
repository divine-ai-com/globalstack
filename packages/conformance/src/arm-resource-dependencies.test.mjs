import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { evaluateArmValue, expandDeploymentTemplate } from '../../azure-control-plane/src/server-support.mjs';

const subscription = '00000000-0000-0000-0000-000000000000';
const group = `/subscriptions/${subscription}/resourceGroups/dependency-check`;
const account = `${group}/providers/Microsoft.Storage/storageAccounts/independentstorage`;
const queue = `${account}/queueServices/default/queues/event-arrivals`;
const topic = `${group}/providers/Microsoft.EventGrid/systemTopics/independent-topic`;
const roleName = '11111111-2222-4333-8444-555555555555';
const role = `${queue}/providers/Microsoft.Authorization/roleAssignments/${roleName}`;
const deployment = `${group}/providers/Microsoft.Resources/deployments/ordering?api-version=2025-04-01`;

async function fixture(t) {
  const store = new ResourceStore();
  store.putResourceGroup(subscription, 'dependency-check', { location: 'westus2' });
  const server = createArmServer({ store });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  async function request(method, path, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
      method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  return { store, request };
}

test('compiled Bicep resolves an identity after creation and retains resource-scoped roles', async t => {
  const { request } = await fixture(t);
  await request('PUT', `${account}?api-version=2023-05-01`, { location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: {} });
  for (let i = 0; i < 6; i++) await request('GET', `${account}?api-version=2023-05-01`);
  const template = JSON.parse(await readFile(new URL('../../../experiments/production-scenarios/evidence/blob-events-c806558/template.json', import.meta.url)));
  // This test covers ARM dependencies and roles, not the unfinished Event Grid delivery path.
  template.resources = template.resources.filter(resource => resource.type !== 'Microsoft.EventGrid/systemTopics/eventSubscriptions').reverse();
  delete template.outputs.eventSubscriptionId;
  template.outputs.principal = { type: 'string', value: `[reference('${topic}', '2025-02-15', 'Full').identity.principalId]` };
  const body = { properties: { mode: 'Incremental', template, parameters: Object.fromEntries(Object.entries({
    accountName: 'independentstorage', topicName: 'independent-topic', roleName, runId: 'independent', location: 'westus2',
  }).map(([key, value]) => [key, { value }])) } };
  const deployed = await request('PUT', deployment, body);
  assert.equal(deployed.status, 201, JSON.stringify(deployed.body));
  const identity = (await request('GET', `${topic}?api-version=2025-02-15`)).body.identity.principalId;
  const created = await request('GET', `${role}?api-version=2022-04-01`);
  assert.equal(created.status, 200);
  assert.equal(created.body.id, role);
  assert.equal(created.body.properties.scope, queue);
  assert.equal(created.body.properties.principalId, identity);
  assert.equal(deployed.body.properties.outputs.principal.value, identity);
  const steps = deployed.body.properties.globalstackDeploymentSteps.map(step => step.id);
  assert.ok(steps.indexOf(role) > steps.indexOf(topic));
  assert.ok(steps.indexOf(role) > steps.indexOf(queue));
  assert.equal((await request('PUT', deployment, body)).status, 201);
  const changed = { properties: { ...created.body.properties, principalId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } };
  const rejected = await request('PUT', `${role}?api-version=2022-04-01`, changed);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, 'RoleAssignmentUpdateNotPermitted');
  assert.equal((await request('GET', `${role}?api-version=2022-04-01`)).body.properties.principalId, identity);
  assert.equal((await request('DELETE', `${role}?api-version=2022-04-01`)).status, 200);
  assert.equal((await request('GET', `${role}?api-version=2022-04-01`)).status, 404);
  assert.equal((await request('DELETE', `${role}?api-version=2022-04-01`)).status, 204);
});

test('explicit dependencies override declaration order and cycles fail before writes', async t => {
  const { request } = await fixture(t);
  const resource = name => ({ type: 'Microsoft.EventGrid/systemTopics', apiVersion: '2025-02-15', name,
    location: 'westus2', properties: { topicType: 'Microsoft.Storage.StorageAccounts', source: account } });
  const first = resource('first'), second = resource('second');
  first.dependsOn = [`${group}/providers/Microsoft.EventGrid/systemTopics/second`];
  const expanded = expandDeploymentTemplate({ template: { resources: [first, second] }, subscriptionId: subscription, resourceGroupName: 'dependency-check' });
  assert.deepEqual(expanded.operations.map(op => op.providerRoute.typePath), ['systemTopics/second', 'systemTopics/first']);
  second.dependsOn = [`${group}/providers/Microsoft.EventGrid/systemTopics/first`];
  const result = await request('PUT', deployment, { properties: { template: { resources: [first, second] } } });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, 'InvalidTemplate');
  assert.deepEqual(result.body.error.details, []);
  assert.equal((await request('GET', `${group}/providers/Microsoft.EventGrid/systemTopics/first?api-version=2025-02-15`)).status, 404);
});

test('resource references reject missing resources and unsafe properties instead of returning expression text', () => {
  const context = { __resourceLookup: id => id === topic ? { properties: { value: 7 }, identity: { principalId: roleName } } : null };
  assert.equal(evaluateArmValue(`[reference('${topic}', '2025-02-15').value]`, context), 7);
  assert.equal(evaluateArmValue(`[concat('id:', reference('${topic}', '2025-02-15', 'Full').identity.principalId)]`, context), `id:${roleName}`);
  for (const property of ['missing', '__proto__', 'constructor']) {
    assert.throws(() => evaluateArmValue(`[reference('${topic}', '2025-02-15', 'Full').${property}]`, context), { code: 'InvalidTemplate' });
  }
  assert.throws(() => evaluateArmValue("[reference('/missing', '2025-02-15', 'Full')]", context), { code: 'ResourceNotFound' });
});

test('a missing output reference produces a structured deployment error', async t => {
  const { request } = await fixture(t);
  const result = await request('PUT', deployment, { properties: { template: { resources: [], outputs: {
    missing: { type: 'string', value: "[reference('/missing', '2025-02-15', 'Full').id]" },
  } } } });
  assert.equal(result.status, 404);
  assert.equal(result.body.error.code, 'ResourceNotFound');
});

test('resource and output loops deploy distinct identities and resolve each output reference', async t => {
  const { request } = await fixture(t);
  const template = { resources: [{
    copy: { name: 'identities', count: "[length(createArray('alpha', 'beta'))]" },
    type: 'Microsoft.ManagedIdentity/userAssignedIdentities', apiVersion: '2023-01-31',
    name: "[format('independent-{0}', createArray('alpha', 'beta')[copyIndex()])]",
    location: 'westus2', tags: { sequence: "[format('{0}', copyIndex('identities', 5))]", numericString: '123' },
  }], outputs: { principals: { type: 'array', copy: { count: 2,
    input: "[reference(resourceId('Microsoft.ManagedIdentity/userAssignedIdentities', format('independent-{0}', createArray('alpha', 'beta')[copyIndex()])), '2023-01-31').principalId]",
  } } } };
  const deployed = await request('PUT', deployment, { properties: { template } });
  assert.equal(deployed.status, 201, JSON.stringify(deployed.body));
  const principals = [];
  for (const [index, name] of ['alpha', 'beta'].entries()) {
    const resource = await request('GET', `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/independent-${name}?api-version=2023-01-31`);
    assert.equal(resource.status, 200);
    assert.equal(resource.body.tags.sequence, String(index + 5));
    assert.equal(resource.body.tags.numericString, '123');
    assert.match(resource.body.properties.principalId, /^[0-9a-f-]{36}$/i);
    principals.push(resource.body.properties.principalId);
  }
  assert.notEqual(principals[0], principals[1]);
  assert.deepEqual(deployed.body.properties.outputs.principals.value, principals);
});

test('copy loops reject invalid counts and unsupported serial execution before writes', async t => {
  const { request } = await fixture(t);
  for (const count of [-1, 801, 1.5, '2']) {
    const response = await request('PUT', deployment, { properties: { template: { resources: [{
      type: 'Microsoft.ManagedIdentity/userAssignedIdentities', apiVersion: '2023-01-31', name: 'must-not-exist',
      location: 'westus2', copy: { name: 'invalid', count },
    }] } } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'InvalidTemplate');
  }
  const empty = expandDeploymentTemplate({ template: { resources: [{ copy: { name: 'empty', count: 0 } }],
    outputs: { empty: { type: 'array', copy: { count: 0, input: '[copyIndex()]' } } } }, subscriptionId: subscription, resourceGroupName: 'dependency-check' });
  assert.deepEqual(empty.operations, []);
  assert.deepEqual(empty.outputs.empty.value, []);
  assert.throws(() => expandDeploymentTemplate({ template: { resources: [{ copy: { name: 'serial', count: 2, mode: 'serial' } }] } }), { code: 'GlobalStackCopyNotImplemented' });
  assert.throws(() => evaluateArmValue('[copyIndex()]', {}), { code: 'InvalidTemplate' });
  assert.equal((await request('GET', `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/must-not-exist?api-version=2023-01-31`)).status, 404);
});
