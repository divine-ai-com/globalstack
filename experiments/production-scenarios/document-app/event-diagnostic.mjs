import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { documentEvent } from './events.mjs';

const sourceName = /^pilot\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.txt$/i;
const etagPattern = /^[a-zA-Z0-9]{1,128}$/;
const digest = (blobName, etag) => createHash('sha256').update(JSON.stringify([blobName, etag])).digest('hex');

// The diagnostic is separate from the production Durable handler. Its marker
// proves that the deployed Event Grid destination executed with Blob access.
export function createEventDiagnostic({ env = process.env, blobs } = {}) {
  const endpoint = new URL(env.STORAGE_ENDPOINT);
  assert.ok(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password
    && !endpoint.search && !endpoint.hash && endpoint.pathname === '/');
  assert.match(env.STORAGE_RESOURCE_ID ?? '', /^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Storage\/storageAccounts\/[^/]+$/i);
  assert.equal(env.LANDING_CONTAINER, 'landing');
  assert.equal(env.EVENT_DIAGNOSTICS_CONTAINER, 'event-diagnostics');
  assert.match(env.AZURE_CLIENT_ID ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  const client = blobs ?? new BlobServiceClient(endpoint.href,
    new DefaultAzureCredential({ managedIdentityClientId: env.AZURE_CLIENT_ID }));
  const container = client.getContainerClient('event-diagnostics');
  const config = { storageEndpoint: endpoint.href, storageResourceId: env.STORAGE_RESOURCE_ID,
    landingContainer: env.LANDING_CONTAINER };
  return {
    async onEvent(event, context) {
      const parsed = documentEvent(event, config);
      if (!parsed || parsed.deleted) return;
      const sourceSha256 = digest(parsed.blobName, parsed.etag);
      const name = `${sourceSha256}.json`;
      const payload = Buffer.from(JSON.stringify({ eventType: event.eventType, sourceSha256 }));
      await container.getBlockBlobClient(name).uploadData(payload,
        { blobHTTPHeaders: { blobContentType: 'application/json' }, abortSignal: AbortSignal.timeout(30000) });
      context.log(JSON.stringify({ stage: 'event_diagnostic_recorded', sourceSha256 }));
    },
    async status(request) {
      let input;
      try { input = await request.json(); } catch { return { status: 400, jsonBody: { error: 'InvalidDiagnosticInput' } }; }
      const etag = String(input?.etag ?? '').replace(/^"|"$/g, '');
      if (typeof input?.blobName !== 'string' || !sourceName.test(input.blobName) || !etagPattern.test(etag)) {
        return { status: 400, jsonBody: { error: 'InvalidDiagnosticInput' } };
      }
      try {
        const result = await container.getBlobClient(`${digest(input.blobName, etag)}.json`).getProperties({ abortSignal: AbortSignal.timeout(10000) });
        return { status: 200, jsonBody: { recorded: true, sourceSha256: digest(input.blobName, etag), markerVersionId: result.versionId ?? null } };
      } catch (error) {
        if (error.statusCode === 404) return { status: 404, jsonBody: { recorded: false } };
        return { status: 502, jsonBody: { error: 'EventDiagnosticLookupFailed' } };
      }
    },
  };
}
