import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compare } from './compare.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const load = async name => JSON.parse(await readFile(resolve(root, 'evidence', name), 'utf8'));
const initial = await load('pre-fix.json');
const corrected = await load('corrected.json');
assert.equal(initial.targets.find(target => target.name === 'local').probes.find(probe => probe.phase === 'inject-drift').status, 404);
assert.equal(initial.targets.find(target => target.name === 'azure').probes.find(probe => probe.phase === 'inject-drift').status, 200);
assert.equal(initial.ok, false);
const result = compare(corrected);
assert.equal(result.completePilot, true);
assert.deepEqual(result, await load('corrected-comparison.json'));
assert.deepEqual(compare(initial), await load('pre-fix-comparison.json'));
for (const [file, digest] of Object.entries(corrected.source)) {
  assert.equal(createHash('sha256').update(await readFile(resolve(root, 'terraform', file))).digest('hex'), digest, `Changed IaC fixture: ${file}`);
}
for (const target of corrected.targets) {
  assert.equal(target.phases.length, 16);
  assert.equal(target.cleanup.nativeDestroy, true); assert.equal(target.cleanup.absent, true);
  assert.equal(target.cleanup.privateFilesRemoved, true); assert.equal(target.sourceUnchanged, true);
}
const crash = await load('crash-attempt.json');
const recovery = await load('recovery.json');
assert.ok(crash.targets[0].injectedFault?.startsWith('controller SIGKILL'));
assert.equal(crash.ok, false);
assert.equal(recovery.sourceRevision, crash.revision);
assert.deepEqual(recovery.source, corrected.source);
assert.equal(recovery.passed, true); assert.equal(recovery.watchdog.absent, true);
assert.equal(recovery.watchdog.fallbackDelete, true); assert.equal(recovery.verification.fallbackDelete, false);
assert.equal(recovery.privateFilesRemoved, true);
console.log('Initial failure, corrected lifecycle, source identity, observation coverage and crash cleanup verified.');
