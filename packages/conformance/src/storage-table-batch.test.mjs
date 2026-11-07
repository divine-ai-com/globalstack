import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createStorageDataPlaneRouter } from '../../azure-data-plane/src/storage-router.mjs';
import { storageExchange, storageBatch } from '../../../experiments/production-scenarios/storage-http.mjs';
import { parseTableBatch } from '../../azure-data-plane/src/storage-table-batch.mjs';

const contentType = 'multipart/mixed; boundary=batch_native';
const account = 'atomiccomparison879';
const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'Timestamp' && name !== 'odata.etag')
    .map(([name, nested]) => [name, normalize(nested)])) : value;
const statuses = body => [...body.matchAll(/HTTP\/1\.1 (\d{3})/g)].map(match => Number(match[1]));
const errorCode = body => body.match(/"code":"([A-Za-z]+)"/)?.[1];

async function setup(t) {
  const router = createStorageDataPlaneRouter(), key = Buffer.alloc(64, 69).toString('base64');
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const server = createServer(router.tableHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const request = input => storageExchange({ account, key, surface: 'table', origin: `http://127.0.0.1:${server.address().port}`, ...input });
  return { router, request, batch: operations => request({ method: 'POST', path: '/$batch', headers: { 'content-type': contentType },
    body: storageBatch(operations).replaceAll('{account}', account) }) };
}

test('Azure batch and query capture replays with atomic rollback and exact projected fields', async t => {
  const { request } = await setup(t);
  const base = new URL('../../../experiments/production-scenarios/evidence/storage-durable-92c1e82/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  }
  const capture = JSON.parse(await readFile(new URL('result.json', base), 'utf8'));
  assert.equal(capture.sourceDirty, false); assert.equal(capture.probesComplete, true);
  assert.deepEqual(capture.cleanup, { groupAbsent: true, accountAbsent: true });
  for (const azure of capture.exchanges.filter(item => item.target === 'azure' && item.surface === 'table')) {
    const local = await request({ method: azure.method, path: azure.path, ...azure.request,
      body: azure.request.body.replaceAll('<storage-account>', account) });
    assert.equal(local.status, azure.status, azure.phase);
    if (azure.path === '/$batch') {
      assert.deepEqual(statuses(local.body), statuses(azure.body), azure.phase);
      assert.equal(errorCode(local.body), errorCode(azure.body), azure.phase);
      if (errorCode(azure.body)) assert.match(local.body, /"value":"1:/, 'Report the failing operation index');
    } else if (azure.status === 415) assert.match(local.body, /<code>AtomFormatNotSupported<\/code>/);
    else if (azure.status >= 400) assert.equal(errorCode(local.body), errorCode(azure.body), azure.phase);
    else if (azure.body) {
      const expected = normalize(JSON.parse(azure.body.replaceAll('<storage-account>', account)));
      assert.deepEqual(normalize(JSON.parse(local.body)), expected, azure.phase);
    }
  }
});

test('batch updates are conditional and a failing delete rolls back earlier writes', async t => {
  const { request, batch, router } = await setup(t);
  router.registerTable({ accountName: account, tableName: 'OtherEntities' });
  const path = "/OtherEntities(PartitionKey='independent',RowKey='')";
  const initial = await batch([{ path: 'OtherEntities', body: { PartitionKey: 'independent', RowKey: '', Count: 1, Retained: true } }]);
  assert.deepEqual(statuses(initial.body), [204]);
  const get = () => request({ method: 'GET', path, headers: { accept: 'application/json;odata=nometadata' } });
  const before = await get();
  const replace = { method: 'PUT', path: path.slice(1), headers: { 'If-Match': before.headers.etag }, body: { Count: 2 } };
  const failed = await batch([replace, { method: 'DELETE', path: "/OtherEntities(PartitionKey='independent',RowKey='missing')".slice(1), headers: { 'If-Match': '*' } }]);
  assert.deepEqual(statuses(failed.body), [404]);
  const unchanged = await get();
  assert.equal(unchanged.status, before.status);
  assert.equal(unchanged.body, before.body);
  assert.equal(unchanged.headers.etag, before.headers.etag);
  const contenders = await Promise.all(Array.from({ length: 8 }, () => batch([replace])));
  assert.equal(contenders.filter(result => statuses(result.body)[0] === 204).length, 1);
  assert.equal(contenders.filter(result => statuses(result.body)[0] === 412).length, 7);
  assert.equal(JSON.parse((await get()).body).Retained, undefined);
  const merge = await batch([{ method: 'MERGE', path: path.slice(1), body: { Added: 'value' } }]);
  assert.deepEqual(statuses(merge.body), [204]);
  const after = JSON.parse((await get()).body);
  assert.equal(after.Count, 2); assert.equal(after.Added, 'value');
});

test('batch parser bounds operations and rejects foreign URLs and malformed boundaries', () => {
  const source = storageBatch([{ body: { PartitionKey: 'p', RowKey: 'r' } }]).replaceAll('{account}', account);
  assert.equal(parseTableBatch(source, contentType, account).length, 1);
  const native = source.replace('NativePartitions HTTP/1.1', 'NativePartitions?$format=application%2Fjson%3Bodata%3Dminimalmetadata HTTP/1.1').replace('--changeset_native--\r\n', '--changeset_native--\r\n\r\n');
  assert.equal(parseTableBatch(native, contentType, account).length, 1);
  assert.throws(() => parseTableBatch(source.replaceAll(account, 'foreignaccount'), contentType, account));
  assert.throws(() => parseTableBatch(source.slice(0, -20), contentType, account));
  assert.throws(() => parseTableBatch(source, 'multipart/mixed; boundary=wrong', account));
  assert.throws(() => parseTableBatch(storageBatch(Array.from({ length: 101 }, (_, i) => ({ body: { PartitionKey: 'p', RowKey: String(i) } }))).replaceAll('{account}', account), contentType, account));
  assert.throws(() => parseTableBatch('x'.repeat(4 * 1024 ** 2 + 1), contentType, account), /too large/);
});
