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
  await assert.rejects(request('PUT', `${scope.account}/blobServices/foreign`));
  await assert.rejects(request('DELETE', `${scope.account}/blobServices/default`));
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
    if (path.includes('/resources?')) return { status: 200, body: { value: [{ id: scope.account }, { id: `${scope.account}/blobServices/default` }] } };
    return { status: 200, body: { tags: { run: manifest.runId, project: 'globalstack-storage-component' } } };
  });
  assert.deepEqual(result, { groupAbsent: true, accountAbsent: true });
  assert.equal(calls.at(-1)[1], `${scope.account}?api-version=2023-05-01`);
});

test('eventing mode permits only the declared deployment and role, with verified teardown', async () => {
  const eventManifest = { ...manifest, eventing: true, roleName: '11111111-2222-4333-8444-555555555555' };
  const owned = storageScope(eventManifest), network = [];
  const transport = storageArmClient(eventManifest, () => {}, async (url, options) => {
    network.push([url.pathname, options.method]); return { status: 200, json: async () => ({}) };
  });
  await transport('PUT', owned.deployment, { properties: {} });
  await transport('DELETE', owned.role);
  for (const [method, path] of [['PUT', owned.role], ['DELETE', owned.topic], ['PUT', owned.deployment + '-foreign'],
    ['DELETE', owned.role.replace(eventManifest.roleName, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')]]) {
    await assert.rejects(transport(method, path));
  }
  assert.equal(network.length, 2);
  assert.throws(() => storageScope({ ...eventManifest, eventing: 'true' }));
  let exists = true;
  const deletions = [];
  const request = async (method, path) => {
    if (method === 'DELETE') {
      deletions.push(path);
      if (path.startsWith(owned.group + '?')) exists = false;
      return { status: 202 };
    }
    if (!exists) return { status: 404 };
    if (path.startsWith(owned.role + '?')) return { status: 200, body: { id: owned.role, properties: {
      roleDefinitionId: `/subscriptions/${manifest.subscription}/providers/Microsoft.Authorization/roleDefinitions/c6a89b2d-59bc-44d0-9896-0f6e12d7b80a`,
    } } };
    if (path.includes('/resources?')) return { status: 200, body: { value: [owned.account, owned.topic, owned.queue].map(id => ({ id })) } };
    return { status: 200, body: { tags: { run: manifest.runId, project: 'globalstack-storage-component' } } };
  };
  assert.deepEqual(await cleanupStorage(eventManifest, request), { groupAbsent: true, accountAbsent: true,
    topicAbsent: true, subscriptionAbsent: true, roleAbsent: true, deploymentAbsent: true });
  assert.equal(deletions.length, 2);
  assert.ok(deletions[0].startsWith(owned.role + '?'));
});

test('eventing cleanup refuses a foreign resource or a changed role definition', async () => {
  const eventManifest = { ...manifest, eventing: true, roleName: '11111111-2222-4333-8444-555555555555' };
  const owned = storageScope(eventManifest);
  for (const changed of ['inventory', 'role']) {
    const mutations = [];
    await assert.rejects(cleanupStorage(eventManifest, async (method, path) => {
      if (method === 'DELETE') mutations.push(path);
      if (path.includes('/resources?')) return { status: 200, body: { value: [{ id: changed === 'inventory' ? `${owned.topic}-foreign` : owned.topic }] } };
      if (path.startsWith(owned.role + '?')) return { status: 200, body: { id: owned.role, properties: { roleDefinitionId: 'foreign-role' } } };
      return { status: 200, body: { tags: { run: manifest.runId, project: 'globalstack-storage-component' } } };
    }));
    assert.equal(mutations.length, 0);
  }
});

test('account-scoped sender capture restricts cleanup to its declared role', async () => {
  const eventManifest = { ...manifest, eventing: true, roleName: '11111111-2222-4333-8444-555555555555', roleScope: 'account' };
  const owned = storageScope(eventManifest);
  assert.equal(owned.roleScope, owned.account);
  assert.equal(owned.role, `${owned.account}/providers/Microsoft.Authorization/roleAssignments/${eventManifest.roleName}`);
  const calls = [];
  const request = storageArmClient(eventManifest, () => {}, async (url, options) => {
    calls.push([url.pathname, options.method]); return { status: 404, json: async () => null };
  });
  assert.ok(Object.values(await cleanupStorage(eventManifest, request)).every(value => value === true));
  await request('DELETE', owned.role);
  await assert.rejects(request('DELETE', `${owned.queue}/providers/Microsoft.Authorization/roleAssignments/${eventManifest.roleName}`));
  assert.throws(() => storageScope({ ...eventManifest, roleScope: 'subscription' }));
  assert.ok(calls.some(([path, method]) => path === owned.role && method === 'DELETE'));
});
