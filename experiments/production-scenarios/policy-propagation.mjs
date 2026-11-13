import assert from 'node:assert/strict';

export async function observePolicyPropagation({ request, expectedStatus, observe, timeoutMs = 90000,
  intervalMs = 5000, now = Date.now, sleep = ms => new Promise(done => setTimeout(done, ms)) }) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120000);
  assert.ok(Number.isInteger(intervalMs) && intervalMs > 0);
  const started = now(); let attempts = 0;
  do {
    let result;
    try { result = await request(); } catch { result = { status: null, error: 'request_failed' }; }
    attempts++;
    await observe({ attempt: attempts, elapsedMs: now() - started, expectedStatus, ...result });
    if (result.status === expectedStatus) return { ready: true, attempts, elapsedMs: now() - started };
    if (now() - started >= timeoutMs) break;
    await sleep(Math.min(intervalMs, timeoutMs - (now() - started)));
  } while (now() - started <= timeoutMs);
  return { ready: false, attempts, elapsedMs: now() - started };
}
