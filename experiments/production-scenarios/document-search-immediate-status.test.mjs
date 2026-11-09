import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('published Search first-read evidence records the observed lifecycle gap', async () => {
  const base = new URL('./evidence/document-search-immediate-status-20261109/', import.meta.url);
  const bytes = await readFile(new URL('trace.json', base));
  const trace = JSON.parse(bytes);
  const summary = JSON.parse(await readFile(new URL('summary.json', base)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), summary.publishedTraceSha256);
  assert.equal(trace.revision, summary.sourceRevision);
  assert.equal(trace.sourceDirty, false);
  assert.deepEqual(summary.immediateStatusReads.map(item => [item.target, item.operation,
    item.httpStatus, item.result]), [
    ['azure', 'index', 200, null], ['azure', 'delete', 200, 'success'],
    ['local', 'index', 200, 'success'], ['local', 'delete', 200, 'success'],
  ]);
  assert.equal(summary.firstStatusBodies[0].topLevelStatus, 'running');
  assert.equal(summary.firstStatusBodies[0].executionHistoryCount, 0);
  assert.equal(summary.firstStatusBodies[2].topLevelStatus, 'running');
  assert.equal(summary.firstStatusBodies[2].executionHistoryCount, 1);
  assert.ok(trace.stages.every(stage => stage.azureState === 'Succeeded' && stage.localState === 'Succeeded'));
  assert.ok(trace.searchTraversal.every(item => item.indexed && item.quarantineExcluded && item.softDeleteObserved));
  assert.deepEqual(trace.cleanup, { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.deepEqual(summary.independentAzureInventory, { resources: 0, deployments: 0 });
  assert.equal(trace.fullWorkflowCompleted, false);
  assert.doesNotMatch(bytes.toString(), /\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b/i);
});
