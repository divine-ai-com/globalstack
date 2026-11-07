import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storageScope, storageArmClient, cleanupStorage } from './storage-cleanup.mjs';
const manifest = { subscription: '00000000-0000-0000-0000-000000000000', runId: '123456abcdef', group: 'gs-storage-123456abcdef', account: 'gs123456abcdef', token: 'synthetic' };
const scope = storageScope(manifest);

test('Storage cleanup restricts origin, methods and exact owned resource paths', async () => {
  const calls = [];
  const request = storageArmClient(manifest, () => {}, async (url, options) => { calls.push([url.pathname, options.method]); return { status: 200, json: async () => ({}) }; });
  for (const path of ['https://external.example/', `https://user@management.azure.com${scope.group}`, `${scope.group}/foreign`, `${scope.group}#fragment`]) await assert.rejects(request('GET', path));
  await assert.rejects(request('DELETE', `${scope.account}/listKeys`));
  await assert.rejects(request('PUT', `${scope.group}/resources`));
  assert.equal(calls.length, 0);
  await request('GET', scope.account);
  assert.equal(calls.length, 1);
});

test('Storage cleanup refuses unknown ownership or extra resources before deletion', async () => {
  for (const mismatch of ['owner', 'inventory']) {
    const calls = [];
    await assert.rejects(cleanupStorage(manifest, async (method, path) => {
      calls.push(method);
      if (path.includes('/resources?')) return { status: 200, body: { value: [{ id: `${scope.group}/foreign` }] } };
      return { status: 200, body: { tags: { run: mismatch === 'owner' ? 'foreign' : manifest.runId, project: 'globalstack-storage-component' } } };
    }));
    assert.ok(!calls.includes('DELETE'));
  }
});

test('Storage cleanup verifies group and account absence', async () => {
  let exists = true;
  const calls = [];
  const result = await cleanupStorage(manifest, async (method, path) => {
    calls.push([method, path]);
    if (method === 'DELETE') { exists = false; return { status: 202 }; }
    if (!exists) return { status: 404 };
    if (path.includes('/resources?')) return { status: 200, body: { value: [{ id: scope.account }] } };
    return { status: 200, body: { tags: { run: manifest.runId, project: 'globalstack-storage-component' } } };
  });
  assert.deepEqual(result, { groupAbsent: true, accountAbsent: true });
  assert.equal(calls.at(-1)[1], `${scope.account}?api-version=2023-05-01`);
});
