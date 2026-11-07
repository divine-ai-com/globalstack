import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { sourceRevision } from './adapters.mjs';
import { createDefaultHttpClient, createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { toCompatResponse } from '@azure/core-http-compat';
import { createStorageDataPlaneRouter } from '../../../packages/azure-data-plane/src/storage-router.mjs';

const input = { container: 'landing', blobName: 'tenant/report.txt', etag: 'original' };
const version = '2026-11-07T00:00:00.0000000Z';
const content = 'historical document';
const key = Buffer.alloc(64, 42).toString('base64');

// Explicit protocol fixtures exercise the real Blob SDK and adapter. These
// responses are not Azure captures or evidence of emulator version support.
async function fixture(t, { currentStatus = 404, currentCode = 'BlobNotFound', listed = true,
  historicalEtag = 'original', downloadStatus = 206, currentEtag = 'newer', count = 1 } = {}) {
  const calls = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    calls.push({ method: req.method, path: url.pathname, query: Object.fromEntries(url.searchParams), ifMatch: req.headers['if-match'] });
    const error = (status, code) => {
      res.writeHead(status, { 'x-ms-error-code': code, 'content-type': 'application/xml' });
      res.end(req.method === 'HEAD' ? undefined : `<Error><Code>${code}</Code><Message>Test fixture</Message></Error>`);
    };
    if (url.searchParams.get('comp') === 'list') {
      const entries = listed ? Array.from({ length: count }, () => `<Blob><Name>tenant/report.txt</Name><VersionId>${version}</VersionId><IsCurrentVersion>false</IsCurrentVersion><Properties><Etag>"${count > 1 ? 'unrelated' : 'original'}"</Etag><Content-Length>${Buffer.byteLength(content)}</Content-Length><BlobType>BlockBlob</BlobType></Properties></Blob>`).join('') : '';
      res.writeHead(200, { 'content-type': 'application/xml' });
      return res.end(`<EnumerationResults ServiceEndpoint="http://localhost" ContainerName="landing"><Blobs>${entries}</Blobs><NextMarker /></EnumerationResults>`);
    }
    if (req.method === 'HEAD') {
      const historical = url.searchParams.has('versionid');
      if (!historical && currentStatus !== 200) return error(currentStatus, currentCode);
      res.writeHead(200, { etag: `"${historical ? historicalEtag : currentEtag}"`,
        'content-length': Buffer.byteLength(content), 'content-type': 'text/plain', 'x-ms-blob-type': 'BlockBlob', 'x-ms-version-id': version });
      return res.end();
    }
    if (req.method === 'GET' && url.pathname.endsWith('/report.txt')) {
      if (downloadStatus !== 206) return error(downloadStatus, 'ConditionNotMet');
      res.writeHead(206, { 'content-type': 'text/plain', 'content-length': Buffer.byteLength(content),
        'content-range': `bytes 0-${Buffer.byteLength(content) - 1}/${Buffer.byteLength(content)}`, etag: '"original"' });
      return res.end(content);
    }
    return error(400, 'UnexpectedFixtureRequest');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const blobs = new BlobServiceClient(`http://127.0.0.1:${server.address().port}/account`, new StorageSharedKeyCredential('account', key),
    { retryOptions: { maxTries: 1 } });
  return { blobs, calls };
}

test('a deleted current blob falls back to the exact retained version through the Blob SDK', async t => {
  const { blobs, calls } = await fixture(t);
  assert.equal((await sourceRevision(blobs, input)).bytes.toString(), content);
  assert.deepEqual(calls.map(item => item.method), ['HEAD', 'GET', 'HEAD', 'GET']);
  assert.equal(calls[1].query.include, 'versions');
  assert.equal(calls[1].query.prefix, input.blobName);
  assert.equal(calls[2].query.versionid, version);
  assert.equal(calls[3].query.versionid, version);
  assert.equal(calls[3].ifMatch, '"original"');
});

test('a matching current ETag pins the version without a listing', async t => {
  const { blobs, calls } = await fixture(t, { currentStatus: 200, currentEtag: 'original' });
  assert.equal((await sourceRevision(blobs, input)).bytes.toString(), content);
  assert.deepEqual(calls.map(item => item.method), ['HEAD', 'GET']);
  assert.equal(calls[1].query.versionid, version);
  assert.equal(calls[1].ifMatch, '"original"');
});

test('an overwritten blob resolves the event version rather than downloading current content', async t => {
  const { blobs, calls } = await fixture(t, { currentStatus: 200 });
  assert.equal((await sourceRevision(blobs, input)).bytes.toString(), content);
  assert.equal(calls.at(-1).query.versionid, version);
});

test('authorization and missing-container errors do not trigger fallback', async t => {
  for (const [currentStatus, currentCode] of [[403, 'AuthorizationPermissionMismatch'], [404, 'ContainerNotFound']]) {
    const { blobs, calls } = await fixture(t, { currentStatus, currentCode });
    await assert.rejects(sourceRevision(blobs, input), { statusCode: currentStatus });
    assert.equal(calls.length, 1);
  }
});

test('missing or mismatched historical versions never reach download', async t => {
  for (const [options, expected] of [[{ listed: false }, /unavailable/], [{ historicalEtag: 'wrong-version' }, /does not match/], [{ count: 1001 }, /exceeded its bound/]]) {
    const { blobs, calls } = await fixture(t, options);
    await assert.rejects(sourceRevision(blobs, input), expected);
    assert.ok(!calls.some(item => item.method === 'GET' && item.path.endsWith('/report.txt')));
  }
});

test('a failed download ETag condition remains a failure', async t => {
  const { blobs, calls } = await fixture(t, { downloadStatus: 412 });
  await assert.rejects(sourceRevision(blobs, input), { statusCode: 412, code: 'ConditionNotMet' });
  assert.equal(calls.at(-1).ifMatch, '"original"');
});

test('native Blob SDK and document adapter recover immutable versions from the actual emulator router', async t => {
  const router = createStorageDataPlaneRouter(), account = 'sdkversionfixture';
  router.registerStorageAccount({ accountName: account, accountKey: key });
  router.configureBlobService({ accountName: account, isVersioningEnabled: true });
  const server = createServer(router.blobHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const transport = createDefaultHttpClient();
  // Route signed SDK requests to loopback. The account host and signed paths
  // remain unchanged; neither SDK nor application receives synthetic responses.
  const blobs = new BlobServiceClient(`http://${account}.blob.core.windows.net`, new StorageSharedKeyCredential(account, key), {
    retryOptions: { maxTries: 1 }, httpClient: { async sendRequest(request) {
      const url = new URL(request.url);
      request.headers.set('host', url.hostname);
      url.hostname = '127.0.0.1'; url.port = String(server.address().port); request.url = url.href;
      const outgoing = createPipelineRequest({ ...request, headers: createHttpHeaders(request.headers.toJson()), allowInsecureConnection: true });
      return { ...toCompatResponse(await transport.sendRequest(outgoing)), request };
    } },
  });
  const container = blobs.getContainerClient('landing');
  await container.create();
  const blob = container.getBlockBlobClient('tenant/report.txt');
  const original = await blob.upload('original application bytes', 26, { metadata: { owner: 'original' } });
  const changed = await blob.upload('new bytes', 9);
  assert.notEqual(original.versionId, changed.versionId);
  const event = { ...input, etag: original.etag.replaceAll('"', '') };
  assert.equal((await sourceRevision(blobs, event)).bytes.toString(), 'original application bytes');
  await blob.delete();
  assert.equal((await sourceRevision(blobs, event)).bytes.toString(), 'original application bytes');
  const versions = [];
  for await (const page of container.listBlobsFlat({ includeVersions: true, includeMetadata: true }).byPage({ maxPageSize: 1 })) {
    assert.equal(page.segment.blobItems.length, 1);
    versions.push(...page.segment.blobItems);
  }
  assert.equal(versions.length, 2);
  assert.equal(versions[0].metadata.owner, 'original');
  assert.equal(versions[0].properties.etag.replaceAll('"', ''), event.etag);
  await blob.withVersion(original.versionId).delete();
  await assert.rejects(sourceRevision(blobs, event), /unavailable/);
  const retained = await sourceRevision(blobs, { ...input, etag: changed.etag.replaceAll('"', '') });
  assert.equal(retained.bytes.toString(), 'new bytes');
});
