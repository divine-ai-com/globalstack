import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { createStorageProxyServer } from '../../azure-data-plane/src/storage-proxy.mjs';
import { AzureFilesRouter, createAzureFilesRouterServer } from '../../azure-data-plane/src/azure-files-router.mjs';
import { createKeyVaultRouter, createKeyVaultRouterServer } from '../../azure-data-plane/src/key-vault-router.mjs';
import { IotHubRouter, createIotHubRouterServer } from '../../azure-data-plane/src/iot-hub-router.mjs';
import { markdownCell } from '../../workspace-utils/src/markdown-cell.mjs';

async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return server;
}
function send(server, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
    const req = request({ host: '127.0.0.1', port: server.address().port, path, method,
      headers: { ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('Test request timed out')));
    req.on('error', reject);
    req.end(payload);
  });
}

test('storage proxy confines requests to its backend and never follows redirects', async t => {
  let outsideRequests = 0;
  const outside = await listen(t, createServer((req, res) => { outsideRequests++; res.end('outside'); }));
  const outsideUrl = `http://127.0.0.1:${outside.address().port}/private`;
  let backendRequests = 0;
  const backend = await listen(t, createServer((req, res) => {
    backendRequests++;
    if (req.url === '/redirect') return res.writeHead(302, { location: outsideUrl }).end();
    res.end('backend');
  }));
  const proxy = await listen(t, createStorageProxyServer({ service: 'blob', targetEndpoint: `http://127.0.0.1:${backend.address().port}` }));
  assert.equal((await send(proxy, '/safe')).text, 'backend');
  for (const path of [outsideUrl, outsideUrl.replace('http:', ''), '/\\127.0.0.1/private']) {
    assert.equal((await send(proxy, path)).status, 400);
  }
  assert.equal((await send(proxy, '/redirect')).status, 302);
  assert.equal(outsideRequests, 0);
  assert.equal(backendRequests, 2);
  assert.equal((await send(proxy, '/large', { method: 'POST', body: Buffer.alloc(8 * 1024 * 1024 + 1) })).status, 413);
  assert.equal(backendRequests, 2);
  backend.closeAllConnections();
  await new Promise(resolve => backend.close(resolve));
  const failure = await send(proxy, '/safe');
  assert.equal(failure.status, 502);
  assert.deepEqual(JSON.parse(failure.text), { error: 'Storage backend request failed.' });
});

test('Azure Files rejects oversized allocations and enforces a reclaimable storage budget', async t => {
  const router = new AzureFilesRouter({ maxFileBytes: 16, maxStoredBytes: 24 });
  router.registerShare({ accountName: 'files', shareName: 'share' });
  const server = await listen(t, createAzureFilesRouterServer(router));
  const headers = { host: 'files.file.core.windows.net', authorization: 'local-test', 'x-ms-version': '2023-11-03', 'x-ms-type': 'file' };
  const create = (name, size) => send(server, `/share/${name}`, { method: 'PUT', headers: { ...headers, 'x-ms-content-length': String(size) } });
  assert.equal((await create('huge', Number.MAX_SAFE_INTEGER)).status, 413);
  assert.equal((await create('first', 16)).status, 201);
  assert.equal((await create('second', 16)).status, 413);
  assert.equal((await send(server, '/share/first', { method: 'DELETE', headers })).status, 202);
  assert.equal((await create('second', 16)).status, 201);
  assert.equal((await create('second', 8)).status, 201);
  assert.equal((await create('third', 16)).status, 201);
});

test('Key Vault rejects arbitrary bearer tokens before reading secrets', async t => {
  const router = createKeyVaultRouter();
  router.registerVault({ vaultName: 'secure-vault' });
  router.setSecret({ vaultName: 'secure-vault', secretName: 'example', value: 'public-test-value' });
  const server = await listen(t, createKeyVaultRouterServer(router));
  const headers = { host: 'secure-vault.vault.azure.net' };
  const path = '/secrets/example?api-version=7.4';
  assert.equal((await send(server, path, { headers: { ...headers, authorization: 'Bearer attacker-controlled' } })).status, 401);
  const result = await send(server, path, { headers: { ...headers, authorization: 'Bearer globalstack-local-token' } });
  assert.equal(result.status, 200);
  assert.equal(JSON.parse(result.text).value, 'public-test-value');
});

test('IoT twin patches cannot modify object prototypes', async t => {
  const router = new IotHubRouter();
  router.registerHub({ hubName: 'secure-hub' });
  const server = await listen(t, createIotHubRouterServer(router));
  const headers = { host: 'secure-hub.azure-devices.net', authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' };
  assert.equal((await send(server, '/devices/device?api-version=2021-04-12', { method: 'PUT', headers, body: {} })).status, 200);
  const result = await send(server, '/twins/device?api-version=2021-04-12', { method: 'PATCH', headers,
    body: '{"tags":{"__proto__":{"globalstackPolluted":true}}}' });
  assert.equal(result.status, 400);
  assert.equal({}.globalstackPolluted, undefined);
});

test('report cells escape HTML, delimiters, backslashes and newlines together', () => {
  assert.equal(markdownCell('<script>&|\\\n'), '&lt;script&gt;&amp;&#124;&#92; ');
});
