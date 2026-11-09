import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('published PostgreSQL SQL pilot retains its paired result and cleanup proof', async () => {
  const base = new URL('./evidence/document-postgres-sql-paired-20261109/', import.meta.url);
  const bytes = await readFile(new URL('trace.json', base));
  const trace = JSON.parse(bytes);
  const summary = JSON.parse(await readFile(new URL('summary.json', base)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), summary.publishedTraceSha256);
  assert.equal(trace.revision, summary.sourceRevision);
  assert.equal(trace.templateSha256, summary.templateSha256);
  assert.equal(trace.sourceDirty, false);
  assert.equal(trace.azureTerminalState, 'Succeeded');
  assert.equal(trace.localTerminalState, 'Succeeded');
  assert.equal(trace.firewall.azure.initialStatus, 202);
  assert.equal(trace.firewall.local.initialStatus, 501);
  assert.equal(trace.sql.azure.connection.status, 'passed');
  assert.equal(trace.sql.azure.schema.status, 'passed');
  assert.equal(trace.sql.local.attempted, false);
  assert.equal(trace.fullWorkflowCompleted, false);
  assert.deepEqual(trace.cleanup, { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.ok(trace.observations.some(event => event.target === 'local' && event.method === 'PUT'
    && event.path.includes('/firewallRules/pilot-egress') && event.status === 501
    && event.body?.error?.code === 'GlobalStackResourceTypeNotEmulated'));
  assert.equal(summary.independentAzureInventory.resources, 0);
  assert.equal(summary.independentAzureInventory.deployments, 0);
  assert.equal(summary.budget.actualAzureChargesMeasured, false);
});
