import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';

export function storageScope(manifest) {
  assert.match(manifest.subscription, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  assert.match(manifest.runId, /^[a-f0-9]{12}$/);
  assert.equal(manifest.group, `gs-storage-${manifest.runId}`);
  assert.equal(manifest.account, `gs${manifest.runId}`);
  const group = `/subscriptions/${manifest.subscription}/resourceGroups/${manifest.group}`;
  const account = `${group}/providers/Microsoft.Storage/storageAccounts/${manifest.account}`;
  if (manifest.eventing !== undefined) assert.equal(typeof manifest.eventing, 'boolean');
  if (!manifest.eventing) return { group, account };
  assert.match(manifest.roleName, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
  const topic = `${group}/providers/Microsoft.EventGrid/systemTopics/gs-events-${manifest.runId}`;
  const queue = `${account}/queueServices/default/queues/event-arrivals`;
  assert.ok(manifest.roleScope === undefined || ['queue', 'account'].includes(manifest.roleScope), 'Unexpected sender role scope');
  const roleScope = manifest.roleScope === 'account' ? account : queue;
  return { group, account, topic, queue, subscription: `${topic}/eventSubscriptions/blob-arrivals`,
    roleScope, role: `${roleScope}/providers/Microsoft.Authorization/roleAssignments/${manifest.roleName}`,
    deployment: `${group}/providers/Microsoft.Resources/deployments/blob-events` };
}

export function storageArmClient(manifest, observe = () => {}, transport = fetch) {
  const scope = storageScope(manifest);
  const allowed = new Map([[scope.group, ['GET', 'PUT', 'DELETE']], [`${scope.group}/resources`, ['GET']],
    [scope.account, ['GET', 'PUT']], [`${scope.account}/blobServices/default`, ['GET', 'PUT']], [`${scope.account}/listKeys`, ['POST']]]);
  if (manifest.eventing) {
    for (const id of [scope.topic, scope.queue, scope.subscription]) allowed.set(id, ['GET']);
    allowed.set(scope.role, ['GET', 'DELETE']);
    allowed.set(scope.deployment, ['GET', 'PUT']);
    allowed.set(`${scope.deployment}/operations`, ['GET']);
  }
  return async (method, path, body) => {
    const url = new URL(path, 'https://management.azure.com');
    assert.ok(url.origin === 'https://management.azure.com' && !url.username && !url.password && !url.hash
      && allowed.get(url.pathname)?.includes(method), 'Request escaped the owned Storage scope');
    const response = await transport(url, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { authorization: `Bearer ${manifest.token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const parsed = await response.json().catch(() => null);
    observe({ method, path, status: response.status, request: body, body: url.pathname.endsWith('/listKeys') ? '<credential response omitted>' : parsed });
    return { status: response.status, body: parsed };
  };
}

export async function cleanupStorage(manifest, request = storageArmClient(manifest), { sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = 600000 } = {}) {
  const scope = storageScope(manifest);
  const group = `${scope.group}?api-version=2025-04-01`;
  const account = `${scope.account}?api-version=2023-05-01`;
  const found = await request('GET', group);
  if (found.status !== 404) {
    assert.equal(found.status, 200);
    assert.equal(found.body.tags?.run, manifest.runId, 'Group ownership mismatch');
    assert.equal(found.body.tags?.project, 'globalstack-storage-component', 'Group project mismatch');
    const inventory = await request('GET', `${scope.group}/resources?api-version=2025-04-01`);
    assert.equal(inventory.status, 200);
    assert.ok(!inventory.body.nextLink && Array.isArray(inventory.body.value), 'Incomplete resource inventory');
    const owned = [scope.account, `${scope.account}/blobServices/default`, ...(manifest.eventing
      ? [`${scope.account}/queueServices/default`, scope.queue, scope.topic, scope.subscription, scope.role, scope.deployment] : [])];
    assert.ok(inventory.body.value.every(resource => owned.some(id => resource.id.toLowerCase() === id.toLowerCase())), 'Unexpected resources in Storage component group');
    if (manifest.eventing) {
      const role = await request('GET', `${scope.role}?api-version=2022-04-01`);
      assert.ok([200, 404].includes(role.status), 'Role ownership lookup failed');
      if (role.status === 200) {
        assert.equal(role.body.id.toLowerCase(), scope.role.toLowerCase());
        assert.equal(role.body.properties.roleDefinitionId.toLowerCase(), `/subscriptions/${manifest.subscription}/providers/Microsoft.Authorization/roleDefinitions/c6a89b2d-59bc-44d0-9896-0f6e12d7b80a`.toLowerCase());
        assert.ok([200, 202, 204, 404].includes((await request('DELETE', `${scope.role}?api-version=2022-04-01`)).status), 'Sender role deletion failed');
      }
    }
    const deleted = await request('DELETE', group);
    assert.ok([200, 202, 204, 404].includes(deleted.status), 'Group deletion failed');
  }
  const deadline = Date.now() + timeoutMs;
  while (true) {
    assert.ok(Date.now() < deadline, 'Storage cleanup deadline exceeded');
    const current = await request('GET', group);
    if (current.status === 404) break;
    assert.ok([200, 409].includes(current.status), 'Group deletion poll failed');
    await sleep(3000);
  }
  assert.equal((await request('GET', account)).status, 404, 'Storage account still exists');
  if (manifest.eventing) {
    for (const [id, apiVersion] of [[scope.topic, '2025-02-15'], [scope.subscription, '2025-02-15'], [scope.role, '2022-04-01'], [scope.deployment, '2025-04-01']]) {
      assert.equal((await request('GET', `${id}?api-version=${apiVersion}`)).status, 404, 'Eventing resource still exists');
    }
    return { groupAbsent: true, accountAbsent: true, topicAbsent: true, subscriptionAbsent: true, roleAbsent: true, deploymentAbsent: true };
  }
  return { groupAbsent: true, accountAbsent: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  storageScope(manifest);
  assert.ok(Number.isSafeInteger(manifest.parentPid) && manifest.parentPid > 1);
  assert.ok(Number.isFinite(manifest.deadline) && manifest.deadline <= Date.now() + 1200000);
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    manifest.token = azureToken(manifest.config);
    const result = await cleanupStorage(manifest);
    await writeFile(resultPath, JSON.stringify({ ...result, watchdog: true }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
