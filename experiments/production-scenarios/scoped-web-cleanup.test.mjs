import test from 'node:test';
import assert from 'node:assert/strict';
import { scopedWebPaths, scopedWebClient, cleanupScopedWeb } from './scoped-web-cleanup.mjs';
const manifest = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-test', runId: 'aa1122334455' };
const scope = scopedWebPaths(manifest);
test('scoped hosting cannot delete the group or access foreign resources', async () => {
  let calls = 0;
  const request = scopedWebClient(manifest, () => {}, async () => { calls++; return { status: 200 }; });
  for (const [method, path] of [['DELETE', scope.group], ['PUT', scope.group], ['GET', 'https://example.com/'], ['DELETE', scope.plans[0] + '-other'], ['DELETE', scope.deployment + '/operations'], ['GET', 'https://u@management.azure.com' + scope.group]]) {
    await assert.rejects(request(method, path), /allowlist/);
  }
  assert.equal(calls, 0);
});
test('scoped cleanup cancels deployment, deletes only tagged plans and preserves group', async () => {
  let active = true, deployment = true;
  const plans = new Set(scope.plans), actions = [];
  const result = await cleanupScopedWeb(manifest, async (method, path) => {
    path = path.split('?')[0]; actions.push([method, path]);
    if (path === scope.deployment + '/cancel') { active = false; return { status: 204 }; }
    if (path === scope.deployment) {
      if (method === 'DELETE') { assert.equal(plans.size, 0); deployment = false; return { status: 200 }; }
      return deployment ? { status: 200, body: { properties: { provisioningState: active ? 'Running' : 'Canceled', parameters: { runId: { value: manifest.runId }, serviceName: { value: scope.service } } } } } : { status: 404 };
    }
    if (scope.plans.includes(path)) {
      if (method === 'DELETE') { assert.equal(active, false); plans.delete(path); return { status: 202 }; }
      return plans.has(path) ? { status: 200, body: { tags: { run: manifest.runId, project: 'globalstack-production-scenarios' } } } : { status: 404 };
    }
    assert.equal(path, scope.group); assert.equal(method, 'GET'); return { status: 200 };
  }, { sleep: async () => {} });
  assert.deepEqual(result, { plansAbsent: true, deploymentAbsent: true, groupPreserved: true });
  assert.ok(!actions.some(([method, path]) => method === 'DELETE' && path === scope.group));
});
test('foreign plan tags block all resource deletion', async () => {
  const mutations = [];
  await assert.rejects(cleanupScopedWeb(manifest, async (method, path) => {
    if (method !== 'GET') mutations.push(method);
    if (path.startsWith(scope.deployment)) return { status: 404 };
    return { status: 200, body: { tags: { run: 'another-run' } } };
  }), /ownership mismatch/);
  assert.deepEqual(mutations, []);
});

test('document foundation allowlist contains only generated identities and network', async () => {
  const configured = { ...manifest, scenario: 'document-foundation' };
  const foundation = scopedWebPaths(configured);
  assert.equal(foundation.plans.length, 4);
  assert.deepEqual(Object.values(foundation.versions), ['2023-01-31', '2023-01-31', '2023-01-31', '2024-05-01']);
  let calls = 0;
  const request = scopedWebClient(configured, () => {}, async () => { calls++; return { status: 200 }; });
  await request('GET', foundation.plans[0] + '?api-version=2023-01-31');
  for (const path of [foundation.group, scope.plans[0], foundation.plans[0] + '-foreign']) {
    await assert.rejects(request('DELETE', path), /allowlist/);
  }
  assert.equal(calls, 1);
  assert.throws(() => scopedWebPaths({ ...manifest, scenario: 'arbitrary' }), /Unknown/);
});

test('foundation cleanup checks every resource owner and uses each provider API', async () => {
  const configured = { ...manifest, scenario: 'document-foundation' };
  const foundation = scopedWebPaths(configured);
  const remaining = new Set(foundation.plans);
  const result = await cleanupScopedWeb(configured, async (method, path) => {
    const url = new URL(path, 'https://management.azure.com');
    if (url.pathname === foundation.deployment) return { status: 404 };
    if (url.pathname === foundation.group) { assert.equal(method, 'GET'); return { status: 200 }; }
    assert.ok(foundation.plans.includes(url.pathname));
    assert.equal(url.searchParams.get('api-version'), foundation.versions[url.pathname]);
    if (method === 'DELETE') { remaining.delete(url.pathname); return { status: 202 }; }
    return remaining.has(url.pathname) ? { status: 200, body: { tags: { run: manifest.runId, project: 'globalstack-production-scenarios' } } } : { status: 404 };
  });
  assert.deepEqual(result, { resourcesAbsent: true, deploymentAbsent: true, groupPreserved: true });
  assert.equal(remaining.size, 0);
});
