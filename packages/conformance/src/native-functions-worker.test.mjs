import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFunctionsRouter } from '../../azure-data-plane/src/functions-router.mjs';
import { nativeWorkerBindings, forwardNativeFunction, readNativeHostKeys } from '../../azure-data-plane/src/native-functions-worker.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

const resourceId = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/native-workers/providers/Microsoft.Web/sites/real-worker';
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
const host = { host: 'real-worker.azurewebsites.net' };
function wireFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: options.method ?? 'GET', headers: options.headers }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject);
      response.on('end', () => resolve(new Response([204, 304].includes(response.statusCode) ? null : Buffer.concat(chunks),
        { status: response.statusCode, headers: response.headers })));
    });
    request.on('error', reject); request.end(options.body);
  });
}


test('native worker bindings reject ambiguous and remote destinations', () => {
  for (const origin of ['https://example.com', 'http://169.254.169.254', 'http://127.0.0.1/path', 'http://u:p@127.0.0.1', 'http://127.0.0.1?x=1', 'http://127.0.0.1#x', 'file:///tmp/worker']) {
    assert.throws(() => nativeWorkerBindings([{ resourceId, appResourceId: resourceId, origin }]));
  }
  for (const origin of ['http://127.0.0.1:1234', 'http://172.18.0.2', 'https://10.1.1.1', 'http://[::1]:1234']) {
    assert.equal(nativeWorkerBindings([{ appResourceId: resourceId, origin }]).size, 1);
  }
  assert.throws(() => nativeWorkerBindings([{ appResourceId: 'real-worker', origin: 'http://localhost' }]));
  assert.throws(() => nativeWorkerBindings(Array(2).fill({ appResourceId: resourceId, origin: 'http://localhost' })));
});

test('ARM site lifecycle controls actual worker forwarding without synthetic fallback', async t => {
  let calls = 0, last;
  const worker = createServer(async (req, res) => {
    calls++; const chunks = []; for await (const chunk of req) chunks.push(chunk);
    last = { method: req.method, path: req.url, headers: req.headers, bytes: Buffer.concat(chunks).toString('hex') };
    res.writeHead(req.headers['x-functions-key'] === 'worker-key' ? 202 : 401, { 'content-type': 'application/json', 'x-ms-request-id': 'observed', 'x-unreviewed-header': 'discarded' });
    res.end(JSON.stringify({ received: last.bytes }));
  });
  const upstream = await listen(t, worker), store = new ResourceStore();
  store.putResourceGroup('00000000-0000-0000-0000-000000000000', 'native-workers');
  const runtime = createEmulatorRuntime({ store, nativeFunctionsWorkers: [{ appResourceId: resourceId, origin: upstream }] });
  t.after(() => runtime.dispose());
  const arm = await listen(t, createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter: runtime.functionsRouter }));
  const endpoint = await listen(t, createServer(runtime.functionsRouter.handler()));
  const send = (method, body) => wireFetch(`${arm}${resourceId}?api-version=2023-12-01`, { method,
    headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await wireFetch(`${endpoint}/api/real`, { headers: host })).status, 404);
  const planId = resourceId.replace('/sites/real-worker', '/serverfarms/native-plan');
  const plan = await wireFetch(`${arm}${planId}?api-version=2023-12-01`, { method: 'PUT', headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
    body: JSON.stringify({ location: 'westus2', kind: 'functionapp', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} }) });
  assert.ok([200, 201, 202].includes(plan.status), await plan.text());
  const created = await send('PUT', { location: 'westus2', kind: 'functionapp,linux', properties: { serverFarmId: planId } });
  assert.ok([200, 201, 202].includes(created.status)); await created.arrayBuffer();
  const keys = await wireFetch(`${arm}${resourceId}/host/default/listKeys?api-version=2023-12-01`, { method: 'POST', headers: { authorization: 'Bearer globalstack-local-token' } });
  assert.equal(keys.status, 501);
  assert.equal((await keys.json()).error.code, 'NativeFunctionsKeysNotConfigured');
  assert.equal((await wireFetch(`${endpoint}/api/real`, { headers: host })).status, 401, 'worker authentication must not be bypassed');
  const payload = Buffer.from([0, 255, 10, 42]);
  const result = await wireFetch(`${endpoint}/runtime/webhooks/durabletask/orchestrators/actual?x=one%20two`, {
    method: 'POST', headers: { ...host, 'x-functions-key': 'worker-key', 'content-type': 'application/octet-stream', 'x-forwarded-host': 'forged' }, body: payload,
  });
  assert.equal(result.status, 202); assert.equal(result.headers.get('x-ms-request-id'), 'observed');
  assert.equal(result.headers.get('x-unreviewed-header'), null);
  assert.deepEqual(await result.json(), { received: payload.toString('hex') });
  assert.equal(last.path, '/runtime/webhooks/durabletask/orchestrators/actual?x=one%20two');
  assert.equal(last.headers['x-forwarded-host'], undefined);
  assert.equal(last.headers.host, host.host);
  const scm = await wireFetch(`${endpoint}/api/zipdeploy`, { method: 'POST', headers: { host: 'real-worker.scm.azurewebsites.net' }, body: 'not-a-package' });
  assert.equal(scm.status, 501); assert.equal(calls, 2);
  worker.closeAllConnections(); await new Promise(resolve => worker.close(resolve));
  const unavailable = await wireFetch(`${endpoint}/api/real`, { headers: host });
  assert.equal(unavailable.status, 502);
  assert.equal((await unavailable.json()).error.code, 'NativeFunctionsWorkerUnavailable');
  const deleted = await send('DELETE'); await deleted.arrayBuffer();
  assert.equal((await wireFetch(`${endpoint}/api/real`, { headers: host })).status, 404);
});

