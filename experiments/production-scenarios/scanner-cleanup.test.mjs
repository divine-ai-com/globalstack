import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scannerPaths, scannerClient, cleanupScanner } from './scanner-cleanup.mjs';
const m = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-conformance-pilot',
  runId: '012345abcdef', publisher: '11111111-1111-4111-8111-111111111111',
  roles: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'] };
function fixture() {
  const s = scannerPaths(m), deleted = [], resources = new Map();
  for (const id of s.resources) resources.set(id, { tags: { run: m.runId, project: 'globalstack-production-scenarios' }, properties: {} });
  resources.get(s.scanner).properties.principalId = '44444444-4444-4444-8444-444444444444';
  s.roles.forEach((id, i) => resources.set(id, { properties: { description: `globalstack-production-scenarios:${m.runId}`, scope: s.registry,
    principalId: i === 0 ? resources.get(s.scanner).properties.principalId : m.publisher,
    roleDefinitionId: `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/${i === 0 ? '7f951dda-4ed3-4680-a7ca-43fe172d538d' : '8311e382-0749-4cb8-b61a-304f252e45ec'}` } }));
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (id === s.group) return { status: 200, body: {} };
    if (id === `${s.group}/resources`) return { status: 200, body: { value: [...resources.values()] } };
    if (method === 'DELETE') { deleted.push(id); resources.delete(id); return { status: 202 }; }
    return resources.has(id) ? { status: 200, body: resources.get(id) } : { status: 404 };
  };
  return { s, deleted, resources, request };
}
test('scanner cleanup removes only verified resources in dependency order and preserves an empty group', async () => {
  const f = fixture(); const result = await cleanupScanner(m, f.request);
  assert.equal(result.groupEmpty, true); assert.equal(result.groupPreserved, true);
  assert.deepEqual(f.deleted, f.s.resources);
});
test('scanner cleanup refuses foreign resource tags and mismatched role recipients before deletion', async () => {
  for (const mutate of [f => { f.resources.get(f.s.registry).tags.run = 'foreign'; }, f => { f.resources.get(f.s.roles[0]).properties.principalId = m.publisher; }]) {
    const f = fixture(); mutate(f); await assert.rejects(cleanupScanner(m, f.request)); assert.deepEqual(f.deleted, []);
  }
});
test('scanner request boundary rejects external hosts and unowned resources', async () => {
  let calls = 0;
  const request = scannerClient({ ...m, token: 'test' }, () => {}, async () => { calls++; return { status: 200 }; });
  await assert.rejects(request('GET', 'https://outside.example/'));
  await assert.rejects(request('DELETE', `/subscriptions/${m.subscription}/resourceGroups/gs-unrelated`));
  assert.equal(calls, 0);
  await request('GET', `${scannerPaths(m).auth}?api-version=2025-01-01`); assert.equal(calls, 1);
});

test('scanner client refreshes an expired token during a long cleanup poll', async () => {
  const observations = [], headers = [];
  const request = scannerClient({ ...m, token: 'old-token', config: '/synthetic-config' }, event => observations.push(event),
    async (_url, options) => {
      headers.push(options.headers.authorization);
      return headers.length === 1 ? { status: 401, body: { error: { code: 'ExpiredAuthenticationToken' } } } : { status: 200, body: {} };
    }, () => 'new-token');
  assert.equal((await request('GET', `${scannerPaths(m).environment}?api-version=2025-01-01`)).status, 200);
  assert.deepEqual(headers, ['Bearer old-token', 'Bearer new-token']);
  assert.deepEqual(observations.map(x => x.status), [401, 200]);
  assert.ok(!JSON.stringify(observations).includes('new-token'));
});

test('slow environment deletion does not retain the registry and identities', async () => {
  const f = fixture(); let pending = false, observations = 0;
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (id === f.s.environment && method === 'DELETE') {
      pending = true; f.deleted.push(id); return { status: 202 };
    }
    if (id === f.s.environment && method === 'GET' && pending) {
      assert.ok(f.deleted.includes(f.s.registry));
      assert.ok(f.deleted.includes(f.s.scanner));
      assert.ok(f.deleted.includes(f.s.worker));
      if (observations++ === 0) return { status: 200, body: { properties: { provisioningState: 'ScheduledForDelete' } } };
      f.resources.delete(id); return { status: 404 };
    }
    return f.request(method, path);
  };
  assert.equal((await cleanupScanner(m, request, { sleep: async () => {} })).groupEmpty, true);
  assert.equal(observations, 2);
});

test('cleanup retries transient reads but still requires observed resource absence', async () => {
  const f = fixture(); let failures = 0; const delays = [];
  const request = async (method, path) => {
    if (method === 'GET' && path.startsWith(f.s.environment) && f.deleted.includes(f.s.environment) && failures++ === 0) {
      return { status: 503, headers: { 'retry-after': '2' } };
    }
    return f.request(method, path);
  };
  assert.equal((await cleanupScanner(m, request, { sleep: async ms => delays.push(ms) })).groupEmpty, true);
  assert.deepEqual(delays, [2000]);
});

test('cleanup stops on persistent read failure without claiming absence', async () => {
  let requests = 0;
  await assert.rejects(cleanupScanner(m, async () => { requests++; return { status: 503 }; }, { sleep: async () => {} }));
  assert.equal(requests, 5);
});

test('cleanup waits for owned inventory lag after provider absence and rejects foreign inventory', async () => {
  for (const foreign of [false, true]) {
    const f = fixture(); let reads = 0;
    const request = async (method, path) => {
      if (path.startsWith(`${f.s.group}/resources?`) && reads++ === 0) return { status: 200, body: { value: [{
        id: foreign ? `${f.s.group}/providers/Microsoft.App/managedEnvironments/unrelated` : f.s.environment,
        tags: { project: 'globalstack-production-scenarios', run: m.runId },
      }] } };
      return f.request(method, path);
    };
    if (foreign) await assert.rejects(cleanupScanner(m, request, { sleep: async () => {} }), /Unexpected resource/);
    else { assert.equal((await cleanupScanner(m, request, { sleep: async () => {} })).groupEmpty, true); assert.equal(reads, 2); }
  }
});
