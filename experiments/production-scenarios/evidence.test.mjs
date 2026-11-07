import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const base = new URL('./evidence/', import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, base), 'utf8'));
test('retained scenario diagnostics preserve integrity and do not claim application success', async () => {
  const index = await load('index.json');
  for (const [name, metadata] of Object.entries(index.files)) {
    const data = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(data).digest('hex'), metadata.sha256);
  }
  const report = await load('validation.json');
  assert.equal(report.sourceDirty, false);
  assert.equal(report.provisioningPerformed, false);
  assert.equal(report.noResourcesCreated, true);
  assert.equal(report.validationTerminalsComplete, true);
  assert.equal(report.fullProtocolParityEvaluated, false);
  assert.equal(report.portalEvidenceComplete, false);
  assert.equal(report.attempts.length, 4);
  for (const attempt of report.attempts) {
    assert.deepEqual(attempt.targets.map(item => item.target), ['azure', 'local']);
    assert.deepEqual(attempt.targets[0].request, attempt.targets[1].request);
    assert.equal(attempt.sameStatusAndErrorCode, false);
    assert.ok(attempt.targets.every(item => item.terminalObserved));
  }
  assert.equal(report.attempts[0].targets[0].body.error.code, 'InvalidTemplate');
  assert.equal(report.attempts[2].targets[0].body.error.details[0].code, 'InvalidServiceName');
  assert.equal(report.attempts[3].targets[0].status, 200);
  assert.ok(report.probes.every(item => item.status === 404));
  const events = await readFile(new URL('validation-events.ndjson', base));
  const recording = await load('validation-recording.json');
  assert.equal(createHash('sha256').update(events).digest('hex'), recording.eventSha256);
  assert.equal(events.toString().trim().split('\n').length, recording.eventCount);
});

test('all 101 application assertions remain required and unexecuted', async () => {
  const manifest = JSON.parse(await readFile(new URL('./requirements.json', import.meta.url), 'utf8'));
  assert.equal(manifest.assertions.length, 101);
  assert.equal(new Set(manifest.assertions.map(item => item.id)).size, 101);
  for (const item of manifest.assertions) {
    assert.equal(item.required, true);
    assert.equal(item.azure, 'not-run');
    assert.equal(item.globalstack, 'not-run');
  }
});
