import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';

export function scopedWebPaths(manifest) {
  assert.match(manifest.subscription ?? '', /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
  assert.match(manifest.group ?? '', /^gs-[a-z0-9-]{1,70}$/);
  assert.match(manifest.runId ?? '', /^[a-f0-9]{12}$/);
  const group = `/subscriptions/${manifest.subscription}/resourceGroups/${manifest.group}`;
  const service = `gs${manifest.runId}`;
  return { group, service, deployment: `${group}/providers/Microsoft.Resources/deployments/gs-hosting-${manifest.runId}`,
    plans: ['ingress', 'worker'].map(name => `${group}/providers/Microsoft.Web/serverfarms/${service}-${name}`) };
}
export function scopedWebClient(manifest, observe = () => {}, exchange = httpExchange) {
  const scope = scopedWebPaths(manifest);
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    const names = [scope.deployment, ...scope.plans];
    const allowed = ['GET', 'PUT', 'DELETE'].includes(method) && names.includes(url.pathname)
      || method === 'GET' && [scope.group, `${scope.group}/resources`, `${scope.deployment}/operations`].includes(url.pathname)
      || method === 'POST' && [`${scope.deployment}/validate`, `${scope.deployment}/cancel`].includes(url.pathname);
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash && allowed, 'Request escaped the scoped hosting allowlist');
    const startedAt = new Date().toISOString();
    const result = await exchange(url.href, { method, body, timeoutMs: 60000, headers: { authorization: `Bearer ${manifest.token}` } });
    observe({ method, path, request: body, ...result, startedAt, completedAt: new Date().toISOString() });
    return result;
  };
}

export async function cleanupScopedWeb(manifest, request = scopedWebClient(manifest), { sleep = ms => new Promise(done => setTimeout(done, ms)), timeoutMs = 600000 } = {}) {
  const scope = scopedWebPaths(manifest), deadline = Date.now() + timeoutMs;
  const deployment = `${scope.deployment}?api-version=2025-04-01`;
  const terminal = state => ['Succeeded', 'Failed', 'Canceled'].includes(state);
  let found = await request('GET', deployment);
  if (found.status !== 404) {
    assert.equal(found.status, 200, 'Cannot inspect deployment ownership');
    assert.equal(found.body.properties?.parameters?.runId?.value, manifest.runId, 'Deployment ownership mismatch');
    assert.equal(found.body.properties?.parameters?.serviceName?.value, scope.service, 'Deployment service mismatch');
    if (!terminal(found.body.properties?.provisioningState)) {
      assert.ok([200, 202, 204, 409].includes((await request('POST', `${scope.deployment}/cancel?api-version=2025-04-01`)).status));
      do {
        assert.ok(Date.now() < deadline, 'Deployment cancellation deadline exceeded');
        await sleep(3000); found = await request('GET', deployment);
        assert.ok([200, 404].includes(found.status));
      } while (found.status !== 404 && !terminal(found.body.properties?.provisioningState));
    }
  }
  // Check all ownership before deleting anything. Never delete the shared group.
  const existing = [];
  for (const id of scope.plans) {
    const path = `${id}?api-version=2024-11-01`, current = await request('GET', path);
    if (current.status === 404) continue;
    assert.equal(current.status, 200, 'Cannot inspect plan ownership');
    assert.equal(current.body.tags?.run, manifest.runId, 'Plan ownership mismatch');
    assert.equal(current.body.tags?.project, 'globalstack-production-scenarios', 'Plan project mismatch');
    existing.push(path);
  }
  for (const path of existing) {
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', path)).status), 'Plan deletion failed');
  }
  async function absent(path) {
    while (true) {
      assert.ok(Date.now() < deadline, 'Resource cleanup deadline exceeded');
      const result = await request('GET', path);
      if (result.status === 404) return;
      assert.ok([200, 409].includes(result.status), 'Cleanup polling failed'); await sleep(3000);
    }
  }
  for (const id of scope.plans) await absent(`${id}?api-version=2024-11-01`);
  if (found.status !== 404) {
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', deployment)).status));
    await absent(deployment);
  }
  assert.equal((await request('GET', `${scope.group}?api-version=2022-09-01`)).status, 200, 'Operator group was not preserved');
  return { plansAbsent: true, deploymentAbsent: true, groupPreserved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  scopedWebPaths(manifest);
  assert.ok(Number.isFinite(manifest.deadline) && manifest.deadline <= Date.now() + 1800000);
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    manifest.token = azureToken(manifest.config);
    const result = await cleanupScopedWeb(manifest);
    await writeFile(resultPath, JSON.stringify({ ...result, watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, watchdog: true, recoveryRequired: true }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
