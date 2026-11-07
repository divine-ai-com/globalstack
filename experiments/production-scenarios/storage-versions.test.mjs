import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createStorageDataPlaneRouter } from '../../packages/azure-data-plane/src/storage-router.mjs';
import { storageExchange } from './storage-http.mjs';
import { storageVersionCases } from './storage-version-cases.mjs';

async function fixture(t) {
  const router = createStorageDataPlaneRouter(), account = 'unrelatedrevision123', key = Buffer.alloc(64, 63).toString('base64');
  router.registerStorageAccount({ accountName: account, accountKey: key });
  router.configureBlobService({ accountName: account, isVersioningEnabled: true });
  const server = createServer(router.blobHandler());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const send = (method, path, headers = {}, body = '') => storageExchange({ account, key, surface: 'blob',
    origin: `http://127.0.0.1:${server.address().port}`, method, path, headers, body });
  return { router, account, key, send };
}

test('Blob version lifecycle reproduces captured Azure decisions with independently generated version IDs', async t => {
  const base = new URL('./evidence/version-baseline-97a7821/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  for (const [name, info] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(bytes.length, info.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), info.sha256);
  }
  const report = JSON.parse(await readFile(new URL('result.json', base)));
  assert.equal(report.sourceDirty, false);
  assert.equal(report.versionObservations.azure.complete, true);
  assert.equal(report.versionObservations.local.complete, false);
  assert.deepEqual(report.cleanup, { groupAbsent: true, accountAbsent: true });
  const observed = new Map(report.exchanges.filter(e => e.target === 'azure' && e.phase.startsWith('versions-')).map(e => [e.phase, e]));
  const { send } = await fixture(t);
  const local = new Map();
  const versions = await storageVersionCases(async item => {
    const result = await send(item.method, item.path, item.headers, item.body);
    local.set(item.id, result);
    const azure = observed.get(item.id);
    assert.equal(result.status, azure.status, item.id);
    const code = value => value.headers['x-ms-error-code'] ?? value.body.match(/<Code>(.*?)<\/Code>/)?.[1];
    assert.equal(code(result), code(azure), item.id);
    if (item.method === 'GET' && !item.path.includes('comp=list') && result.status === 200) assert.equal(result.body, azure.body, item.id);
    return result;
  }, { sleep: async () => assert.fail('Configured local versioning must be active') });
  assert.notEqual(versions.firstVersion, report.versionObservations.azure.firstVersion);
  const listed = local.get('versions-list-current-and-old').body;
  assert.equal((listed.match(/<Blob>/g) ?? []).length, 2);
  assert.ok(listed.includes(`<VersionId>${versions.firstVersion}</VersionId>`));
  assert.ok(listed.includes('<Metadata><owner>first</owner></Metadata>'));
  assert.equal((listed.match(/<IsCurrentVersion>true/g) ?? []).length, 1);
  assert.ok(!local.get('versions-list-after-delete').body.includes('<IsCurrentVersion>'));
  assert.ok(!local.get('versions-list-empty').body.includes('<Blob>'));
});

test('version history survives metadata changes, disabling versioning and account refresh; scoped deletion removes it', async t => {
  const { router, account, key, send } = await fixture(t);
  await send('PUT', '/history?restype=container');
  const first = await send('PUT', '/history/name', { 'x-ms-blob-type': 'BlockBlob', 'x-ms-meta-owner': 'first' }, 'v1');
  const second = await send('PUT', '/history/name?comp=metadata', { 'x-ms-meta-owner': 'second' });
  assert.notEqual(first.headers['x-ms-version-id'], second.headers['x-ms-version-id']);
  router.configureBlobService({ accountName: account, isVersioningEnabled: false });
  router.registerStorageAccount({ accountName: account, accountKey: key });
  const third = await send('PUT', '/history/name', { 'x-ms-blob-type': 'BlockBlob' }, 'unversioned');
  assert.equal(third.headers['x-ms-version-id'], undefined);
  const version = first.headers['x-ms-version-id'];
  const old = await send('GET', `/history/name?versionid=${encodeURIComponent(version)}`, { 'if-match': first.headers.etag });
  assert.equal(old.body, 'v1');
  const listing = await send('GET', '/history?restype=container&comp=list&include=versions,metadata');
  assert.ok(listing.body.includes('<owner>first</owner>'));
  assert.ok(listing.body.includes('<owner>second</owner>'));
  assert.equal((listing.body.match(/<Blob>/g) ?? []).length, 3);
  assert.equal((await send('GET', `/history/name?versionid=${encodeURIComponent(version)}`, { 'if-match': '"wrong"' })).status, 412);
  await send('DELETE', '/history?restype=container');
  await send('PUT', '/history?restype=container');
  assert.equal((await send('GET', `/history/name?versionid=${encodeURIComponent(version)}`)).status, 404);
  assert.equal(router.account(account).blobVersions.size, 0);
});

test('version listing paginates exact prefixes without accepting foreign or modified markers', async t => {
  const { send } = await fixture(t);
  await send('PUT', '/history?restype=container');
  for (const name of ['tenant/a.txt', 'tenant/a.txt', 'tenant/ab.txt', 'foreign/a.txt']) {
    await send('PUT', `/history/${name}`, { 'x-ms-blob-type': 'BlockBlob' }, name);
  }
  const path = '/history?restype=container&comp=list&include=versions&prefix=tenant/a&maxresults=1';
  let marker = '', count = 0, firstMarker;
  do {
    const result = await send('GET', path + (marker ? `&marker=${encodeURIComponent(marker)}` : ''));
    assert.equal(result.status, 200);
    assert.equal((result.body.match(/<Blob>/g) ?? []).length, 1);
    assert.ok(!result.body.includes('foreign/'));
    marker = result.body.match(/<NextMarker>(.*?)<\/NextMarker>/)[1];
    firstMarker ??= marker;
    assert.ok(++count <= 3);
  } while (marker);
  assert.equal(count, 3);
  assert.equal((await send('GET', path.replace('prefix=tenant/a', 'prefix=foreign/') + `&marker=${firstMarker}`)).status, 400);
  assert.equal((await send('GET', path + `&marker=${firstMarker}tampered`)).status, 400);
  assert.equal((await send('GET', path.replace('maxresults=1', 'maxresults=0'))).status, 400);
  assert.equal((await send('GET', path + '&delimiter=/')).status, 501);
});
