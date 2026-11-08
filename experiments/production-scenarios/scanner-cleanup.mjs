import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
export function scannerPaths(m) {
  assert.match(m.subscription ?? '', uuid); assert.match(m.publisher ?? '', uuid);
  assert.match(m.group ?? '', /^gs-[a-z0-9-]{1,70}$/); assert.match(m.runId ?? '', /^[a-f0-9]{12}$/);
  assert.ok(Array.isArray(m.roles) && m.roles.length === 2 && new Set(m.roles).size === 2); m.roles.forEach(value => assert.match(value, uuid));
  const group = `/subscriptions/${m.subscription}/resourceGroups/${m.group}`, service = `gs${m.runId}`;
  const id = (type, name) => `${group}/providers/${type}/${name}`;
  const app = id('Microsoft.App/containerApps', `${service}-scanner`), environment = id('Microsoft.App/managedEnvironments', `${service}-scanner`);
  const registry = id('Microsoft.ContainerRegistry/registries', `${service}images`);
  const scanner = id('Microsoft.ManagedIdentity/userAssignedIdentities', `${service}-scanner`), worker = id('Microsoft.ManagedIdentity/userAssignedIdentities', `${service}-worker`);
  const roles = m.roles.map(name => `${registry}/providers/Microsoft.Authorization/roleAssignments/${name}`);
  const resources = [app, ...roles, environment, registry, scanner, worker];
  const versions = Object.fromEntries([[app, '2025-01-01'], [environment, '2025-01-01'], [registry, '2023-07-01'],
    [scanner, '2023-01-31'], [worker, '2023-01-31'], ...roles.map(role => [role, '2022-04-01'])]);
  const deployments = ['host', 'app', 'auth', 'public'].map(stage => id('Microsoft.Resources/deployments', `gs-scanner-${stage}-${m.runId}`));
  return { group, service, app, environment, registry, scanner, worker, roles, resources, versions, deployments, auth: `${app}/authConfigs/current` };
}
export function scannerClient(m, observe = () => {}, exchange = httpExchange) {
  const s = scannerPaths(m);
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    const allowed = ['GET', 'PUT', 'DELETE'].includes(method) && [...s.resources, ...s.deployments, s.auth].includes(url.pathname)
      || method === 'GET' && [s.group, `${s.group}/resources`, ...s.deployments.map(id => `${id}/operations`)].includes(url.pathname)
      || method === 'POST' && s.deployments.some(id => [`${id}/validate`, `${id}/cancel`].includes(url.pathname));
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash && allowed, 'Request escaped scanner allowlist');
    const startedAt = new Date().toISOString();
    const result = await exchange(url.href, { method, body, timeoutMs: 60000, headers: { authorization: `Bearer ${m.token}` } });
    observe({ method, path, request: body, ...result, startedAt, completedAt: new Date().toISOString() }); return result;
  };
}
export async function cleanupScanner(m, request = scannerClient(m), { sleep = ms => new Promise(done => setTimeout(done, ms)), timeoutMs = 1800000 } = {}) {
  const s = scannerPaths(m), deadline = Date.now() + timeoutMs, deployments = [], resources = [];
  const get = async id => {
    for (let attempt = 0; ; attempt++) {
      assert.ok(Date.now() < deadline, 'Scanner cleanup deadline exceeded');
      let result;
      try { result = await request('GET', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`); }
      catch (error) { if (attempt >= 4) throw error; }
      if (result && (![408, 429, 500, 502, 503, 504].includes(result.status) || attempt >= 4)) return result;
      const seconds = Number(result?.headers?.['retry-after']);
      await sleep(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 30000) : 3000);
    }
  };
  for (const id of s.deployments) {
    let found = await get(id); if (found.status === 404) continue;
    assert.equal(found.status, 200);
    assert.equal(found.body.properties?.parameters?.runId?.value, m.runId);
    if (!['Succeeded', 'Failed', 'Canceled'].includes(found.body.properties.provisioningState)) {
      assert.ok([200, 202, 204, 409].includes((await request('POST', `${id}/cancel?api-version=2025-04-01`)).status));
      do { assert.ok(Date.now() < deadline); await sleep(3000); found = await get(id); assert.ok([200, 404].includes(found.status)); }
      while (found.status !== 404 && !['Succeeded', 'Failed', 'Canceled'].includes(found.body.properties.provisioningState));
    }
    deployments.push(id);
  }
  const identity = await get(s.scanner); assert.ok([200, 404].includes(identity.status));
  for (const id of s.resources) {
    const found = id === s.scanner ? identity : await get(id); if (found.status === 404) continue;
    assert.equal(found.status, 200);
    const role = s.roles.indexOf(id);
    if (role >= 0) {
      const p = found.body.properties;
      assert.equal(p.description, `globalstack-production-scenarios:${m.runId}`);
      assert.equal(p.scope.toLowerCase(), s.registry.toLowerCase());
      assert.equal(p.principalId, role === 1 ? m.publisher : identity.body?.properties.principalId);
      assert.equal(p.roleDefinitionId.toLowerCase(), `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/${role === 0 ? '7f951dda-4ed3-4680-a7ca-43fe172d538d' : '8311e382-0749-4cb8-b61a-304f252e45ec'}`.toLowerCase());
    } else {
      assert.equal(found.body.tags?.run, m.runId); assert.equal(found.body.tags?.project, 'globalstack-production-scenarios');
    }
    resources.push(id);
  }
  const awaitAbsent = async id => {
    while (true) {
      assert.ok(Date.now() < deadline, 'Scanner cleanup deadline exceeded'); const found = await get(id);
      if (found.status === 404) break; assert.ok([200, 409].includes(found.status)); await sleep(3000);
    }
  };
  for (const id of [...resources, ...deployments.reverse()]) {
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`)).status));
    // The app is already absent. Environment teardown must not retain the
    // independent registry and identities while Azure schedules its deletion.
    if (id !== s.environment) await awaitAbsent(id);
  }
  if (resources.includes(s.environment)) await awaitAbsent(s.environment);
  assert.equal((await request('GET', `${s.group}?api-version=2022-09-01`)).status, 200);
  const inventory = await request('GET', `${s.group}/resources?api-version=2021-04-01`);
  assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink); assert.deepEqual(inventory.body.value, []);
  return { resourcesAbsent: true, rolesAbsent: true, deploymentsAbsent: true, groupEmpty: true, groupPreserved: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifest, done, result] = process.argv.slice(2), m = JSON.parse(await readFile(manifest));
  scannerPaths(m); assert.ok(Number.isFinite(m.deadline) && m.deadline <= Date.now() + 1800000);
  while (Date.now() < m.deadline) {
    try { await access(done); process.exit(0); } catch {}
    try { process.kill(m.parentPid, 0); } catch { break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try { m.token = azureToken(m.config); await writeFile(result, JSON.stringify({ ...await cleanupScanner(m), watchdog: true }), { mode: 0o600 }); }
  catch { await writeFile(result, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true }), { mode: 0o600 }); process.exitCode = 1; }
}
