import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createUploadDiagnostic } from './upload-diagnostic.mjs';

const env = { STORAGE_ENDPOINT: 'https://pilotdocs.blob.core.windows.net/', LANDING_CONTAINER: 'landing',
  AZURE_CLIENT_ID: '22222222-2222-4222-8222-222222222222' };

test('upload diagnostic writes bounded bytes to the landing container', async () => {
  let calls = 0;
  const blobs = { getContainerClient(container) {
    assert.equal(container, 'landing');
    return { getBlockBlobClient(name) {
      assert.match(name, /^pilot\/[a-f0-9-]{36}\.txt$/);
      return { async uploadData(bytes, options) {
        calls++;
        assert.equal(bytes.toString(), 'test document');
        assert.equal(options.blobHTTPHeaders.blobContentType, 'text/plain');
        assert.equal(options.conditions.ifNoneMatch, '*');
        return { etag: '"etag-one"', versionId: 'version-one' };
      } };
    } };
  } };
  const handler = createUploadDiagnostic({ env, blobs });
  const result = await handler({ json: async () => ({ tenant: 'pilot', text: 'test document' }) });
  assert.equal(result.status, 201);
  assert.equal(result.jsonBody.inputSha256, createHash('sha256').update('test document').digest('hex'));
  assert.equal(result.jsonBody.etag, '"etag-one"');
  assert.equal(result.jsonBody.versionId, 'version-one');
  assert.equal(calls, 1);
});

test('upload diagnostic rejects invalid input before writing and hides transport errors', async () => {
  let calls = 0;
  const blobs = { getContainerClient() { calls++; throw new Error('private upstream detail'); } };
  const handler = createUploadDiagnostic({ env, blobs });
  for (const input of [null, { tenant: 'other', text: 'x' }, { tenant: 'pilot', text: '' },
    { tenant: 'pilot', text: 'x', blobName: 'pilot/../other.txt' },
    { tenant: 'pilot', text: 'x', blobName: 'other/00000000-0000-0000-0000-000000000000.txt' }]) {
    assert.equal((await handler({ json: async () => input })).status, 400);
  }
  assert.equal((await handler({ json: async () => ({ tenant: 'pilot', text: 'x'.repeat(4097) }) })).status, 413);
  assert.equal(calls, 0);
  const failure = await handler({ json: async () => ({ tenant: 'pilot', text: 'x' }) });
  assert.equal(failure.status, 502);
  assert.ok(!JSON.stringify(failure).includes('private upstream detail'));
  assert.throws(() => createUploadDiagnostic({ env: { ...env, STORAGE_ENDPOINT: 'http://pilotdocs.blob.core.windows.net/' }, blobs }));
});

test('upload diagnostic accepts a pre-registered pilot blob name', async () => {
  const blobName = 'pilot/11111111-1111-4111-8111-111111111111.txt';
  let received;
  const blobs = { getContainerClient() { return { getBlockBlobClient(name) {
    received = name;
    return { uploadData: async () => ({ etag: 'etag-one', versionId: 'version-one' }) };
  } }; } };
  const handler = createUploadDiagnostic({ env, blobs });
  const result = await handler({ json: async () => ({ tenant: 'pilot', text: 'registered input', blobName }) });
  assert.equal(result.status, 201);
  assert.equal(result.jsonBody.blobName, blobName);
  assert.equal(received, blobName);
});
