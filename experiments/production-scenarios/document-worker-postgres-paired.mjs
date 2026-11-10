import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, statfs } from 'node:fs/promises';
import { isIP } from 'node:net';
import pg from 'pg';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azureToken, azureDockerArguments, azureCli } from './azure-session.mjs';
import { workerPaths, workerClient } from './worker-cleanup.mjs';
import { postgresScope, postgresClient } from './document-postgres-cleanup.mjs';
import { cleanupWorkerPostgres } from './document-worker-postgres-cleanup.mjs';
import { bootstrapDocumentDatabase } from './document-app/database-bootstrap.mjs';
import { installLocalPostgresPrincipalCatalog, createLocalPostgresAdministrator,
  createLocalPostgresPrincipalResolver } from '../../packages/azure-data-plane/src/local-postgres-principals.mjs';
import { reserveBudget, confirmBudgetCleanup, productionBudgetPath } from './budget-ledger.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { httpExchange } from './http-exchange.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createManagedIdentityService } from '../../packages/azure-data-plane/src/managed-identity-service.mjs';
import { createDockerFunctionsProvisioner } from '../../packages/azure-data-plane/src/docker-functions-provisioner.mjs';
import { createNativeFunctionsPlatform } from '../../packages/azure-data-plane/src/native-functions-platform.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
assert.ok(process.env.PAIRED_RUN_DIR, 'Evidence directory required');
const out = resolve(process.env.PAIRED_RUN_DIR); await mkdir(out, { recursive: true, mode: 0o700 });
const disk = await statfs(out); assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: repo }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', cwd: repo }).trim(), '');
const account = azureCli(process.env.PAIRED_AZURE_CONFIG_DIR, ['account', 'show']);
assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(account.state, 'Enabled');
const token = azureToken(process.env.PAIRED_AZURE_CONFIG_DIR);
const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
assert.equal(claims.tid, account.tenantId);
assert.match(claims.oid, /^[a-f0-9-]{36}$/i);
if (process.env.PAIRED_PUBLISHER_OBJECT_ID) assert.equal(claims.oid, process.env.PAIRED_PUBLISHER_OBJECT_ID);
const m = { subscription: account.id, group: process.env.PAIRED_RESOURCE_GROUP,
  publisher: claims.oid, config: process.env.PAIRED_AZURE_CONFIG_DIR,
  runId: randomBytes(6).toString('hex'), roles: Array.from({ length: 6 }, randomUUID),
  workerFirewallMode: true, parentPid: process.pid, deadline: Date.now() + 60 * 60000 };
const s = workerPaths(m), p = postgresScope(m);
assert.equal(s.identity, p.worker);
const replacements = [[token, '<redacted>'], [m.subscription, '<subscription>'], [m.group, '<group>'], [m.publisher, '<publisher>'], [out, '<run-directory>']];
const emit = createRecording(out, { platform: 'Document worker: Azure CLI and local ARM', revision, sourceDirty: false });
const report = { revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Same host, PostgreSQL, and worker app templates on Azure and GlobalStack, with restricted SQL role login from the live Functions worker. Public firewall exceptions are temporary pilot access, not production network conformance or a complete document workflow.',
  businessWorkflowCompleted: false, portalEvidenceComplete: false, exchanges: [], cleanup: null, localNativeRuntimeVerified: false };
