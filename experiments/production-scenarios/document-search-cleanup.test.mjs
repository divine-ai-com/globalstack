import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupDocumentSearch, documentSearchClient, documentSearchScope } from './document-search-cleanup.mjs';

const manifest = {
  subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-conformance-pilot',
  runId: 'aabbccddeeff', publisher: '11111111-1111-1111-1111-111111111111', token: 'synthetic',
  dataRoles: ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'],
  searchRoles: ['44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555',
    '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777'],
};

test('Search cleanup cannot contact a foreign ARM path or host', async () => {
  const request = documentSearchClient(manifest, () => {}, async () => {
    throw new Error('Transport must not be reached');
  });
  await assert.rejects(request('DELETE', 'https://example.invalid/resource?api-version=2025-05-01'), /owned scope/);
  await assert.rejects(request('DELETE', '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/foreign?api-version=2025-05-01'), /owned scope/);
  await assert.rejects(request('POST', `${documentSearchScope(manifest).group}/providers/Microsoft.Resources/deployments/foreign/cancel?api-version=2025-04-01`), /owned scope/);
});

test('Search cleanup refuses another run before any deletion', async () => {
  const scope = documentSearchScope(manifest);
  const mutations = [];
  const request = async (method, path) => {
    if (method !== 'GET') mutations.push(path);
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (id === scope.group) return { status: 200, body: {} };
    if (id === scope.search) return { status: 200, body: { tags: { project: 'globalstack-production-scenarios', run: 'other-run' } } };
    return { status: 404 };
  };
  await assert.rejects(cleanupDocumentSearch(manifest, request, { sleep: async () => {} }), /run mismatch/);
  assert.deepEqual(mutations, []);
});

test('Search cleanup preserves the pilot group and removes only an owned Search service', async () => {
  const scope = documentSearchScope(manifest);
  let exists = true;
  const deleted = [];
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (method === 'DELETE') {
      deleted.push(id);
      if (id === scope.search) exists = false;
      return { status: 202 };
    }
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: exists ? [{ id: scope.search }] : [] } };
    if (id === scope.search && exists) return { status: 200, body: { tags: { project: 'globalstack-production-scenarios', run: manifest.runId } } };
    return { status: 404 };
  };
  assert.deepEqual(await cleanupDocumentSearch(manifest, request, { sleep: async () => {} }),
    { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.deepEqual(deleted, [scope.search]);
});

test('Search cleanup refuses an unexpected child under the owned Storage account', async () => {
  const scope = documentSearchScope(manifest);
  const deleted = [];
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (method === 'DELETE') deleted.push(id);
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) return { status: 200, body: {
      value: [{ id: `${scope.storage}/blobServices/default/containers/unexpected-foreign-data` }],
    } };
    return { status: 404 };
  };
  await assert.rejects(cleanupDocumentSearch(manifest, request), /Foreign resource/);
  assert.deepEqual(deleted, []);
});

test('Search cleanup refuses a role with an unexpected definition before deletion', async () => {
  const scope = documentSearchScope(manifest);
  const deleted = [];
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (method === 'DELETE') deleted.push(id);
    if (id === scope.group) return { status: 200, body: {} };
    if (id === scope.storage) return { status: 200, body: { tags: { project: 'globalstack-production-scenarios', run: manifest.runId } } };
    if (id === scope.dataRoles[0]) return { status: 200, body: { properties: {
      description: `globalstack-production-scenarios:${manifest.runId}`, scope: scope.storage,
      principalId: manifest.publisher,
      roleDefinitionId: `/subscriptions/${manifest.subscription}/providers/Microsoft.Authorization/roleDefinitions/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`,
    } } };
    return { status: 404 };
  };
  await assert.rejects(cleanupDocumentSearch(manifest, request), /role definition mismatch/);
  assert.deepEqual(deleted, []);
});
