import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const evidence = new URL('./evidence/document-postgres-sql-paired-20261110/', import.meta.url);

test('published PostgreSQL SQL pair preserves both results and verified cleanup', async () => {
  const summary = JSON.parse(await readFile(new URL('summary.json', evidence), 'utf8'));
  const traceBytes = await readFile(new URL('trace.json', evidence));
  assert.equal(createHash('sha256').update(traceBytes).digest('hex'), summary.publishedTraceSha256);
  const trace = JSON.parse(traceBytes);
  assert.equal(summary.sourceRevision, trace.revision);
  assert.equal(summary.templateSha256, trace.templateSha256);
  assert.equal(summary.observationCount, trace.observations.length);
  assert.equal(summary.azureDeployment.terminalState, 'Succeeded');
  assert.equal(summary.globalstackDeployment.terminalState, 'Succeeded');
  assert.equal(summary.firewall.azure.initialStatus, 202);
  assert.equal(summary.firewall.local.initialStatus, 202);
  for (const sql of [summary.azureSql, summary.globalstackSql]) {
    assert.equal(sql.connection.status, 'passed');
    assert.equal(sql.schema.status, 'passed');
    assert.deepEqual(sql.schema.tables, ['document_access', 'document_outbox', 'document_revisions', 'scanned_documents']);
  }
  assert.deepEqual(summary.automaticAzureCleanup,
    { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true });
  assert.deepEqual(summary.independentAzureInventory, { resources: 0, deployments: 0 });
  assert.deepEqual(summary.localCleanup, { complete: true, failures: [] });
  assert.equal(summary.fullWorkflowCompleted, false);
  assert.equal(summary.budget.actualAzureChargesMeasured, false);
  const content = traceBytes.toString();
  assert.doesNotMatch(content, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|Bearer eyJ|\/home\/dev\//);
  assert.doesNotMatch(content, /\b[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}\b/i);
  assert.doesNotMatch(content, /\b(?:\d{1,3}\.){3}\d{1,3}\b/);
});
