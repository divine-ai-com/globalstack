import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const workerRoles = ['b7e6dc6d-f1e8-4753-8033-0f276bb0955b', '974c5e8b-45b9-4653-ba55-5f855dd0fb88',
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3', '17d1049b-9a84-46fb-8f53-869881c3d3ab',
  '7f951dda-4ed3-4680-a7ca-43fe172d538d', '8311e382-0749-4cb8-b61a-304f252e45ec'];
export function workerPaths(m) {
  assert.match(m.subscription ?? '', uuid); assert.match(m.group ?? '', /^gs-[a-z0-9-]{1,70}$/);
  assert.match(m.runId ?? '', /^[a-f0-9]{12}$/); assert.match(m.publisher ?? '', uuid);
  assert.ok(Array.isArray(m.roles) && m.roles.length === 6 && new Set(m.roles).size === 6);
  m.roles.forEach(id => assert.match(id, uuid));
  const group = `/subscriptions/${m.subscription}/resourceGroups/${m.group}`, service = `gs${m.runId}`;
  const id = (type, name) => `${group}/providers/${type}/${name}`;
  const storage = id('Microsoft.Storage/storageAccounts', `${service}host`), registry = id('Microsoft.ContainerRegistry/registries', `${service}images`);
  const identity = id('Microsoft.ManagedIdentity/userAssignedIdentities', `${service}-worker`);
  const app = id('Microsoft.Web/sites', `${service}-worker`), plan = id('Microsoft.Web/serverfarms', `${service}-worker`);
  const roles = m.roles.map((name, i) => `${i < 4 ? storage : registry}/providers/Microsoft.Authorization/roleAssignments/${name}`);
  const resources = [app, ...roles, plan, registry, storage, identity];
  const versions = Object.fromEntries([[app, '2024-11-01'], ...roles.map(role => [role, '2022-04-01']), [plan, '2024-11-01'],
    [registry, '2023-07-01'], [storage, '2023-05-01'], [identity, '2023-01-31']]);
  return { group, service, storage, registry, identity, app, plan, roles, resources, versions,
    deployments: ['host', 'app'].map(stage => id('Microsoft.Resources/deployments', `gs-worker-${stage}-${m.runId}`)) };
}
export function workerClient(m, observe = () => {}, exchange = httpExchange, refreshToken = azureToken) {
  const scope = workerPaths(m);
  const hostKeysPath = `${scope.app}/host/default/listkeys`;
  let token = m.token;
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    const allowed = ['GET', 'PUT', 'DELETE'].includes(method) && [...scope.resources, ...scope.deployments].includes(url.pathname)
      || method === 'GET' && [scope.group, `${scope.group}/resources`, ...scope.deployments.map(id => `${id}/operations`)].includes(url.pathname)
      || method === 'POST' && url.pathname === hostKeysPath
      || method === 'POST' && scope.deployments.some(id => [`${id}/validate`, `${id}/cancel`].includes(url.pathname));
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash && allowed, 'Request escaped worker allowlist');
    const send = async attempt => {
      const startedAt = new Date().toISOString();
      const result = await exchange(url.href, { method, body, timeoutMs: 60000, headers: { authorization: `Bearer ${token}` } });
      // Host keys stay in the caller's memory and never reach evidence observers.
      const recorded = url.pathname === hostKeysPath
        ? { status: result.status, body: '<host-key response redacted>' } : result;
      observe({ method, path, request: body, ...recorded, attempt, startedAt, completedAt: new Date().toISOString() });
      return result;
    };
    let result = await send(1);
    if (result.status === 401 && result.body?.error?.code === 'ExpiredAuthenticationToken' && m.config) {
      token = refreshToken(m.config);
      result = await send(2);
    }
    return result;
  };
}
export async function cleanupWorker(m, request = workerClient(m), { sleep = ms => new Promise(done => setTimeout(done, ms)), timeoutMs = 600000, planOnly = false } = {}) {
  const s = workerPaths(m), deadline = Date.now() + timeoutMs, existing = [], deployments = [];
  const get = async id => {
    for (let attempt = 0; ; attempt++) {
      assert.ok(Date.now() < deadline, 'Worker cleanup deadline exceeded');
      let result;
      try { result = await request('GET', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`); }
      catch (error) { if (attempt >= 4) throw error; }
      if (result && (![408, 429, 500, 502, 503, 504].includes(result.status) || attempt >= 4)) return result;
      const seconds = Number(result?.headers?.['retry-after']);
      await sleep(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 30000) : 3000);
    }
  };
  const terminal = state => ['Succeeded', 'Failed', 'Canceled'].includes(state);
  for (const id of s.deployments) {
    let found = await get(id); if (found.status === 404) continue;
    assert.equal(found.status, 200); assert.equal(found.body.properties?.parameters?.runId?.value, m.runId);
    assert.equal(found.body.properties?.parameters?.serviceName?.value, s.service);
    if (!planOnly && !terminal(found.body.properties.provisioningState)) {
      assert.ok([200, 202, 204, 409].includes((await request('POST', `${id}/cancel?api-version=2025-04-01`)).status));
      do { assert.ok(Date.now() < deadline); await sleep(3000); found = await get(id); assert.ok([200, 404].includes(found.status)); }
      while (found.status !== 404 && !terminal(found.body.properties.provisioningState));
    }
    deployments.push(id);
  }
  const identity = await get(s.identity);
  assert.ok([200, 404].includes(identity.status));
  for (const id of s.resources) {
    const found = id === s.identity ? identity : await get(id); if (found.status === 404) continue;
    assert.equal(found.status, 200, 'Cannot inspect resource ownership');
    const index = s.roles.indexOf(id);
    if (index >= 0) {
      const p = found.body.properties;
      assert.equal(p?.description, `globalstack-production-scenarios:${m.runId}`, 'Role ownership mismatch');
      assert.equal(p.roleDefinitionId?.toLowerCase(), `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/${workerRoles[index]}`.toLowerCase());
      assert.equal(p.principalId, index === 5 ? m.publisher : identity.body?.properties?.principalId);
      assert.equal(p.scope?.toLowerCase(), (index < 4 ? s.storage : s.registry).toLowerCase());
    } else {
      assert.equal(found.body.tags?.run, m.runId, 'Resource ownership mismatch');
      assert.equal(found.body.tags?.project, 'globalstack-production-scenarios');
    }
    existing.push(id);
  }
  if (planOnly) return { ownershipVerified: true };
  // Complete each deletion before removing a dependency, such as the hosting plan.
  for (const id of [...existing, ...deployments.reverse()]) {
    while (true) {
      assert.ok(Date.now() < deadline, 'Worker cleanup deadline exceeded');
      const response = await request('DELETE', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`);
      if ([200, 202, 204, 404].includes(response.status)) break;
      assert.ok([408, 409, 429, 500, 502, 503, 504].includes(response.status), 'Worker deletion failed');
      if ((await get(id)).status === 404) break;
      const seconds = Number(response.headers?.['retry-after']);
      await sleep(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 30000) : 3000);
    }
    while (true) {
      assert.ok(Date.now() < deadline, 'Worker cleanup deadline exceeded'); const found = await get(id);
      if (found.status === 404) break; assert.ok([200, 409].includes(found.status)); await sleep(3000);
    }
  }
  assert.equal((await request('GET', `${s.group}?api-version=2022-09-01`)).status, 200);
  return { resourcesAbsent: true, rolesAbsent: true, deploymentsAbsent: true, groupPreserved: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2), m = JSON.parse(await readFile(manifestPath));
  workerPaths(m); assert.ok(Number.isFinite(m.deadline) && m.deadline <= Date.now() + 1800000);
  while (Date.now() < m.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(m.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try { m.token = azureToken(m.config); await writeFile(resultPath, JSON.stringify({ ...await cleanupWorker(m), watchdog: true }), { mode: 0o600 }); }
  catch { await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true }), { mode: 0o600 }); process.exitCode = 1; }
}
