import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { compareSpecDirectories } from '../conformance/check-azure-spec-drift.mjs';
import { allCapabilities } from '../../packages/core/src/azure-tier1-capabilities.mjs';

const baseline = { trackedPaths: [{ path: 'specification/storage', treeSha: 'old' }], capabilities: [{ id: 'blob-storage', paths: ['specification/storage'] }] };
test('specification watch distinguishes unchanged, changed and removed directories', () => {
  assert.deepEqual(compareSpecDirectories(baseline, [{ path: 'specification/storage', type: 'dir', sha: 'old' }]), []);
  const changed = compareSpecDirectories(baseline, [{ path: 'specification/storage', type: 'dir', sha: 'new' }]);
  assert.equal(changed[0].status, 'changed');
  assert.deepEqual(changed[0].affectedCapabilities, ['blob-storage']);
  assert.equal(compareSpecDirectories(baseline, [])[0].status, 'missing');
  assert.throws(() => compareSpecDirectories(baseline, { message: 'rate limited' }));
});
test('specification baseline covers every registered capability', async () => {
  const baseline = JSON.parse(await readFile(new URL('../../docs/conformance/azure-spec-baseline.json', import.meta.url), 'utf8'));
  assert.deepEqual(baseline.capabilities.map(c => c.id).sort(), allCapabilities.map(c => c.id).sort());
  for (const capability of baseline.capabilities) {
    assert.ok(capability.paths.length);
    for (const path of capability.paths) assert.ok(baseline.trackedPaths.some(entry => entry.path === path));
  }
});
