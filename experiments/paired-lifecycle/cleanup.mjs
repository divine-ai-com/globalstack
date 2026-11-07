import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

export async function removeOwnedGroup(manifest, observe = () => {}) {
  assert.match(manifest.subscription, /^[a-f0-9-]{36}$/i);
  assert.match(manifest.group, /^gs-pair-[a-f0-9]{12}$/);
  const base = `https://management.azure.com/subscriptions/${manifest.subscription}/resourcegroups/${manifest.group}`;
  const request = async (method, suffix = '?api-version=2021-04-01') => {
    const startedAt = new Date().toISOString();
    const response = await fetch(base + suffix, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${manifest.token}` } });
    const body = await response.json().catch(() => null);
    observe({ phase: 'cleanup-verification', method, path: new URL(base + suffix).pathname + new URL(base + suffix).search, status: response.status, body, startedAt, completedAt: new Date().toISOString() });
    return { status: response.status, body };
  };
  const existing = await request('GET');
  if (existing.status === 404) return { absent: true, fallbackDelete: false };
  assert.equal(existing.status, 200, 'Cleanup could not read the owned group');
  assert.equal(existing.body.tags?.run, manifest.runId, 'Cleanup ownership mismatch');
  assert.equal(existing.body.tags?.project, 'globalstack-paired-lifecycle', 'Cleanup project mismatch');
  const inventory = await request('GET', '/resources?api-version=2021-04-01');
  assert.equal(inventory.status, 200, 'Cleanup inventory failed');
  assert.deepEqual(inventory.body.value, [], 'Empty-group pilot unexpectedly contains resources');
  assert.ok(!inventory.body.nextLink, 'Cleanup inventory is incomplete');
  const deleted = await request('DELETE');
  assert.ok([200, 202, 204, 404].includes(deleted.status), 'Cleanup delete failed');
  const deadline = Date.now() + 300000;
  while (Date.now() < deadline) {
    const observed = await request('GET');
    if (observed.status === 404) return { absent: true, fallbackDelete: true };
    assert.ok([200, 409].includes(observed.status), 'Cleanup polling failed');
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  throw new Error('Cleanup did not establish group absence');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  try {
    assert.match(manifest.runId, /^[a-f0-9]{12}$/);
    assert.equal(manifest.container, `gs-paired-${manifest.runId}-azure`);
    // Stop an in-flight native write before observing absence or deleting its group.
    try { execFileSync('docker', ['rm', '-f', manifest.container], { timeout: 15000, stdio: 'ignore' }); } catch {}
    const result = await removeOwnedGroup(manifest);
    await writeFile(resultPath, JSON.stringify({ ...result, watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch (error) {
    await writeFile(resultPath, JSON.stringify({ absent: false, watchdog: true, error: error.message }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
