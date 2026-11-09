import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { platforms } from './platforms.mjs';
import { compareNative } from './compare.mjs';
import { validateCapture } from './validate.mjs';

test('retained live evidence has intact hashes, complete native stages and reproducible comparisons', async () => {
  const base = new URL('./evidence/live/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  assert.deepEqual(index.platforms.map(item => item.id).sort(), platforms.map(item => item.id).sort());
  for (const entry of index.platforms) {
    const files = {};
    for (const [name, file] of Object.entries(entry.files)) {
      const data = await readFile(new URL(file.path, base));
      assert.equal(createHash('sha256').update(data).digest('hex'), file.sha256);
      files[name] = name.endsWith('.ndjson') ? data.toString() : JSON.parse(data);
    }
    const report = files['result.json'];
    assert.equal(validateCapture(report, platforms.find(item => item.id === entry.id)), true);
    assert.equal(report.revision, entry.revision);
    assert.deepEqual(JSON.parse(JSON.stringify(compareNative(report))), files['comparison.json']);
    assert.equal(files['comparison.json'].portalEvidenceComplete, false);
    const events = files['events.ndjson'].trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events.length, files['recording.json'].eventCount);
    assert.equal(createHash('sha256').update(files['events.ndjson']).digest('hex'), files['recording.json'].eventSha256);
    assert.equal(events.at(-1).type, 'run-end');
  }
});
