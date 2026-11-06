import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { verifyReports } from '../../../experiments/claims-evidence/verify.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), 'claims/evidence');
const read = async name => JSON.parse(await readFile(resolve(root, name), 'utf8'));
const provenance = await read('provenance.json');
for (const source of provenance.productSources) {
  const bytes = await readFile(resolve(root, '../../../../..', source.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
}
for (const name of provenance.preFixRuns) {
  const earlier = await read(`${name}.json`);
  const duplicate = earlier.episodes.find(e => e.label === 'duplicate-subscription');
  assert.equal(earlier.ok, true);
  assert.deepEqual(duplicate.boundaries.filter(b => b.service === 'table' && b.method === 'POST').map(b => b.status), [201, 201]);
}
const labels = ['connected', 'wrong-destination', 'restored-wrong-destination', 'missing-subscription',
  'restored-missing-subscription', 'duplicate-subscription', 'restored-duplicate-subscription'];
const faults = new Set(['wrong-destination', 'missing-subscription', 'duplicate-subscription']);
const resources = ['storage-account', 'blob-container', 'queue', 'file-share', 'table', 'service-bus-namespace',
  'service-bus-topic', 'event-grid-topic', 'event-hub-namespace', 'event-hub', 'app-config-store'];
const summary = { repetitions: 0, episodes: 0, positiveEpisodes: 0, rejectedFaultEpisodes: 0,
  distinctFaults: faults.size, minimumFreeGiB: Infinity, duplicateInsertCorrectionVerified: true };
const correlations = new Set();
assert.deepEqual(provenance.retainedRuns, ['final-1', 'final-2', 'final-3']);
for (const name of provenance.retainedRuns) {
  const report = await read(`${name}.json`);
  assert.equal(report.ok, true); assert.equal(report.error, null);
  assert.equal(report.corpusDirty, false); assert.equal(report.productDirty, false);
  assert.equal(report.corpusRevision, provenance.corpusRevision);
  assert.equal(report.productRevision, provenance.productRevision);
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
// The public sample supersedes the private-harness sample without pooling observations.
const publicProvenance = await read('public-provenance.json');
for (const source of publicProvenance.sourceFiles) {
  const bytes = await readFile(resolve(root, '../../../../..', source.path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), source.sha256);
}
const publicReports = await Promise.all(publicProvenance.reports.map(read));
for (const report of publicReports) assert.equal(report.sourceRevision, publicProvenance.sourceRevision);
const publicSummary = verifyReports(publicReports);
for (const key of ['repetitions', 'episodes', 'positiveEpisodes', 'rejectedFaultEpisodes', 'distinctFaults']) {
  assert.equal(publicSummary[key], summary[key], `Public migration changed ${key}`);
}
Object.assign(summary, publicSummary);
const ciSummary = verifyReports([await read('ci-reproduction.json')]);
assert.equal(ciSummary.episodes, 7);
assert.equal(ciSummary.positiveEpisodes, 4);
assert.equal(ciSummary.rejectedFaultEpisodes, 3);
const macros = Object.entries({ ClaimsRepetitions: summary.repetitions, ClaimsEpisodes: summary.episodes,
  ClaimsPositives: summary.positiveEpisodes, ClaimsFaultEpisodes: summary.rejectedFaultEpisodes,
  ClaimsDistinctFaults: summary.distinctFaults, ClaimsMinimumFree: summary.minimumFreeGiB.toFixed(2) })
  .map(([name, value]) => `\\newcommand{\\${name}}{${value}}`).join('\n') + '\n';
await writeFile(resolve(root, 'measurements.tex'), macros);
await writeFile(resolve(root, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
const rows = [
  '\\begin{tabular}{lrrrr}\\toprule',
  'Configuration & Repeats & Callbacks & Messages & Outcome \\\\ \\midrule',
  `Connected / restored & ${summary.positiveEpisodes} & 1 & 1 & Pass \\\\`,
  `Wrong destination & ${summary.repetitions} & 1 (wrong) & 0 & Reject \\\\`,
  `No subscription & ${summary.repetitions} & 0 & 0 & Reject \\\\`,
  `Two subscriptions & ${summary.repetitions} & 2 & 2 & Reject \\\\`,
  '\\bottomrule\\end{tabular}', '',
];
await writeFile(resolve(root, 'rows.tex'), rows.join('\n'));
console.log(JSON.stringify(summary));
