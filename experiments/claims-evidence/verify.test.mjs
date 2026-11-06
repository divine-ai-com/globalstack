import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { verifyReports } from './verify.mjs';

// Adapt only the provenance schema for a verifier fixture; this is not a new experiment result.
const captured = JSON.parse(await readFile(new URL('../../docs/research/globalstack/claims/evidence/final-1.json', import.meta.url)));
const report = { ...captured, schemaVersion: 2, sourceRevision: captured.productRevision, sourceDirty: false,
  localFilesRemoved: true, platform: 'linux', architecture: 'x64' };

test('the report verifier rejects broken evidence even when aggregate ok stays true', () => {
  assert.equal(verifyReports([report]).episodes, 7);
  for (const change of [
    r => { r.stages.pop(); },
    r => { r.episodes[0].expectedRecord.sha256 = 'wrong'; },
    r => { r.episodes[0].deliveries.push(structuredClone(r.episodes[0].deliveries[0])); },
    r => { r.cleanup.tableStatus = 200; },
    r => { r.localFilesRemoved = false; },
    r => { r.sourceDirty = true; },
    r => { r.episodes.find(e => e.label === 'duplicate-subscription').boundaries.find(b => b.status === 409).status = 201; },
  ]) {
    const corrupted = structuredClone(report); change(corrupted);
    assert.throws(() => verifyReports([corrupted]));
  }
  assert.throws(() => verifyReports([]));
  assert.throws(() => verifyReports([report, report]), 'Repeated correlations cannot count as fresh repetitions');
});
