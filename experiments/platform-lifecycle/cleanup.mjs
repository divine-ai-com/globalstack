import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { removeOwnedGroup } from '../paired-lifecycle/cleanup.mjs';

export async function cleanup(manifest, observe = () => {}) {
  assert.match(manifest.subscription, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i);
  assert.match(manifest.runId, /^[a-f0-9]{12}$/);
  assert.equal(manifest.group, `gs-pair-${manifest.runId}`);
  if (!manifest.templateDeployment) return removeOwnedGroup(manifest, observe);
  const url = `https://management.azure.com/subscriptions/${manifest.subscription}/providers/Microsoft.Resources/deployments/${manifest.group}?api-version=2022-09-01`;
  const request = async method => {
    const startedAt = new Date().toISOString();
    const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${manifest.token}` } });
    const body = await response.clone().json().catch(() => null);
    observe({ phase: 'cleanup-deployment', method, path: new URL(url).pathname + new URL(url).search, status: response.status, body, startedAt, completedAt: new Date().toISOString() });
    return response;
  };
  let found = await request('GET');
  const terminalDeadline = Date.now() + 120000;
  // An active ARM deployment can recreate a group after its deletion.
  while (found.status !== 404) {
    assert.equal(found.status, 200, 'Cleanup could not read the deployment');
    const body = await found.clone().json();
    assert.equal(body.properties?.parameters?.runId?.value, manifest.runId, 'Deployment ownership mismatch');
    assert.equal(body.properties?.parameters?.groupName?.value, manifest.group, 'Deployment group mismatch');
    if (['Succeeded', 'Failed', 'Canceled'].includes(body.properties?.provisioningState)) break;
    assert.ok(Date.now() < terminalDeadline, 'Deployment is still active; retain recovery context before deleting resources');
    await new Promise(done => setTimeout(done, 2000));
    found = await request('GET');
  }
  const result = await removeOwnedGroup(manifest, observe);
  if (found.status !== 404) {
    const removed = await request('DELETE');
    assert.ok([200, 202, 204, 404].includes(removed.status));
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      if ((await request('GET')).status === 404) return { ...result, deploymentAbsent: true };
      await new Promise(done => setTimeout(done, 2000));
    }
    throw new Error('Deployment record cleanup incomplete');
  }
  return { ...result, deploymentAbsent: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    assert.match(manifest.runId, /^[a-f0-9]{12}$/);
    assert.equal(manifest.container, `gs-paired-${manifest.runId}-azure`);
    try { execFileSync('docker', ['rm', '-f', manifest.container], { timeout: 15000, stdio: 'ignore' }); } catch {}
    await writeFile(resultPath, JSON.stringify({ ...await cleanup(manifest), watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch (error) {
    await writeFile(resultPath, JSON.stringify({ absent: false, watchdog: true, error: error.message }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
