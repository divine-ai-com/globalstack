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

test('Table Shared Key requests reproduce captured create, duplicate, insert and query decisions', async t => {
  const capture = JSON.parse(await readFile(new URL('./evidence/storage-contracts-ecb7026/result.json', import.meta.url), 'utf8'));
  const router = createStorageDataPlaneRouter();
  const account = 'independenttable987', key = Buffer.alloc(64, 35).toString('base64');
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const server = createServer(router.tableHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const config = { account, key, origin: `http://127.0.0.1:${server.address().port}`, surface: 'table' };
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'Timestamp').map(([name, nested]) => [name, normalize(nested)])) : value;
  for (const azure of capture.exchanges.filter(item => item.target === 'azure' && item.surface === 'table')) {
    const local = await storageExchange({ ...config, method: azure.method, path: azure.path, ...azure.request });
    assert.equal(local.status, azure.status, azure.phase);
    if (local.status >= 400) assert.equal(JSON.parse(local.body)['odata.error'].code, JSON.parse(azure.body)['odata.error'].code, azure.phase);
    else if (local.body) assert.deepEqual(normalize(JSON.parse(local.body)), normalize(JSON.parse(azure.body)), azure.phase);
  }
  const invalid = await storageExchange({ ...config, key: Buffer.alloc(64, 36).toString('base64'), method: 'GET', path: '/Tables' });
  assert.equal(invalid.status, 403);
  const foreignFilter = await storageExchange({ ...config, method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'foreign'", headers: { accept: 'application/json;odata=nometadata' } });
  assert.deepEqual(JSON.parse(foreignFilter.body), { value: [] });
  assert.equal((await storageExchange({ ...config, method: 'GET', path: '/NativePartitions()?$filter=unsupported', headers: { accept: 'application/json;odata=nometadata' } })).status, 501);
  const lite = await storageExchange({ ...config, scheme: 'SharedKeyLite', method: 'GET', path: '/Tables', headers: { accept: 'application/json;odata=nometadata' } });
  assert.equal(lite.status, 200);
});

test('Queue replay preserves raw text and hides received messages; stale receipts cannot settle them', async t => {
  const capture = JSON.parse(await readFile(new URL('./evidence/storage-contracts-ecb7026/result.json', import.meta.url), 'utf8'));
  const router = createStorageDataPlaneRouter();
  const account = 'independentqueue987', key = Buffer.alloc(64, 39).toString('base64');
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const server = createServer(router.queueHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const config = { account, key, origin: `http://127.0.0.1:${server.address().port}`, surface: 'queue' };
  const xml = (body, name) => body.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];
  let messageId, receipt;
  for (const azure of capture.exchanges.filter(item => item.target === 'azure' && item.surface === 'queue')) {
    const local = await storageExchange({ ...config, method: azure.method, path: azure.path, ...azure.request });
    assert.equal(local.status, azure.status, azure.phase);
    assert.equal(xml(local.body, 'MessageText'), xml(azure.body, 'MessageText'), azure.phase);
    assert.equal(xml(local.body, 'DequeueCount'), xml(azure.body, 'DequeueCount'), azure.phase);
    if (azure.phase === 'queue-receive') { messageId = xml(local.body, 'MessageId'); receipt = xml(local.body, 'PopReceipt'); }
    if (azure.phase === 'queue-hidden-message') assert.equal(xml(local.body, 'MessageId'), undefined);
  }
  assert.ok(messageId && receipt);
  const path = `/native-control/messages/${messageId}`;
  const update = await storageExchange({ ...config, method: 'PUT', path: `${path}?popreceipt=${receipt}&visibilitytimeout=0`,
    headers: { 'content-type': 'application/xml' }, body: '<QueueMessage><MessageText>updated &amp; exact</MessageText></QueueMessage>' });
  assert.equal(update.status, 204);
  assert.notEqual(update.headers['x-ms-popreceipt'], receipt);
  assert.equal((await storageExchange({ ...config, method: 'DELETE', path: `${path}?popreceipt=${receipt}` })).status, 400);
  const received = await storageExchange({ ...config, method: 'GET', path: '/native-control/messages?visibilitytimeout=30' });
  assert.equal(xml(received.body, 'MessageText'), 'updated &amp; exact');
  assert.equal(xml(received.body, 'DequeueCount'), '2');
  const currentReceipt = xml(received.body, 'PopReceipt');
  assert.equal((await storageExchange({ ...config, method: 'DELETE', path: `${path}?popreceipt=${currentReceipt}` })).status, 204);
  const empty = await storageExchange({ ...config, method: 'GET', path: '/native-control/messages' });
  assert.equal(xml(empty.body, 'MessageId'), undefined);
});

test('second Azure capture validates leased metadata and optimistic Table updates', async t => {
  const base = new URL('./evidence/storage-updates-d16a469/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  }
  const capture = JSON.parse(await readFile(new URL('result.json', base), 'utf8'));
  assert.deepEqual(capture.cleanup, { groupAbsent: true, accountAbsent: true });
  assert.equal(capture.probesComplete, true); assert.equal(capture.sourceDirty, false);
  const router = createStorageDataPlaneRouter(), account = 'optimisticworker234', key = Buffer.alloc(64, 51).toString('base64');
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const servers = {};
  for (const surface of ['blob', 'table', 'queue']) {
    const server = createServer(router[`${surface}Handler`]());
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers[surface] = server;
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  }
  const normalize = value => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).filter(([name]) => name !== 'Timestamp').map(([name, nested]) => [name, normalize(nested)])) : value;
  for (const azure of capture.exchanges.filter(item => item.target === 'azure' && item.surface && item.request)) {
    const local = await storageExchange({ account, key, origin: `http://127.0.0.1:${servers[azure.surface].address().port}`,
      surface: azure.surface, method: azure.method, path: azure.path, ...azure.request });
    assert.equal(local.status, azure.status, azure.phase);
    if (azure.surface === 'table' && local.status >= 400) assert.equal(JSON.parse(local.body)['odata.error'].code, JSON.parse(azure.body)['odata.error'].code, azure.phase);
    else if (azure.surface === 'table' && local.body) assert.deepEqual(normalize(JSON.parse(local.body)), normalize(JSON.parse(azure.body)), azure.phase);
    else assert.equal(local.headers['x-ms-error-code'], azure.headers['x-ms-error-code'], azure.phase);
  }
  const config = { account, key, origin: `http://127.0.0.1:${servers.table.address().port}`, surface: 'table' };
  const path = "/NativePartitions(PartitionKey='taskhub',RowKey='0')";
  const before = await storageExchange({ ...config, method: 'GET', path, headers: { accept: 'application/json;odata=nometadata' } });
  const changes = await Promise.all(Array.from({ length: 8 }, (_, i) => storageExchange({ ...config, method: 'PUT', path,
    headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata', 'if-match': before.headers.etag }, body: JSON.stringify({ Owner: `concurrent-${i}` }) })));
  assert.equal(changes.filter(item => item.status === 204).length, 1);
  assert.equal(changes.filter(item => item.status === 412).length, 7);
  const after = await storageExchange({ ...config, method: 'GET', path, headers: { accept: 'application/json;odata=nometadata' } });
  assert.equal(JSON.parse(after.body).Owner, `concurrent-${changes.findIndex(item => item.status === 204)}`);
  assert.equal(JSON.parse(after.body).Phase, undefined, 'Replacement removes omitted properties');
  const missing = await storageExchange({ account, key, origin: `http://127.0.0.1:${servers.blob.address().port}`, surface: 'blob', method: 'HEAD', path: '/missing?restype=container' });
  assert.equal(missing.status, 404); assert.equal(missing.body, ''); assert.equal(missing.headers['content-type'], undefined);
});