let phase = 'preflight', allocated = false, watchdog, arm, facade, runtime, imageReference, identityService;
let databaseContainer, backend, delegated;
const approvedImages = new Map();
const manifestPath = resolve(out, 'private-cleanup.json'), donePath = resolve(out, 'cleanup.done'), dockerConfig = resolve(out, 'private-docker');
const observe = (target, event) => { const safe = sanitize({ target, phase, ...event }, replacements); report.exchanges.push(safe); emit('output', { target, phase, text: JSON.stringify(safe, null, 2) + '\n' }); };
const request = workerClient({ ...m, token }, event => observe('azure', event));
const databaseRequest = postgresClient({ ...m, token }, event => observe('azure', event));
async function local(method, path, body) {
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
  observe('local', { method, path, request: body, ...result }); return result;
}
function compile(name) {
  const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${here}/document-infra:/fixture:ro`, '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned',
    'build', `/fixture/${name}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 });
  return { template: JSON.parse(text), text, sha256: createHash('sha256').update(text).digest('hex') };
}
async function deploy(stage, compiled, parameters) {
  assert.ok(Date.now() < m.deadline - 240000, 'Insufficient time remaining before cleanup deadline');
  const id = stage === 'database' ? p.deployment : s.deployments[stage === 'host' ? 0 : 1];
  const armRequest = stage === 'database' ? databaseRequest : request;
  const stem = `worker-${stage}`;
  await writeFile(resolve(out, `${stem}.json`), compiled.text, { mode: 0o600 });
  await writeFile(resolve(out, `${stem}-parameters.json`), JSON.stringify({ parameters }), { mode: 0o600 });
  const body = { properties: { mode: 'Incremental', template: compiled.template, parameters } };
  phase = `${stage}-validation`;
  const validation = stage === 'database' ? { status: 200 } : await armRequest('POST', `${id}/validate?api-version=2025-04-01`, body);
  if (stage !== 'database') await local('POST', `${id}/validate?api-version=2025-04-01`, body);
  if (validation.status !== 200 || validation.body?.error) {
    await local('PUT', `${id}?api-version=2025-04-01`, body);
    throw new Error(`Azure ${stage} validation rejected or incomplete`);
  }
  phase = `${stage}-deployment`;
  const args = azureDockerArguments(m.config, ['deployment', 'group', 'create', '--subscription', m.subscription, '--resource-group', m.group,
    '--name', id.split('/').at(-1), '--template-file', `/evidence/${stem}.json`, '--parameters', `@/evidence/${stem}-parameters.json`]);
  args.splice(args.indexOf('--entrypoint'), 0, '-v', `${out}:/evidence:ro`);
  let result;
  try {
    result = JSON.parse(execFileSync('docker', args, { encoding: 'utf8', timeout: 480000, stdio: ['ignore', 'pipe', 'pipe'] }));
    observe('azure', { command: ['az', 'deployment', 'group', 'create'], exitCode: 0, body: result, templateSha256: compiled.sha256 });
  } catch (error) {
    observe('azure', { command: ['az', 'deployment', 'group', 'create'], exitCode: error.status,
      stdout: String(error.stdout ?? '').slice(0, 65536), stderr: String(error.stderr ?? '').slice(0, 65536) });
    await local('PUT', `${id}?api-version=2025-04-01`, body); throw new Error(`Azure ${stage} deployment failed`);
  }
  const paired = await local('PUT', `${id}?api-version=2025-04-01`, body);
  report[`${stage}LocalState`] = paired.body?.properties?.provisioningState ?? paired.body?.error?.code;
  assert.equal(result.properties.provisioningState, 'Succeeded'); return result;
}
async function startLocalDatabase() {
  databaseContainer = `gs-db-${m.runId}`;
  const password = randomBytes(32).toString('hex');
  execFileSync('docker', ['run', '-d', '--rm', '--name', databaseContainer,
    '--label', 'globalstack.experiment=worker-postgres-pair', '--memory', '512m', '--cpus', '2',
    '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot',
    '-e', 'POSTGRES_DB=documents', 'postgres:16-alpine'],
  { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: 'ignore', timeout: 30000 });
  const inspected = JSON.parse(execFileSync('docker', ['inspect', databaseContainer], { encoding: 'utf8' }))[0];
  backend = { host: '127.0.0.1', port: Number(inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort),
    user: 'pilot', password };
  const deadline = Date.now() + 30000;
  while (true) {
    try { execFileSync('docker', ['exec', databaseContainer, 'pg_isready', '-U', 'pilot', '-d', 'documents'], { stdio: 'ignore' }); break; }
    catch { assert.ok(Date.now() < deadline, 'Local PostgreSQL was not ready'); await new Promise(done => setTimeout(done, 300)); }
  }
  runtime.relationalBackends.postgresEndpoint = { protocol: 'postgres:', ...backend, database: 'postgres' };
  await installLocalPostgresPrincipalCatalog(backend);
  delegated = await createLocalPostgresAdministrator(backend, {
    user: 'pilot-admin', password: randomBytes(32).toString('hex'), database: 'documents' });
}
async function bootstrapLocalDatabase() {
  const worker = await local('GET', `${p.worker}?api-version=2023-01-31`);
  const ingress = await local('GET', `${p.ingress}?api-version=2023-01-31`);
  assert.equal(worker.status, 200); assert.equal(ingress.status, 200);
  const common = { ...delegated, max: 1, connectionTimeoutMillis: 10000 };
  const postgresPool = new pg.Pool({ ...common, database: 'postgres' });
  const databasePool = new pg.Pool({ ...common, database: 'documents' });
  try {
    await bootstrapDocumentDatabase({ postgresPool, databasePool,
      workerRole: `${s.service}_worker`, workerObjectId: worker.body.properties.principalId,
      ingressRole: `${s.service}_ingress`, ingressObjectId: ingress.body.properties.principalId });
  } finally { await Promise.all([postgresPool.end(), databasePool.end()]); }
}
async function bootstrapAzureDatabase(host, tenantId, administratorObjectId) {
  const ipResponse = await fetch('https://api.ipify.org', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(ipResponse.status, 200);
  const ip = (await ipResponse.text()).trim(); assert.equal(isIP(ip), 4);
  replacements.push([ip, '<runner-ip>']);
  const rule = await databaseRequest('PUT', `${p.firewall}?api-version=2024-08-01`,
    { properties: { startIpAddress: ip, endIpAddress: ip } });
  assert.ok([200, 201, 202].includes(rule.status));
  const readyBy = Date.now() + 300000;
  while (true) {
    const current = await databaseRequest('GET', `${p.firewall}?api-version=2024-08-01`);
    if (current.status === 200 && (!current.body?.properties?.provisioningState
      || current.body.properties.provisioningState === 'Succeeded')) break;
    assert.ok(Date.now() < readyBy, 'Azure runner firewall rule did not become ready');
    await new Promise(done => setTimeout(done, 5000));
  }
  const password = () => azureCli(m.config, ['account', 'get-access-token',
    '--resource', 'https://ossrdbms-aad.database.windows.net']).accessToken;
  const common = { host, port: 5432, user: 'globalstack-conformance-pilot', password,
    ssl: { rejectUnauthorized: true }, max: 1, connectionTimeoutMillis: 10000, statement_timeout: 10000 };
  const postgresPool = new pg.Pool({ ...common, database: 'postgres' });
  const databasePool = new pg.Pool({ ...common, database: 'documents' });
  const worker = await databaseRequest('GET', `${p.worker}?api-version=2023-01-31`);
  const ingress = await databaseRequest('GET', `${p.ingress}?api-version=2023-01-31`);
  assert.equal(worker.status, 200); assert.equal(ingress.status, 200);
  const ready = Date.now() + 300000;
  try {
    while (true) {
      try { await databasePool.query('SELECT current_user'); break; }
      catch (error) {
        if (Date.now() >= ready) throw error;
        await new Promise(done => setTimeout(done, 10000));
      }
    }
    await bootstrapDocumentDatabase({ postgresPool, databasePool,
      workerRole: `${s.service}_worker`, workerObjectId: worker.body.properties.principalId,
      ingressRole: `${s.service}_ingress`, ingressObjectId: ingress.body.properties.principalId });
    report.azureDatabaseBootstrap = true;
  } finally { await Promise.all([postgresPool.end(), databasePool.end()]); }
  assert.equal(tenantId, process.env.GLOBALSTACK_AZURE_TENANT_ID);
  assert.equal(administratorObjectId, m.publisher);
}
try {
  const group = await request('GET', `${s.group}?api-version=2022-09-01`);
  assert.equal(group.status, 200); assert.equal(group.body.location, 'westus2');
  const inventory = await request('GET', `${s.group}/resources?api-version=2021-04-01`);
  assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink); assert.deepEqual(inventory.body.value, []);
  for (const id of [...s.deployments, ...s.resources]) assert.equal((await request('GET', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`)).status, 404);
  const host = compile('worker-host'), database = compile('document-postgres-roles'), app = compile('worker-app');
  report.templates = { host: host.sha256, database: database.sha256, app: app.sha256 };
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = m.subscription;
  const tenantId = account.tenantId;
  process.env.GLOBALSTACK_AZURE_TENANT_ID = tenantId;
  const store = new ResourceStore();
  identityService = await createManagedIdentityService({ store, tenantId, subscriptionIds: [m.subscription],
    audiences: ['https://storage.azure.com', 'https://storage.azure.com/',
      'https://ossrdbms-aad.database.windows.net'] });
  const preparePlatform = createNativeFunctionsPlatform({ identityService, storageRouter: () => runtime.storageRouter,
    store, postgresBackend: () => ({ ...delegated, mapDatabase: (_, name) => name,
      resolvePrincipal: createLocalPostgresPrincipalResolver(backend) }),
    observe: event => observe('local-data-plane', event) });
  runtime = createEmulatorRuntime({ store, storageTokenTrusts: [identityService.trust], nativeFunctionsProvisioner: input =>
    createDockerFunctionsProvisioner({ images: approvedImages, directory: resolve(out, 'workers.private'), preparePlatform })(input) });
  arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter: runtime.functionsRouter });
  facade = createFunctionsRouterServer(runtime.functionsRouter);
  for (const server of [arm, facade]) await new Promise(done => server.listen(0, '127.0.0.1', done));
  const localGroup = await local('PUT', `${s.group}?api-version=2022-09-01`, { location: group.body.location });
  assert.equal(localGroup.status, 201, 'Local subscription and group setup must succeed before Azure mutation');
  report.budget = await reserveBudget(productionBudgetPath, { runId: m.runId, envelopeUsd: 25,
    purpose: 'Paired PostgreSQL and document Functions diagnostic with immediate cleanup' }); allocated = true;
  await writeFile(manifestPath, JSON.stringify(m), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve(here, 'document-worker-postgres-cleanup.mjs'), manifestPath, donePath,
    resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); }); watchdog.unref();
  const baseParameters = { serviceName: { value: s.service }, location: { value: group.body.location }, runId: { value: m.runId } };
  const hosted = await deploy('host', host, { ...baseParameters, publisherPrincipalId: { value: m.publisher }, roleAssignmentNames: { value: m.roles } });
  await startLocalDatabase();
  const deployedDatabase = await deploy('database', database, { ...baseParameters,
    tenantId: { value: tenantId }, administratorObjectId: { value: m.publisher },
    administratorName: { value: 'globalstack-conformance-pilot' } });
  assert.equal(deployedDatabase.properties.outputs.databaseHost.value, `${s.service}-db.postgres.database.azure.com`);
  await bootstrapLocalDatabase();
  await bootstrapAzureDatabase(deployedDatabase.properties.outputs.databaseHost.value, tenantId, m.publisher);
  const registryHost = hosted.properties.outputs.registryHost.value;
  assert.match(registryHost, /^[a-z0-9.-]+\.azurecr\.io$/); assert.ok(registryHost.startsWith(`${s.service}images`));
  phase = 'image-publication';
  await mkdir(dockerConfig, { mode: 0o700 });
  const credential = azureCli(m.config, ['acr', 'login', '--name', `${s.service}images`, '--expose-token']);
  replacements.push([credential.accessToken, '<redacted>']);
  execFileSync('docker', ['--config', dockerConfig, 'login', registryHost, '--username', '00000000-0000-0000-0000-000000000000', '--password-stdin'], {
    input: credential.accessToken, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  imageReference = `${registryHost}/document-worker:${revision.slice(0, 12)}`;
  execFileSync('docker', ['build', '--platform', 'linux/amd64', '-t', imageReference, '-f', `${here}/document-app/Dockerfile`, `${here}/document-app`], { timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('docker', ['--config', dockerConfig, 'push', imageReference], { timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
  const inspected = JSON.parse(execFileSync('docker', ['image', 'inspect', imageReference], { encoding: 'utf8' }))[0];
  report.applicationImage = { id: inspected.Id, digest: inspected.RepoDigests.find(value => value.startsWith(registryHost + '/')) };
  assert.ok(report.applicationImage.digest, 'Registry image digest missing'); observe('azure', { publishedImage: report.applicationImage });
  approvedImages.set(report.applicationImage.digest, inspected.Id);
  const deployed = await deploy('app', app, { ...baseParameters, imageReference: { value: report.applicationImage.digest },
    applicationSettings: { value: [
      { name: 'DOCUMENT_DATABASE_DIAGNOSTIC_ENABLED', value: 'true' },
      { name: 'DB_AUTH_MODE', value: 'entra' },
      { name: 'DB_HOST', value: deployedDatabase.properties.outputs.databaseHost.value },
      { name: 'DB_NAME', value: 'documents' },
      { name: 'DB_USER', value: `${s.service}_worker` },
    ] } });
  const hostname = deployed.properties.outputs.hostname.value;
  assert.match(hostname, /^[a-z0-9.-]+\.azurewebsites\.net$/); assert.ok(hostname.startsWith(`${s.service}-worker`));
  phase = 'native-health';
  const end = Math.min(Date.now() + 180000, m.deadline - 90000);
  do {
    try {
      const result = await httpExchange(`https://${hostname}/api/health`, { timeoutMs: 10000 });
      observe('azure', { method: 'GET', path: '/api/health', ...result });
      if (result.status === 200 && result.body?.worker === 'ready') { report.azureNativeHealth = true; break; }
    } catch { observe('azure', { method: 'GET', path: '/api/health', error: 'Health request failed or timed out' }); }
    await new Promise(done => setTimeout(done, 5000));
  } while (Date.now() < end);
  await runtime.nativeFunctionsLifecycle.settle();
  report.localWorkerState = runtime.nativeFunctionsLifecycle.status(`${s.group}/providers/Microsoft.Web/sites/${s.service}-worker`);
  const localHealth = await httpExchange(`http://127.0.0.1:${facade.address().port}/api/health`, { headers: { host: `${s.service}-worker.azurewebsites.net` } });
  observe('local', { method: 'GET', path: '/api/health', ...localHealth });
  report.localHealthStatus = localHealth.status;
  report.localNativeRuntimeVerified = report.localWorkerState === 'running' && localHealth.status === 200 && localHealth.body?.worker === 'ready';
  assert.ok(report.azureNativeHealth && report.localNativeRuntimeVerified, 'Both worker health checks must pass');
  phase = 'database-diagnostic';
  const site = await request('GET', `${s.app}?api-version=2024-11-01`);
  assert.equal(site.status, 200);
  const addresses = [...new Set((site.body?.properties?.outboundIpAddresses ?? '').split(',').map(value => value.trim()).filter(Boolean))];
  assert.ok(addresses.length > 0 && addresses.length <= 32);
  for (const [index, ip] of addresses.entries()) {
    assert.equal(isIP(ip), 4); replacements.push([ip, `<worker-egress-${index}>`]);
    const rule = await databaseRequest('PUT', `${p.workerFirewall(index)}?api-version=2024-08-01`,
      { properties: { startIpAddress: ip, endIpAddress: ip } });
    assert.ok([200, 201, 202].includes(rule.status));
    const readyBy = Date.now() + 300000;
    while (true) {
      const current = await databaseRequest('GET', `${p.workerFirewall(index)}?api-version=2024-08-01`);
      if (current.status === 200 && (!current.body?.properties?.provisioningState
        || current.body.properties.provisioningState === 'Succeeded')) break;
      assert.ok(Date.now() < readyBy, 'Worker firewall rule did not become ready');
      await new Promise(done => setTimeout(done, 5000));
    }
  }
  const native = runtime.functionsRouter.nativeWorkers.get(s.app.toLowerCase());
  assert.ok(native, 'Local native worker missing');
  const localIp = new URL(native.origin).hostname; assert.equal(isIP(localIp), 4);
  const localRule = await local('PUT', `${p.workerFirewall(0)}?api-version=2024-08-01`,
    { properties: { startIpAddress: localIp, endIpAddress: localIp } });
  assert.ok([200, 201, 202].includes(localRule.status));
  const azureKeys = await request('POST', `${s.app}/host/default/listkeys?api-version=2024-11-01`);
  assert.equal(azureKeys.status, 200);
  const azureKey = azureKeys.body?.masterKey; assert.ok(azureKey);
  const localKey = (await readFile(native.masterKeyFile, 'utf8')).trim();
  const localDiagnostic = await httpExchange(`http://127.0.0.1:${facade.address().port}/api/database-diagnostic`,
    { headers: { host: hostname, 'x-functions-key': localKey }, timeoutMs: 20000 });
  observe('local', { method: 'GET', path: '/api/database-diagnostic', ...localDiagnostic });
  report.localDatabaseDiagnostic = { status: localDiagnostic.status, body: localDiagnostic.body };
  const diagnosticDeadline = Math.min(Date.now() + 180000, m.deadline - 120000);
  do {
    try {
      const result = await httpExchange(`https://${hostname}/api/database-diagnostic`,
        { headers: { 'x-functions-key': azureKey }, timeoutMs: 20000 });
      observe('azure', { method: 'GET', path: '/api/database-diagnostic', ...result });
      report.azureDatabaseDiagnostic = { status: result.status, body: result.body };
      if (result.status === 200) break;
    } catch (error) {
      observe('azure', { method: 'GET', path: '/api/database-diagnostic',
        error: sanitize(error.message, replacements) });
    }
    await new Promise(done => setTimeout(done, 10000));
  } while (Date.now() < diagnosticDeadline);
  assert.deepEqual(report.localDatabaseDiagnostic, { status: 200,
    body: { database: 'ready', role: `${s.service}_worker`, documents: 0 } });
  assert.deepEqual(report.azureDatabaseDiagnostic, report.localDatabaseDiagnostic);
  report.databasePairPassed = true;
  report.observationsComplete = true;
} catch (error) { report.error = sanitize(error.message, replacements); }
finally {
  phase = 'cleanup';
  if (allocated) {
    try {
      const refreshed = azureToken(m.config); replacements.push([refreshed, '<redacted>']);
      report.cleanup = await cleanupWorkerPostgres(m, { workerRequest: workerClient({ ...m, token: refreshed }, event => observe('azure', event)),
        postgresRequest: postgresClient({ ...m, token: refreshed }, event => observe('azure', event)) });
      await writeFile(donePath, 'verified\n', { mode: 0o600 }); watchdog?.kill('SIGTERM'); await rm(manifestPath, { force: true });
      await confirmBudgetCleanup(productionBudgetPath, m.runId);
    } catch { report.cleanup = { cleanupComplete: false, recoveryRequired: true }; }
  }
  for (const server of [facade, arm]) if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  try { await runtime?.dispose(); report.localCleanupComplete = true; }
  catch { report.localCleanupComplete = false; report.error ??= 'Local worker cleanup incomplete'; }
  identityService?.dispose();
  if (databaseContainer) try { execFileSync('docker', ['rm', '-f', databaseContainer], { stdio: 'ignore', timeout: 15000 }); }
  catch { report.localCleanupComplete = false; report.error ??= 'Local PostgreSQL cleanup incomplete'; }
  await rm(dockerConfig, { recursive: true, force: true });
  if (imageReference) try { execFileSync('docker', ['image', 'rm', imageReference], { stdio: 'ignore' }); } catch {}
  report.completedAt = new Date().toISOString(); emit('run-end', { summary: report.error ?? 'Worker observations recorded. No full application workflow.' });
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, error: report.error, azureNativeHealth: report.azureNativeHealth, hostLocalState: report.hostLocalState, appLocalState: report.appLocalState, localHealthStatus: report.localHealthStatus, cleanup: report.cleanup }));
if (report.error || !report.databasePairPassed || allocated && !report.cleanup?.cleanupComplete) process.exitCode = 1;
