import assert from 'node:assert/strict';

export async function waitForSearchReadiness({ request, observe, refreshToken, deadline,
  now = Date.now, sleep = ms => new Promise(done => setTimeout(done, ms)) }) {
  let lastTokenRefresh = now();
  while (true) {
    assert.ok(now() < deadline, 'Azure Search did not become usable before the readiness deadline');
    const result = await request();
    observe(result);
    if (result.status === 200) return result;
    if (result.status === 401 && now() - lastTokenRefresh >= 60000) {
      await refreshToken();
      lastTokenRefresh = now();
    }
    assert.ok([401, 403, 404, 429, 503].includes(result.status),
      'Azure Search readiness failed with a terminal response');
    await sleep(10000);
  }
}
