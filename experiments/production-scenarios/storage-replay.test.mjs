import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createStorageDataPlaneRouter } from '../../packages/azure-data-plane/src/storage-router.mjs';
import { storageExchange } from './storage-http.mjs';

test('retained Azure Blob requests enforce conditions and leases without changing protected content', async t => {
  const base = new URL('./evidence/storage-contracts-ecb7026/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const capture = JSON.parse(await readFile(new URL('result.json', base), 'utf8'));
  assert.equal(capture.sourceDirty, false);
  assert.equal(capture.probesComplete, true);
  assert.deepEqual(capture.cleanup, { groupAbsent: true, accountAbsent: true });
  const router = createStorageDataPlaneRouter();
  const account = 'independentlease456', key = Buffer.alloc(64, 31).toString('base64');
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const server = createServer(router.blobHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  for (const azure of capture.exchanges.filter(item => item.target === 'azure' && item.surface === 'blob' && item.request)) {
    const local = await storageExchange({ account, key, origin: `http://127.0.0.1:${server.address().port}`,
      surface: 'blob', method: azure.method, path: azure.path.replaceAll('native-host', 'unrelated-worker'), ...azure.request });
    assert.equal(local.status, azure.status, azure.phase);
    assert.equal(local.headers['x-ms-error-code'], azure.headers['x-ms-error-code'], azure.phase);
    for (const header of ['x-ms-lease-id', 'x-ms-lease-state', 'x-ms-lease-status', 'x-ms-lease-duration']) assert.equal(local.headers[header], azure.headers[header], `${azure.phase}: ${header}`);
    if (azure.phase === 'blob-retained-content') assert.equal(local.body, azure.body);
  }
});
