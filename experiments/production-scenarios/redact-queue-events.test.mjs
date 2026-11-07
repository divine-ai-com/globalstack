import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactQueueEvents } from './redact-queue-events.mjs';
import { queueEvents } from './blob-event-component.mjs';

test('encoded Event Grid payload identifiers are redacted without changing the event schema', () => {
  const event = { id: 'correlation', eventType: 'Microsoft.Storage.BlobCreated', topic: '/subscriptions/private-identifier', data: { url: 'https://private-account.blob.core.windows.net/file' } };
  const raw = `<MessageText>${Buffer.from(JSON.stringify(event)).toString('base64')}</MessageText>`;
  const safe = redactQueueEvents({ body: raw }, [['private-identifier', '<subscription>'], ['private-account', '<account>']]);
  const decoded = queueEvents(safe.body)[0];
  assert.equal(decoded.topic, '/subscriptions/<subscription>');
  assert.equal(decoded.data.url, 'https://<account>.blob.core.windows.net/file');
  assert.equal(decoded.id, event.id);
  assert.equal(redactQueueEvents('<MessageText>invalid</MessageText>', []), '<MessageText>invalid</MessageText>');
  assert.equal(redactQueueEvents('<MessageText>e30=</MessageText>', []), '<MessageText>e30=</MessageText>');
});
