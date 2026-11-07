import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createFunctionsRouter } from '../../azure-data-plane/src/functions-router.mjs';
import { nativeWorkerBindings, forwardNativeFunction } from '../../azure-data-plane/src/native-functions-worker.mjs';
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
    res.writeHead(req.headers['x-functions-key'] === 'worker-key' ? 202 : 401, { 'content-type': 'application/json', 'x-worker-proof': 'observed' });
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
  assert.equal((await keys.json()).error.code, 'NativeFunctionsKeysNotImplemented');
  assert.equal((await wireFetch(`${endpoint}/api/real`, { headers: host })).status, 401, 'worker authentication must not be bypassed');
  const payload = Buffer.from([0, 255, 10, 42]);
  const result = await wireFetch(`${endpoint}/runtime/webhooks/durabletask/orchestrators/actual?x=one%20two`, {
    method: 'POST', headers: { ...host, 'x-functions-key': 'worker-key', 'content-type': 'application/octet-stream', 'x-forwarded-host': 'forged' }, body: payload,
  });
  assert.equal(result.status, 202); assert.equal(result.headers.get('x-worker-proof'), 'observed');
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
