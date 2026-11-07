import assert from 'node:assert/strict';

export async function configureBlobVersioning(request, accountPath) {
  const response = await request('PUT', `${accountPath}/blobServices/default?api-version=2023-05-01`, {
    properties: { isVersioningEnabled: true, deleteRetentionPolicy: { enabled: false }, containerDeleteRetentionPolicy: { enabled: false } },
  });
  assert.ok([200, 201].includes(response.status), 'Blob service configuration did not complete');
  assert.equal(response.body?.properties?.isVersioningEnabled, true, 'Blob service did not retain the versioning setting');
  return response;
}

// The same sequence runs on both targets. Version identifiers are outputs of
// each target, not fixed values copied from Azure into the emulator.
export async function storageVersionCases(exchange, { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const blob = '/revision-probe/document.txt';
  const call = (id, method, path, headers = {}, body = '') => exchange({ id, surface: 'blob', method, path, headers, body });
  await call('versions-container', 'PUT', '/revision-probe?restype=container');
  let ready = false;
  for (let attempt = 0; attempt < 25; attempt++) {
    const result = await call(`versions-readiness-${attempt + 1}`, 'PUT', '/revision-probe/readiness', { 'x-ms-blob-type': 'BlockBlob' }, 'r');
    assert.equal(result.status, 201, 'Version readiness upload failed');
    if (typeof result.headers['x-ms-version-id'] === 'string') { ready = true; break; }
    if (attempt < 24) await sleep(5000);
  }
  assert.ok(ready, 'Versioning did not become effective within 25 bounded readiness writes');
  const first = await call('versions-first-write', 'PUT', blob, { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'text/plain', 'x-ms-meta-owner': 'first' }, 'original document');
  const firstVersion = first.headers['x-ms-version-id'];
  assert.equal(typeof firstVersion, 'string', 'Version-enabled upload did not return a version ID');
  const second = await call('versions-second-write', 'PUT', blob, { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'text/plain' }, 'updated document');
  const secondVersion = second.headers['x-ms-version-id'];
  assert.equal(typeof secondVersion, 'string');
  assert.notEqual(firstVersion, secondVersion);
  const old = `${blob}?versionid=${encodeURIComponent(firstVersion)}`, current = `${blob}?versionid=${encodeURIComponent(secondVersion)}`;
  await call('versions-read-old', 'GET', old);
  await call('versions-head-old', 'HEAD', old);
  await call('versions-read-current', 'GET', blob);
  await call('versions-invalid-date', 'GET', `${blob}?versionid=invalid-date`);
  await call('versions-delete-current-by-id', 'DELETE', current);
  await call('versions-read-after-current-id-delete', 'GET', blob);
  await call('versions-write-old', 'PUT', old, { 'x-ms-blob-type': 'BlockBlob' }, 'must not replace');
  await call('versions-metadata-old', 'PUT', `${old}&comp=metadata`, { 'x-ms-meta-owner': 'must-not-change' });
  await call('versions-list-current-and-old', 'GET', '/revision-probe?restype=container&comp=list&include=versions,metadata&prefix=document');
  await call('versions-delete-current', 'DELETE', blob);
  await call('versions-head-deleted-current', 'HEAD', blob);
  await call('versions-read-old-after-delete', 'GET', old, { 'if-match': first.headers.etag });
  await call('versions-list-after-delete', 'GET', '/revision-probe?restype=container&comp=list&include=versions&prefix=document');
  await call('versions-delete-missing', 'DELETE', `${blob}?versionid=2020-01-01T00%3A00%3A00.0000000Z`);
  await call('versions-delete-old', 'DELETE', old);
  await call('versions-read-deleted-old', 'GET', old);
  await call('versions-read-retained-second', 'GET', current);
  await call('versions-delete-second', 'DELETE', current);
  await call('versions-list-empty', 'GET', '/revision-probe?restype=container&comp=list&include=versions&prefix=document');
  return { firstVersion, secondVersion };
}
