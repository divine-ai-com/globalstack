import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanupWorkerPostgres } from './document-worker-postgres-cleanup.mjs';
import { postgresScope } from './document-postgres-cleanup.mjs';

const manifest = { subscription: '00000000-0000-0000-0000-000000000000',
  runId: 'a1b2c3d4e5f6', group: 'gs-conformance-pilot', publisher: '11111111-1111-4111-8111-111111111111',
  roles: Array.from({ length: 6 }, (_, index) => `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`),
  token: 'synthetic' };
const scope = postgresScope(manifest);
const tags = { project: 'globalstack-production-scenarios', run: manifest.runId };

function reads({ foreign = null } = {}) {
  const calls = [];
  const request = async (method, path) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    calls.push([method, id]);
    assert.equal(method, 'GET');
    if (id === scope.deployment) return { status: 200, body: { properties: { parameters: {
      runId: { value: manifest.runId }, serviceName: { value: `gs${manifest.runId}` } } } } };
    if ([scope.server, scope.worker, scope.ingress].includes(id)) {
      return { status: 200, body: { tags: { ...tags, ...(id === foreign ? { run: 'foreign' } : {}) } } };
    }
    throw new Error(`Unexpected request for ${id}`);
  };
  return { request, calls };
}

test('combined cleanup checks both scopes before deleting either', async () => {
  const { request, calls } = reads({ foreign: scope.server });
  const steps = [];
  await assert.rejects(cleanupWorkerPostgres(manifest, { postgresRequest: request,
    workerCleanup: async (_m, _request, options) => { steps.push(options?.planOnly ? 'plan' : 'delete'); },
    postgresCleanup: async () => { steps.push('postgres-delete'); } }), /run mismatch/);
  assert.deepEqual(steps, ['plan']);
  assert.ok(calls.every(([method]) => method === 'GET'));
});

test('combined cleanup removes the worker before PostgreSQL and checks the shared identity', async () => {
  const { request, calls } = reads();
  const steps = [];
  const result = await cleanupWorkerPostgres(manifest, { postgresRequest: request,
    workerCleanup: async (_m, _request, options) => {
      steps.push(options?.planOnly ? 'plan' : 'worker'); return { resourcesAbsent: true };
    }, postgresCleanup: async () => { steps.push('postgres'); return { resourcesAbsent: true }; } });
  assert.deepEqual(steps, ['plan', 'worker', 'postgres']);
  assert.equal(result.cleanupComplete, true);
  assert.ok(calls.some(([, id]) => id === scope.worker));
});

test('PostgreSQL cleanup still runs after a worker cleanup failure', async () => {
  const { request } = reads();
  const steps = [];
  await assert.rejects(cleanupWorkerPostgres(manifest, { postgresRequest: request,
    workerCleanup: async (_m, _request, options) => {
      if (options?.planOnly) return { ownershipVerified: true };
      steps.push('worker-failed'); throw new Error('worker delete failed');
    }, postgresCleanup: async () => { steps.push('postgres'); return { resourcesAbsent: true }; } }),
  /cleanup incomplete/);
  assert.deepEqual(steps, ['worker-failed', 'postgres']);
});
