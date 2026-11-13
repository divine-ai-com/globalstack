import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupWeb, webArmClient, webScope } from './web-cleanup.mjs';

const manifest = { subscription: '00000000-0000-0000-0000-000000000000', runId: 'a123456789bc', group: 'gs-prod-a123456789bc', service: 'gsa123456789bc', deployment: 'gs-web-a123456789bc', token: 'synthetic' };
const scope = webScope(manifest);
const tags = { run: manifest.runId, project: 'globalstack-production-scenarios' };

test('cleanup refuses foreign scope, credentials in URLs and unexpected inventory', async () => {
  let calls = 0;
  const client = webArmClient(manifest, () => {}, async () => { calls++; throw new Error('Must not request'); });
  for (const url of ['https://example.com/', `https://user@management.azure.com${scope.group}`, `${scope.group}/unapproved`, `/subscriptions/other/resourceGroups/${manifest.group}`]) {
    await assert.rejects(client('DELETE', url));
  }
  assert.equal(calls, 0);
  const actions = [];
  await assert.rejects(cleanupWeb(manifest, async (method, path) => {
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
  const result = await cleanupWeb(manifest, async (method, path) => {
    actions.push(`${method} ${path.split('?')[0]}`);
    if (path.startsWith(`${scope.deployment}/cancel`)) { active = false; return { status: 204 }; }
    if (path.startsWith(scope.deployment)) {
      if (method === 'DELETE') { deploymentExists = false; return { status: 202 }; }
      return deploymentExists ? { status: 200, body: { properties: { provisioningState: active ? 'Running' : 'Canceled', parameters: { runId: { value: manifest.runId }, groupName: { value: manifest.group } } } } } : { status: 404 };
    }
    if (path.includes('/resources?')) return { status: 200, body: { value: [{ id: scope.plans[0] }] } };
    if (scope.plans.some(id => path.startsWith(id))) return { status: groupExists ? 200 : 404 };
    if (method === 'DELETE') { assert.equal(active, false); groupExists = false; return { status: 202 }; }
    return groupExists ? { status: 200, body: { tags } } : { status: 404 };
  }, { sleep: async () => {} });
  assert.equal(result.plansAbsent, true);
  assert.ok(actions.indexOf(`POST ${scope.deployment}/cancel`) < actions.indexOf(`DELETE ${scope.group}`));
  assert.ok(actions.includes(`GET ${scope.plans[0]}`));
});

test('cleanup does not delete a deployment with mismatched ownership', async () => {
  const actions = [];
  await assert.rejects(cleanupWeb(manifest, async (method, path) => {
    actions.push(method);
    return { status: 200, body: { properties: { parameters: { runId: { value: 'someone-else' } } } } };
  }), /ownership mismatch/);
  assert.deepEqual(actions, ['GET']);
});

test('nested diagnostic scope permits reads but rejects mutations', async () => {
  const calls = [];
  const client = webArmClient(manifest, () => {}, async (url, options) => {
    calls.push(options.method);
    return { status: 200, json: async () => ({}) };
  });
  const path = `${scope.group}/providers/Microsoft.Resources/deployments/web-component/operations?api-version=2025-04-01`;
  assert.equal((await client('GET', path)).status, 200);
  await assert.rejects(client('DELETE', path), /escaped/);
  await assert.rejects(client('PUT', path), /escaped/);
  assert.deepEqual(calls, ['GET']);
});
