import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { storageExchange } from '../../../experiments/production-scenarios/storage-http.mjs';

const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/worker-events';
const site = `${group}/providers/Microsoft.Web/sites/event-worker`, fn = `${site}/functions/observeBlob`;
const account = `${group}/providers/Microsoft.Storage/storageAccounts/eventworkerstore`;
const topic = `${group}/providers/Microsoft.EventGrid/systemTopics/document-events`;
const subscription = `${topic}/eventSubscriptions/process-documents`;
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate()) { assert.ok(Date.now() < deadline, 'Expected event observation did not arrive'); await new Promise(resolve => setTimeout(resolve, 10)); }
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'globalstack-events-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const master = randomBytes(32).toString('base64'), eventKey = randomBytes(32).toString('base64');
  const masterKeyFile = join(directory, 'master'); await writeFile(masterKeyFile, master, { mode: 0o600 });
  async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const observed = [], state = { status: 500 };
  const origin = await listen(createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/admin/host/')) {
      assert.equal(req.headers['x-functions-key'], master);
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify(url.pathname.endsWith('/_master') ? { value: master }
        : { keys: url.pathname.endsWith('/systemkeys') ? [{ name: 'eventgrid_extension', value: eventKey }] : [] }));
    }
    assert.equal(req.method, 'POST'); assert.equal(url.pathname, '/runtime/webhooks/eventgrid');
    assert.equal(url.searchParams.get('functionName'), 'observeBlob');
    assert.equal(req.headers['x-functions-key'], eventKey); assert.equal(req.headers['aeg-event-type'], 'Notification');
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    observed.push(JSON.parse(Buffer.concat(chunks)));
    res.writeHead(state.status, state.status === 302 ? { location: `${origin}/must-not-follow` } : {}); res.end();
  }));
  const store = new ResourceStore(), runtime = createEmulatorRuntime({ store, nativeFunctionsWorkers: [{ appResourceId: site, origin, masterKeyFile }] });
  t.after(() => runtime.dispose());
  let now = Date.now(); runtime.storageEventDelivery.now = () => now;
  runtime.storageEventDelivery.schedule = () => 1; runtime.storageEventDelivery.cancel = () => {};
  const arm = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter: runtime.functionsRouter }));
  async function management(method, resource, body, version = '2023-12-01') {
    const res = await fetch(`${arm}${resource}?api-version=${version}`, { method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text(); return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  const put = async (resource, body, version) => { const result = await management('PUT', resource, body, version); assert.ok([200, 201, 202].includes(result.status), JSON.stringify(result)); return result; };
  await put(group, { location: 'westus2' }, '2025-04-01');
  const plan = `${group}/providers/Microsoft.Web/serverfarms/worker-plan`;
  await put(plan, { location: 'westus2', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} });
  await put(site, { location: 'westus2', kind: 'functionapp,linux', properties: { serverFarmId: plan } });
  await put(fn, { properties: { config: { bindings: [{ name: 'event', type: 'eventGridTrigger', direction: 'in' }] } } });
  await put(account, { location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: {} }, '2023-05-01');
  for (let i = 0; i < 6; i++) await management('GET', account, undefined, '2023-05-01');
  await put(topic, { location: 'westus2', properties: { source: account, topicType: 'Microsoft.Storage.StorageAccounts' } }, '2025-02-15');
  const subscriptionBody = { properties: { destination: { endpointType: 'AzureFunction', properties: { resourceId: fn } },
    filter: { includedEventTypes: ['Microsoft.Storage.BlobCreated'], subjectBeginsWith: '/blobServices/default/containers/landing/' }, retryPolicy: { maxDeliveryAttempts: 2, eventTimeToLiveInMinutes: 1 } } };
  await put(subscription, subscriptionBody, '2025-02-15');
  const blobOrigin = await listen(createServer(runtime.storageRouter.blobHandler()));
  const key = runtime.storageRouter.account('eventworkerstore').accountKey;
  const exchange = (method, path, body = '', headers = {}) => storageExchange({ account: 'eventworkerstore', key, origin: blobOrigin, surface: 'blob', method, path, body, headers });
  for (const container of ['landing', 'unrelated']) assert.equal((await exchange('PUT', `/${container}?restype=container`)).status, 201);
  const upload = path => exchange('PUT', path, 'actual uploaded document', { 'x-ms-blob-type': 'BlockBlob', 'x-ms-client-request-id': 'document-correlation' });
  return { runtime, observed, state, upload, management, subscriptionBody, advance: ms => { now += ms; runtime.storageEventDelivery.drain(); } };
}

test('Blob events invoke the bound worker and retry failed delivery with the same event', async t => {
  const f = await fixture(t);
  await f.upload('/unrelated/ignored.txt'); assert.equal(f.observed.length, 0);
  const uploaded = await f.upload('/landing/document.txt'); assert.equal(uploaded.status, 201);
  await until(() => f.runtime.storageEventDelivery.diagnostics.some(item => item.state === 'retrying'));
  assert.equal(f.observed.length, 1);
  const event = f.observed[0][0];
  assert.equal(event.data.eTag, uploaded.headers.etag.replaceAll('"', ''));
  assert.equal(event.data.clientRequestId, 'document-correlation');
  assert.equal(event.subject, '/blobServices/default/containers/landing/blobs/document.txt');
  assert.equal(f.runtime.storageEventDelivery.diagnostics.at(-1).reason, 'NativeEventGridHttp500');
  f.state.status = 200; f.advance(10001);
  await until(() => f.runtime.storageEventDelivery.diagnostics.at(-1)?.state === 'delivered');
  assert.equal(f.observed.length, 2); assert.deepEqual(f.observed[1][0], event);
  assert.equal(f.runtime.storageEventDelivery.pending.size, 0);
  await f.management('DELETE', subscription, undefined, '2025-02-15');
  await f.upload('/landing/disconnected.txt'); assert.equal(f.runtime.storageEventDelivery.pending.size, 0);
  assert.equal(f.observed.length, 2);
});

test('unbound and missing functions are rejected, redirects fail closed, and retries exhaust', async t => {
  const f = await fixture(t);
  const missing = structuredClone(f.subscriptionBody); missing.properties.destination.properties.resourceId = `${site}/functions/missing`;
  assert.equal((await f.management('PUT', subscription, missing, '2025-02-15')).status, 400);
  f.runtime.functionsRouter.nativeWorkers.clear();
  assert.equal((await f.management('PUT', subscription, f.subscriptionBody, '2025-02-15')).status, 501);
  await f.upload('/landing/unavailable.txt');
  await until(() => f.runtime.storageEventDelivery.diagnostics.at(-1)?.state === 'retrying');
  assert.equal(f.runtime.storageEventDelivery.diagnostics.at(-1).reason, 'NativeFunctionDestinationUnavailable');
  f.advance(10001);
  await until(() => f.runtime.storageEventDelivery.diagnostics.at(-1)?.state === 'exhausted');
  assert.equal(f.observed.length, 0);
});

test('redirects never forward the Event Grid system key to another endpoint', async t => {
  const f = await fixture(t); f.state.status = 302;
  await f.upload('/landing/redirect.txt');
  await until(() => f.runtime.storageEventDelivery.diagnostics.at(-1)?.state === 'retrying');
  assert.equal(f.observed.length, 1);
  assert.equal(f.runtime.storageEventDelivery.diagnostics.at(-1).reason, 'NativeEventGridUnavailable');
  f.runtime.dispose();
  assert.equal(f.runtime.storageEventDelivery.pending.size, 0);
  assert.equal(f.runtime.storageEventDelivery.inFlight.size, 0);
});
