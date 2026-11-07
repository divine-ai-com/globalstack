import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { queueEvents } from './blob-event-component.mjs';

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
