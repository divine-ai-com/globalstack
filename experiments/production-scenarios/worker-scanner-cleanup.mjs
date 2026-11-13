import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { workerPaths, workerClient, cleanupWorker } from './worker-cleanup.mjs';
import { scannerPaths, scannerClient, cleanupScanner } from './scanner-cleanup.mjs';
import { azureToken } from './azure-session.mjs';

export function pairedComponentManifests(m) {
  assert.ok(Array.isArray(m.roles) && m.roles.length === 7 && new Set(m.roles).size === 7);
  const worker = { ...m, roles: m.roles.slice(0, 6) };
  const scanner = { ...m, roles: [m.roles[6], m.roles[5]] };
  workerPaths(worker); scannerPaths(scanner);
  return { worker, scanner };
}
export function pairedComponentClient(m, observe = () => {}, exchange) {
  const { worker, scanner } = pairedComponentManifests(m), w = workerPaths(worker);
  const requestWorker = workerClient(worker, observe, exchange), requestScanner = scannerClient(scanner, observe, exchange);
  return (method, path, body) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    return ([...w.resources, ...w.deployments, w.group, `${w.group}/resources`, `${w.app}/host/default/listkeys`].includes(id)
      || w.deployments.some(d => id.startsWith(`${d}/`)) ? requestWorker : requestScanner)(method, path, body);
  };
}
export async function cleanupPairedComponent(m, request = pairedComponentClient(m), options = {}) {
  const { worker, scanner } = pairedComponentManifests(m);
  // Shared resources must not be removed if either side fails ownership checks.
  await cleanupWorker(worker, request, { ...options, planOnly: true });
  await cleanupScanner(scanner, request, { ...options, planOnly: true });
  let workerResult, scannerResult, workerError, scannerError;
  try { workerResult = await cleanupWorker(worker, request, options); } catch (error) { workerError = error; }
  // Attempt scanner teardown even if Functions cleanup failed. Each cleaner
  // verifies ownership independently and never deletes the operator group.
  try { scannerResult = await cleanupScanner(scanner, request, options); } catch (error) { scannerError = error; }
  if (workerError || scannerError) throw new AggregateError([workerError, scannerError].filter(Boolean), 'Paired component cleanup incomplete');
  return { worker: workerResult, scanner: scannerResult, resourcesAbsent: true, groupEmpty: true, groupPreserved: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2), m = JSON.parse(await readFile(manifestPath));
  pairedComponentManifests(m); assert.ok(Number.isFinite(m.deadline) && m.deadline <= Date.now() + 1800000);
  while (Date.now() < m.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(m.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    m.token = azureToken(m.config);
    await writeFile(resultPath, JSON.stringify({ ...await cleanupPairedComponent(m), watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 }); process.exitCode = 1;
  }
}
