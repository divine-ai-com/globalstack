import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';

const project = 'globalstack-production-scenarios';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export function postgresScope(manifest) {
  assert.match(manifest.subscription ?? '', uuid);
  assert.match(manifest.runId ?? '', /^[a-f0-9]{12}$/);
  assert.equal(manifest.group, 'gs-conformance-pilot');
  const base = `/subscriptions/${manifest.subscription}/resourceGroups/${manifest.group}`;
  const server = `${base}/providers/Microsoft.DBforPostgreSQL/flexibleServers/gs${manifest.runId}-db`;
  return { group: base, server, firewall: `${server}/firewallRules/pilot-egress`,
    workerFirewalls: `${server}/firewallRules`,
    workerFirewall: index => {
      assert.ok(Number.isInteger(index) && index >= 0 && index < 32);
      return `${server}/firewallRules/worker-${manifest.runId}-${String(index).padStart(2, '0')}`;
    },
    worker: `${base}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/gs${manifest.runId}-worker`,
    ingress: `${base}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/gs${manifest.runId}-ingress`,
    deployment: `${base}/providers/Microsoft.Resources/deployments/gs-document-postgres-${manifest.runId}` };
}

export function postgresClient(manifest, observe = () => {}, exchange = httpExchange) {
  const scope = postgresScope(manifest);
  let token = manifest.token;
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    const workerFirewall = Array.from({ length: 32 }, (_, index) => scope.workerFirewall(index)).includes(url.pathname);
    const allowed = method === 'GET' && [scope.group, `${scope.group}/resources`, scope.server, scope.firewall,
      scope.workerFirewalls, scope.worker, scope.ingress, scope.deployment, `${scope.deployment}/operations`].includes(url.pathname)
      || method === 'GET' && workerFirewall
      || method === 'PUT' && ([scope.deployment, scope.firewall].includes(url.pathname) || workerFirewall)
      || method === 'DELETE' && ([scope.server, scope.firewall, scope.worker, scope.ingress, scope.deployment].includes(url.pathname) || workerFirewall)
      || method === 'POST' && url.pathname === `${scope.deployment}/cancel`;
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash && allowed,
      'PostgreSQL request escaped the owned run scope');
    const send = async attempt => {
      const result = await exchange(url.href, { method, body, timeoutMs: 60000, headers: { authorization: `Bearer ${token}` } });
      observe({ method, path, request: body, ...result, attempt });
      return result;
    };
    let result = await send(1);
    if (result.status === 401 && result.body?.error?.code === 'ExpiredAuthenticationToken' && manifest.config) {
      token = azureToken(manifest.config);
      result = await send(2);
    }
    return result;
  };
}

