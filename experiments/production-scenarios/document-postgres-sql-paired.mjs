import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { productionBudgetPath, reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';
import { postgresClient, postgresScope, cleanupPostgres } from './document-postgres-cleanup.mjs';
import { httpExchange } from './http-exchange.mjs';
import { migrate } from './document-app/repository.mjs';

assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit private run directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
assert.ok((await statfs(out)).bavail * (await statfs(out)).bsize >= 40 * 1024 ** 3, '40 GiB free required');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const compiled = await readFile(new URL('./document-infra/compiled/document-postgres.json', import.meta.url));
const templateSha256 = createHash('sha256').update(compiled).digest('hex');
assert.equal(templateSha256, '47281bbb75f6f4e6c91534971535928ee1dc05ffd2418ae830744f17501444a9');
const template = JSON.parse(compiled);
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
const account = azureCli(config, ['account', 'show']);
assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(account.state, 'Enabled');
const token = azureToken(config);
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
assert.equal(claims.tid, account.tenantId);
assert.match(claims.oid, /^[a-f0-9-]{36}$/i);
const runId = randomBytes(6).toString('hex');
const manifest = { subscription: account.id, runId, group: 'gs-conformance-pilot', config,
  parentPid: process.pid, deadline: Date.now() + 60 * 60000 };
const scope = postgresScope(manifest);
const serverName = `gs${runId}-db`;
const databaseHost = `${serverName}.postgres.database.azure.com`;
const replacements = [[token, '<redacted>'], [account.id, '<subscription>'], [account.tenantId, '<tenant>'],
  [claims.oid, '<pilot-principal>'], [manifest.group, '<group>'], [databaseHost, '<database-host>'],
  [serverName, '<database-server>'], [runId, '<run>']];
const report = { schemaVersion: 1, revision, sourceDirty: false, templateSha256, startedAt: new Date().toISOString(),
  scope: 'Same PostgreSQL Bicep template on both targets, temporary single-address firewall rule, Azure Entra SQL and schema probe. GlobalStack SQL data plane is separately assessed; no full document application test.',
  budget: { thisRunEnvelopeUsd: 12, actualAzureChargesMeasured: false },
  observations: [], cleanup: null, sql: { azure: { attempted: false }, local: { attempted: false } },
  fullWorkflowCompleted: false };
let phase = 'preflight', arm, watchdog, allocated = false;
const manifestPath = resolve(out, 'private-cleanup.json'), donePath = resolve(out, 'cleanup.done');
function observe(target, event) {
  report.observations.push(sanitize({ target, phase, ...event }, replacements));
}
const azure = postgresClient({ ...manifest, token }, event => observe('azure', event));
async function local(method, path, body) {
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  observe('local', { method, path, request: body, ...result });
  return result;
}
async function pollAzureDeployment() {
  const deadline = manifest.deadline - 15 * 60000;
  while (true) {
    assert.ok(Date.now() < deadline, 'Deployment exceeded its runtime allowance');
    const current = await azure('GET', `${scope.deployment}?api-version=2025-04-01`);
    if (current.status === 200 && ['Succeeded', 'Failed', 'Canceled'].includes(current.body?.properties?.provisioningState)) return current;
    assert.ok([200, 404, 429].includes(current.status), 'Deployment polling failed');
    await new Promise(done => setTimeout(done, 5000));
  }
}
async function pollFirewall(request) {
  const deadline = Date.now() + 5 * 60000;
  while (Date.now() < deadline) {
    const result = await request('GET', `${scope.firewall}?api-version=2024-08-01`);
    if (result.status === 200 && result.body?.properties?.provisioningState === 'Succeeded') return result;
    if (result.status === 200 && !result.body?.properties?.provisioningState) return result;
    assert.ok([200, 404, 429].includes(result.status), 'Firewall readback failed');
    await new Promise(done => setTimeout(done, 5000));
  }
  throw new Error('Firewall rule did not become ready within five minutes');
}
async function probeAzureSql() {
  report.sql.azure.attempted = true;
  report.sql.azure.connectionAttempts = [];
  const password = () => azureCli(config, ['account', 'get-access-token',
    '--resource', 'https://ossrdbms-aad.database.windows.net']).accessToken;
  const pool = new pg.Pool({ host: databaseHost, port: 5432, database: 'documents',
    user: 'globalstack-conformance-pilot', password, ssl: { rejectUnauthorized: true },
    max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  try {
    const deadline = Date.now() + 5 * 60000;
    let connected = false;
    while (Date.now() < deadline) {
      try {
        const result = await pool.query('SELECT current_database() AS database, current_user AS role');
        assert.equal(result.rows[0]?.database, 'documents');
        report.sql.azure.connection = { status: 'passed', role: result.rows[0].role };
        report.sql.azure.connectionAttempts.push({ status: 'passed' });
        connected = true;
        break;
      } catch (error) {
        const failure = { status: 'failed', code: error.code ?? null,
          message: sanitize(error.message, replacements) };
        report.sql.azure.connection = failure;
        report.sql.azure.connectionAttempts.push(failure);
        await new Promise(done => setTimeout(done, 10000));
      }
    }
    if (!connected) return;
    await migrate(pool);
    const tables = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename IN ('document_access', 'scanned_documents', 'document_revisions', 'document_outbox')
      ORDER BY tablename`)).rows.map(row => row.tablename);
    assert.deepEqual(tables, ['document_access', 'document_outbox', 'document_revisions', 'scanned_documents']);
    report.sql.azure.schema = { status: 'passed', tables };
  } catch (error) {
    report.sql.azure.schema = { status: 'failed', code: error.code ?? null,
      message: sanitize(error.message, replacements) };
  } finally { await pool.end(); }
}
try {
  const all = azureCli(config, ['resource', 'list', '--subscription', account.id]);
  assert.equal(all.length, 0, 'Existing Azure resources require separate reconciliation before this paid run');
  assert.equal((await azure('GET', `${scope.group}?api-version=2022-09-01`)).status, 200);
  assert.equal((await azure('GET', `${scope.deployment}?api-version=2025-04-01`)).status, 404);
  assert.equal((await azure('GET', `${scope.server}?api-version=2024-08-01`)).status, 404);
  const publicIp = await fetch('https://api.ipify.org', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(publicIp.status, 200);
  const ip = (await publicIp.text()).trim();
  assert.equal(isIP(ip), 4, 'A single IPv4 egress address is required');
  replacements.push([ip, '<runner-ip>']);
  report.network = { scope: 'One temporary runner IPv4 firewall rule on each server. This is test access, not production network conformance.' };
  report.budget.ledger = await reserveBudget(productionBudgetPath, { runId, envelopeUsd: 12,
    purpose: 'Bounded PostgreSQL deployment, Entra SQL/schema probe and immediate cleanup in westus2' });
  allocated = true;
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve('experiments/production-scenarios/document-postgres-cleanup.mjs'),
    manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); });
  watchdog.unref();
  phase = 'prepare-local-group';
  const groupBody = { location: 'westus2', tags: { project: 'globalstack-production-scenarios', run: runId } };
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = account.id;
  arm = createArmServer({ store: new ResourceStore() });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  assert.ok([200, 201, 202].includes((await local('PUT', `${scope.group}?api-version=2022-09-01`, groupBody)).status));
  const body = { properties: { mode: 'Incremental', template, parameters: Object.fromEntries(Object.entries({
    serviceName: `gs${runId}`, location: 'westus2', runId, tenantId: account.tenantId,
    administratorObjectId: claims.oid, administratorName: 'globalstack-conformance-pilot',
  }).map(([key, value]) => [key, { value }])) } };
  phase = 'deploy-azure';
  const first = await azure('PUT', `${scope.deployment}?api-version=2025-04-01`, body);
  report.azureInitialStatus = first.status;
  const terminal = [200, 201, 202].includes(first.status) ? await pollAzureDeployment() : first;
  report.azureTerminalState = terminal.body?.properties?.provisioningState ?? terminal.body?.error?.code ?? `HTTP ${terminal.status}`;
  phase = 'deploy-local';
  const replay = await local('PUT', `${scope.deployment}?api-version=2025-04-01`, body);
  report.localInitialStatus = replay.status;
  report.localTerminalState = replay.body?.properties?.provisioningState ?? replay.body?.error?.code ?? `HTTP ${replay.status}`;
  phase = 'network-access';
  if (report.azureTerminalState === 'Succeeded') {
    const firewallBody = { properties: { startIpAddress: ip, endIpAddress: ip } };
    const rule = await azure('PUT', `${scope.firewall}?api-version=2024-08-01`, firewallBody);
    report.firewall = { azure: { initialStatus: rule.status } };
    if ([200, 201, 202].includes(rule.status)) {
      const ready = await pollFirewall(azure);
      report.firewall.azure.readStatus = ready.status;
      phase = 'sql-azure';
      await probeAzureSql();
    }
    if (report.localTerminalState === 'Succeeded') {
      phase = 'network-access-local';
      const localRule = await local('PUT', `${scope.firewall}?api-version=2024-08-01`, firewallBody);
      report.firewall.local = { initialStatus: localRule.status,
        errorCode: localRule.body?.error?.code ?? null };
    }
  }
  report.sql.local = { attempted: false, reason: 'The in-memory ARM replay has no endpoint-routed PostgreSQL wire-protocol listener or Entra SQL authentication.' };
  phase = 'readback';
  const resource = await azure('GET', `${scope.server}?api-version=2024-08-01`);
  report.azureServerReadStatus = resource.status;
  report.comparisonComplete = true;
} catch (error) {
  report.error = sanitize(error.message, replacements);
} finally {
  phase = 'cleanup';
  if (allocated) {
    try {
      const cleanupToken = azureToken(config);
      replacements.push([cleanupToken, '<redacted>']);
      report.cleanup = await cleanupPostgres(manifest, postgresClient({ ...manifest, token: cleanupToken }, event => observe('azure', event)));
      assert.deepEqual(azureCli(config, ['resource', 'list', '--subscription', account.id]), [], 'Azure inventory not empty after cleanup');
      await writeFile(donePath, 'verified\n', { mode: 0o600 });
      watchdog?.kill('SIGTERM');
      await rm(manifestPath);
      await confirmBudgetCleanup(productionBudgetPath, runId);
    } catch (error) { report.cleanup = { cleanupComplete: false, recoveryRequired: true, error: sanitize(error.message, replacements) }; }
  }
  if (arm) {
    await local('DELETE', `${scope.group}?api-version=2022-09-01`).catch(() => {});
    arm.closeAllConnections();
    await new Promise(done => arm.close(done));
  }
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, azure: report.azureTerminalState, local: report.localTerminalState,
  azureSql: report.sql.azure, localSql: report.sql.local, cleanup: report.cleanup, error: report.error ?? null }));
if (report.error || !report.comparisonComplete || !report.cleanup?.resourcesAbsent
    || report.sql.azure.connection?.status !== 'passed' || report.sql.azure.schema?.status !== 'passed'
    || ![200, 201, 202].includes(report.firewall?.local?.initialStatus) || !report.sql.local.attempted) process.exitCode = 1;
