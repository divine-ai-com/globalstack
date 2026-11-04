import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lifecycleStages, readStageResults } from '../../packages/bundle-runtime/src/stage-results.mjs';

test('requires evidence for every stage, even when destroy passed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'globalstack-stage-results-'));
  const platform = 'azure-terraform-hcl';
  try {
    for (const stage of lifecycleStages) {
      await writeFile(join(dir, `stage-${stage}.json`), JSON.stringify({ platform, stage, status: 'PASS' }));
    }
    assert.equal((await readStageResults(dir, platform)).every(result => result.ok), true);
    const path = join(dir, 'stage-integration-tests.json');
    for (const content of [
      '{invalid',
      JSON.stringify({ platform, stage: 'integration-tests', status: 'FAIL' }),
      JSON.stringify({ platform: 'azure-bicep', stage: 'integration-tests', status: 'PASS' }),
      JSON.stringify({ platform, stage: 'destroy', status: 'PASS' }),
    ]) {
      await writeFile(path, content);
      const results = await readStageResults(dir, platform);
      assert.equal(results.find(result => result.stage === 'integration-tests').ok, false);
      assert.equal(results.find(result => result.stage === 'destroy').ok, true);
    }
    await rm(path);
    assert.equal((await readStageResults(dir, platform)).every(result => result.ok), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
