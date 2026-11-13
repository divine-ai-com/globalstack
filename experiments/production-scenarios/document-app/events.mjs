import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function documentEvent(event, { storageEndpoint, storageResourceId, landingContainer }) {
  if (!['Microsoft.Storage.BlobCreated', 'Microsoft.Storage.BlobDeleted'].includes(event?.eventType)) return null;
  assert.equal(typeof event.id, 'string');
  assert.ok(event.id.length > 0 && event.id.length <= 128);
  if (String(event.topic).toLowerCase() !== storageResourceId.toLowerCase()) return null;
  const prefix = `/blobServices/default/containers/${landingContainer}/blobs/`;
  if (!event.subject?.startsWith(prefix)) return null;
  const endpoint = new URL(storageEndpoint), source = new URL(event.data?.url);
  assert.ok(!source.username && !source.password && !source.search && !source.hash, 'Event blob URL must not contain credentials or query data');
  assert.ok(source.protocol === 'https:' && !source.port && source.hostname === endpoint.hostname,
    'Event must reference the configured storage account');
  const [container, ...segments] = source.pathname.slice(1).split('/').map(decodeURIComponent);
  assert.equal(container, landingContainer);
  const blobName = segments.join('/');
  assert.equal(decodeURIComponent(event.subject.slice(prefix.length)), blobName, 'Event subject and blob URL must agree');
  const [tenant] = blobName.split('/');
  assert.match(tenant, /^[a-zA-Z0-9_-]{1,80}$/);
  assert.ok(segments.length >= 2 && segments.at(-1).length > 0 && segments.at(-1).length <= 255);
  assert.match(event.data.sequencer, /^[a-fA-F0-9]{1,64}$/);
  const deleted = event.eventType === 'Microsoft.Storage.BlobDeleted';
  const etag = deleted ? null : String(event.data.eTag ?? '').replace(/^"|"$/g, '');
  assert.ok(deleted || /^[a-zA-Z0-9]{1,128}$/.test(etag), 'Created events require an ETag');
  const version = deleted ? `delete:${event.data.sequencer}` : etag;
  const correlationId = createHash('sha256').update(JSON.stringify([event.topic.toLowerCase(), blobName, version, event.data.sequencer])).digest('hex');
  return { tenant, blobUrl: source.href, fileName: segments.at(-1), blobName, container, version,
    etag, sequence: event.data.sequencer, deleted, correlationId, eventId: event.id };
}
