import test from 'node:test';
import assert from 'node:assert/strict';
import { recoverDocumentPaired } from './document-paired-recover.mjs';

const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const manifest = { subscription: uuid(1), group: 'gs-conformance-pilot', runId: '123456789abc',
  config: '/private/azure', parentPid: 12345, publisher: uuid(2),
  roles: Array.from({ length: 7 }, (_, i) => uuid(i + 3)),
  documentRoles: Array.from({ length: 3 }, (_, i) => uuid(i + 10)) };

const fixture = ({ resources = [], deployments = [], group = { name: manifest.group } } = {}) => {
  const called = [];
  const dependencies = {
    isAlive: () => false,
    token: () => 'private-token',
    cleanup: async input => { called.push('cleanup'); assert.equal(input.token, 'private-token'); return { resourcesAbsent: true }; },
    cli: (_config, args) => {
      called.push(args.slice(0, 3).join(' '));
      if (args[0] === 'resource') return resources;
      if (args[0] === 'deployment') return deployments;
      return group;
    },
    confirm: async (_path, runId) => { called.push('confirm'); assert.equal(runId, manifest.runId); },
  };
  return { called, dependencies };
};

test('recovery confirms budget only after ownership cleanup and independent empty readbacks', async () => {
  const { called, dependencies } = fixture();
  const result = await recoverDocumentPaired(manifest, dependencies);
  assert.equal(result.budgetCleanupConfirmed, true);
  assert.deepEqual(result.independentAzureReadback, { resources: 0, deploymentRecords: 0 });
  assert.deepEqual(called, ['cleanup', 'resource list --subscription', 'deployment group list', 'group show --subscription', 'confirm']);
});

test('recovery refuses a live runner before requesting a token or touching resources', async () => {
  const { called, dependencies } = fixture();
  dependencies.isAlive = () => true;
  await assert.rejects(recoverDocumentPaired(manifest, dependencies), /still active/);
  assert.deepEqual(called, []);
});

test('recovery leaves budget unresolved if independent inventory is nonempty', async () => {
  const { called, dependencies } = fixture({ resources: [{ id: 'still-present' }] });
  await assert.rejects(recoverDocumentPaired(manifest, dependencies), /not empty/);
  assert.ok(called.includes('cleanup'));
  assert.ok(!called.includes('confirm'));
});

test('recovery leaves budget unresolved if deployment history remains', async () => {
  const { called, dependencies } = fixture({ deployments: [{ name: 'still-present' }] });
  await assert.rejects(recoverDocumentPaired(manifest, dependencies), /history is not empty/);
  assert.ok(!called.includes('confirm'));
});
