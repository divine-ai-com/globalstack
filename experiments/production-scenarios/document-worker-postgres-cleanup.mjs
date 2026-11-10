import assert from 'node:assert/strict';
import { access, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { cleanupPostgres, postgresClient, postgresScope } from './document-postgres-cleanup.mjs';
import { cleanupWorker, workerClient, workerPaths } from './worker-cleanup.mjs';

const project = 'globalstack-production-scenarios';

export async function cleanupWorkerPostgres(manifest, {
  workerRequest = workerClient(manifest), postgresRequest = postgresClient(manifest),
  workerCleanup = cleanupWorker, postgresCleanup = cleanupPostgres,
} = {}) {
  const worker = workerPaths(manifest), database = postgresScope(manifest);
  assert.equal(worker.group, database.group);
  assert.equal(worker.identity, database.worker);
  await workerCleanup(manifest, workerRequest, { planOnly: true });
  const read = async (id, version) => {
    const result = await postgresRequest('GET', `${id}?api-version=${version}`);
    assert.ok([200, 404].includes(result.status), 'Combined cleanup ownership read failed');
    return result;
  };
  const deployment = await read(database.deployment, '2025-04-01');
  if (deployment.status === 200) {
    assert.equal(deployment.body?.properties?.parameters?.runId?.value, manifest.runId,
      'PostgreSQL deployment ownership mismatch');
    assert.equal(deployment.body?.properties?.parameters?.serviceName?.value, worker.service,
      'PostgreSQL deployment service mismatch');
  }
  for (const [id, version] of [[database.server, '2024-08-01'],
    [database.worker, '2023-01-31'], [database.ingress, '2023-01-31']]) {
    const current = await read(id, version);
    if (current.status === 404) continue;
    assert.equal(current.body?.tags?.project, project, 'Combined cleanup project mismatch');
    assert.equal(current.body?.tags?.run, manifest.runId, 'Combined cleanup run mismatch');
  }
  const results = {};
  try { results.worker = await workerCleanup(manifest, workerRequest); }
  catch (error) { results.workerError = error; }
  try { results.postgres = await postgresCleanup(manifest, postgresRequest); }
  catch (error) { results.postgresError = error; }
  if (results.workerError || results.postgresError) {
    throw new AggregateError([results.workerError, results.postgresError].filter(Boolean),
      'Combined worker and PostgreSQL cleanup incomplete');
  }
  return { worker: results.worker, postgres: results.postgres, cleanupComplete: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [manifestPath, donePath, resultPath] = process.argv.slice(2);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  workerPaths(manifest); postgresScope(manifest);
  assert.ok(Number.isFinite(manifest.deadline) && manifest.deadline <= Date.now() + 3600000);
  while (Date.now() < manifest.deadline) {
    try { await access(donePath); process.exit(0); } catch {}
    try { process.kill(manifest.parentPid, 0); } catch { break; }
    await new Promise(done => setTimeout(done, 2000));
  }
  try {
    manifest.token = azureToken(manifest.config);
    await writeFile(resultPath, JSON.stringify({ ...await cleanupWorkerPostgres(manifest), watchdog: true,
      completedAt: new Date().toISOString() }), { mode: 0o600 });
  } catch {
    await writeFile(resultPath, JSON.stringify({ cleanupComplete: false, recoveryRequired: true, watchdog: true }),
      { mode: 0o600 });
    process.exitCode = 1;
  }
}
