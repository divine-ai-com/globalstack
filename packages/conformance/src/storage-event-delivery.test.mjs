import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { storageExchange } from '../../../experiments/production-scenarios/storage-http.mjs';
import { queueEvents } from '../../../experiments/production-scenarios/blob-event-component.mjs';

const sub = '00000000-0000-0000-0000-000000000000';
const group = `/subscriptions/${sub}/resourceGroups/independent-events`;
const accountName = 'independentfeedstore';
const account = `${group}/providers/Microsoft.Storage/storageAccounts/${accountName}`;
const topic = `${group}/providers/Microsoft.EventGrid/systemTopics/independent-events`;
const subscription = `${topic}/eventSubscriptions/blob-arrivals`;
const roleName = '11111111-2222-4333-8444-555555555555';
const role = `${account}/providers/Microsoft.Authorization/roleAssignments/${roleName}`;
const evidence = new URL('../../../experiments/production-scenarios/evidence/blob-events-fc6c225/', import.meta.url);

async function fixture(t) {
  const store = new ResourceStore(), runtime = createEmulatorRuntime({ store }), servers = [];
  let now = Date.now();
  runtime.storageEventDelivery.now = () => now;
  runtime.storageEventDelivery.schedule = () => 1;
  runtime.storageEventDelivery.cancel = () => {};
  async function listen(server) {
    servers.push(server); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${server.address().port}`;
  }
  t.after(async () => { for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await runtime.dispose(); });
  const arm = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource }));
  const origins = { blob: await listen(createServer(runtime.storageRouter.blobHandler())), queue: await listen(createServer(runtime.storageRouter.queueHandler())) };
  async function request(method, path, body) {
    const response = await fetch(arm + path, { method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  assert.equal((await request('PUT', `${group}?api-version=2025-04-01`, { location: 'westus2' })).status, 201);
  const accountBody = { location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: {
    publicNetworkAccess: 'Enabled', networkAcls: { defaultAction: 'Deny', bypass: 'AzureServices' },
  } };
  await request('PUT', `${account}?api-version=2023-05-01`, accountBody);
  for (let i = 0; i < 6; i++) await request('GET', `${account}?api-version=2023-05-01`);
  const template = JSON.parse(await readFile(new URL('template.json', evidence)));
  const deploymentBody = { properties: { mode: 'Incremental', template, parameters: Object.fromEntries(Object.entries({
    accountName, topicName: 'independent-events', roleName, runId: 'unrelated', location: 'westus2',
  }).map(([key, value]) => [key, { value }])) } };
  const deployed = await request('PUT', `${group}/providers/Microsoft.Resources/deployments/events?api-version=2025-04-01`, deploymentBody);
  assert.equal(deployed.status, 201, JSON.stringify(deployed.body));
  const key = runtime.storageRouter.account(accountName).accountKey;
  const exchange = (surface, method, path, body, headers) => storageExchange({ account: accountName, key, surface, origin: origins[surface], method, path, body, headers });
  for (const name of ['event-landing', 'other']) assert.equal((await exchange('blob', 'PUT', `/${name}?restype=container`)).status, 201);
  const upload = (path, body = 'independent bytes', headers = {}) => exchange('blob', 'PUT', path, body, { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'text/plain', ...headers });
  const events = async () => queueEvents((await exchange('queue', 'GET', '/event-arrivals/messages?peekonly=true&numofmessages=32')).body);
  return { store, runtime, request, exchange, upload, events, accountBody, advance: ms => { now += ms; runtime.storageEventDelivery.drain(); } };
}

test('real Blob writes traverse the captured Bicep wiring into Storage Queue', async t => {
  const { upload, exchange, events, request } = await fixture(t);
  assert.deepEqual(await events(), []);
  assert.equal((await upload('/other/document.txt')).status, 201);
  assert.deepEqual(await events(), []);
  const created = await upload('/event-landing/tenant/document.txt');
  assert.equal(created.status, 201);
  const [event] = await events();
  const captured = JSON.parse(await readFile(new URL('result.json', evidence))).eventObservations.targets.azure.events[0];
  for (const field of ['eventType', 'dataVersion', 'metadataVersion']) assert.equal(event[field], captured[field]);
  for (const field of ['api', 'contentType', 'blobType', 'accessTier']) assert.equal(event.data[field], captured.data[field]);
  assert.equal(event.topic, account);
  assert.equal(event.subject, '/blobServices/default/containers/event-landing/blobs/tenant/document.txt');
  assert.equal(event.data.eTag, created.headers.etag.replaceAll('"', ''));
  assert.equal(event.data.contentLength, Buffer.byteLength('independent bytes'));
  assert.equal(event.data.url, `https://${accountName}.blob.core.windows.net/event-landing/tenant/document.txt`);
  assert.equal((await exchange('blob', 'PUT', '/event-landing/tenant/document.txt?comp=metadata', '', { 'x-ms-meta-state': 'reviewed' })).status, 200);
  assert.equal((await events()).length, 1, 'Metadata must not create a BlobCreated event');
  assert.equal((await upload('/event-landing/tenant/document.txt', 'overwrite', { 'if-match': 'wrong' })).status, 412);
  assert.equal((await events()).length, 1, 'Rejected writes must not emit events');
  await upload('/event-landing/tenant/document.txt', 'overwrite');
  const updated = (await events())[1];
  assert.notEqual(updated.id, event.id);
  assert.ok(updated.data.sequencer > event.data.sequencer);
  const subscriptionBody = (await request('GET', `${subscription}?api-version=2025-02-15`)).body;
  subscriptionBody.properties.filter.includedEventTypes.push('Microsoft.Storage.BlobDeleted');
  assert.ok([200, 201].includes((await request('PUT', `${subscription}?api-version=2025-02-15`, subscriptionBody)).status));
  assert.equal((await exchange('blob', 'DELETE', '/event-landing/tenant/document.txt')).status, 202);
  assert.equal((await events())[2].eventType, 'Microsoft.Storage.BlobDeleted');
  await request('DELETE', `${subscription}?api-version=2025-02-15`);
  await upload('/event-landing/disconnected.txt');
  assert.equal((await events()).length, 3, 'Removing the subscription must disconnect delivery');
});

