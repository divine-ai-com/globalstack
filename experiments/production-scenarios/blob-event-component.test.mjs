import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { queueEvents, deployEventTemplate } from './blob-event-component.mjs';

test('queue diagnostic decodes Event Grid JSON or base64, and rejects malformed delivery', () => {
  const event = { id: 'synthetic-event', eventType: 'Microsoft.Storage.BlobCreated', data: { label: '<literal>' } };
  const xml = text => `<QueueMessagesList><QueueMessage><MessageText>${text}</MessageText></QueueMessage></QueueMessagesList>`;
  assert.deepEqual(queueEvents(xml(JSON.stringify(event).replaceAll('<', '&lt;').replaceAll('>', '&gt;'))), [event]);
  assert.deepEqual(queueEvents(xml(Buffer.from(JSON.stringify([event])).toString('base64'))), [event]);
  assert.deepEqual(queueEvents('<QueueMessagesList />'), []);
  assert.throws(() => queueEvents(xml('not-json-or-base64')));
  assert.throws(() => queueEvents(xml('{}')));
});

test('retained local Blob event baseline records accepted resources and missing delivery', async () => {
  const base = new URL('./evidence/blob-events-0220696/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  const bytes = await readFile(new URL('result.json', base));
  assert.equal(bytes.length, index.files['result.json'].bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), index.files['result.json'].sha256);
  const result = JSON.parse(bytes);
  assert.equal(result.sourceDirty, false);
  assert.equal(result.cleanup, true);
  assert.deepEqual(result.observed, { uploadAccepted: true, subscriptionRetained: true, queueMessages: 0, waitWindowMs: 1000 });
  assert.equal(result.deliveryObserved, false);
});

test('managed-identity retry preserves the deployment and requires the matching scoped sender role', async () => {
  const scope = { deployment: '/deployment', topic: '/topic', role: '/role', queue: '/queue' };
  const body = { properties: { template: { resources: ['immutable test fixture'] } } };
  for (const mode of ['eventual', 'wrong-scope', 'wrong-role', 'wrong-principal', 'other-error']) {
    let puts = 0;
    const delays = [];
    const result = await deployEventTemplate({ scope, body, deadline: Date.now() + 600000, sleep: async ms => delays.push(ms),
      request: async (method, path, submitted) => {
        if (method === 'PUT') { assert.equal(submitted, body); puts++; return { status: 201 }; }
        if (path.startsWith('/deployment/operations?')) return { status: 200, body: { value: [{ properties: { statusMessage: {
          error: { code: mode === 'other-error' ? 'AuthorizationFailed' : 'Managed Identity Authorization Error' },
        } } }] } };
        if (path.startsWith('/deployment?')) return { status: 200, body: { properties: { provisioningState: puts === 2 ? 'Succeeded' : 'Failed' } } };
        if (path.startsWith('/topic?')) return { status: 200, body: { identity: { principalId: 'synthetic-identity' } } };
        if (path.startsWith('/role?')) return { status: 200, body: { properties: {
          principalId: mode === 'wrong-principal' ? 'foreign' : 'synthetic-identity', scope: mode === 'wrong-scope' ? '/foreign' : scope.queue,
          roleDefinitionId: '/roles/' + (mode === 'wrong-role' ? 'foreign' : 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a'),
        } } };
        assert.fail('Unexpected request');
      },
    });
    assert.equal(result.complete, mode === 'eventual');
    assert.equal(puts, mode === 'eventual' ? 2 : 1);
    assert.deepEqual(delays, mode === 'eventual' ? [120000] : []);
  }
});

test('Azure Event Grid baseline retains authorization failure and the different local scope failure', async () => {
  const base = new URL('./evidence/blob-events-c806558/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(bytes.length, metadata.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  }
  const result = JSON.parse(await readFile(new URL('result.json', base)));
  const operations = JSON.parse(await readFile(new URL('deployment-operations.json', base)));
  assert.equal(result.sourceDirty, false);
  assert.ok(Object.values(result.cleanup).every(value => value === true));
  assert.ok(Object.values(result.eventObservations.targets).every(target => !target.deploymentComplete && !target.deliveryObserved));
  assert.ok(operations.some(operation => operation.properties?.statusMessage?.error?.code === 'Managed Identity Authorization Error'));
  const local = result.exchanges.find(event => event.target === 'local' && event.phase === 'event-deploy' && event.method === 'PUT');
  assert.equal(local.status, 501);
  assert.equal(local.body.error.code, 'GlobalStackUnsupportedResourceScope');
});
