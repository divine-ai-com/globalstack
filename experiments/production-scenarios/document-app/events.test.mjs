import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentEvent } from './events.mjs';

const config = { storageEndpoint: 'https://documents.blob.core.windows.net', storageResourceId: '/subscriptions/s/resourceGroups/g/providers/Microsoft.Storage/storageAccounts/documents', landingContainer: 'landing' };
const event = { id: 'synthetic-delivery', eventType: 'Microsoft.Storage.BlobCreated', topic: config.storageResourceId,
  subject: '/blobServices/default/containers/landing/blobs/tenant_alpha/report.txt',
  data: { url: `${config.storageEndpoint}/landing/tenant_alpha/report.txt`, eTag: '0xABC123', sequencer: '0001' } };

test('source revision and orchestration identity survive duplicate event delivery', () => {
  const first = documentEvent(event, config), again = documentEvent({ ...event, id: 'redelivery' }, config);
  assert.equal(first.correlationId, again.correlationId);
  assert.equal(first.tenant, 'tenant_alpha');
  assert.equal(first.version, '0xABC123');
  assert.notEqual(documentEvent({ ...event, data: { ...event.data, eTag: '0xABC124', sequencer: '0002' } }, config).correlationId, first.correlationId);
  assert.equal(documentEvent({ ...event, eventType: 'Microsoft.Storage.BlobDeleted' }, config).deleted, true);
});

test('wrong account/container and mismatched subjects cannot become processing inputs', () => {
  assert.equal(documentEvent({ ...event, topic: '/another/account' }, config), null);
  assert.equal(documentEvent({ ...event, subject: event.subject.replace('/landing/', '/quarantine/') }, config), null);
  assert.throws(() => documentEvent({ ...event, data: { ...event.data, url: 'https://other.blob.core.windows.net/landing/tenant_alpha/report.txt' } }, config));
  assert.throws(() => documentEvent({ ...event, data: { ...event.data, url: `${event.data.url}?sig=synthetic` } }, config));
  assert.throws(() => documentEvent({ ...event, data: { ...event.data, url: event.data.url.replace('report.txt', 'other.txt') } }, config));
  assert.throws(() => documentEvent({ ...event, data: { ...event.data, sequencer: 'not-hex' } }, config));
});

test('canonical event URL matches a platform-routed storage endpoint without accepting alternate source ports', () => {
  const routed = { ...config, storageEndpoint: 'https://documents.blob.core.windows.net:44321' };
  assert.equal(documentEvent(event, routed).blobName, 'tenant_alpha/report.txt');
  assert.throws(() => documentEvent({ ...event,
    data: { ...event.data, url: 'https://documents.blob.core.windows.net:44321/landing/tenant_alpha/report.txt' } }, routed));
  assert.throws(() => documentEvent({ ...event,
    data: { ...event.data, url: 'http://documents.blob.core.windows.net/landing/tenant_alpha/report.txt' } }, routed));
});
