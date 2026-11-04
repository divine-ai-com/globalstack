import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const lifecycleStages = ['build', 'lint', 'unit-tests', 'deploy', 'provider-lifecycle', 'integration-tests', 'destroy'];

export async function readStageResults(reportDir, platformId) {
  return Promise.all(lifecycleStages.map(async stage => {
    try {
      const evidence = JSON.parse(await readFile(join(reportDir, `stage-${stage}.json`), 'utf8'));
      return { stage, ok: evidence.platform === platformId && evidence.stage === stage && evidence.status === 'PASS' };
    } catch {
      return { stage, ok: false };
    }
  }));
}
