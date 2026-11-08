import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupPostgres, postgresClient, postgresScope } from './document-postgres-cleanup.mjs';

const manifest = { subscription: '00000000-0000-0000-0000-000000000000', runId: 'a1b2c3d4e5f6', group: 'gs-prod-a1b2c3d4e5f6', token: 'synthetic' };
const scope = postgresScope(manifest);
const tags = { project: 'globalstack-production-scenarios', run: manifest.runId };

test('PostgreSQL client rejects paths outside the owned group', async () => {
  const request = postgresClient(manifest, () => {}, async () => ({ status: 404 }));
  await assert.rejects(request('DELETE', `/subscriptions/${manifest.subscription}/resourceGroups/foreign?api-version=2022-09-01`), /escaped/);
  await assert.rejects(request('DELETE', `${scope.server}?api-version=2024-08-01`), /escaped/);
});

test('foreign PostgreSQL group inventory prevents deletion', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push([method, new URL(path, 'https://management.azure.com').pathname]);
    const id = calls.at(-1)[1];
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group) return { status: 200, body: { tags } };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: [{ id: `${scope.group}/providers/Microsoft.Storage/storageAccounts/foreign` }] } };
    throw new Error('Unexpected cleanup request');
  };
  await assert.rejects(cleanupPostgres(manifest, request, { sleep: async () => {} }), /Unexpected resource/);
  assert.ok(calls.every(([method]) => method === 'GET'));
});

test('owned PostgreSQL group and deployment are absent after cleanup', async () => {
  let exists = true;
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group && method === 'DELETE') { exists = false; return { status: 202 }; }
    if (!exists) return { status: 404 };
    if (id === scope.group) return { status: 200, body: { tags } };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: [{ id: scope.server }] } };
    if (id === scope.server) return { status: 200, body: { tags } };
    throw new Error('Unexpected cleanup request');
  };
  assert.deepEqual(await cleanupPostgres(manifest, request, { sleep: async () => {} }),
    { groupAbsent: true, serverAbsent: true, deploymentAbsent: true });
});
