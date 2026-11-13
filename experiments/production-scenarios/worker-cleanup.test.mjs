import test from 'node:test';
import assert from 'node:assert/strict';
import { workerPaths, workerClient, cleanupWorker, workerRoles } from './worker-cleanup.mjs';
const m = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-worker-test', runId: '123456abcdef',
  publisher: '11111111-1111-4111-8111-111111111111', roles: Array.from({ length: 6 }, (_, i) => `22222222-2222-4222-8222-22222222222${i}`) };
const s = workerPaths(m), principal = '33333333-3333-4333-8333-333333333333';
function fixture({ foreignRole = false } = {}) {
  const live = new Set(s.resources), mutations = [];
  return { live, mutations, request: async (method, path) => {
    const id = path.split('?')[0];
    if (s.deployments.includes(id)) return { status: 404 };
    if (id === s.group) { assert.equal(method, 'GET'); return { status: 200 }; }
    assert.ok(s.resources.includes(id));
    if (method === 'DELETE') {
      if (id === s.plan) assert.ok(!live.has(s.app), 'Site must be gone before plan');
      if ([s.storage, s.registry, s.identity].includes(id)) assert.ok(s.roles.every(role => !live.has(role)), 'Roles removed before scope or principal');
      mutations.push(id); live.delete(id); return { status: 202 };
    }
    if (!live.has(id)) return { status: 404 };
    const index = s.roles.indexOf(id);
    return { status: 200, body: index < 0 ? { tags: { run: m.runId, project: 'globalstack-production-scenarios' }, properties: { principalId: principal } }
      : { properties: { description: `globalstack-production-scenarios:${foreignRole ? 'foreign' : m.runId}`,
        roleDefinitionId: `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/${workerRoles[index]}`,
        principalId: index === 5 ? m.publisher : principal, scope: index < 4 ? s.storage : s.registry } } };
  } };
}
test('worker requests cannot delete the operator group or unrelated roles', async () => {
  let calls = 0;
  const request = workerClient(m, () => {}, async () => { calls++; return { status: 200 }; });
  for (const [method, path] of [['DELETE', s.group], ['PUT', s.group], ['DELETE', s.roles[0] + '-foreign'], ['POST', `${s.app}/listkeys`], ['GET', 'https://example.com']]) {
    await assert.rejects(request(method, path), /allowlist/);
  }
  assert.equal(calls, 0);
  await request('GET', s.app + '?api-version=2024-11-01'); assert.equal(calls, 1);
});
test('worker cleanup verifies role ownership and removes dependencies in order', async () => {
  const f = fixture();
  assert.deepEqual(await cleanupWorker(m, f.request), { resourcesAbsent: true, rolesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.equal(f.live.size, 0); assert.deepEqual(f.mutations, s.resources);
});
test('one foreign role prevents all worker resource deletion', async () => {
  const f = fixture({ foreignRole: true });
  await assert.rejects(cleanupWorker(m, f.request), /Role ownership mismatch/);
  assert.deepEqual(f.mutations, []);
});

test('worker cleanup retries an uncertain 503 delete only while the owned resource remains', async () => {
  const f = fixture(); let failures = 0;
  const request = async (method, path) => {
    if (method === 'DELETE' && path.startsWith(s.storage + '?') && failures++ === 0) return { status: 503, headers: { 'retry-after': '2' } };
    return f.request(method, path);
  };
  const delays = [];
  assert.equal((await cleanupWorker(m, request, { sleep: async ms => delays.push(ms) })).resourcesAbsent, true);
  assert.equal(failures, 2);
  assert.deepEqual(delays, [2000]);
});

test('worker client refreshes an expired token once without leaking it to observations', async () => {
  const observations = [], headers = [];
  const request = workerClient({ ...m, token: 'old-token', config: '/synthetic-config' }, event => observations.push(event),
    async (_url, options) => {
      headers.push(options.headers.authorization);
      return headers.length === 1 ? { status: 401, body: { error: { code: 'ExpiredAuthenticationToken' } } } : { status: 200, body: {} };
    }, () => 'new-token');
  assert.equal((await request('GET', `${s.app}?api-version=2024-11-01`)).status, 200);
  assert.deepEqual(headers, ['Bearer old-token', 'Bearer new-token']);
  assert.deepEqual(observations.map(x => x.status), [401, 200]);
  assert.ok(!JSON.stringify(observations).includes('new-token'));
});

test('only the owned host key operation is allowed and its response is never observed', async () => {
  const observations = [], secret = 'synthetic-host-master-key';
  const request = workerClient(m, event => observations.push(event), async () => ({ status: 200,
    body: { masterKey: secret, functionKeys: { default: secret }, systemKeys: { eventgrid: secret } },
    headers: { 'x-test-secret': secret } }));
  const result = await request('POST', `${s.app}/host/default/listkeys?api-version=2024-11-01`);
  assert.equal(result.body.masterKey, secret);
  assert.equal(observations[0].body, '<host-key response redacted>');
  assert.ok(!JSON.stringify(observations).includes(secret));
  for (const [method, path] of [['GET', `${s.app}/host/default/listkeys`],
    ['POST', `${s.app}-foreign/host/default/listkeys`], ['POST', `${s.app}/functions/foreign/listkeys`]]) {
    await assert.rejects(request(method, path), /allowlist/);
  }
});
