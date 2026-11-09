import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('paired Search recheck preserves the measured result and its timing limit', async () => {
  const base = new URL('./evidence/document-search-async-recheck-20261109/', import.meta.url);
  const bytes = await readFile(new URL('trace.json', base));
  const trace = JSON.parse(bytes);
  const summary = JSON.parse(await readFile(new URL('summary.json', base)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), summary.publishedTraceSha256);
  assert.equal(trace.revision, summary.sourceRevision);
  assert.equal(trace.sourceDirty, false);
  assert.ok(trace.stages.every(stage => stage.azureState === 'Succeeded' && stage.localState === 'Succeeded'));
  assert.deepEqual(trace.searchTraversal.map(item => [item.target, item.indexed, item.quarantineExcluded,
    item.softDeleteObserved, item.indexerStatus]), [
    ['azure', true, true, true, 'success'], ['local', true, true, true, 'success'],
  ]);
  assert.deepEqual(trace.negativeWiring.map(item => [item.target, item.stages[1].status, item.quarantineIndexed]),
    [['azure', 401, false], ['local', 401, false]]);
  const failures = trace.observations.filter(item => item.phase?.includes('wrong-container-indexer') && item.status === 401);
  assert.equal(failures.length, 2);
  assert.equal(failures[0].body.error.message, failures[1].body.error.message);
  assert.equal(summary.indexerRunAndStatusCalls.filter(item => item.method === 'POST').length, 4);
  assert.ok(summary.indexerRunAndStatusCalls.filter(item => item.method === 'POST').every(item => item.status === 202));
  assert.equal(summary.immediateInProgressStateCompared, false);
  assert.deepEqual(trace.cleanup, { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.deepEqual(summary.independentAzureInventory, { resources: 0, deployments: 0 });
  assert.equal(trace.fullWorkflowCompleted, false);
});
