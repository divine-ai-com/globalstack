import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const project = 'globalstack-production-scenarios';

export function documentSearchScope(m) {
  assert.match(m.subscription ?? '', uuid);
  assert.match(m.runId ?? '', /^[0-9a-f]{12}$/);
  assert.equal(m.group, 'gs-conformance-pilot');
  assert.match(m.publisher ?? '', uuid);
  assert.ok(Array.isArray(m.dataRoles) && m.dataRoles.length === 2);
  assert.ok(Array.isArray(m.searchRoles) && m.searchRoles.length === 4);
  assert.equal(new Set([...m.dataRoles, ...m.searchRoles]).size, 6);
  [...m.dataRoles, ...m.searchRoles].forEach(value => assert.match(value, uuid));
  const group = `/subscriptions/${m.subscription}/resourceGroups/${m.group}`;
  const name = `gs${m.runId}`;
  const storage = `${group}/providers/Microsoft.Storage/storageAccounts/${name}docs`;
  const projection = `${storage}/blobServices/default/containers/clean-projection`;
  const search = `${group}/providers/Microsoft.Search/searchServices/${name}-search`;
  const worker = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${name}-worker`;
  const ingress = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${name}-ingress`;
  const dataRoles = m.dataRoles.map(id => `${storage}/providers/Microsoft.Authorization/roleAssignments/${id}`);
  const searchRoles = m.searchRoles.slice(0, 3).map(id => `${search}/providers/Microsoft.Authorization/roleAssignments/${id}`);
  searchRoles.push(`${projection}/providers/Microsoft.Authorization/roleAssignments/${m.searchRoles[3]}`);
  const storageChildren = ['landing', 'clean-projection', 'quarantine', 'event-deadletters']
    .map(container => `${storage}/blobServices/default/containers/${container}`);
  storageChildren.push(`${storage}/blobServices/default`);
  const deployments = ['search-identities', 'data', 'search'].map(stage => `${group}/providers/Microsoft.Resources/deployments/gs-document-${stage}-${m.runId}`);
  const version = id => id === group ? '2022-09-01' : id === `${group}/resources` ? '2021-04-01'
    : id === search ? '2025-05-01' : id === storage || id === projection ? '2023-05-01'
    : id === worker || id === ingress ? '2023-01-31'
    : id.includes('/roleAssignments/') ? '2022-04-01' : '2025-04-01';
  return { group, name, storage, projection, search, worker, ingress, dataRoles, searchRoles, storageChildren, deployments,
    resources: [storage, search, worker, ingress, ...dataRoles, ...searchRoles], version };
}

export function documentSearchClient(m, observe = () => {}, exchange = httpExchange, refresh = azureToken) {
  const s = documentSearchScope(m);
  let token = m.token;
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    const allowed = method === 'GET' && [s.group, `${s.group}/resources`, s.projection, ...s.resources, ...s.deployments,
      ...s.deployments.map(id => `${id}/operations`)].includes(url.pathname)
      || method === 'PUT' && s.deployments.includes(url.pathname)
      || method === 'DELETE' && [...s.resources, ...s.deployments].includes(url.pathname)
      || method === 'POST' && s.deployments.some(id => `${id}/cancel` === url.pathname);
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash && allowed,
      'Search comparison request escaped its owned scope');
    const send = async attempt => {
      const result = await exchange(url.href, { method, body, timeoutMs: 60000,
        headers: { authorization: `Bearer ${token}` } });
      observe({ method, path, request: body, ...result, attempt });
      return result;
    };
    let result = await send(1);
    if (result.status === 401 && result.body?.error?.code === 'ExpiredAuthenticationToken' && m.config) {
      token = refresh(m.config);
      result = await send(2);
    }
    return result;
  };
}

