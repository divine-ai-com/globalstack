import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { validateStorageSystemSubscription } from '../../core/src/event-grid-storage-contract.mjs';
import { StorageDataPlaneRouter } from '../../azure-data-plane/src/storage-router.mjs';
import { StorageEventDelivery } from '../../azure-data-plane/src/storage-event-delivery.mjs';

const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/deadletter-test';
const accountId = `${group}/providers/Microsoft.Storage/storageAccounts/deadletters`;
const containerId = `${accountId}/blobServices/default/containers/failed-events`;
const topicId = `${group}/providers/Microsoft.EventGrid/systemTopics/document-events`;
const subscriptionId = `${topicId}/eventSubscriptions/document-revisions`;
const principal = '11111111-1111-4111-8111-111111111111';
const put = (store, id, type, properties, extra = {}) => store.resources.set(id.toLowerCase(), { id, name: id.split('/').at(-1), type, properties, ...extra });

function fixture() {
  const store = new ResourceStore(), storageRouter = new StorageDataPlaneRouter({ store });
  let now = Date.parse('2026-11-08T10:00:00Z');
  storageRouter.registerStorageAccount({ accountName: 'deadletters', accountKey: Buffer.alloc(32).toString('base64'), resourceId: accountId });
  storageRouter.registerContainer({ accountName: 'deadletters', containerName: 'failed-events' });
  put(store, accountId, 'Microsoft.Storage/storageAccounts', {});
  put(store, containerId, 'Microsoft.Storage/storageAccounts/blobServices/containers', {});
  put(store, topicId, 'Microsoft.EventGrid/systemTopics', { source: accountId, topicType: 'Microsoft.Storage.StorageAccounts' }, { identity: { principalId: principal } });
  const deadLetterWithResourceIdentity = { identity: { type: 'SystemAssigned' }, deadLetterDestination: {
    endpointType: 'StorageBlob', properties: { resourceId: accountId, blobContainerName: 'failed-events' } } };
  const properties = { eventDeliverySchema: 'EventGridSchema',
    destination: { endpointType: 'StorageQueue', properties: { resourceId: accountId, queueName: 'missing-queue' } },
    deliveryWithResourceIdentity: { identity: { type: 'SystemAssigned' }, destination: {
      endpointType: 'StorageQueue', properties: { resourceId: accountId, queueName: 'missing-queue' } } },
    deadLetterWithResourceIdentity, retryPolicy: { maxDeliveryAttempts: 1, eventTimeToLiveInMinutes: 30 } };
  put(store, subscriptionId, 'Microsoft.EventGrid/systemTopics/eventSubscriptions', properties);
  const roleId = `${accountId}/providers/Microsoft.Authorization/roleAssignments/22222222-2222-4222-8222-222222222222`;
  const grant = () => put(store, roleId, 'Microsoft.Authorization/roleAssignments', { principalId: principal, scope: accountId,
    roleDefinitionId: '/subscriptions/00000000-0000-0000-0000-000000000000/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe' });
  const delivery = new StorageEventDelivery({ store, storageRouter, now: () => now, schedule: () => 1, cancel: () => {} });
  const publish = () => delivery.publish({ account: storageRouter.account('deadletters'),
    blob: { containerName: 'landing', blobName: 'file.txt', etag: '"etag"', body: Buffer.from('test'), contentType: 'text/plain' },
    api: 'PutBlob', requestId: 'synthetic-request' });
  const advance = ms => { now += ms; delivery.drain(); };
  return { store, storageRouter, delivery, properties, roleId, grant, publish, advance };
}

test('identity-based Storage Blob dead-letter shape is accepted with a real container and Function destination', () => {
  const f = fixture();
  const site = `${group}/providers/Microsoft.Web/sites/worker`;
  const fn = `${site}/functions/documentUploaded`;
  put(f.store, site, 'Microsoft.Web/sites', {});
  const body = { properties: { ...f.properties, destination: { endpointType: 'AzureFunction', properties: { resourceId: fn } },
    deliveryWithResourceIdentity: undefined } };
  const route = { subscriptionId: '00000000-0000-0000-0000-000000000000', resourceGroupName: 'deadletter-test',
    typePath: 'systemTopics/document-events/eventSubscriptions/document-revisions' };
  const functions = { hasNativeWorker: () => true, hasNativeEventGridFunction: () => true };
  assert.equal(validateStorageSystemSubscription(f.store, route, body, functions), null);
  f.store.resources.delete(containerId.toLowerCase());
  assert.equal(validateStorageSystemSubscription(f.store, route, body, functions)?.status, 400);
});

test('exhausted event becomes a JSON Blob after the documented delay', () => {
  const f = fixture(); f.grant(); f.publish();
  assert.equal(f.delivery.diagnostics.at(-1).state, 'deadletter-pending');
  assert.equal(f.storageRouter.account('deadletters').blobs.size, 0);
  f.advance(299999); assert.equal(f.storageRouter.account('deadletters').blobs.size, 0);
  f.advance(1);
  assert.equal(f.delivery.diagnostics.at(-1).state, 'deadlettered');
  const [key, blob] = [...f.storageRouter.account('deadletters').blobs.entries()][0];
  assert.match(key, /^failed-events\0DOCUMENT-REVISIONS\/2026\/11\/8\/10\/[a-f0-9-]+\.json$/);
  const [event] = JSON.parse(blob.body.toString());
  assert.equal(event.deadLetterReason, 'MaxDeliveryAttemptsExceeded');
  assert.equal(event.deliveryAttempts, 1);
  assert.equal(event.lastDeliveryOutcome, 'DestinationNotFound');
  assert.equal(event.subject, '/blobServices/default/containers/landing/blobs/file.txt');
  assert.equal(f.delivery.deadLetters.size, 0);
});

test('revoked Blob role prevents dead-letter write until access is restored', () => {
  const f = fixture(); f.grant(); f.publish(); f.store.resources.delete(f.roleId.toLowerCase());
  f.advance(300000);
  assert.equal(f.delivery.diagnostics.at(-1).state, 'deadletter-retrying');
  assert.equal(f.delivery.diagnostics.at(-1).reason, 'AuthorizationFailed');
  assert.equal(f.storageRouter.account('deadletters').blobs.size, 0);
  f.grant(); f.advance(10000);
  assert.equal(f.delivery.diagnostics.at(-1).state, 'deadlettered');
  assert.equal(f.storageRouter.account('deadletters').blobs.size, 1);
});
