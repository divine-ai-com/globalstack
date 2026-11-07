import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { storageVersionCases } from './storage-version-cases.mjs';

test('version diagnostics wait for observed data-plane activation and bound retries', async () => {
  const calls = [], delays = [];
  await assert.rejects(storageVersionCases(async item => {
    calls.push(item);
    return { status: 201, headers: {} };
  }, { sleep: async ms => { delays.push(ms); } }), /25 bounded/);
  assert.equal(calls.filter(item => item.id.startsWith('versions-readiness')).length, 25);
  assert.equal(delays.length, 24);
  assert.ok(calls.every(item => !item.path.includes('document.txt')));
  let attempted = 0;
  await assert.rejects(storageVersionCases(async item => {
    if (item.id === 'versions-container') return { status: 201, headers: {} };
    attempted++;
    return { status: 403, headers: {} };
  }, { sleep: async () => assert.fail('Do not retry an authorization failure') }), /upload failed/);
  assert.equal(attempted, 1);
});

test('initial readiness evidence remains incomplete despite its original zero exit code', async () => {
  const base = new URL('./evidence/version-readiness-2205374/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  for (const [name, item] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(bytes.length, item.bytes);
  }
  const report = JSON.parse(await readFile(new URL('result.json', base)));
  assert.equal(report.sourceDirty, false);
  assert.ok(Object.values(report.versionObservations).every(item => !item.complete));
  assert.deepEqual(report.cleanup, { groupAbsent: true, accountAbsent: true });
  const configuration = report.exchanges.filter(e => e.phase === 'enable-blob-versioning');
  assert.deepEqual(configuration.map(e => e.status), [200, 409]);
  assert.equal(configuration[0].body.properties.isVersioningEnabled, true);
  const write = report.exchanges.find(e => e.phase === 'versions-first-write' && e.target === 'azure');
  assert.equal(write.status, 201);
  assert.equal(write.headers['x-ms-version-id'], undefined);
});
