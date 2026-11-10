import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';

// This opt-in endpoint tests the deployed worker's Blob write and event wiring.
// It is not the authenticated document-ingress API.
export function createUploadDiagnostic({ env = process.env, blobs } = {}) {
  const endpoint = new URL(env.STORAGE_ENDPOINT);
  assert.ok(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password
    && !endpoint.search && !endpoint.hash && endpoint.pathname === '/');
  assert.equal(env.LANDING_CONTAINER, 'landing');
  assert.match(env.AZURE_CLIENT_ID ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
  const client = blobs ?? new BlobServiceClient(endpoint.href,
    new DefaultAzureCredential({ managedIdentityClientId: env.AZURE_CLIENT_ID }));
  return async request => {
    let input;
    try { input = await request.json(); } catch { return { status: 400, jsonBody: { error: 'InvalidDiagnosticInput' } }; }
    if (typeof input?.text !== 'string' || !input.text.length || input.tenant !== 'pilot') {
      return { status: 400, jsonBody: { error: 'InvalidDiagnosticInput' } };
    }
    const bytes = Buffer.from(input.text);
    if (bytes.length > 4096) return { status: 413, jsonBody: { error: 'DiagnosticInputTooLarge' } };
    if (input.blobName !== undefined && !/^pilot\/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.txt$/i.test(input.blobName)) {
      return { status: 400, jsonBody: { error: 'InvalidDiagnosticInput' } };
    }
    const blobName = input.blobName ?? `pilot/${randomUUID()}.txt`;
    const inputSha256 = createHash('sha256').update(bytes).digest('hex');
    try {
      const result = await client.getContainerClient('landing').getBlockBlobClient(blobName)
        .uploadData(bytes, { blobHTTPHeaders: { blobContentType: 'text/plain' },
          conditions: { ifNoneMatch: '*' }, abortSignal: AbortSignal.timeout(30000) });
      return { status: 201, jsonBody: { blobName, inputSha256, etag: result.etag, versionId: result.versionId ?? null } };
    } catch (error) {
      return { status: 502, jsonBody: { error: 'UploadDiagnosticFailed', upstreamStatus: error.statusCode ?? null } };
    }
  };
}
