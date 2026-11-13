import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('PostgreSQL deployment evidence retains the Azure/local mismatch and separate cleanup recovery', async () => {
  const base = new URL('./evidence/document-postgres-paired-efb90ad/', import.meta.url);
  const bytes = await readFile(new URL('result.json', base));
  const result = JSON.parse(bytes);
  const recovery = JSON.parse(await readFile(new URL('recovery.json', base)));
  assert.equal(result.revision.startsWith('efb90ad'), true);
  assert.equal(result.azureTerminalState, 'Succeeded');
  assert.equal(result.localTerminalState, 'MissingRequiredParameter');
  assert.equal(result.comparisonComplete, true);
  assert.equal(result.cleanup.cleanupComplete, false);
  assert.equal(recovery.firstPassCleanupComplete, false);
  assert.equal(recovery.watchdogCleanupComplete, false);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), recovery.originalResultSha256);
  assert.deepEqual([recovery.recovery.resourcesAbsent, recovery.recovery.deploymentsAbsent,
    recovery.recovery.groupPreserved, recovery.recovery.independentGroupResourceCount], [true, true, true, 0]);
  assert.equal(result.fullWorkflowCompleted, false);
  assert.equal(recovery.recovery.actualAzureChargesMeasured, false);
  const replay = JSON.parse(await readFile(new URL('./evidence/document-postgres-local-replay-f10ee8a/result.json', import.meta.url)));
  assert.equal(replay.sameSanitizedDeploymentRequest, true);
  assert.equal(replay.originalResultSha256, recovery.originalResultSha256);
  assert.equal(replay.deployment.status, result.azureInitialStatus);
  assert.equal(replay.deployment.state, result.azureTerminalState);
  assert.deepEqual(replay.resources, { server: 200, administrator: 200, database: 200 });
  assert.equal(replay.cleanup.groupAbsent, true);
});
