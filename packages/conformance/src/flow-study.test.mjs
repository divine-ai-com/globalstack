import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessFlowEpisode } from '../../../scripts/e2e/flow-study-oracles.mjs';
import { flowStudyCases } from '../../../scripts/e2e/flow-study-cases.mjs';
import { runCrossServiceFlow } from '../../../scripts/e2e/cross-service-flows.mjs';

test('outcome checks distinguish duplicate, misrouted and uncorrelated deliveries', () => {
  const payload = { requestId: 'case-1', course: 'CS-101', office: 'curriculum-office' };
  const episode = { scenario: 'vault-enrichment', input: { requestId: 'case-1' },
    management: { deploymentState: 'Succeeded', workflowReadStatus: 200, operations: [{ status: 201 }] },
    workflowStatus: 'Succeeded', triggerStatus: 202, expectedPayload: payload,
    deliveries: [{ path: '/accepted', body: payload }] };
  assert.ok(Object.values(assessFlowEpisode(episode)).every(Boolean));
  const extra = structuredClone(episode);
  extra.deliveries.push({ path: '/wrong', body: { ...payload, requestId: 'incorrect-id' } });
  assert.equal(assessFlowEpisode(extra).exactAtTarget, true);
  assert.equal(assessFlowEpisode(extra).exclusiveOutcome, false);
  const duplicate = structuredClone(episode);
  duplicate.deliveries.push(duplicate.deliveries[0]);
  assert.equal(assessFlowEpisode(duplicate).arrival, true);
  assert.equal(assessFlowEpisode(duplicate).exactAtTarget, false);
  const mistyped = structuredClone(episode);
  mistyped.deliveries[0].body.course = 101;
  assert.equal(assessFlowEpisode(mistyped).exactAtTarget, false);
  const rejected = structuredClone(episode);
  rejected.management.operations.push({ status: 400 });
  assert.ok(Object.values(assessFlowEpisode(rejected)).every(value => !value));
});

for (const item of flowStudyCases) {
  test(`configuration fault and restoration: ${item.id}`, { timeout: 30000 }, async () => {
    const result = await runCrossServiceFlow(item.scenario, { studyMutation: item.mutation });
    assert.equal(result.cleanupVerified, true);
    assert.deepEqual(result.episodes.map(episode => assessFlowEpisode(episode).exclusiveOutcome), [true, false, true]);
  });
}
