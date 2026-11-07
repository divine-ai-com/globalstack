import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { compareNative } from './compare.mjs';

test('a successful lifecycle does not conceal response differences or missing portal evidence', async () => {
  const report = JSON.parse(await readFile(new URL('./evidence/local/azure-terraform-hcl.json', import.meta.url), 'utf8'));
  report.targets.push({ ...structuredClone(report.targets[0]), name: 'azure' });
  const create = report.targets[1].traces.find(trace => trace.method === 'PUT');
  create.response.body.additionalAzureField = true;
  const result = compareNative(report);
  assert.equal(result.lifecyclePassed, true);
  assert.equal(result.exchangesWithDifferences, 1);
  assert.equal(result.portalEvidenceComplete, false);
  report.targets[1].cleanup.absent = false;
  assert.equal(compareNative(report).lifecyclePassed, false);
});
