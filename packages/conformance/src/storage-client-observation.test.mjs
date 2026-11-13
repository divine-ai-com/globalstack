import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { AzuriteClient } from '../../azure-data-plane/src/azurite-client.mjs';
import { createStorageDataPlaneRouter } from '../../azure-data-plane/src/storage-router.mjs';

test('queue observation includes multiple messages and validates the requested limit', async () => {
  const router = createStorageDataPlaneRouter();
  const account = { name: 'claimsprobe', key: Buffer.from('synthetic-test-key').toString('base64') };
  router.registerStorageAccount({ accountName: account.name, accountKey: account.key });
  router.registerQueue({ accountName: account.name, queueName: 'claims' });
  const handler = router.queueHandler();
  const server = createServer((req, res) => { req.headers.host = `${account.name}.queue.core.windows.net`; return handler(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new AzuriteClient({ account, pathStyle: false, queueEndpoint: `http://127.0.0.1:${server.address().port}` });
  try {
    assert.equal((await client.putQueueMessage('claims', 'first')).status, 201);
    assert.equal((await client.putQueueMessage('claims', 'second')).status, 201);
    const one = await client.peekQueueMessages('claims');
    assert.equal(one.status, 200);
    assert.equal([...one.body.matchAll(/<MessageText>/g)].length, 1);
    const many = await client.peekQueueMessages('claims', { maxMessages: 32 });
    assert.equal(many.status, 200);
    assert.deepEqual([...many.body.matchAll(/<MessageText>(.*?)<\/MessageText>/g)].map(m => Buffer.from(m[1], 'base64').toString()), ['first', 'second']);
    for (const maxMessages of [0, 33, 1.5, '2']) {
      await assert.rejects(client.peekQueueMessages('claims', { maxMessages }), RangeError);
    }
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});

test('table insert rejects an existing key without replacing its value or metadata', async () => {
  const router = createStorageDataPlaneRouter();
  const account = { name: 'tableprobe', key: Buffer.from('synthetic-test-key').toString('base64') };
  router.registerStorageAccount({ accountName: account.name, accountKey: account.key });
  router.registerTable({ accountName: account.name, tableName: 'claims' });
  const handler = router.tableHandler();
  const server = createServer((req, res) => { req.headers.host = `${account.name}.table.core.windows.net`; return handler(req, res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const client = new AzuriteClient({ account, pathStyle: false, tableEndpoint: `http://127.0.0.1:${server.address().port}` });
  try {
    const original = { PartitionKey: 'claims', RowKey: 'one', status: 'queued' };
    const inserted = await client.insertTableEntity('claims', original);
    assert.equal(inserted.status, 201);
    for (const status of ['queued', 'overwritten']) {
      const conflict = await client.insertTableEntity('claims', { ...original, status });
      assert.equal(conflict.status, 409);
      assert.equal(JSON.parse(conflict.body)['odata.error'].code, 'EntityAlreadyExists');
      const retained = await client.getTableEntity('claims', 'claims', 'one');
      assert.equal(retained.status, 200);
      assert.deepEqual(JSON.parse(retained.body), JSON.parse(inserted.body));
    }
    assert.equal((await client.insertTableEntity('claims', { ...original, RowKey: 'two' })).status, 201);
    assert.equal((await client.insertTableEntity('claims', { ...original, PartitionKey: 'other' })).status, 201);
  } finally {
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
