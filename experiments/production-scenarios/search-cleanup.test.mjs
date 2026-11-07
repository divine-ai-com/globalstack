import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupSearch, searchArmClient, searchScope } from './search-cleanup.mjs';

const manifest = { subscription: '00000000-0000-0000-0000-000000000000', runId: 'a123456789bc', group: 'gs-prod-a123456789bc', service: 'gsa123456789bc', deployment: 'gs-search-a123456789bc', token: 'synthetic' };
const scope = searchScope(manifest);
const tags = { run: manifest.runId, project: 'globalstack-production-scenarios' };

test('cleanup refuses foreign scope, credentials in URLs and unexpected inventory', async () => {
  let calls = 0;
  const client = searchArmClient(manifest, () => {}, async () => { calls++; throw new Error('Must not request'); });
  for (const url of ['https://example.com/', `https://user@management.azure.com${scope.group}`, `${scope.group}/unapproved`, `/subscriptions/other/resourceGroups/${manifest.group}`]) {
    await assert.rejects(client('DELETE', url));
  }
  assert.equal(calls, 0);
  const actions = [];
  await assert.rejects(cleanupSearch(manifest, async (method, path) => {
    actions.push(method);
    if (path.startsWith(scope.deployment)) return { status: 404 };
    if (path.includes('/resources?')) return { status: 200, body: { value: [{ id: `${scope.group}/providers/Other/resource/foreign` }] } };
    return { status: 200, body: { tags } };
  }), /Unexpected resources/);
  assert.ok(!actions.includes('DELETE'));
});

test('cleanup cancels owned deployments before deleting resources and verifies absence', async () => {
  const actions = [];
  let active = true, groupExists = true, deploymentExists = true;
  const result = await cleanupSearch(manifest, async (method, path) => {
    actions.push(`${method} ${path.split('?')[0]}`);
    if (path.startsWith(`${scope.deployment}/cancel`)) { active = false; return { status: 204 }; }
    if (path.startsWith(scope.deployment)) {
      if (method === 'DELETE') { deploymentExists = false; return { status: 202 }; }
      return deploymentExists ? { status: 200, body: { properties: { provisioningState: active ? 'Running' : 'Canceled', parameters: { runId: { value: manifest.runId }, groupName: { value: manifest.group } } } } } : { status: 404 };
    }
    if (path.includes('/resources?')) return { status: 200, body: { value: [{ id: scope.service }] } };
    if (path.startsWith(scope.service)) return { status: groupExists ? 200 : 404 };
    if (method === 'DELETE') { assert.equal(active, false); groupExists = false; return { status: 202 }; }
    return groupExists ? { status: 200, body: { tags } } : { status: 404 };
  }, { sleep: async () => {} });
  assert.equal(result.serviceAbsent, true);
  assert.ok(actions.indexOf(`POST ${scope.deployment}/cancel`) < actions.indexOf(`DELETE ${scope.group}`));
  assert.ok(actions.includes(`GET ${scope.service}`));
});

test('cleanup does not delete a deployment with mismatched ownership', async () => {
  const actions = [];
  await assert.rejects(cleanupSearch(manifest, async (method, path) => {
    actions.push(method);
    return { status: 200, body: { properties: { parameters: { runId: { value: 'someone-else' } } } } };
  }), /ownership mismatch/);
  assert.deepEqual(actions, ['GET']);
});
