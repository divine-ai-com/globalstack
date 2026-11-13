import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, statfs, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createPostgresArmConnectionResolver } from '../../packages/azure-data-plane/src/postgres-arm-connection.mjs';
import { createPostgresWireGateway } from '../../packages/azure-data-plane/src/postgres-wire-gateway.mjs';
import { installLocalPostgresPrincipalCatalog, createLocalPostgresAdministrator,
  createLocalPostgresPrincipalResolver } from '../../packages/azure-data-plane/src/local-postgres-principals.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { productionBudgetPath, reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';
import { postgresClient, postgresScope, cleanupPostgres } from './document-postgres-cleanup.mjs';
import { httpExchange } from './http-exchange.mjs';
import { bootstrapDocumentDatabase } from './document-app/database-bootstrap.mjs';
import { postgresSqlPairPassed } from './document-postgres-sql-outcome.mjs';

assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit private run directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
assert.ok((await statfs(out)).bavail * (await statfs(out)).bsize >= 40 * 1024 ** 3, '40 GiB free required');
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const compiled = await readFile(new URL('./document-infra/compiled/document-postgres-roles.json', import.meta.url));
const templateSha256 = createHash('sha256').update(compiled).digest('hex');
assert.equal(templateSha256, '0e761f0f028aff6903bfa93899f5b95781d5a70f54af28fa5b61f5c84804cbc1');
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
  scope: 'Same PostgreSQL and worker/ingress identity Bicep template on both targets, temporary single-address firewall rule, Azure Entra SQL role bootstrap and privilege probe. No full document application test.',
  budget: { thisRunEnvelopeUsd: 12, actualAzureChargesMeasured: false },
  observations: [], cleanup: null, sql: { azure: { attempted: false }, local: { attempted: false } },
  fullWorkflowCompleted: false };
