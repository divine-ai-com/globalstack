import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupPostgres, postgresClient, postgresScope } from './document-postgres-cleanup.mjs';

const manifest = { subscription: '00000000-0000-0000-0000-000000000000', runId: 'a1b2c3d4e5f6', group: 'gs-conformance-pilot', token: 'synthetic' };
const scope = postgresScope(manifest);
const tags = { project: 'globalstack-production-scenarios', run: manifest.runId };

test('PostgreSQL client rejects paths outside the owned group', async () => {
  const request = postgresClient(manifest, () => {}, async () => ({ status: 404 }));
  await assert.rejects(request('DELETE', `/subscriptions/${manifest.subscription}/resourceGroups/foreign?api-version=2022-09-01`), /escaped/);
  await assert.rejects(request('DELETE', `${scope.group}?api-version=2022-09-01`), /escaped/);
  await assert.rejects(request('PUT', `${scope.server}/firewallRules/other?api-version=2024-08-01`), /escaped/);
  await assert.rejects(request('DELETE', `${scope.group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/other?api-version=2023-01-31`), /escaped/);
  await assert.rejects(request('PUT', `${scope.workerFirewalls}/worker-${manifest.runId}-32?api-version=2024-08-01`), /escaped/);
});

test('paired worker firewall rules are scoped and removed before the server', async () => {
  const combined = { ...manifest, workerFirewallMode: true };
  const rule = scope.workerFirewall(0);
  const present = new Set([scope.server, rule]);
  const calls = [];
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    calls.push([method, id]);
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: [...present].map(value => ({ id: value })) } };
    if (id === scope.workerFirewalls) return { status: 200, body: { value: present.has(rule) ? [{ id: rule }] : [] } };
    if (id === scope.firewall || id === scope.worker || id === scope.ingress) return { status: 404 };
    if (method === 'DELETE' && present.has(id)) { present.delete(id); return { status: 202 }; }
    if (id === scope.server) return present.has(id) ? { status: 200, body: { tags } } : { status: 404 };
    if (id === rule) return present.has(id) ? { status: 200 } : { status: 404 };
    throw new Error('Unexpected cleanup request');
  };
  assert.equal((await cleanupPostgres(combined, request, { sleep: async () => {} })).resourcesAbsent, true);
  assert.ok(calls.findIndex(([method, id]) => method === 'DELETE' && id === rule)
    < calls.findIndex(([method, id]) => method === 'DELETE' && id === scope.server));
});

test('foreign child firewall rule prevents server deletion', async () => {
  const combined = { ...manifest, workerFirewallMode: true };
  const calls = [];
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    calls.push([method, id]);
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: [{ id: scope.server }] } };
    if (id === scope.server) return { status: 200, body: { tags } };
    if (id === scope.workerFirewalls) return { status: 200,
      body: { value: [{ id: `${scope.workerFirewalls}/foreign` }] } };
    throw new Error('Unexpected cleanup request');
  };
  await assert.rejects(cleanupPostgres(combined, request, { sleep: async () => {} }), /Foreign firewall rule/);
  assert.ok(calls.every(([method]) => method === 'GET'));
});

test('foreign PostgreSQL server tags prevent deletion', async () => {
  const calls = [];
  const request = async (method, path) => {
    calls.push([method, new URL(path, 'https://management.azure.com').pathname]);
    const id = calls.at(-1)[1];
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: [{ id: scope.server }] } };
    if (id === scope.server) return { status: 200, body: { tags: { ...tags, run: 'foreign' } } };
    throw new Error('Unexpected cleanup request');
  };
  await assert.rejects(cleanupPostgres(manifest, request, { sleep: async () => {} }), /Server run mismatch/);
  assert.ok(calls.every(([method]) => method === 'GET'));
});

test('owned PostgreSQL server is removed and pilot group retained', async () => {
  let exists = true;
  let firewallExists = true;
  let staleInventoryReads = 1;
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) {
      const stale = !exists && staleInventoryReads-- > 0;
      return { status: 200, body: { value: exists || stale ? [{ id: scope.server }] : [] } };
    }
    if (id === scope.server && method === 'DELETE') { exists = false; return { status: 202 }; }
    if (id === scope.server) return exists ? { status: 200, body: { tags } } : { status: 404 };
    if (id === scope.firewall && method === 'DELETE') { firewallExists = false; return { status: 202 }; }
    if (id === scope.firewall) return firewallExists ? { status: 200 } : { status: 404 };
    if (id === scope.worker || id === scope.ingress) return { status: 404 };
    throw new Error('Unexpected cleanup request');
  };
  assert.deepEqual(await cleanupPostgres(manifest, request, { sleep: async () => {} }),
    { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.equal(staleInventoryReads, -1, 'Cleanup must retry a stale child inventory after server deletion');
  assert.equal(firewallExists, false, 'Temporary network access must be removed before deleting the server');
});

test('foreign PostgreSQL pilot identity tags prevent deletion', async () => {
  const calls = [];
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    calls.push([method, id]);
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: [{ id: scope.worker }] } };
    if (id === scope.server || id === scope.worker && method === 'DELETE') return { status: 404 };
    if (id === scope.worker) return { status: 200, body: { tags: { ...tags, run: 'foreign' } } };
    throw new Error('Unexpected cleanup request');
  };
  await assert.rejects(cleanupPostgres(manifest, request, { sleep: async () => {} }), /Identity run mismatch/);
  assert.ok(calls.every(([method]) => method === 'GET'));
});

test('owned PostgreSQL pilot identities are removed after server cleanup', async () => {
  const present = new Set([scope.worker, scope.ingress]);
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    if (id === scope.deployment) return { status: 404 };
    if (id === scope.group) return { status: 200, body: {} };
    if (id === `${scope.group}/resources`) return { status: 200, body: { value: [...present].map(value => ({ id: value })) } };
    if (id === scope.server) return { status: 404 };
    if (present.has(id) && method === 'DELETE') { present.delete(id); return { status: 202 }; }
    if (id === scope.worker || id === scope.ingress) return present.has(id)
      ? { status: 200, body: { tags } } : { status: 404 };
    throw new Error('Unexpected cleanup request');
  };
  assert.deepEqual(await cleanupPostgres(manifest, request, { sleep: async () => {} }),
    { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.equal(present.size, 0);
});