export async function cleanupPostgres(manifest, request = postgresClient(manifest), {
  sleep = ms => new Promise(done => setTimeout(done, ms)), timeoutMs = 3600000,
} = {}) {
  const scope = postgresScope(manifest), deadline = Date.now() + timeoutMs;
  const path = (id, version) => `${id}?api-version=${version}`;
  const get = async (id, version) => {
    for (let attempt = 0; ; attempt++) {
      assert.ok(Date.now() < deadline, 'PostgreSQL cleanup deadline exceeded');
      const result = await request('GET', path(id, version));
      if (![408, 429, 500, 502, 503, 504].includes(result.status) || attempt >= 4) return result;
      await sleep(3000);
    }
  };
  let deployment = await get(scope.deployment, '2025-04-01');
  if (deployment.status !== 404) {
    assert.equal(deployment.status, 200);
    assert.equal(deployment.body?.properties?.parameters?.runId?.value, manifest.runId, 'Deployment ownership mismatch');
    if (!['Succeeded', 'Failed', 'Canceled'].includes(deployment.body.properties?.provisioningState)) {
      assert.ok([200, 202, 204, 409].includes((await request('POST', `${scope.deployment}/cancel?api-version=2025-04-01`)).status));
      do {
        assert.ok(Date.now() < deadline, 'PostgreSQL deployment cancellation deadline exceeded');
        await sleep(3000);
        deployment = await get(scope.deployment, '2025-04-01');
      } while (deployment.status === 200 && !['Succeeded', 'Failed', 'Canceled'].includes(deployment.body.properties?.provisioningState));
    }
  }
  const group = await get(scope.group, '2022-09-01');
  assert.equal(group.status, 200, 'Preserved pilot group is unavailable');
  const inventory = await get(`${scope.group}/resources`, '2021-04-01');
  assert.equal(inventory.status, 200);
  assert.ok(!inventory.body.nextLink && Array.isArray(inventory.body.value), 'Incomplete PostgreSQL inventory');
  const owned = inventory.body.value.filter(item => item.id?.toLowerCase() === scope.server.toLowerCase()
    || item.id?.toLowerCase().startsWith(`${scope.server.toLowerCase()}/`));
  const server = await get(scope.server, '2024-08-01');
  if (server.status === 200) {
    assert.equal(server.body.tags?.project, project, 'Server project mismatch');
    assert.equal(server.body.tags?.run, manifest.runId, 'Server run mismatch');
    if (manifest.workerFirewallMode) {
      const listed = await get(scope.workerFirewalls, '2024-08-01');
      assert.equal(listed.status, 200, 'Worker firewall inventory unavailable');
      assert.ok(Array.isArray(listed.body?.value) && !listed.body.nextLink && listed.body.value.length <= 33,
        'Worker firewall inventory incomplete');
      const owned = new Set([scope.firewall, ...Array.from({ length: 32 }, (_, index) => scope.workerFirewall(index))]
        .map(id => id.toLowerCase()));
      for (const rule of listed.body.value) {
        assert.ok(owned.has(rule.id?.toLowerCase()), 'Foreign firewall rule would be deleted with the server');
        if (rule.id?.toLowerCase() === scope.firewall.toLowerCase()) continue;
        const index = Array.from({ length: 32 }, (_, number) => number)
          .find(number => scope.workerFirewall(number).toLowerCase() === rule.id.toLowerCase());
        assert.ok(index !== undefined);
        const id = scope.workerFirewall(index);
        assert.ok([200, 202, 204, 404].includes((await request('DELETE', path(id, '2024-08-01'))).status));
        while (true) {
          const observed = await get(id, '2024-08-01');
          if (observed.status === 404) break;
          assert.ok([200, 409].includes(observed.status));
          await sleep(3000);
        }
      }
    }
    const firewall = await get(scope.firewall, '2024-08-01');
    if (firewall.status === 200) {
      assert.ok([200, 202, 204, 404].includes((await request('DELETE', path(scope.firewall, '2024-08-01'))).status));
      while (true) {
        const observed = await get(scope.firewall, '2024-08-01');
        if (observed.status === 404) break;
        assert.ok([200, 409].includes(observed.status));
        await sleep(3000);
      }
    } else assert.equal(firewall.status, 404);
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', path(scope.server, '2024-08-01'))).status));
  } else {
    assert.equal(server.status, 404);
    assert.equal(owned.length, 0, 'Owned child remains without its server');
  }
  while (true) {
    const observed = await get(scope.server, '2024-08-01');
    if (observed.status === 404) break;
    assert.ok([200, 409].includes(observed.status));
    await sleep(3000);
  }
  for (const identity of [scope.worker, scope.ingress]) {
    const current = await get(identity, '2023-01-31');
    if (current.status === 404) continue;
    assert.equal(current.status, 200);
    assert.equal(current.body.tags?.project, project, 'Identity project mismatch');
    assert.equal(current.body.tags?.run, manifest.runId, 'Identity run mismatch');
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', path(identity, '2023-01-31'))).status));
    while (true) {
      const observed = await get(identity, '2023-01-31');
      if (observed.status === 404) break;
      assert.ok([200, 409].includes(observed.status));
      await sleep(3000);
    }
  }
  if (deployment.status !== 404) {
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', path(scope.deployment, '2025-04-01'))).status));
    while (true) {
      const observed = await get(scope.deployment, '2025-04-01');
      if (observed.status === 404) break;
      assert.ok([200, 409].includes(observed.status));
      await sleep(3000);
    }
  }
  while (true) {
    const after = await get(`${scope.group}/resources`, '2021-04-01');
    assert.equal(after.status, 200);
    assert.ok(!after.body.nextLink && Array.isArray(after.body.value));
    if (!after.body.value.some(item => [scope.server, scope.worker, scope.ingress].some(id => item.id?.toLowerCase() === id.toLowerCase())
      || item.id?.toLowerCase().startsWith(`${scope.server.toLowerCase()}/`))) break;
    assert.ok(Date.now() < deadline, 'PostgreSQL inventory did not converge before cleanup deadline');
    await sleep(3000);
  }
  assert.equal((await get(scope.group, '2022-09-01')).status, 200, 'Pilot group was removed');
  return { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  postgresScope(manifest);
  assert.ok(Number.isFinite(manifest.deadline) && manifest.deadline <= Date.now() + 3600000);
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    manifest.token = azureToken(manifest.config);
    await writeFile(resultPath, JSON.stringify({ ...await cleanupPostgres(manifest), watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
