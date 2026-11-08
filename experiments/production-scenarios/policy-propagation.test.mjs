import assert from 'node:assert/strict';
import { test } from 'node:test';
import { observePolicyPropagation } from './policy-propagation.mjs';

test('policy activation retains each rejected request before the expected response', async () => {
  let time = 0, index = 0; const observations = [];
  const result = await observePolicyPropagation({ expectedStatus: 200, request: async () => ({ status: [403, 403, 200][index++] }),
    observe: value => observations.push(value), now: () => time, sleep: async ms => { time += ms; } });
  assert.deepEqual(observations.map(value => value.status), [403, 403, 200]);
  assert.deepEqual(result, { ready: true, attempts: 3, elapsedMs: 10000 });
});
test('policy timeout remains a failed activation and records transport failures', async () => {
  let time = 0; const observations = [];
  const result = await observePolicyPropagation({ expectedStatus: 403, timeoutMs: 10000, request: async () => { throw new Error('private request detail'); },
    observe: value => observations.push(value), now: () => time, sleep: async ms => { time += ms; } });
  assert.equal(result.ready, false); assert.equal(result.elapsedMs, 10000);
  assert.equal(observations.length, 3); assert.ok(observations.every(value => value.error === 'request_failed'));
});
