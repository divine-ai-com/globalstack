import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { pathToFileURL } from 'node:url';

export function verifyReports(reports) {
  assert.ok(reports.length > 0, 'Supply at least one complete report');
const labels = ['connected', 'wrong-destination', 'restored-wrong-destination', 'missing-subscription',
  'restored-missing-subscription', 'duplicate-subscription', 'restored-duplicate-subscription'];
const faults = new Set(['wrong-destination', 'missing-subscription', 'duplicate-subscription']);
const resources = ['storage-account', 'blob-container', 'queue', 'file-share', 'table', 'service-bus-namespace',
  'service-bus-topic', 'event-grid-topic', 'event-hub-namespace', 'event-hub', 'app-config-store'];
const summary = { repetitions: 0, episodes: 0, positiveEpisodes: 0, rejectedFaultEpisodes: 0,
  distinctFaults: faults.size, minimumFreeGiB: Infinity, duplicateInsertCorrectionVerified: true };
const correlations = new Set();
for (const report of reports) {
  assert.equal(report.ok, true); assert.equal(report.error, null);
  assert.equal(report.sourceDirty, false); assert.equal(report.productDirty, false);
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.sourceRevision, report.productRevision);
  assert.match(report.sourceRevision, /^[0-9a-f]{40}$/);
  assert.equal(report.localFilesRemoved, true);
  assert.equal(report.platform, 'linux');
  assert.equal(report.architecture, 'x64');
  assert.equal(report.terraformVersion, '1.17.1');
  assert.ok(report.minimumFreeGiB >= 40);
  assert.deepEqual(report.episodes.map(e => e.label), labels);
  const stages = ['certificate', 'version', 'format-check', 'source-unit', 'init', 'validate'];
  for (const label of labels) {
    stages.push(`apply-${label}`, `plan-${label}`);
    if (label === 'connected') stages.push('outputs');
    stages.push(`behavior-${label}`);
  }
  stages.push('destroy');
  assert.deepEqual(report.stages.map(s => s.label), stages);
  assert.ok(report.stages.every(s => s.exitCode === 0));
  assert.ok((report.dependencyRetries ?? []).length <= 2);
  for (const [index, retry] of (report.dependencyRetries ?? []).entries()) {
    assert.equal(retry.label, 'init'); assert.equal(retry.attempt, index + 1);
    assert.ok(Number.isInteger(retry.exitCode) && retry.exitCode !== 0);
    assert.match(retry.log, /^\d+-init\.log$/);
  }
  assert.deepEqual(report.managementChecks.map(r => r.label), resources);
  assert.ok(report.managementChecks.every(r => r.status === 200));
  assert.deepEqual(report.cleanup.resourceStatuses.map(r => r.label), resources);
  assert.ok(report.cleanup.resourceStatuses.every(r => r.status === 404));
  for (const key of ['groupStatus', 'blobStatus', 'queueStatus', 'tableStatus', 'eventStatus']) assert.equal(report.cleanup[key], 404);
  assert.equal(report.cleanup.error, undefined);
  for (const e of report.episodes) {
    assert.ok(!correlations.has(e.event.id)); correlations.add(e.event.id);
    assert.equal(e.input.correlationId, e.event.id);
    assert.equal(e.event.data.claimId, e.input.claimId);
    assert.equal(e.event.data.blobName, `${e.event.id}.json`);
    const expected = { correlationId: e.event.id, claimId: e.input.claimId, blobName: e.event.data.blobName,
      sha256: createHash('sha256').update(JSON.stringify(e.input)).digest('hex') };
    assert.deepEqual(e.expectedRecord, expected);
    const entity = { PartitionKey: 'claims', RowKey: e.event.id, ...expected, status: 'queued' };
    const entityMatches = e.ledger.status === 200 && Object.entries(entity).every(([k, v]) => isDeepStrictEqual(e.ledger.body[k], v));
    const outcome = e.deliveries.length === 1 && e.deliveries[0].path === '/claims'
      && isDeepStrictEqual(e.deliveries[0].body, [e.event]) && e.messages.length === 1
      && isDeepStrictEqual(e.messages[0], expected) && entityMatches;
    const positive = !faults.has(e.label);
    assert.equal(outcome, positive); assert.equal(e.outcome, outcome); assert.equal(e.expectedOutcome, positive);
    assert.equal(e.publishStatus, 200); assert.deepEqual(e.workerErrors, []);
    const steps = [['blob', 'PUT', 201]];
    const executions = positive ? 1 : e.label === 'duplicate-subscription' ? 2 : 0;
    for (let i = 0; i < executions; i++) {
      steps.push(['blob', 'GET', 200], ['queue', 'POST', 201], ['table', 'POST', i === 0 ? 201 : 409]);
      if (i > 0) steps.push(['table', 'GET', 200]);
    }
    steps.push(['event-grid', 'POST', 200]);
    assert.deepEqual(e.boundaries.map(b => [b.service, b.method, b.status]), steps);
    if (e.label === 'wrong-destination' || e.label === 'missing-subscription') {
      assert.deepEqual(e.deliveries.map(d => d.path), e.label === 'wrong-destination' ? ['/wrong'] : []);
      assert.deepEqual(e.messages, []); assert.equal(e.ledger.status, 404);
    }
    if (e.label === 'duplicate-subscription') {
      assert.deepEqual(e.deliveries, [{ path: '/claims', body: [e.event] }, { path: '/claims', body: [e.event] }]);
      assert.deepEqual(e.messages, [expected, expected]); assert.ok(entityMatches);
    }
    summary.episodes++;
    if (positive) summary.positiveEpisodes++; else summary.rejectedFaultEpisodes++;
  }
  summary.repetitions++;
  summary.minimumFreeGiB = Math.min(summary.minimumFreeGiB, report.minimumFreeGiB);
}
return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reports = await Promise.all(process.argv.slice(2).map(async file => JSON.parse(await readFile(file, 'utf8'))));
  console.log(JSON.stringify(verifyReports(reports), null, 2));
}
