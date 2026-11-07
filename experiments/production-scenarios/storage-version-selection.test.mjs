import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createStorageDataPlaneRouter } from '../../packages/azure-data-plane/src/storage-router.mjs';
import { storageExchange } from './storage-http.mjs';

test('retained local diagnostic exposes version reads and deletes falling through to current data', async () => {
  const base = new URL('./evidence/version-selection-368fc33/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  const bytes = await readFile(new URL('result.json', base));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), index.files['result.json'].sha256);
  assert.equal(bytes.length, index.files['result.json'].bytes);
  const report = JSON.parse(bytes);
  assert.equal(report.sourceDirty, false);
  assert.match(report.scope, /Local synthetic diagnostic only/);
  const byPhase = Object.fromEntries(report.exchanges.map(item => [item.phase, item]));
  assert.equal(byPhase['read-missing-version'].status, 200);
  assert.equal(byPhase['read-missing-version'].body, 'current synthetic contents');
  assert.equal(byPhase['delete-missing-version'].status, 202);
  assert.equal(byPhase['read-current-after-version-delete'].status, 404);
});

test('missing versions and unsupported snapshots cannot read or mutate current blob content, metadata or lease', async t => {
  const router = createStorageDataPlaneRouter();
  const account = 'independentversions', key = Buffer.alloc(64, 57).toString('base64');
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const server = createServer(router.blobHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const send = (method, path, headers = {}, body = '') => storageExchange({ account, key, surface: 'blob',
    origin: `http://127.0.0.1:${server.address().port}`, method, path, headers, body });
  assert.equal((await send('PUT', '/history?restype=container')).status, 201);
  assert.equal((await send('PUT', '/history/independent.txt', { 'x-ms-blob-type': 'BlockBlob', 'x-ms-meta-owner': 'original' }, 'protected bytes')).status, 201);
  const current = await send('GET', '/history/independent.txt');
  for (const selector of ['versionid', 'snapshot']) {
    const path = `/history/independent.txt?${selector}=2025-03-02T01%3A02%3A03.0000000Z`;
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) {
      const response = await send(method, path, { 'x-ms-blob-type': 'BlockBlob' }, method === 'PUT' ? 'wrong replacement' : '');
      const expected = selector === 'snapshot' ? [501, 'NotImplemented'] : method === 'PUT' ? [400, 'InvalidQueryParameterValue'] : [404, 'BlobNotFound'];
      assert.equal(response.status, expected[0], `${selector} ${method}`);
      assert.equal(response.headers['x-ms-error-code'], expected[1]);
      assert.ok(!response.body.includes('protected bytes'));
    }
    assert.equal((await send('PUT', `${path}&comp=metadata`, { 'x-ms-meta-owner': 'changed' })).status, selector === 'snapshot' ? 501 : 400);
    assert.equal((await send('PUT', `${path}&comp=lease`, { 'x-ms-lease-action': 'acquire', 'x-ms-lease-duration': '60' })).status, selector === 'snapshot' ? 501 : 400);
    const after = await send('GET', '/history/independent.txt');
    assert.equal(after.body, current.body);
    assert.equal(after.headers.etag, current.headers.etag);
    assert.deepEqual(router.account(account).blobs.values().next().value.metadata, { 'x-ms-meta-owner': 'original' });
    assert.equal(after.headers['x-ms-lease-state'], 'available');
  }
  assert.equal((await send('DELETE', '/history/independent.txt')).status, 202);
  assert.equal((await send('GET', '/history/independent.txt')).status, 404);
});
