import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';

export function webScope(manifest) {
  assert.match(manifest.subscription, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  assert.match(manifest.runId, /^[a-f0-9]{12}$/);
  assert.equal(manifest.group, `gs-prod-${manifest.runId}`);
  assert.equal(manifest.service, `gs${manifest.runId}`);
  assert.equal(manifest.deployment, `gs-web-${manifest.runId}`);
  const subscription = `/subscriptions/${manifest.subscription}`;
  const group = `${subscription}/resourceGroups/${manifest.group}`;
  return { group, plans: ['ingress', 'worker'].map(suffix => `${group}/providers/Microsoft.Web/serverfarms/${manifest.service}-${suffix}`),
    deployment: `${subscription}/providers/Microsoft.Resources/deployments/${manifest.deployment}` };
}

export function webArmClient(manifest, observe = () => {}, transport = fetch) {
  const scope = webScope(manifest);
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    const nestedDeployment = `${scope.group}/providers/Microsoft.Resources/deployments/web-component`;
    const allowed = [scope.group, `${scope.group}/resources`, ...scope.plans, scope.deployment, `${scope.deployment}/cancel`];
    if (method === 'GET') allowed.push(nestedDeployment, `${nestedDeployment}/operations`, `${scope.deployment}/operations`);
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash && allowed.some(item => item.toLowerCase() === url.pathname.toLowerCase()), 'Request escaped the owned Web scope');
    const startedAt = new Date().toISOString();
    const response = await transport(url.href, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { authorization: `Bearer ${manifest.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = await response.json().catch(() => null);
    const event = { method, path, status: response.status, startedAt, completedAt: new Date().toISOString(),
      request: body, body: url.pathname.endsWith('/listAdminKeys') ? '<credential response omitted>' : parsed };
    observe(event);
    return { status: response.status, body: parsed };
  };
}

export async function cleanupWeb(manifest, request = webArmClient(manifest), { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 600000 } = {}) {
  const scope = webScope(manifest);
  const deployment = `${scope.deployment}?api-version=2025-04-01`;
  const group = `${scope.group}?api-version=2025-04-01`;
  const plans = scope.plans.map(id => `${id}?api-version=2024-11-01`);
  const deadline = Date.now() + timeoutMs;
  let found = await request('GET', deployment);
  if (found.status !== 404) {
    assert.equal(found.status, 200, 'Cannot inspect the deployment before cleanup');
    assert.equal(found.body.properties?.parameters?.runId?.value, manifest.runId, 'Deployment ownership mismatch');
    assert.equal(found.body.properties?.parameters?.groupName?.value, manifest.group, 'Deployment group mismatch');
    if (!['Succeeded', 'Failed', 'Canceled'].includes(found.body.properties?.provisioningState)) {
      const cancel = await request('POST', `${scope.deployment}/cancel?api-version=2025-04-01`);
      assert.ok([200, 202, 204, 409].includes(cancel.status), 'Could not cancel the owned active deployment');
      do {
        assert.ok(Date.now() < deadline, 'Deployment did not stop before cleanup deadline');
        await sleep(3000);
        found = await request('GET', deployment);
        assert.ok([200, 404].includes(found.status), 'Deployment cleanup polling failed');
      } while (found.status !== 404 && !['Succeeded', 'Failed', 'Canceled'].includes(found.body.properties?.provisioningState));
    }
  }
  const existing = await request('GET', group);
  if (existing.status !== 404) {
    assert.equal(existing.status, 200, 'Cannot inspect the group before cleanup');
    assert.equal(existing.body.tags?.run, manifest.runId, 'Group ownership mismatch');
    assert.equal(existing.body.tags?.project, 'globalstack-production-scenarios', 'Group project mismatch');
    const inventory = await request('GET', `${scope.group}/resources?api-version=2025-04-01`);
    assert.equal(inventory.status, 200, 'Could not inventory the owned group');
    assert.ok(!inventory.body.nextLink, 'Incomplete cleanup inventory');
    assert.ok(Array.isArray(inventory.body.value), 'Malformed cleanup inventory');
    assert.ok(inventory.body.value.every(resource => scope.plans.some(id => id.toLowerCase() === resource.id.toLowerCase())), 'Unexpected resources in the Web-only group');
    const removed = await request('DELETE', group);
    assert.ok([200, 202, 204, 404].includes(removed.status), 'Group deletion failed');
  }
  while (true) {
    assert.ok(Date.now() < deadline, 'Group cleanup deadline exceeded');
    const observed = await request('GET', group);
    if (observed.status === 404) break;
    assert.ok([200, 409].includes(observed.status), 'Group cleanup polling failed');
    await sleep(3000);
  }
  for (const plan of plans) assert.equal((await request('GET', plan)).status, 404, 'Web plan still exists after cleanup');
  if (found.status !== 404) {
    const removed = await request('DELETE', deployment);
    assert.ok([200, 202, 204, 404].includes(removed.status), 'Deployment record deletion failed');
    while (true) {
      assert.ok(Date.now() < deadline, 'Deployment record cleanup deadline exceeded');
      const observed = await request('GET', deployment);
      if (observed.status === 404) break;
      assert.ok([200, 409].includes(observed.status), 'Deployment record cleanup polling failed');
      await sleep(3000);
    }
  }
  return { groupAbsent: true, plansAbsent: true, deploymentAbsent: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  webScope(manifest);
  assert.ok(Number.isFinite(manifest.deadline) && manifest.deadline <= Date.now() + 1800000);
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    manifest.token = azureToken(manifest.config);
    const result = await cleanupWeb(manifest);
    await writeFile(resultPath, JSON.stringify({ ...result, watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, watchdog: true, recoveryRequired: true }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
