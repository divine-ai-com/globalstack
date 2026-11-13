import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForSearchReadiness } from './search-readiness.mjs';

test('Search readiness tolerates temporary 401 responses and bounds token refresh', async () => {
  let time = 0, calls = 0, refreshes = 0;
  const statuses = [401, 401, 401, 401, 401, 401, 401, 200];
  const observed = [];
  const result = await waitForSearchReadiness({
    deadline: 100000,
    now: () => time,
    sleep: async ms => { time += ms; },
    request: async () => ({ status: statuses[calls++] }),
    observe: response => observed.push(response.status),
    refreshToken: async () => { refreshes++; },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(observed, statuses);
  assert.equal(refreshes, 1);
});

test('Search readiness keeps unexpected responses and deadline failures visible', async () => {
  await assert.rejects(waitForSearchReadiness({ deadline: 1000, now: () => 0,
    request: async () => ({ status: 400 }), observe: () => {}, refreshToken: () => {}, sleep: () => {} }),
  /terminal response/);
  let time = 0;
  await assert.rejects(waitForSearchReadiness({ deadline: 20000, now: () => time,
    request: async () => ({ status: 401 }), observe: () => {}, refreshToken: () => {},
    sleep: async ms => { time += ms; } }), /readiness deadline/);
});