test('worker redirects are returned without forwarding credentials to another endpoint', async t => {
  let leakedCalls = 0;
  const other = await listen(t, createServer((_req, res) => { leakedCalls++; res.end(); }));
  const upstream = await listen(t, createServer((_req, res) => { res.writeHead(302, { location: other }); res.end(); }));
  const router = createFunctionsRouter({ nativeWorkers: [{ appResourceId: resourceId, origin: upstream }] });
  router.registerApp({ appName: 'real-worker', resourceId });
  const endpoint = await listen(t, createServer(router.handler()));
  const response = await wireFetch(`${endpoint}/api/test`, { headers: { ...host, authorization: 'Bearer fixture' }, redirect: 'manual' });
  assert.equal(response.status, 302); assert.equal(response.headers.get('location'), other); assert.equal(leakedCalls, 0);
});

test('native forwarding bounds request bodies and worker response time', async t => {
  const upstream = await listen(t, createServer(() => {}));
  const endpoint = await listen(t, createServer((req, res) => forwardNativeFunction(req, res, upstream, { timeoutMs: 50, maxRequestBytes: 3 })));
  assert.equal((await wireFetch(endpoint, { method: 'POST', body: 'large' })).status, 413);
  const chunked = await new Promise((resolve, reject) => {
    const req = httpRequest(endpoint, { method: 'POST' }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('ab'); req.end('cd');
  });
  assert.equal(chunked, 413);
  const timedOut = await wireFetch(endpoint);
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).error.code, 'NativeFunctionsWorkerTimeout');
});


test('host key lookup uses private credentials and actual native responses without caching', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'gs-worker-keys-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const masterKeyFile = join(dir, 'master'), master = randomBytes(32).toString('base64url');
  const functionKey = randomBytes(32).toString('base64url'), systemKey = randomBytes(32).toString('base64url');
  await writeFile(masterKeyFile, master, { mode: 0o600 });
  let mode = 'valid', calls = 0;
  const origin = await listen(t, createServer((req, res) => {
    calls++;
    if (req.headers['x-functions-key'] !== master) { res.writeHead(401); return res.end('denied'); }
    if (mode === 'redirect') { res.writeHead(302, { location: '/other' }); return res.end(); }
    if (mode === 'denied') { res.writeHead(401); return res.end(master); }
    res.setHeader('content-type', 'application/json');
    if (mode === 'oversized') return res.end('x'.repeat(70000));
    if (req.url === '/admin/host/systemkeys/_master') return res.end(JSON.stringify({ name: '_master', value: master }));
    if (mode === 'duplicate') return res.end(JSON.stringify({ keys: [{ name: 'same', value: functionKey }, { name: 'same', value: systemKey }] }));
    res.end(JSON.stringify({ keys: req.url.endsWith('functionkeys') ? [{ name: 'default', value: functionKey }]
      : [{ name: 'durabletask_extension', value: systemKey }] }));
  }));
  const binding = nativeWorkerBindings([{ appResourceId: resourceId, origin, masterKeyFile }]).get(resourceId.toLowerCase());
  const read = await readNativeHostKeys(binding);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body, { masterKey: master, functionKeys: { default: functionKey }, systemKeys: { durabletask_extension: systemKey } });
  assert.equal(calls, 3);
  for (const changed of ['redirect', 'denied', 'oversized', 'duplicate']) {
    mode = changed;
    const result = await readNativeHostKeys(binding);
    assert.equal(result.status, 502);
    assert.equal(result.body.error.code, 'NativeFunctionsKeysUnavailable');
    assert.equal(JSON.stringify(result).includes(master), false);
    assert.equal(JSON.stringify(result).includes(masterKeyFile), false);
  }
  mode = 'valid';
  const before = calls;
  await chmod(masterKeyFile, 0o644);
  assert.equal((await readNativeHostKeys(binding)).status, 502);
  assert.equal(calls, before, 'world-readable credentials must be rejected before sending a request');
  await chmod(masterKeyFile, 0o600);
  await writeFile(masterKeyFile, randomBytes(32).toString('base64url'));
  assert.equal((await readNativeHostKeys(binding)).status, 502, 'changed credentials must not return cached keys');
  await rm(masterKeyFile);
  assert.equal((await readNativeHostKeys(binding)).status, 502);
  assert.equal((await readNativeHostKeys({ origin })).status, 501);
});


test('native worker status must be a supported final HTTP response code', async t => {
  const upstream = await listen(t, createServer((_req, res) => { res.writeHead(700); res.end('unexpected'); }));
  const endpoint = await listen(t, createServer((req, res) => forwardNativeFunction(req, res, upstream)));
  const result = await wireFetch(endpoint);
  assert.equal(result.status, 502);
  assert.equal((await result.json()).error.code, 'NativeFunctionsWorkerInvalidResponse');
});

test('native connection establishment has a deadline separate from function execution', async t => {
  const { createServer: tcpServer } = await import('node:net');
  const sockets = new Set();
  const stalled = tcpServer(socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {}); });
  await new Promise(resolve => stalled.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { for (const socket of sockets) socket.destroy(); stalled.close(resolve); }));
  const origin = `https://127.0.0.1:${stalled.address().port}`;
  const endpoint = await listen(t, createServer((req, res) => forwardNativeFunction(req, res, origin, { timeoutMs: 10000, connectTimeoutMs: 50 })));
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(2000) });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, 'NativeFunctionsWorkerUnavailable');
});
