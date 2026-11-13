import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { storageExchange } from './storage-http.mjs';
import { createStorageDataPlaneRouter } from '../../packages/azure-data-plane/src/storage-router.mjs';
const account = 'transportprobe123', key = Buffer.alloc(64, 23).toString('base64');

test('Storage diagnostic transport preserves virtual host, body and conditional headers', async t => {
  const router = createStorageDataPlaneRouter();
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const handler = router.blobHandler();
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const config = { account, key, surface: 'blob', origin: `http://127.0.0.1:${server.address().port}` };
  assert.equal((await storageExchange({ ...config, method: 'PUT', path: '/probe?restype=container' })).status, 201);
  assert.equal((await storageExchange({ ...config, method: 'PUT', path: '/probe/item', headers: { 'x-ms-blob-type': 'BlockBlob', 'if-none-match': '*' }, body: 'exact bytes' })).status, 201);
  assert.equal((await storageExchange({ ...config, method: 'GET', path: '/probe/item' })).body, 'exact bytes');
  for (const origin of ['https://external.example', 'http://user@127.0.0.1', 'http://127.0.0.1/path']) assert.throws(() => storageExchange({ ...config, origin, method: 'GET', path: '/' }));
  assert.throws(() => storageExchange({ ...config, method: 'GET', path: '//external.example/' }));
});

test('Table transport uses Table canonicalization and does not follow redirects', async t => {
  let count = 0;
  const server = createServer((req, res) => {
    count++;
    const signed = [req.method, '', 'application/json', req.headers['x-ms-date'], `/${account}/Tables`].join('\n');
    const signature = createHmac('sha256', Buffer.from(key, 'base64')).update(signed).digest('base64');
    assert.equal(req.headers.authorization, `SharedKey ${account}:${signature}`);
    res.writeHead(302, { location: 'https://external.example', 'set-cookie': 'must-not-be-retained' }); res.end('redirect');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const response = await storageExchange({ account, key, surface: 'table', origin: `http://127.0.0.1:${server.address().port}`, method: 'POST', path: '/Tables?$filter=ignored-for-signature', headers: { 'content-type': 'application/json' }, body: '{"TableName":"Probe"}' });
  assert.equal(response.status, 302); assert.equal(count, 1); assert.equal(response.headers['set-cookie'], undefined);
});
