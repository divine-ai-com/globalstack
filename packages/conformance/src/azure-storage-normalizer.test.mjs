import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  QueueDeleteStaleReadTracker,
  queueDeleteStaleReadObservedGoneByMs,
  queueDeleteStaleReadObservedThroughMs,
} from '../../azure-data-plane/src/queue-delete-window.mjs';
import {
  normalizationRuleById,
  normalizeStorageResponse,
  storageNormalizationRules,
} from '../../azure-data-plane/src/storage-normalizer.mjs';

function request({ method = 'GET', url, headers = {}, body = '' }) {
  return {
    method,
    url: new URL(url),
    headers,
    body,
  };
}

function response({ status, errorCode = null }) {
  return {
    status,
    headers: errorCode ? { 'x-ms-error-code': errorCode } : {},
    body: '',
  };
}

test('storage normalizer only implements real Azure captured safe mismatch rules', () => {
  const implemented = storageNormalizationRules.filter(rule => rule.status === 'implemented').map(rule => rule.id).sort();
  assert.deepEqual(implemented, [
    'blob-get-without-authorization',
    'blob-missing-blob-type-header',
    'queue-malformed-message',
    'queue-peek-after-delete',
  ]);

  const repeatCapture = normalizationRuleById('queue-peek-after-delete');
  assert.equal(repeatCapture.status, 'implemented');
  assert.equal(repeatCapture.azureStatus, 200);
  assert.equal(repeatCapture.azuriteStatus, 404);
  assert.equal(repeatCapture.observedContinueThroughMs, queueDeleteStaleReadObservedThroughMs);
  assert.equal(repeatCapture.observedGoneByMs, queueDeleteStaleReadObservedGoneByMs);
});

test('blob missing x-ms-blob-type is normalized to the captured Azure error code', () => {
  const normalized = normalizeStorageResponse({
    service: 'blob',
    request: request({
      method: 'PUT',
      url: 'http://127.0.0.1:10000/devstoreaccount1/container/blob.txt',
      headers: { 'content-type': 'text/plain' },
      body: 'payload',
    }),
    response: response({ status: 400 }),
  });

  assert.equal(normalized.normalized, true);
  assert.equal(normalized.ruleId, 'blob-missing-blob-type-header');
  assert.equal(normalized.response.status, 400);
  assert.equal(normalized.response.headers['x-ms-error-code'], 'MissingRequiredHeader');
  assert.match(normalized.response.body, /<HeaderName>x-ms-blob-type<\/HeaderName>/);
});

test('unauthenticated blob GET is normalized to Azure NoAuthenticationInformation', () => {
  const normalized = normalizeStorageResponse({
    service: 'blob',
    request: request({
      method: 'GET',
      url: 'http://127.0.0.1:10000/devstoreaccount1/container/blob.txt',
    }),
    response: response({ status: 403, errorCode: 'AuthorizationFailure' }),
  });

  assert.equal(normalized.normalized, true);
  assert.equal(normalized.ruleId, 'blob-get-without-authorization');
  assert.equal(normalized.response.status, 401);
  assert.equal(normalized.response.headers['x-ms-error-code'], 'NoAuthenticationInformation');
});

test('malformed queue message XML is normalized to Azure InvalidXmlDocument', () => {
  const normalized = normalizeStorageResponse({
    service: 'queue',
    request: request({
      method: 'POST',
      url: 'http://127.0.0.1:10001/devstoreaccount1/queue/messages',
      headers: { 'content-type': 'application/xml' },
      body: '<QueueMessage><MessageText>unterminated',
    }),
    response: response({ status: 400 }),
  });

  assert.equal(normalized.normalized, true);
  assert.equal(normalized.ruleId, 'queue-malformed-message');
  assert.equal(normalized.response.status, 400);
  assert.equal(normalized.response.headers['x-ms-error-code'], 'InvalidXmlDocument');
});

test('queue delete tracker models the bounded Azure stale-read window', () => {
  let now = 10_000;
  const tracker = new QueueDeleteStaleReadTracker({ now: () => now });
  tracker.recordPeek({
    accountName: 'account',
    queueName: 'jobs',
    body: '<QueueMessagesList><QueueMessage><MessageText>cmVhZHk=</MessageText></QueueMessage></QueueMessagesList>',
  });
  tracker.armDelete({ accountName: 'account', queueName: 'jobs' });

  now += queueDeleteStaleReadObservedThroughMs;
  assert.match(tracker.readAfterDelete({ accountName: 'account', queueName: 'jobs' }) ?? '', /QueueMessagesList/);

  now += queueDeleteStaleReadObservedGoneByMs - queueDeleteStaleReadObservedThroughMs;
  assert.equal(tracker.readAfterDelete({ accountName: 'account', queueName: 'jobs' }), null);
});

test('queue peek after delete is no longer treated as an unresolved normalization gap', () => {
  const normalized = normalizeStorageResponse({
    service: 'queue',
    request: request({
      method: 'GET',
      url: 'http://127.0.0.1:10001/devstoreaccount1/queue/messages?peekonly=true&numofmessages=1',
    }),
    response: response({ status: 404, errorCode: 'QueueNotFound' }),
  });

  assert.equal(normalized.normalized, false);
  assert.equal(normalized.ruleId, null);
  assert.equal(normalized.response.status, 404);
  assert.equal(normalized.response.headers['x-ms-error-code'], 'QueueNotFound');
});
