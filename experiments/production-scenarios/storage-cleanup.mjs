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
  return { group, account: `${group}/providers/Microsoft.Storage/storageAccounts/${manifest.account}` };
}

export function storageArmClient(manifest, observe = () => {}, transport = fetch) {
  const scope = storageScope(manifest);
  const allowed = new Map([[scope.group, ['GET', 'PUT', 'DELETE']], [`${scope.group}/resources`, ['GET']],
    [scope.account, ['GET', 'PUT']], [`${scope.account}/blobServices/default`, ['GET', 'PUT']], [`${scope.account}/listKeys`, ['POST']]]);
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
    assert.ok(inventory.body.value.every(resource => [scope.account, `${scope.account}/blobServices/default`].some(id => resource.id.toLowerCase() === id.toLowerCase())), 'Unexpected resources in Storage-only group');
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
