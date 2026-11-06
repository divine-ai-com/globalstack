import { isDeepStrictEqual } from 'node:util';

export const checkNames = ['management', 'workflow', 'arrival', 'exactAtTarget', 'exclusiveOutcome'];

export function assessFlowEpisode(episode) {
  const { management, expectedPayload, deliveries, input, scenario } = episode;
  const accepted = deliveries.filter(item => item.path === '/accepted'
    && (scenario === 'vault-enrichment' ? item.body?.requestId : item.body?.[0]?.id) === input.requestId);
  const checks = {};
  checks.management = management.deploymentState === 'Succeeded' && management.workflowReadStatus === 200
    && management.operations.length > 0 && management.operations.every(op => [200, 201, 202, 204].includes(op.status));
  checks.workflow = checks.management && episode.triggerStatus === 202 && episode.workflowStatus === 'Succeeded';
  checks.arrival = checks.workflow && accepted.length > 0;
  checks.exactAtTarget = checks.workflow && accepted.length === 1 && isDeepStrictEqual(accepted[0].body, expectedPayload);
  checks.exclusiveOutcome = checks.exactAtTarget && deliveries.length === 1;
  return checks;
}

export function summarizeFlowStudy(attempts) {
  const episodes = attempts.flatMap(attempt => attempt.result?.episodes ?? []);
  const positive = episodes.filter(episode => episode.label !== 'mutated');
  const mutated = episodes.filter(episode => episode.label === 'mutated');
  return {
    attemptedCases: attempts.length,
    inconclusiveCases: attempts.filter(attempt => attempt.error).length,
    observedEpisodes: episodes.length,
    observedMutatedEpisodes: mutated.length,
    observedPositiveEpisodes: positive.length,
    checks: Object.fromEntries(checkNames.map(name => [name, {
      rejectedMutated: mutated.filter(episode => !assessFlowEpisode(episode)[name]).length,
      rejectedPositive: positive.filter(episode => !assessFlowEpisode(episode)[name]).length,
    }])),
  };
}
