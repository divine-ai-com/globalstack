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

test('partial fixes retain the initial-status difference and remaining local failures', async () => {
  const prefix = 'validation-after-4b40af6/';
  const index = await load(`${prefix}index.json`);
  for (const [name, metadata] of Object.entries(index.files)) {
    const data = await readFile(new URL(prefix + name, base));
    assert.equal(createHash('sha256').update(data).digest('hex'), metadata.sha256);
    assert.equal(data.byteLength, metadata.bytes);
  }
  const report = await load(`${prefix}validation.json`);
  assert.equal(report.sourceDirty, false);
  assert.equal(report.noResourcesCreated, true);
  assert.equal(report.provisioningPerformed, false);
  assert.equal(report.validationTerminalsComplete, true);
  assert.equal(report.fullProtocolParityEvaluated, false);
  assert.equal(report.portalEvidenceComplete, false);
  for (const attempt of report.attempts) {
    const [azure, local] = attempt.targets;
    assert.deepEqual(attempt.targets.map(item => item.target), ['azure', 'local']);
    assert.deepEqual(azure.request, local.request);
    const terminal = azure.polls.at(-1) ?? azure;
    assert.equal(terminal.status, local.status);
    assert.equal(terminal.body?.error?.code, local.body?.error?.code);
  }
  assert.equal(report.attempts[1].targets[0].status, 202);
  assert.equal(report.attempts[1].targets[1].status, 200);
  const recording = await load(`${prefix}validation-recording.json`);
  const events = await readFile(new URL(`${prefix}validation-events.ndjson`, base));
  assert.equal(createHash('sha256').update(events).digest('hex'), recording.eventSha256);
  const local = await load(`${prefix}local-gaps.json`);
  assert.equal(local.sourceDirty, false);
  assert.equal(local.results.find(item => item.id === 'search-multiple-keys').status, 'pass');
  assert.deepEqual(local.results.filter(item => item.status === 'fail').map(item => item.id), [
    'search-fuzzy', 'search-invalid-vector', 'apim-backend-forwarding',
  ]);
});
