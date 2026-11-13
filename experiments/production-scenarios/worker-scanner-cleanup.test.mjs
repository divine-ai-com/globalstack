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

test('paired cleanup removes shared resources, both role sets, and both deployments', async () => {
  const { cleanupPairedComponent } = await import('./worker-scanner-cleanup.mjs');
  const { workerRoles } = await import('./worker-cleanup.mjs');
  const { worker, scanner } = pairedComponentManifests(m), w = workerPaths(worker), s = scannerPaths(scanner);
  const live = new Set([...w.resources, ...s.resources]);
  const workerPrincipal = '33333333-3333-4333-8333-333333333333', scannerPrincipal = '44444444-4444-4444-8444-444444444444';
  const request = async (method, path) => {
    const id = path.split('?')[0];
    if (id === w.group) return { status: 200 };
    if (id === `${w.group}/resources`) return { status: 200, body: { value: [...live].filter(id => !id.includes('/roleAssignments/')).map(id => ({ id })) } };
    if (method === 'DELETE') { live.delete(id); return { status: 202 }; }
    if (!live.has(id)) return { status: 404 };
    const wi = w.roles.indexOf(id), si = s.roles.indexOf(id);
    if (wi >= 0 || si >= 0) return { status: 200, body: { properties: {
      description: `globalstack-production-scenarios:${m.runId}`, scope: wi >= 0 && wi < 4 ? w.storage : w.registry,
      principalId: wi === 5 ? m.publisher : wi >= 0 ? workerPrincipal : scannerPrincipal,
      roleDefinitionId: `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/${wi >= 0 ? workerRoles[wi] : workerRoles[4]}`,
    } } };
    return { status: 200, body: { tags: { run: m.runId, project: 'globalstack-production-scenarios' },
      properties: { principalId: id === s.scanner ? scannerPrincipal : workerPrincipal } } };
  };
  const result = await cleanupPairedComponent(m, request);
  assert.equal(result.resourcesAbsent, true); assert.equal(result.groupEmpty, true); assert.equal(live.size, 0);
});
