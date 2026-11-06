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