let phase = 'preflight', arm, watchdog, allocated = false, localGateway, localBackendName, localTlsDirectory;
const localStore = new ResourceStore();
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
async function probeAzureSql(workerObjectId, ingressObjectId) {
  report.sql.azure.attempted = true;
  report.sql.azure.connectionAttempts = [];
  const password = () => azureCli(config, ['account', 'get-access-token',
    '--resource', 'https://ossrdbms-aad.database.windows.net']).accessToken;
  const poolFor = database => new pg.Pool({ host: databaseHost, port: 5432, database,
    user: 'globalstack-conformance-pilot', password, ssl: { rejectUnauthorized: true },
    max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  const pool = poolFor('documents');
  const postgresPool = poolFor('postgres');
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
    const workerRole = `gs${runId}_worker`, ingressRole = `gs${runId}_ingress`;
    await bootstrapDocumentDatabase({ postgresPool, databasePool: pool,
      workerRole, workerObjectId, ingressRole, ingressObjectId });
    const tables = (await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename IN ('document_access', 'scanned_documents', 'document_revisions', 'document_outbox')
      ORDER BY tablename`)).rows.map(row => row.tablename);
    assert.deepEqual(tables, ['document_access', 'document_outbox', 'document_revisions', 'scanned_documents']);
    report.sql.azure.schema = { status: 'passed', tables };
    const grants = (await pool.query(`SELECT
      has_table_privilege($1, 'document_access', 'SELECT') AS worker_access_read,
      has_table_privilege($1, 'document_outbox', 'INSERT') AS worker_outbox_write,
      has_table_privilege($2, 'document_access', 'INSERT') AS ingress_access_write,
      has_table_privilege($2, 'document_outbox', 'SELECT') AS ingress_outbox_read`,
    [workerRole, ingressRole])).rows[0];
    assert.deepEqual(grants, { worker_access_read: true, worker_outbox_write: true,
      ingress_access_write: true, ingress_outbox_read: false });
    report.sql.azure.roles = { status: 'passed', grants };
  } catch (error) {
    report.sql.azure.bootstrap = { status: 'failed', code: error.code ?? null,
      message: sanitize(error.message, replacements) };
  } finally { await Promise.all([pool.end(), postgresPool.end()]); }
}
async function probeLocalSql(workerObjectId, ingressObjectId) {
  report.sql.local.attempted = true;
  localBackendName = `gs-pg-role-${runId}`;
  const privilegedPassword = randomBytes(32).toString('hex');
  execFileSync('docker', ['run', '-d', '--rm', '--name', localBackendName,
    '--label', 'globalstack.experiment=postgres-role-pair', '--memory', '512m', '--cpus', '2',
    '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot',
    '-e', 'POSTGRES_DB=documents', 'postgres:16-alpine'],
  { env: { ...process.env, POSTGRES_PASSWORD: privilegedPassword }, encoding: 'utf8' });
  const inspected = JSON.parse(execFileSync('docker', ['inspect', localBackendName], { encoding: 'utf8' }))[0];
  const privileged = { host: '127.0.0.1', port: Number(inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort),
    user: 'pilot', password: privilegedPassword };
  const deadline = Date.now() + 30000;
  while (true) {
    const check = new pg.Client({ ...privileged, database: 'postgres', connectionTimeoutMillis: 2000 });
    try { await check.connect(); await check.end(); break; } catch (error) {
      await check.end().catch(() => {});
      if (Date.now() > deadline) throw error;
      await new Promise(done => setTimeout(done, 300));
    }
  }
  await installLocalPostgresPrincipalCatalog(privileged);
  const delegated = await createLocalPostgresAdministrator(privileged, {
    user: 'pilot-admin', password: randomBytes(32).toString('hex'), database: 'documents' });
  localTlsDirectory = resolve(out, 'local-tls.private');
  await mkdir(localTlsDirectory, { mode: 0o700 });
  const keyFile = resolve(localTlsDirectory, 'key.pem'), certFile = resolve(localTlsDirectory, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile,
    '-out', certFile, '-days', '1', '-subj', `/CN=${databaseHost}`,
    '-addext', `subjectAltName=DNS:${databaseHost}`], { stdio: 'pipe', timeout: 10000 });
  const cert = await readFile(certFile), key = await readFile(keyFile);
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), alg: 'RS256', kid: randomUUID() };
  const issuer = 'https://identity.globalstack.test/';
  localGateway = createPostgresWireGateway({ tls: { cert, key },
    trust: { issuer, tenantId: account.tenantId, jwks: { keys: [jwk] } },
    resolveConnection: createPostgresArmConnectionResolver({ store: localStore,
      backend: delegated, serverHost: databaseHost, mapDatabase: (_, database) => database,
      resolvePrincipal: createLocalPostgresPrincipalResolver(privileged) }),
    observe: event => observe('local-sql', event) });
  await new Promise(done => localGateway.listen(0, '127.0.0.1', done));
  const signedToken = objectId => new SignJWT({ tid: account.tenantId, oid: objectId, idtyp: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer)
    .setAudience('https://ossrdbms-aad.database.windows.net').setIssuedAt().setExpirationTime('5m')
    .sign(privateKey);
  const connection = (database, user, objectId) => ({ host: '127.0.0.1', port: localGateway.address().port,
    database, user, password: () => signedToken(objectId),
    ssl: { ca: cert, rejectUnauthorized: true, servername: databaseHost },
    max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
  const adminUser = 'globalstack-conformance-pilot';
  const admin = new pg.Pool(connection('documents', adminUser, claims.oid));
  const postgres = new pg.Pool(connection('postgres', adminUser, claims.oid));
  const workerRole = `gs${runId}_worker`, ingressRole = `gs${runId}_ingress`;
  let worker, ingress;
  try {
    await bootstrapDocumentDatabase({ postgresPool: postgres, databasePool: admin,
      workerRole, workerObjectId, ingressRole, ingressObjectId });
    const tables = (await admin.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename IN ('document_access', 'scanned_documents', 'document_revisions', 'document_outbox')
      ORDER BY tablename`)).rows.map(row => row.tablename);
    assert.deepEqual(tables, ['document_access', 'document_outbox', 'document_revisions', 'scanned_documents']);
    report.sql.local.connection = { status: 'passed', identity: 'locally signed administrator token',
      backendRole: 'restricted database owner' };
    report.sql.local.schema = { status: 'passed', tables };
    worker = new pg.Pool(connection('documents', workerRole, workerObjectId));
    ingress = new pg.Pool(connection('documents', ingressRole, ingressObjectId));
    assert.equal((await worker.query('SELECT current_user AS role')).rows[0].role, workerRole);
    assert.equal((await ingress.query('SELECT current_user AS role')).rows[0].role, ingressRole);
    await worker.query('SELECT * FROM document_access LIMIT 0');
    await ingress.query('SELECT * FROM scanned_documents LIMIT 0');
    await assert.rejects(ingress.query('SELECT * FROM document_outbox LIMIT 0'), /permission denied/);
    await assert.rejects(worker.query('CREATE TABLE unexpected(id integer)'), /permission denied/);
    const grants = (await admin.query(`SELECT
      has_table_privilege($1, 'document_access', 'SELECT') AS worker_access_read,
      has_table_privilege($1, 'document_outbox', 'INSERT') AS worker_outbox_write,
      has_table_privilege($2, 'document_access', 'INSERT') AS ingress_access_write,
      has_table_privilege($2, 'document_outbox', 'SELECT') AS ingress_outbox_read`,
    [workerRole, ingressRole])).rows[0];
    assert.deepEqual(grants, { worker_access_read: true, worker_outbox_write: true,
      ingress_access_write: true, ingress_outbox_read: false });
    report.sql.local.roles = { status: 'passed', grants, workerLogin: 'passed', ingressLogin: 'passed',
      ingressOutboxReadDenied: true, workerCreateDenied: true };
  } catch (error) {
    report.sql.local.bootstrap = { status: 'failed', code: error.code ?? null,
      message: sanitize(error.message, replacements) };
  } finally { await Promise.all([worker?.end(), ingress?.end(), admin.end(), postgres.end()]); }
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
  report.network = { scope: 'One temporary runner IPv4 rule on Azure and a loopback rule locally. This is test access, not production network conformance.' };
  report.budget.ledger = await reserveBudget(productionBudgetPath, { runId, envelopeUsd: 12,
    purpose: 'Bounded PostgreSQL and identity deployment, Entra SQL role bootstrap and immediate cleanup in westus2' });
  allocated = true;
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve('experiments/production-scenarios/document-postgres-cleanup.mjs'),
    manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); });
  watchdog.unref();
  phase = 'prepare-local-group';
  const groupBody = { location: 'westus2', tags: { project: 'globalstack-production-scenarios', run: runId } };
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = account.id;
  arm = createArmServer({ store: localStore });
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
      const worker = await azure('GET', `${scope.worker}?api-version=2023-01-31`);
      const ingress = await azure('GET', `${scope.ingress}?api-version=2023-01-31`);
      assert.equal(worker.status, 200);
      assert.equal(ingress.status, 200);
      assert.match(worker.body.properties?.principalId ?? '', /^[a-f0-9-]{36}$/i);
      assert.match(ingress.body.properties?.principalId ?? '', /^[a-f0-9-]{36}$/i);
      replacements.push([worker.body.properties.principalId, '<worker-principal>'],
        [ingress.body.properties.principalId, '<ingress-principal>']);
      await probeAzureSql(worker.body.properties.principalId, ingress.body.properties.principalId);
    }
    if (report.localTerminalState === 'Succeeded') {
      phase = 'network-access-local';
      const localRule = await local('PUT', `${scope.firewall}?api-version=2024-08-01`, {
        properties: { startIpAddress: '127.0.0.1', endIpAddress: '127.0.0.1' } });
      report.firewall.local = { initialStatus: localRule.status,
        errorCode: localRule.body?.error?.code ?? null };
      if ([200, 201, 202].includes(localRule.status)) {
        const localWorker = await local('GET', `${scope.worker}?api-version=2023-01-31`);
        const localIngress = await local('GET', `${scope.ingress}?api-version=2023-01-31`);
        assert.equal(localWorker.status, 200);
        assert.equal(localIngress.status, 200);
        assert.match(localWorker.body.properties?.principalId ?? '', /^[a-f0-9-]{36}$/i);
        assert.match(localIngress.body.properties?.principalId ?? '', /^[a-f0-9-]{36}$/i);
        replacements.push([localWorker.body.properties.principalId, '<local-worker-principal>'],
          [localIngress.body.properties.principalId, '<local-ingress-principal>']);
        phase = 'sql-local';
        await probeLocalSql(localWorker.body.properties.principalId, localIngress.body.properties.principalId);
      }
    }
  }
  if (!report.sql.local.attempted) report.sql.local.reason = 'Local deployment or firewall setup did not reach the SQL probe.';
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
  const localCleanupFailures = [];
  if (arm) {
    try {
      const removed = await local('DELETE', `${scope.group}?api-version=2022-09-01`);
      assert.ok([200, 202, 204].includes(removed.status));
      assert.equal(localStore.resources.size, 0);
    } catch { localCleanupFailures.push('local ARM resources'); }
    arm.closeAllConnections();
    try { await new Promise(done => arm.close(done)); }
    catch { localCleanupFailures.push('local ARM listener'); }
  }
  if (localGateway) {
    localGateway.closeAllConnections();
    try { await new Promise(done => localGateway.close(done)); }
    catch { localCleanupFailures.push('local SQL listener'); }
  }
  if (localBackendName) {
    try { execFileSync('docker', ['rm', '-f', localBackendName], { stdio: 'pipe', timeout: 15000 }); }
    catch { localCleanupFailures.push('local PostgreSQL container'); }
  }
  if (localTlsDirectory) {
    try { await rm(localTlsDirectory, { recursive: true, force: true }); }
    catch { localCleanupFailures.push('local TLS directory'); }
  }
  report.localCleanup = { complete: localCleanupFailures.length === 0, failures: localCleanupFailures };
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, azure: report.azureTerminalState, local: report.localTerminalState,
  azureSql: report.sql.azure, localSql: report.sql.local, cleanup: report.cleanup, error: report.error ?? null }));
if (!postgresSqlPairPassed(report) || report.sql.azure.roles?.status !== 'passed'
  || report.sql.local.roles?.status !== 'passed') process.exitCode = 1;
