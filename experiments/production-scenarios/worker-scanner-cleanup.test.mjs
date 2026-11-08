import test from 'node:test';
import assert from 'node:assert/strict';
import { pairedComponentManifests, pairedComponentClient } from './worker-scanner-cleanup.mjs';
import { workerPaths } from './worker-cleanup.mjs';
import { scannerPaths } from './scanner-cleanup.mjs';
const m = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-paired-test', runId: '123456abcdef',
  publisher: '11111111-1111-4111-8111-111111111111', roles: Array.from({ length: 7 }, (_, i) => `22222222-2222-4222-8222-22222222222${i}`) };
test('paired manifests reuse the publisher grant and isolate scanner pull access', () => {
  const { worker, scanner } = pairedComponentManifests(m), w = workerPaths(worker), s = scannerPaths(scanner);
  assert.equal(w.roles[5], s.roles[1]); assert.equal(w.registry, s.registry); assert.equal(w.identity, s.worker);
  assert.ok(!w.roles.includes(s.roles[0]));
  assert.throws(() => pairedComponentManifests({ ...m, roles: [...m.roles.slice(0, 6), m.roles[0]] }));
});
test('paired transport retains both allowlists and redacts host credentials', async () => {
  const observations = [], { worker, scanner } = pairedComponentManifests(m), w = workerPaths(worker), s = scannerPaths(scanner);
  const client = pairedComponentClient(m, event => observations.push(event), async () => ({ status: 200, body: { masterKey: 'synthetic-private-key' } }));
  await client('POST', `${w.app}/host/default/listkeys?api-version=2024-11-01`);
  assert.ok(!JSON.stringify(observations).includes('synthetic-private-key'));
  await client('GET', s.auth + '?api-version=2025-01-01');
  for (const [method, path] of [['DELETE', w.group], ['PUT', w.group], ['POST', `${s.app}/host/default/listkeys`], ['DELETE', `${s.app}-other`]]) {
    await assert.rejects(client(method, path), /allowlist/);
  }
});

test('a foreign scanner prevents deleting shared worker resources', async () => {
  const { cleanupPairedComponent } = await import('./worker-scanner-cleanup.mjs');
  const { worker, scanner } = pairedComponentManifests(m), w = workerPaths(worker), s = scannerPaths(scanner);
  const mutations = [];
  const request = async (method, path) => {
    if (method !== 'GET') mutations.push(path);
    const id = path.split('?')[0];
    if (id === s.app) return { status: 200, body: { tags: { run: 'foreign' } } };
    if (id === w.registry) return { status: 200, body: { tags: { run: m.runId, project: 'globalstack-production-scenarios' } } };
    return { status: 404 };
  };
  await assert.rejects(cleanupPairedComponent(m, request));
  assert.deepEqual(mutations, []);
});