export async function cleanupDocumentSearch(m, request = documentSearchClient(m), {
  sleep = ms => new Promise(done => setTimeout(done, ms)), timeoutMs = 3600000, planOnly = false,
} = {}) {
  const s = documentSearchScope(m), deadline = Date.now() + timeoutMs;
  const path = id => `${id}?api-version=${s.version(id)}`;
  const get = async id => {
    for (let attempt = 0; ; attempt++) {
      assert.ok(Date.now() < deadline, 'Search cleanup deadline exceeded');
      const result = await request('GET', path(id));
      if (![408, 429, 500, 502, 503, 504].includes(result.status) || attempt >= 4) return result;
      await sleep(3000);
    }
  };
  assert.equal((await get(s.group)).status, 200, 'Preserved pilot group is unavailable');
  const existing = new Set();
  for (const id of s.deployments) {
    const found = await get(id);
    if (found.status === 404) continue;
    assert.equal(found.status, 200, 'Search deployment ownership lookup failed');
    assert.equal(found.body?.properties?.parameters?.runId?.value, m.runId, 'Search deployment run mismatch');
    existing.add(id);
  }
  const identities = new Map();
  for (const id of [s.worker, s.ingress, s.storage, s.search]) {
    const found = await get(id);
    if (found.status === 404) continue;
    assert.equal(found.status, 200, 'Search resource ownership lookup failed');
    assert.equal(found.body?.tags?.project, project, 'Search resource project mismatch');
    assert.equal(found.body?.tags?.run, m.runId, 'Search resource run mismatch');
    identities.set(id, found.body);
    existing.add(id);
  }
  const expectedScopes = [...s.dataRoles.map(() => s.storage), ...s.searchRoles.slice(0, 3).map(() => s.search), s.projection];
  const expectedPrincipals = [m.publisher, identities.get(s.worker)?.properties?.principalId,
    m.publisher, identities.get(s.worker)?.properties?.principalId,
    identities.get(s.ingress)?.properties?.principalId, identities.get(s.search)?.identity?.principalId];
  const expectedRoleIds = ['ba92f5b4-2d11-453d-a403-e96b0029c9fe', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe',
    '7ca78c08-252a-4471-8644-bb5ff32d4ba0', '8ebe5a00-799e-43f5-93ac-243d3dce84a7',
    '1407120a-92aa-4202-b7e9-c0e197c71c8f', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'];
  for (const [i, id] of [...s.dataRoles, ...s.searchRoles].entries()) {
    const found = await get(id);
    if (found.status === 404) continue;
    assert.equal(found.status, 200, 'Search role ownership lookup failed');
    assert.equal(found.body?.properties?.description, `${project}:${m.runId}`, 'Search role description mismatch');
    assert.equal(found.body?.properties?.scope?.toLowerCase(), expectedScopes[i].toLowerCase(), 'Search role scope mismatch');
    assert.equal(found.body?.properties?.principalId?.toLowerCase(), expectedPrincipals[i]?.toLowerCase(), 'Search role principal mismatch');
    assert.equal(found.body?.properties?.roleDefinitionId?.toLowerCase(),
      `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/${expectedRoleIds[i]}`.toLowerCase(),
      'Search role definition mismatch');
    assert.ok(!found.body?.properties?.condition && !found.body?.properties?.conditionVersion,
      'Search role has an unexpected condition');
    existing.add(id);
  }
  const inventory = await get(`${s.group}/resources`);
  assert.equal(inventory.status, 200);
  assert.ok(!inventory.body?.nextLink && Array.isArray(inventory.body?.value), 'Incomplete Search cleanup inventory');
  assert.ok(inventory.body.value.every(item => [...s.resources, ...s.storageChildren]
    .some(id => id.toLowerCase() === item.id?.toLowerCase())), 'Foreign resource in pilot group');
  if (planOnly) return { ownershipVerified: true };
  for (const id of s.deployments) {
    if (!existing.has(id)) continue;
    let found = await get(id);
    if (['Succeeded', 'Failed', 'Canceled'].includes(found.body?.properties?.provisioningState)) continue;
    assert.ok([200, 202, 204, 409].includes((await request('POST', `${id}/cancel?api-version=2025-04-01`)).status));
    do {
      assert.ok(Date.now() < deadline, 'Search deployment cancellation deadline exceeded');
      await sleep(3000);
      found = await get(id);
    } while (found.status === 200 && !['Succeeded', 'Failed', 'Canceled'].includes(found.body?.properties?.provisioningState));
    assert.ok([200, 404].includes(found.status));
  }
  const remove = async id => {
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', path(id))).status), 'Search resource deletion failed');
    while (true) {
      assert.ok(Date.now() < deadline, 'Search resource deletion deadline exceeded');
      const found = await get(id);
      if (found.status === 404) return;
      assert.ok([200, 409].includes(found.status));
      await sleep(3000);
    }
  };
  for (const id of [...s.searchRoles.slice().reverse(), ...s.dataRoles.slice().reverse(), s.search, s.storage, s.ingress, s.worker,
    ...s.deployments.slice().reverse()]) {
    if (existing.has(id)) await remove(id);
  }
  for (const id of s.resources) assert.equal((await get(id)).status, 404, 'Search resource remains after cleanup');
  while (true) {
    assert.ok(Date.now() < deadline, 'Search inventory did not converge before cleanup deadline');
    const after = await get(`${s.group}/resources`);
    assert.equal(after.status, 200);
    assert.ok(!after.body?.nextLink && Array.isArray(after.body?.value), 'Incomplete Search cleanup inventory');
    if (after.body.value.length === 0) break;
    assert.ok(after.body.value.every(item => [...s.resources, ...s.storageChildren]
      .some(id => id.toLowerCase() === item.id?.toLowerCase())), 'Foreign resource appeared during cleanup');
    await sleep(3000);
  }
  assert.equal((await get(s.group)).status, 200, 'Pilot group was removed');
  return { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  documentSearchScope(manifest);
  assert.ok(Number.isFinite(manifest.deadline) && manifest.deadline <= Date.now() + 3600000);
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    manifest.token = azureToken(manifest.config);
    await writeFile(resultPath, JSON.stringify({ ...await cleanupDocumentSearch(manifest), watchdog: true,
      completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
