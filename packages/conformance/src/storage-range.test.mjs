import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createStorageDataPlaneRouter } from '../../azure-data-plane/src/storage-router.mjs';
import { storageExchange } from '../../../experiments/production-scenarios/storage-http.mjs';
import { storageRangeCases } from '../../../experiments/production-scenarios/storage-range-cases.mjs';

const base = new URL('../../../experiments/production-scenarios/evidence/blob-ranges-before-d3e3ead/', import.meta.url);

test('range responses reproduce captured Azure status, bytes and selected headers', async t => {
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  for (const [name, expected] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(bytes.length, expected.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
  }
  const evidence = JSON.parse(await readFile(new URL('result.json', base)));
  assert.equal(evidence.sourceDirty, false);
  assert.deepEqual(evidence.cleanup, { groupAbsent: true, accountAbsent: true });
  const baseline = new Map(evidence.exchanges.filter(item => item.target === 'azure' && item.phase.startsWith('range-')).map(item => [item.phase, item]));
  const before = evidence.exchanges.find(item => item.target === 'local' && item.phase === 'range-bounded');
  assert.equal(before.status, 200); assert.equal(before.body, '0123456789');
  const account = 'independentranges', key = Buffer.alloc(64, 39).toString('base64');
  const router = createStorageDataPlaneRouter();
  router.registerStorageAccount({ accountName: account, accountKey: key });
  router.configureBlobService({ accountName: account, isVersioningEnabled: true });
  const server = createServer(router.blobHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let compared = 0;
  await storageRangeCases(async item => {
    const actual = await storageExchange({ ...item, account, key, origin });
    const expected = baseline.get(item.id); assert.ok(expected, item.id);
    assert.equal(actual.status, expected.status, item.id);
    for (const name of ['content-range', 'content-md5']) assert.equal(actual.headers[name], expected.headers[name], `${item.id} ${name}`);
    // Azure's front-end rejects integer overflow with generic HTML; GlobalStack
    // returns XML InvalidHeaderValue. Retain this explicit envelope difference.
    if (item.id !== 'range-large-end') assert.equal(actual.headers['x-ms-error-code'], expected.headers['x-ms-error-code'], item.id);
    if (actual.status < 400) {
      assert.equal(actual.body, expected.body, item.id);
      assert.equal(actual.headers['content-length'], expected.headers['content-length'], item.id);
    }
    compared++;
    return actual;
  });
  assert.equal(compared, baseline.size);
  const response = await storageExchange({ account, key, origin, surface: 'blob', method: 'GET', path: '/range-probe/document.txt', headers: { 'x-ms-range': 'invalid' } });
  assert.equal(response.status, 501, 'Unmeasured custom-header syntax must not be silently accepted');
});
