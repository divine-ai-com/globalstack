import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { documentPaths, documentClient, cleanupDocument } from './document-cleanup.mjs';
import { pairedComponentManifests, pairedComponentClient, cleanupPairedComponent } from './worker-scanner-cleanup.mjs';
import { workerPaths, cleanupWorker } from './worker-cleanup.mjs';
import { scannerPaths, cleanupScanner } from './scanner-cleanup.mjs';

export function documentPairedClient(m, observe = () => {}, exchange) {
  const d = documentPaths(m);
  const documentRequest = documentClient(m, observe, exchange);
  const componentRequest = pairedComponentClient(m, observe, exchange);
  return (method, path, body) => {
    const id = new URL(path, 'https://management.azure.com').pathname;
    const documentOwned = [...d.resources, ...d.deployments].includes(id)
      || d.deployments.some(deployment => id.startsWith(`${deployment}/`));
    return (documentOwned ? documentRequest : componentRequest)(method, path, body);
  };
}

export async function cleanupDocumentPaired(m, request = documentPairedClient(m), options = {}) {
  const { worker, scanner } = pairedComponentManifests(m);
  documentPaths(m); workerPaths(worker); scannerPaths(scanner);
  // Confirm ownership of every resource set before any deletion.
  await cleanupDocument(m, request, { ...options, planOnly: true });
  await cleanupWorker(worker, request, { ...options, planOnly: true });
  await cleanupScanner(scanner, request, { ...options, planOnly: true });
  let document, component, documentError, componentError;
  try { document = await cleanupDocument(m, request, options); } catch (error) { documentError = error; }
  try { component = await cleanupPairedComponent(m, request, options); } catch (error) { componentError = error; }
  if (documentError || componentError) throw new AggregateError([documentError, componentError].filter(Boolean), 'Document paired cleanup incomplete');
  return { document, component, resourcesAbsent: true, groupEmpty: true, groupPreserved: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2), m = JSON.parse(await readFile(manifestPath));
  assert.ok(Number.isFinite(m.deadline) && m.deadline <= Date.now() + 1800000);
  documentPaths(m); pairedComponentManifests(m);
  while (Date.now() < m.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(m.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    m.token = azureToken(m.config);
    await writeFile(resultPath, JSON.stringify({ ...await cleanupDocumentPaired(m), watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true, completedAt: new Date().toISOString() }), { mode: 0o600 });
    process.exitCode = 1;
  }
}
