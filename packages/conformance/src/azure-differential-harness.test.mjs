import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAzureDifferentialScenario, selectDifferentialCases } from '../../core/src/azure-differential-scenarios.mjs';

test('AKS differential scenario defaults to validation-only cases', () => {
  const scenario = getAzureDifferentialScenario('aks-metadata');
  const selected = selectDifferentialCases(scenario);

  assert.equal(selected.length, 4);
  assert.ok(selected.every(item => item.provisioning === false));
  assert.deepEqual(selected.map(item => item.id), [
    'invalid-network-policy',
    'dns-service-ip-outside-service-cidr',
    'private-dns-none-public-fqdn-disabled',
    'agent-pool-orchestrator-above-control-plane',
  ]);
});

test('AKS differential scenario gates provisioning cases', () => {
  const scenario = getAzureDifferentialScenario('aks-metadata');

  assert.throws(
    () => selectDifferentialCases(scenario, { includeAll: true }),
    /Provisioning cases require --include-provisioning/,
  );

  const selected = selectDifferentialCases(scenario, { includeAll: true, includeProvisioning: true });
  assert.equal(selected.length, 6);
  assert.ok(selected.some(item => item.id === 'valid-private-public-fqdn-enabled' && item.provisioning));
  assert.ok(selected.some(item => item.id === 'invalid-network-plugin' && item.provisioning));
});

test('AKS differential case bodies are deterministic for the same context', () => {
  const scenario = getAzureDifferentialScenario('aks-metadata');
  const selectedCase = selectDifferentialCases(scenario, { caseId: 'private-dns-none-public-fqdn-disabled' })[0];
  const context = {
    name: 'aksdiffprivateabcd',
    location: 'eastus',
    kubernetesVersion: '1.29.2',
    vmSize: 'Standard_DS2_v2',
  };

  assert.deepEqual(selectedCase.body(context), selectedCase.body(context));
  assert.equal(selectedCase.body(context).properties.apiServerAccessProfile.enablePrivateCluster, true);
  assert.equal(selectedCase.body(context).properties.apiServerAccessProfile.privateDNSZone, 'None');
});

test('live differential runs fail before invoking cloud tools unless explicitly enabled', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  for (const target of ['azure', 'both']) {
    await assert.rejects(promisify(execFile)(process.execPath,
      [new URL('../../../scripts/capture/run-azure-differential.mjs', import.meta.url).pathname, `--target=${target}`],
      { env: { PATH: '' } }), error => {
      assert.match(error.stderr, /Real Azure differential capture is disabled/);
      assert.doesNotMatch(error.stderr, /ENOENT/);
      return true;
    });
  }
});
