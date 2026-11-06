import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { pathToFileURL } from 'node:url';
import { runCrossServiceFlow } from './cross-service-flows.mjs';
import { flowStudyCases } from './flow-study-cases.mjs';
import { assessFlowEpisode, summarizeFlowStudy } from './flow-study-oracles.mjs';

export async function runFlowStudy({ outputDirectory = 'dist/flow-study' } = {}) {
  await mkdir(outputDirectory, { recursive: true });
  const files = [
    'scripts/e2e/cross-service-flows.mjs', 'scripts/e2e/flow-study-cases.mjs',
    'scripts/e2e/flow-study-oracles.mjs', 'scripts/e2e/run-flow-study.mjs',
    'docs/research/globalstack/study/PROTOCOL.md',
  ];
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const evidence = {
    schemaVersion: 1, recordedAt: new Date().toISOString(), sourceRevision: git(['rev-parse', 'HEAD']),
    workingTreeDirty: git(['status', '--porcelain']).length > 0,
    command: 'node scripts/e2e/run-flow-study.mjs', repetitions: 3, cases: flowStudyCases,
    environment: { node: process.version, platform: platform(), arch: arch(), logicalCpus: cpus().length },
    digests: Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')]))),
    limitations: ['First-party purposive mutations; no representative fault distribution', 'Two local synchronous scenarios; no live Azure comparison',
      'Three repetitions are not independent workloads', 'Delivery exclusion covers only the instrumented receiver during synchronous invocation'],
    attempts: [],
  };
  async function save() {
    evidence.summary = summarizeFlowStudy(evidence.attempts);
    await writeFile(`${outputDirectory}/results.json`, JSON.stringify(evidence, null, 2) + '\n');
  }
  await save();
  for (let repetition = 1; repetition <= evidence.repetitions; repetition += 1) {
    for (const definition of flowStudyCases) {
      const attempt = { caseId: definition.id, repetition, result: null, error: null };
      evidence.attempts.push(attempt);
      // Checkpoint before execution, so interruption cannot look like a completed study.
      attempt.error = { name: 'IncompleteAttempt', message: 'Execution has not completed' };
      await save();
      try {
        attempt.result = await runCrossServiceFlow(definition.scenario, {
          studyMutation: definition.mutation,
          progress: result => { attempt.result = structuredClone(result); },
        });
        assert.equal(attempt.result.episodes.length, 3);
        assert.equal(attempt.result.cleanupVerified, true);
        for (const episode of attempt.result.episodes) {
          assert.ok(episode.observedBoundaries.some(hop => hop.requestId === episode.input.requestId), 'No correlated service-boundary request');
          const checks = assessFlowEpisode(episode);
          assert.equal(checks.exclusiveOutcome, episode.label !== 'mutated', 'Unexpected outcome or ineffective mutation');
          if (episode.label !== 'mutated') assert.ok(Object.values(checks).every(Boolean), 'Positive control rejected');
        }
        attempt.error = null;
      } catch (error) {
        attempt.error = { name: error.name, message: error.message };
      }
      await save();
    }
  }
  evidence.completedAt = new Date().toISOString();
  await save();
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runFlowStudy();
  console.log(JSON.stringify(result.summary, null, 2));
  if (result.summary.inconclusiveCases > 0) process.exitCode = 1;
}