test('role revocation blocks real delivery; restoring it retries the original event', async t => {
  const { request, upload, events, runtime, advance } = await fixture(t);
  const original = (await request('GET', `${role}?api-version=2022-04-01`)).body;
  await request('DELETE', `${role}?api-version=2022-04-01`);
  assert.equal((await upload('/event-landing/denied.txt')).status, 201);
  assert.deepEqual(await events(), []);
  assert.equal(runtime.storageEventDelivery.diagnostics.at(-1).reason, 'AuthorizationFailed');
  const eventId = runtime.storageEventDelivery.diagnostics.at(-1).eventId;
  await request('PUT', `${role}?api-version=2022-04-01`, original);
  advance(10000);
  assert.equal((await events())[0].id, eventId);
  assert.equal(runtime.storageEventDelivery.diagnostics.at(-1).attempts, 2);
  assert.equal(runtime.storageEventDelivery.pending.size, 0);
});

test('firewall denial and retry exhaustion do not turn a Blob write into false delivery', async t => {
  const { request, upload, events, runtime, advance, accountBody } = await fixture(t);
  accountBody.properties.networkAcls.bypass = 'None';
  await request('PUT', `${account}?api-version=2023-05-01`, accountBody);
  assert.equal((await upload('/event-landing/isolated.txt')).status, 201);
  assert.deepEqual(await events(), []);
  assert.equal(runtime.storageEventDelivery.diagnostics.at(-1).reason, 'NetworkAccessDenied');
  advance(10000); advance(30000);
  assert.equal(runtime.storageEventDelivery.diagnostics.at(-1).state, 'exhausted');
  assert.equal(runtime.storageEventDelivery.pending.size, 0);
  assert.deepEqual(await events(), []);
});

test('subscription updates reject unsupported features and queue-only setup authorization', async t => {
  const { request, upload, events } = await fixture(t);
  const original = (await request('GET', `${subscription}?api-version=2025-02-15`)).body;
  const unsupported = structuredClone(original);
  unsupported.properties.filter.advancedFilters = [{ operatorType: 'StringContains', key: 'subject', values: ['document'] }];
  assert.equal((await request('PUT', `${subscription}?api-version=2025-02-15`, unsupported)).status, 501);
  const assignment = (await request('GET', `${role}?api-version=2022-04-01`)).body;
  await request('DELETE', `${role}?api-version=2022-04-01`);
  const queueRole = `${account}/queueServices/default/queues/event-arrivals/providers/Microsoft.Authorization/roleAssignments/${roleName}`;
  assert.equal((await request('PUT', `${queueRole}?api-version=2022-04-01`, assignment)).status, 201);
  const rejected = await request('PUT', `${subscription}?api-version=2025-02-15`, original);
  assert.equal(rejected.status, 400);
  assert.equal(rejected.body.error.code, 'Managed Identity Authorization Error');
  // The failed update must preserve the already-created subscription.
  assert.equal((await request('GET', `${subscription}?api-version=2025-02-15`)).body.properties.filter.advancedFilters, undefined);
  await upload('/other/filtered.txt');
  assert.deepEqual(await events(), []);
});

test('Azure success baseline integrity and redaction include encoded event payloads', async () => {
  const index = JSON.parse(await readFile(new URL('index.json', evidence)));
  for (const [file, expected] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(file, evidence));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
    assert.equal(bytes.length, expected.bytes);
  }
  const result = JSON.parse(await readFile(new URL('result.json', evidence)));
  assert.equal(result.eventObservations.targets.azure.deliveryObserved, true);
  assert.equal(result.eventObservations.targets.local.deliveryObserved, false);
  assert.ok(Object.values(result.cleanup).every(value => value === true));
  const delivered = result.exchanges.filter(item => item.phase === 'event-delivery').flatMap(item => queueEvents(item.body));
  assert.ok(delivered.length > 0);
  for (const event of delivered) assert.match(event.topic, /^\/subscriptions\/<subscription>\/resourceGroups\/<group>\//);
});
