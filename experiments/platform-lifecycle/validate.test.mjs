import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { platforms } from './platforms.mjs';
import { validateCapture } from './validate.mjs';

const captures = await Promise.all(platforms.map(async platform => ({ platform, report: JSON.parse(await readFile(new URL(`./evidence/local/${platform.id}.json`, import.meta.url), 'utf8')) })));

test('all nine retained native captures have complete lifecycle evidence', () => {
  for (const { platform, report } of captures) assert.equal(validateCapture(report, platform), true);
});

test('aggregate success flags cannot hide missing stages, incorrect state or incomplete cleanup', () => {
  for (const { platform, report } of captures) {
    for (const corrupt of [
      record => { record.targets = []; },
      record => { record.targets.push(structuredClone(record.targets[0])); },
      record => { record.targets[0].name = 'unknown'; },
      record => { record.targets[0].phases.splice(2, 1); },
      record => { record.targets[0].probes.find(probe => probe.phase === 'read-update').body.tags.revision = 'one'; },
      record => { record.targets[0].probes = record.targets[0].probes.filter(probe => !probe.phase.startsWith('post-destroy-read-')); },
      record => { record.targets[0].cleanup.absent = false; },
      record => { record.targets[0].traces = []; },
      record => { record.sourceDirty = true; },
    ]) {
      const copy = structuredClone(report);
      corrupt(copy);
      assert.throws(() => validateCapture(copy, platform), platform.id);
    }
  }
});

test('failed development attempts retain their own digests and failure provenance', async () => {
  const { createHash } = await import('node:crypto');
  const index = JSON.parse(await readFile(new URL('./evidence/attempts/index.json', import.meta.url), 'utf8'));
  for (const attempt of index.attempts) {
    const raw = await readFile(new URL(`./evidence/attempts/${attempt.file}`, import.meta.url));
    assert.equal(createHash('sha256').update(raw).digest('hex'), attempt.sha256);
    const record = JSON.parse(raw);
    assert.equal(record.ok, false);
    assert.equal(record.revision, attempt.revision);
    assert.equal(record.sourceDirty, attempt.sourceDirty);
    assert.equal(record.platform, attempt.platform);
  }
});
