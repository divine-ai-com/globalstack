import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { httpExchange } from './http-exchange.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const project = 'globalstack-production-scenarios';
const blobContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe';

export function documentPaths(m) {
  assert.match(m.subscription ?? '', uuid);
  assert.match(m.group ?? '', /^gs-[a-z0-9-]{1,70}$/);
  assert.match(m.runId ?? '', /^[a-f0-9]{12}$/);
  assert.ok(Array.isArray(m.documentRoles) && m.documentRoles.length === 3 && new Set(m.documentRoles).size === 3);
  m.documentRoles.forEach(value => assert.match(value, uuid));
  const group = `/subscriptions/${m.subscription}/resourceGroups/${m.group}`;
  const service = `gs${m.runId}`;
  const account = `${group}/providers/Microsoft.Storage/storageAccounts/${service}docs`;
  const blobService = `${account}/blobServices/default`;
  const containers = ['landing', 'clean-projection', 'quarantine', 'event-deadletters'].map(name => `${blobService}/containers/${name}`);
  const topic = `${group}/providers/Microsoft.EventGrid/systemTopics/${service}-documents`;
  const eventSubscription = `${topic}/eventSubscriptions/document-revisions`;
  const roles = m.documentRoles.map(name => `${account}/providers/Microsoft.Authorization/roleAssignments/${name}`);
  const deployments = ['data', 'events'].map(stage => `${group}/providers/Microsoft.Resources/deployments/gs-document-${stage}-${m.runId}`);
  const resources = [eventSubscription, topic, ...roles, ...containers, blobService, account];
  const versions = Object.fromEntries([[eventSubscription, '2025-02-15'], [topic, '2025-02-15'],
    ...roles.map(id => [id, '2022-04-01']), ...containers.map(id => [id, '2023-05-01']),
    [blobService, '2023-05-01'], [account, '2023-05-01']]);
  return { group, service, account, blobService, containers, topic, eventSubscription, roles, deployments, resources, versions };
}

export function documentClient(m, observe = () => {}, exchange = httpExchange) {
  const s = documentPaths(m);
  const workerIdentity = `${s.group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${s.service}-worker`;
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    const allowed = ['GET', 'PUT', 'DELETE'].includes(method) && [...s.resources, ...s.deployments].includes(url.pathname)
      || method === 'GET' && [s.group, `${s.group}/resources`, workerIdentity, ...s.deployments.map(id => `${id}/operations`)].includes(url.pathname)
      || method === 'POST' && s.deployments.some(id => [`${id}/validate`, `${id}/cancel`].includes(url.pathname));
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash && allowed, 'Request escaped document allowlist');
    const result = await exchange(url.href, { method, body, timeoutMs: 60000, headers: { authorization: `Bearer ${m.token}` } });
    observe({ method, path, request: body, ...result });
    return result;
  };
}

export async function cleanupDocument(m, request = documentClient(m), { sleep = ms => new Promise(done => setTimeout(done, ms)), timeoutMs = 600000, planOnly = false } = {}) {
  const s = documentPaths(m), deadline = Date.now() + timeoutMs;
  const get = id => request('GET', `${id}?api-version=${id === s.group ? '2022-09-01' : s.versions[id] ?? '2025-04-01'}`);
  const existing = [], deployments = [];
  for (const id of s.deployments) {
    let found = await get(id);
    if (found.status === 404) continue;
    assert.equal(found.status, 200);
    assert.equal(found.body.properties?.parameters?.runId?.value, m.runId, 'Document deployment ownership mismatch');
    if (!planOnly && !['Succeeded', 'Failed', 'Canceled'].includes(found.body.properties?.provisioningState)) {
      assert.ok([200, 202, 204, 409].includes((await request('POST', `${id}/cancel?api-version=2025-04-01`)).status));
      do {
        assert.ok(Date.now() < deadline, 'Document deployment cancellation deadline exceeded');
        await sleep(3000); found = await get(id); assert.ok([200, 404].includes(found.status));
      } while (found.status !== 404 && !['Succeeded', 'Failed', 'Canceled'].includes(found.body.properties?.provisioningState));
    }
    deployments.push(id);
  }
  const account = await get(s.account);
  assert.ok([200, 404].includes(account.status));
  for (const id of s.resources) {
    const found = id === s.account ? account : await get(id);
    if (found.status === 404) continue;
    assert.equal(found.status, 200, 'Document ownership lookup failed');
    const roleIndex = s.roles.indexOf(id);
    if (roleIndex >= 0) {
      const p = found.body.properties;
      assert.equal(p?.description, `${project}:${m.runId}`);
      assert.equal(p?.scope?.toLowerCase(), s.account.toLowerCase());
      assert.equal(p?.roleDefinitionId?.toLowerCase(), `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/${blobContributor}`.toLowerCase());
      if (roleIndex === 0) assert.equal(p.principalId, m.publisher);
      else if (roleIndex === 1) {
        const identityId = `${s.group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${s.service}-worker`;
        const identity = await request('GET', `${identityId}?api-version=2023-01-31`);
        assert.equal(identity.status, 200);
        assert.equal(p.principalId, identity.body.properties?.principalId);
      } else {
        const topic = await get(s.topic);
        assert.equal(topic.status, 200);
        assert.equal(p.principalId, topic.body.identity?.principalId);
      }
    } else if (id === s.account || id === s.topic) {
      assert.equal(found.body.tags?.run, m.runId);
      assert.equal(found.body.tags?.project, project);
      if (id === s.topic) assert.equal(found.body.properties?.source?.toLowerCase(), s.account.toLowerCase());
    } else if (id === s.eventSubscription) {
      assert.equal(found.body.properties?.destination?.properties?.resourceId?.toLowerCase(), `${s.group}/providers/Microsoft.Web/sites/${s.service}-worker/functions/documentUploaded`.toLowerCase());
    } else {
      assert.equal(account.status, 200, 'Document child has no owned account');
    }
    existing.push(id);
  }
  if (planOnly) return { ownershipVerified: true };
  const remove = async id => {
    assert.ok([200, 202, 204, 404].includes((await request('DELETE', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`)).status));
    while (true) {
      assert.ok(Date.now() < deadline, 'Document cleanup deadline exceeded');
      const found = await get(id);
      if (found.status === 404) break;
      assert.ok([200, 409].includes(found.status));
      await sleep(3000);
    }
  };
  // The account owns its blob service and containers. Delete it after the
  // subscription, topic and scoped assignments are absent.
  for (const id of [s.eventSubscription, s.topic, ...s.roles, s.account, ...deployments.reverse()]) {
    if (existing.includes(id) || deployments.includes(id)) await remove(id);
  }
  for (const id of s.resources) assert.equal((await get(id)).status, 404, `Document resource still exists: ${id}`);
  assert.equal((await get(s.group)).status, 200);
  return { resourcesAbsent: true, deploymentsAbsent: true, groupPreserved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2), m = JSON.parse(await readFile(manifestPath));
  documentPaths(m);
  assert.ok(Number.isFinite(m.deadline) && m.deadline <= Date.now() + 1800000);
  while (Date.now() < m.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(m.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    m.token = azureToken(m.config);
    await writeFile(resultPath, JSON.stringify({ ...await cleanupDocument(m), watchdog: true }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
