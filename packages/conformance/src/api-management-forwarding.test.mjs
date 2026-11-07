import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { createApiManagementRouter, createApiManagementRouterServer } from '../../azure-data-plane/src/api-management-router.mjs';

async function listen(server, t) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return server.address().port;
}

export function exchange(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: {
      host: 'gateway-test.azure-api.net', ...(body ? { 'content-length': body.length } : {}), ...headers,
    } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(3000, () => req.destroy(new Error('Test request timed out')));
    req.on('error', reject);
    req.end(body);
  });
}

async function gateway(t, backendPort, options) {
  const router = createApiManagementRouter(options);
  router.registerService({ serviceName: 'gateway-test' });
  router.registerApi({ serviceName: 'gateway-test', apiId: 'documents', properties: { path: 'v1/documents', serviceUrl: `http://127.0.0.1:${backendPort}/backend` } });
  router.registerOperation({ serviceName: 'gateway-test', apiId: 'documents', operationId: 'all', properties: { method: '*', urlTemplate: '/*' } });
  return { router, port: await listen(createApiManagementRouterServer(router), t) };
}

test('gateway forwards actual binary payloads, method, path, query and backend responses', async t => {
  const hits = [];
  const backendPort = await listen(createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    hits.push({ path: req.url, method: req.method, headers: req.headers, body });
    res.writeHead(207, { 'content-type': 'application/octet-stream', 'x-backend-proof': 'actual', connection: 'x-private-hop', 'x-private-hop': 'remove-me' });
    res.end(body);
  }), t);
  const { port } = await gateway(t, backendPort);
  const bytes = Buffer.from([0, 255, 17, 128, 4, 10]);
  const response = await exchange(port, 'POST', '/v1/documents/a%20b?tag=a&tag=b', bytes, {
    'content-type': 'application/octet-stream', 'x-correlation-id': 'doc-17', connection: 'x-client-hop', 'x-client-hop': 'remove-me',
  });
  assert.equal(response.status, 207);
  assert.deepEqual(response.body, bytes);
  assert.equal(response.headers['x-backend-proof'], 'actual');
  assert.equal(response.headers['x-private-hop'], undefined);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, '/backend/a%20b?tag=a&tag=b');
  assert.equal(hits[0].method, 'POST');
  assert.equal(hits[0].headers['x-client-hop'], undefined);
  assert.equal(hits[0].headers['x-correlation-id'], 'doc-17');
  assert.deepEqual(hits[0].body, bytes);
});

test('gateway rejects unknown operations and keeps the backend untouched', async t => {
  let hits = 0;
  const backendPort = await listen(createServer((_req, res) => { hits++; res.end('done'); }), t);
  const { router, port } = await gateway(t, backendPort);
  router.unregisterOperation({ serviceName: 'gateway-test', apiId: 'documents', operationId: 'all' });
  router.registerOperation({ serviceName: 'gateway-test', apiId: 'documents', operationId: 'get-document', properties: { method: 'GET', urlTemplate: '/{id}?revision={revision}' } });
  for (const [method, path] of [['POST', '/v1/documents/42?revision=2'], ['GET', '/v1/documents/42'], ['GET', '/v1/documents-extra/42?revision=2']]) {
    assert.equal((await exchange(port, method, path)).status, 404);
  }
  assert.equal(hits, 0);
  assert.equal((await exchange(port, 'GET', '/v1/documents/42?revision=2')).status, 200);
  assert.equal(hits, 1);
});

test('backend errors and redirects are returned without synthetic success or redirect following', async t => {
  const hits = [];
  const backendPort = await listen(createServer((req, res) => {
    hits.push(req.url);
    if (req.url.endsWith('/redirect')) { res.writeHead(302, { location: '/must-not-be-requested' }); res.end(); }
    else { res.writeHead(503, { 'content-type': 'text/plain' }); res.end('worker unavailable'); }
  }), t);
  const { port } = await gateway(t, backendPort);
  const failed = await exchange(port, 'GET', '/v1/documents/error');
  assert.equal(failed.status, 503);
  assert.equal(failed.body.toString(), 'worker unavailable');
  const redirect = await exchange(port, 'GET', '/v1/documents/redirect');
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.location, '/must-not-be-requested');
  assert.deepEqual(hits, ['/backend/error', '/backend/redirect']);
});

test('unavailable and stalled backends fail within bounded time', async t => {
  const backend = createServer();
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const unavailablePort = backend.address().port;
  await new Promise(resolve => backend.close(resolve));
  const { router, port } = await gateway(t, unavailablePort, { timeoutMs: 100 });
  assert.equal((await exchange(port, 'GET', '/v1/documents/file')).status, 502);
  const stalledPort = await listen(createServer(() => {}), t);
  router.registerApi({ serviceName: 'gateway-test', apiId: 'documents', properties: { path: 'v1/documents', serviceUrl: `http://127.0.0.1:${stalledPort}` } });
  assert.equal((await exchange(port, 'GET', '/v1/documents/file')).status, 504);
});

test('gateway bounds payload sizes and retains APIs across service updates', async t => {
  let hits = 0;
  const backendPort = await listen(createServer((_req, res) => { hits++; res.writeHead(200, { 'content-length': 10 }); res.end('0123456789'); }), t);
  const { router, port } = await gateway(t, backendPort, { maxRequestBytes: 4, maxResponseBytes: 4 });
  router.registerService({ serviceName: 'gateway-test', gatewayUrl: 'https://gateway-test.azure-api.net' });
  assert.equal((await exchange(port, 'POST', '/v1/documents/file', Buffer.from('oversized'))).status, 413);
  assert.equal(hits, 0);
  assert.equal((await exchange(port, 'GET', '/v1/documents/file')).status, 502);
  assert.equal(hits, 1);
  router.unregisterApi({ serviceName: 'gateway-test', apiId: 'documents' });
  assert.equal((await exchange(port, 'GET', '/v1/documents/file')).status, 404);
});
