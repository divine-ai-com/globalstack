import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventDiagnostic } from './event-diagnostic.mjs';

const account = '/subscriptions/00000000-0000-4000-8000-000000000000/resourceGroups/pilot/providers/Microsoft.Storage/storageAccounts/pilotdocs';
const env = { STORAGE_ENDPOINT: 'https://pilotdocs.blob.core.windows.net/', STORAGE_RESOURCE_ID: account,
  LANDING_CONTAINER: 'landing', EVENT_DIAGNOSTICS_CONTAINER: 'event-diagnostics',
  AZURE_CLIENT_ID: '22222222-2222-4222-8222-222222222222' };
const blobName = 'pilot/11111111-1111-4111-8111-111111111111.txt';
const event = { id: 'event-one', eventType: 'Microsoft.Storage.BlobCreated', topic: account,
  subject: `/blobServices/default/containers/landing/blobs/${blobName}`,
  data: { url: `https://pilotdocs.blob.core.windows.net/landing/${blobName}`, eTag: '"0x123"', sequencer: '1A' } };

test('event diagnostic records a marker only after a matching BlobCreated event reaches the Function', async () => {
  let markerName, markerBytes, lookups = 0;
  const blobs = { getContainerClient(name) {
    assert.equal(name, 'event-diagnostics');
    return {
      getBlockBlobClient(value) {
        markerName = value;
        return { async uploadData(bytes, options) {
          markerBytes = bytes;
          assert.equal(options.blobHTTPHeaders.blobContentType, 'application/json');
        } };
      },
      getBlobClient(value) {
        assert.equal(value, markerName);
        return { async getProperties() { lookups++; return { versionId: 'marker-version' }; } };
      },
    };
  } };
  const diagnostic = createEventDiagnostic({ env, blobs });
  await diagnostic.onEvent(event, { log() {} });
  assert.match(markerName, /^[a-f0-9]{64}\.json$/);
  assert.equal(JSON.parse(markerBytes).eventType, 'Microsoft.Storage.BlobCreated');
  const result = await diagnostic.status({ json: async () => ({ blobName, etag: '"0x123"' }) });
  assert.equal(result.status, 200);
  assert.equal(result.jsonBody.sourceSha256, markerName.slice(0, -5));
  assert.equal(result.jsonBody.markerVersionId, 'marker-version');
  assert.equal(lookups, 1);
  await diagnostic.onEvent({ ...event, topic: account.replace('pilotdocs', 'otherdocs') }, { log() {} });
  assert.equal(lookups, 1);
});

test('event diagnostic rejects unrelated lookups and reports missing markers', async () => {
  const blobs = { getContainerClient() { return { getBlobClient() { return { async getProperties() { throw Object.assign(new Error('absent'), { statusCode: 404 }); } }; } }; } };
  const diagnostic = createEventDiagnostic({ env, blobs });
  assert.equal((await diagnostic.status({ json: async () => ({ blobName: '../other', etag: '0x123' }) })).status, 400);
  assert.equal((await diagnostic.status({ json: async () => ({ blobName, etag: '0x123' }) })).status, 404);
  assert.throws(() => createEventDiagnostic({ env: { ...env, STORAGE_ENDPOINT: 'http://pilotdocs.blob.core.windows.net/' }, blobs }));
});
