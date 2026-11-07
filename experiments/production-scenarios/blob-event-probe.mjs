import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, statfs, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { httpExchange } from './http-exchange.mjs';
import { storageExchange } from './storage-http.mjs';

const out = resolve(process.argv[2] ?? 'reports/production-scenarios/blob-event-probe');
await mkdir(out, { recursive: true, mode: 0o700 });
const space = await statfs(out);
assert.ok(space.bavail * space.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const report = { scope: 'Local synthetic Blob-to-Event-Grid-to-Storage-Queue diagnostic. No Azure capture or full application pass.',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(), exchanges: [], receivedEvents: [], cleanup: false };
const store = new ResourceStore(), runtime = createEmulatorRuntime({ store });
const servers = [];
const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/blob-event-fixture';
const account = 'eventsourcefixture', accountPath = `${group}/providers/Microsoft.Storage/storageAccounts/${account}`;
const key = randomBytes(64).toString('base64');
async function listen(server) {
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}
try {
  const arm = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource }));
  const endpoints = { blob: await listen(createServer(runtime.storageRouter.blobHandler())), queue: await listen(createServer(runtime.storageRouter.queueHandler())) };
  async function request(phase, method, path, body) {
    const response = await httpExchange(arm + path, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
    report.exchanges.push({ phase, method, path, request: body, ...response });
    return response;
  }
  assert.equal((await request('group', 'PUT', `${group}?api-version=2025-04-01`, { location: 'westus2' })).status, 201);
  assert.ok([200, 201, 202].includes((await request('account', 'PUT', `${accountPath}?api-version=2023-05-01`, {
    location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: {},
  })).status));
  let state;
  for (let i = 0; i < 20; i++) {
    state = (await request('account-readiness', 'GET', `${accountPath}?api-version=2023-05-01`)).body?.properties?.provisioningState;
    if (state === 'Succeeded') break;
  }
  assert.equal(state, 'Succeeded');
  for (const [type, name] of [['blobServices/default/containers', 'landing'], ['queueServices/default/queues', 'arrivals']]) {
    assert.ok([200, 201].includes((await request('child', 'PUT', `${accountPath}/${type}/${name}?api-version=2023-05-01`, { properties: {} })).status));
  }
  const subscription = `${accountPath}/providers/Microsoft.EventGrid/eventSubscriptions/blob-arrivals?api-version=2025-02-15`;
  const body = { properties: { destination: { endpointType: 'StorageQueue', properties: { resourceId: accountPath, queueName: 'arrivals' } },
    filter: { includedEventTypes: ['Microsoft.Storage.BlobCreated'], subjectBeginsWith: '/blobServices/default/containers/landing/blobs/' },
    eventDeliverySchema: 'EventGridSchema' } };
  assert.ok([200, 201, 202].includes((await request('subscription', 'PUT', subscription, body)).status));
  report.subscriptionRead = await request('subscription-read', 'GET', subscription);
  runtime.storageRouter.registerStorageAccount({ accountName: account, accountKey: key });
  const upload = await storageExchange({ account, key, surface: 'blob', origin: endpoints.blob, method: 'PUT',
    path: '/landing/tenant/document.txt', headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'text/plain' }, body: 'synthetic event source' });
  report.exchanges.push({ phase: 'upload', method: 'PUT', path: '/landing/tenant/document.txt', ...upload });
  assert.equal(upload.status, 201);
  for (let i = 0; i < 5; i++) {
    const response = await storageExchange({ account, key, surface: 'queue', origin: endpoints.queue,
      method: 'GET', path: '/arrivals/messages?peekonly=true&numofmessages=10' });
    report.exchanges.push({ phase: 'queue-peek', method: 'GET', path: '/arrivals/messages?peekonly=true&numofmessages=10', ...response });
    assert.equal(response.status, 200);
    report.receivedEvents.push(...[...response.body.matchAll(/<MessageText>([\s\S]*?)<\/MessageText>/g)].map(match => match[1]));
    if (report.receivedEvents.length) break;
    if (i < 4) await new Promise(resolve => setTimeout(resolve, 250));
  }
  report.observed = { uploadAccepted: true, subscriptionRetained: report.subscriptionRead.status === 200,
    queueMessages: report.receivedEvents.length, waitWindowMs: 1000 };
  report.deliveryObserved = report.receivedEvents.length > 0;
} catch (error) { report.error = error.message; }
finally {
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await runtime.dispose();
  report.cleanup = true;
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, observed: report.observed, deliveryObserved: report.deliveryObserved, error: report.error, cleanup: report.cleanup }));
if (report.error || !report.deliveryObserved) process.exitCode = 1;
