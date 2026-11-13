import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureCli, azureToken } from './azure-session.mjs';
import { documentPaths } from './document-cleanup.mjs';
import { pairedComponentManifests } from './worker-scanner-cleanup.mjs';
import { cleanupDocumentPaired } from './document-paired-cleanup.mjs';
import { confirmBudgetCleanup, productionBudgetPath } from './budget-ledger.mjs';

const processAlive = pid => {
  try { process.kill(pid, 0); return true; }
  catch (error) { if (error.code === 'ESRCH') return false; throw error; }
};

export async function recoverDocumentPaired(m, {
  isAlive = processAlive, token = azureToken, cleanup = cleanupDocumentPaired,
  cli = azureCli, confirm = confirmBudgetCleanup, budgetPath = productionBudgetPath,
} = {}) {
  documentPaths(m);
  pairedComponentManifests(m);
  assert.ok(Number.isSafeInteger(m.parentPid) && m.parentPid > 0, 'Runner PID is required');
  assert.ok(!isAlive(m.parentPid), 'The paired runner is still active');
  assert.ok(typeof m.config === 'string' && m.config.startsWith('/'), 'Private Azure CLI configuration is required');

  const cleanupResult = await cleanup({ ...m, token: token(m.config) });
  assert.equal(cleanupResult.resourcesAbsent, true, 'Ownership-checked cleanup did not finish');
  const args = ['--subscription', m.subscription, '--resource-group', m.group];
  const resources = cli(m.config, ['resource', 'list', ...args]);
  const deployments = cli(m.config, ['deployment', 'group', 'list', ...args]);
  const group = cli(m.config, ['group', 'show', '--subscription', m.subscription, '--name', m.group]);
  assert.ok(Array.isArray(resources) && resources.length === 0, 'Azure resource group is not empty');
  assert.ok(Array.isArray(deployments) && deployments.length === 0, 'Azure deployment history is not empty');
  assert.equal(group.name?.toLowerCase(), m.group.toLowerCase(), 'Pilot resource group was not preserved');

  await confirm(budgetPath, m.runId);
  return { runId: m.runId, cleanup: cleanupResult, independentAzureReadback: { resources: 0, deploymentRecords: 0 },
    groupPreserved: true, budgetCleanupConfirmed: true, recoveredAt: new Date().toISOString() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, resultPath] = process.argv.slice(2);
  assert.ok(manifestPath?.startsWith('/') && resultPath?.startsWith('/'), 'Absolute private manifest and result paths are required');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const result = await recoverDocumentPaired(manifest);
  await writeFile(resultPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ runId: result.runId, ...result.independentAzureReadback, budgetCleanupConfirmed: true }));
}
