import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createManagedIdentityService } from '../../packages/azure-data-plane/src/managed-identity-service.mjs';
import { createDockerFunctionsProvisioner } from '../../packages/azure-data-plane/src/docker-functions-provisioner.mjs';
import { createNativeFunctionsPlatform } from '../../packages/azure-data-plane/src/native-functions-platform.mjs';
import { createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';
import { httpExchange } from './http-exchange.mjs';
import pg from 'pg';
import { installLocalPostgresPrincipalCatalog, createLocalPostgresAdministrator,
  createLocalPostgresPrincipalResolver } from '../../packages/azure-data-plane/src/local-postgres-principals.mjs';
import { bootstrapDocumentDatabase } from './document-app/database-bootstrap.mjs';

const out = resolve(process.env.LOCAL_WORKER_RUN_DIR ?? `reports/production-scenarios/worker-template-${randomBytes(5).toString('hex')}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const uploadProbe = process.env.LOCAL_UPLOAD_DIAGNOSTIC === 'true';
const databaseProbe = process.env.LOCAL_DATABASE_DIAGNOSTIC === 'true';
const sub = '00000000-0000-0000-0000-000000000000', group = `/subscriptions/${sub}/resourceGroups/worker-template`;
const store = new ResourceStore();
const identity = await createManagedIdentityService({ store, tenantId: sub, subscriptionIds: [sub],
  ...(databaseProbe ? { audiences: ['https://storage.azure.com', 'https://storage.azure.com/',
    'https://ossrdbms-aad.database.windows.net'] } : {}) });
const images = new Map(), image = execFileSync('docker', ['image', 'inspect', process.env.LOCAL_WORKER_IMAGE_ID ?? 'globalstack/document-functions:pilot', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const imageReference = 'document-pilot@' + image; images.set(imageReference, image);
const report = { sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  scope: databaseProbe && uploadProbe ? 'One local worker with managed-identity PostgreSQL and Blob access, plus Event Grid diagnostic delivery. No fresh Azure comparison or complete business workflow.'
    : databaseProbe ? 'Local worker process, managed-identity PostgreSQL login and restricted SQL diagnostic. No fresh Azure comparison or complete business workflow.'
    : uploadProbe ? 'Local worker, document data and Event Grid modules with an actual managed-identity Blob upload. No fresh Azure comparison or complete business workflow.'
    : 'Local execution of the worker host/app Bicep templates previously used on Azure. New generated parameters, no fresh Azure comparison or complete business workflow.',
  startedAt: new Date().toISOString(), image, exchanges: [], storage: [], cleanup: false };
let runtime, backend, delegated, databaseContainer;
const provision = createDockerFunctionsProvisioner({ images, directory: resolve(out, 'workers.private'),
  preparePlatform: createNativeFunctionsPlatform({ identityService: identity, storageRouter: () => runtime.storageRouter,
    store, postgresBackend: () => ({ ...delegated, mapDatabase: (_, database) => database,
      resolvePrincipal: createLocalPostgresPrincipalResolver(backend) }),
    blobEndpoints: uploadProbe ? ['STORAGE_ENDPOINT'] : [], observe: event => report.storage.push(event) }) });
runtime = createEmulatorRuntime({ store, storageTokenTrusts: [identity.trust], nativeFunctionsProvisioner: provision });
const arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter: runtime.functionsRouter });
const facade = createFunctionsRouterServer(runtime.functionsRouter);
try {
  for (const server of [arm, facade]) await new Promise(done => server.listen(0, '127.0.0.1', done));
  async function request(method, path, body) {
    const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
    report.exchanges.push({ method, path, ...result }); assert.ok(result.status < 400); return result;
  }
  await request('PUT', group + '?api-version=2022-09-01', { location: 'westus2' });
  const name = 'gs' + randomBytes(5).toString('hex');
  const common = { serviceName: { value: name }, location: { value: 'westus2' }, runId: { value: name } };
  report.templates = {};
  async function deploy(stage, file, parameters) {
    const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${resolve('experiments/production-scenarios/document-infra')}:/fixture:ro`,
      '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned', 'build', `/fixture/${file}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 });
    report.templates[stage] = createHash('sha256').update(text).digest('hex');
    await writeFile(resolve(out, `${file}.json`), text);
    const result = await request('PUT', `${group}/providers/Microsoft.Resources/deployments/${file}?api-version=2025-04-01`, {
      properties: { mode: 'Incremental', template: JSON.parse(text), parameters: { ...parameters, runId: common.runId } },
    });
    assert.equal(result.body.properties.provisioningState, 'Succeeded');
    return result.body.properties.outputs;
  }
  await deploy('host', 'worker-host', { ...common, publisherPrincipalId: { value: randomUUID() },
    roleAssignmentNames: { value: Array.from({ length: 6 }, randomUUID) } });
  let database;
  if (databaseProbe) {
    const adminObjectId = randomUUID();
    databaseContainer = `gs-db-${name}`;
    const password = randomBytes(24).toString('hex');
    execFileSync('docker', ['run', '-d', '--rm', '--name', databaseContainer,
      '--label', 'globalstack.experiment=worker-db', '--memory', '512m', '--cpus', '2', '--pids-limit', '128',
      '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456', '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot', '-e', 'POSTGRES_DB=documents', 'postgres:16-alpine'],
    { env: { ...process.env, POSTGRES_PASSWORD: password }, stdio: 'ignore' });
    const inspected = JSON.parse(execFileSync('docker', ['inspect', databaseContainer], { encoding: 'utf8' }))[0];
    backend = { host: '127.0.0.1', port: Number(inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort),
      user: 'pilot', password };
    const deadline = Date.now() + 30000;
    while (true) {
      try { execFileSync('docker', ['exec', databaseContainer, 'pg_isready', '-U', 'pilot', '-d', 'documents'], { stdio: 'ignore' }); break; }
      catch { assert.ok(Date.now() < deadline, 'PostgreSQL fixture did not become ready'); await new Promise(done => setTimeout(done, 300)); }
    }
    runtime.relationalBackends.postgresEndpoint = { protocol: 'postgres:', ...backend, database: 'postgres' };
    database = await deploy('database', 'document-postgres-roles', { ...common,
      tenantId: { value: sub }, administratorObjectId: { value: adminObjectId },
      administratorName: { value: 'pilot-admin' } });
    await installLocalPostgresPrincipalCatalog(backend);
    delegated = await createLocalPostgresAdministrator(backend, { user: 'pilot-admin',
      password: randomBytes(32).toString('hex'), database: 'documents' });
    const postgresPool = new pg.Pool({ ...delegated, database: 'postgres' });
    const databasePool = new pg.Pool({ ...delegated, database: 'documents' });
    try { await bootstrapDocumentDatabase({ postgresPool, databasePool,
      workerRole: 'worker-pilot', workerObjectId: database.workerPrincipalId.value,
      ingressRole: 'ingress-pilot', ingressObjectId: database.ingressPrincipalId.value }); }
    finally { await Promise.all([postgresPool.end(), databasePool.end()]); }
  }
  const data = uploadProbe ? await deploy('data', 'document-data', { accountName: { value: `${name}docs` },
    workerIdentityName: { value: `${name}-worker` }, publisherPrincipalId: { value: randomUUID() },
    roleAssignmentNames: { value: Array.from({ length: 2 }, randomUUID) }, location: common.location }) : null;
  const applicationSettings = [];
  if (databaseProbe) applicationSettings.push(
    { name: 'DOCUMENT_DATABASE_DIAGNOSTIC_ENABLED', value: 'true' },
    { name: 'DB_AUTH_MODE', value: 'entra' },
    { name: 'DB_HOST', value: database.databaseHost.value },
    { name: 'DB_NAME', value: 'documents' },
    { name: 'DB_USER', value: 'worker-pilot' },
    { name: 'PGSSLROOTCERT', value: '/globalstack-platform-ca.pem' });
  if (uploadProbe) applicationSettings.push(
    { name: 'STORAGE_ENDPOINT', value: data.blobEndpoint.value },
    { name: 'LANDING_CONTAINER', value: 'landing' },
    { name: 'STORAGE_RESOURCE_ID', value: data.accountId.value },
    { name: 'EVENT_DIAGNOSTICS_CONTAINER', value: 'event-diagnostics' },
    { name: 'DOCUMENT_UPLOAD_DIAGNOSTIC_ENABLED', value: 'true' },
    { name: 'DOCUMENT_EVENT_DIAGNOSTIC_ENABLED', value: 'true' });
  await deploy('app', 'worker-app', { ...common, imageReference: { value: imageReference },
    applicationSettings: { value: applicationSettings } });
  const siteId = `${group}/providers/Microsoft.Web/sites/${name}-worker`;
  await runtime.nativeFunctionsLifecycle.settle();
  report.nativeWorkerState = runtime.nativeFunctionsLifecycle.status(siteId);
  assert.equal(report.nativeWorkerState, 'running');
  const health = await httpExchange(`http://127.0.0.1:${facade.address().port}/api/health`, { headers: { host: `${name}-worker.azurewebsites.net` } });
  report.health = health; assert.equal(health.status, 200); assert.equal(health.body.worker, 'ready');
  if (databaseProbe) {
    const native = runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase());
    const workerIp = new URL(native.origin).hostname;
    const serverId = database.serverId.value;
    await request('PUT', `${serverId}/firewallRules/worker-source?api-version=2024-08-01`,
      { properties: { startIpAddress: workerIp, endIpAddress: workerIp } });
    const key = (await readFile(native.masterKeyFile, 'utf8')).trim();
    const result = await httpExchange(`http://127.0.0.1:${facade.address().port}/api/database-diagnostic`,
      { headers: { host: `${name}-worker.azurewebsites.net`, 'x-functions-key': key }, timeoutMs: 20000 });
    report.databaseDiagnostic = { status: result.status, body: result.body };
    assert.equal(result.status, 200);
    assert.deepEqual(result.body, { database: 'ready', role: 'worker-pilot', documents: 0 });
    assert.ok(report.storage.some(event => event.surface === 'postgres' && event.outcome === 'connected'));
  }
  assert.ok(report.storage.length && report.storage.every(event => event.surface === 'postgres' || event.bearer));
  report.discoveredEventGridFunctions = [...runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).eventGridFunctions];
  if (uploadProbe) {
    await deploy('events', 'document-events', { accountName: { value: `${name}docs` },
      workerName: { value: `${name}-worker` }, topicName: { value: `${name}-documents` },
      deadLetterRoleName: { value: randomUUID() }, location: common.location });
    await deploy('diagnostic', 'document-diagnostic', { accountName: { value: `${name}docs` },
      workerName: { value: `${name}-worker` }, topicName: { value: `${name}-documents` } });
    const markerContainer = await request('GET', `${group}/providers/Microsoft.Storage/storageAccounts/${name}docs/blobServices/default/containers/event-diagnostics?api-version=2023-05-01`);
    assert.equal(markerContainer.body.properties?.metadata?.run, name);
    report.diagnosticContainerOwned = true;
    const key = (await readFile(runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).masterKeyFile, 'utf8')).trim();
    const endpoint = `http://127.0.0.1:${facade.address().port}`;
    const headers = { host: `${name}-worker.azurewebsites.net`, 'x-functions-key': key };
    const discovered = await httpExchange(endpoint + '/admin/functions', { headers });
    report.uploadFunctionDiscovered = discovered.status === 200 && Array.isArray(discovered.body)
      && discovered.body.some(item => item.name === 'uploadDiagnostic');
    assert.ok(report.uploadFunctionDiscovered);
    report.eventFunctionDiscovered = discovered.body.some(item => item.name === 'documentUploaded');
    assert.ok(report.eventFunctionDiscovered);
    report.diagnosticFunctionDiscovered = discovered.body.some(item => item.name === 'documentEventDiagnostic');
    assert.ok(report.diagnosticFunctionDiscovered);
    const input = { tenant: 'pilot', text: 'Local document event diagnostic.' };
    const uploaded = await httpExchange(endpoint + '/api/upload-diagnostic', { method: 'POST', body: input, headers });
    report.upload = { status: uploaded.status, body: uploaded.body };
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.inputSha256, createHash('sha256').update(input.text).digest('hex'));
    assert.ok(report.storage.some(event => event.surface === 'blob-app' && event.method === 'PUT' && event.status === 201));
    const event = [...runtime.storageEventDelivery.pending.values()].find(item => item.event.subject.endsWith(uploaded.body.blobName));
    assert.ok(event, 'BlobCreated did not match the deployed Event Grid subscription');
    const eventDeadline = Date.now() + 15000;
    while (Date.now() < eventDeadline && !runtime.storageEventDelivery.diagnostics.some(item => item.eventId === event.event.id
      && item.subscriptionId.endsWith('/document-diagnostic') && item.state === 'delivered')) {
      await new Promise(done => setTimeout(done, 250));
    }
    report.eventDelivery = runtime.storageEventDelivery.diagnostics.filter(item => item.eventId === event.event.id);
    assert.ok(report.eventDelivery.some(item => item.subscriptionId.endsWith('/document-diagnostic') && item.state === 'delivered'),
      'Event Grid did not deliver the diagnostic event');
    const marker = await httpExchange(endpoint + '/api/event-diagnostic-status', { method: 'POST',
      body: { blobName: uploaded.body.blobName, etag: uploaded.body.etag }, headers });
    report.eventMarker = { status: marker.status, sourceSha256: marker.body?.sourceSha256 };
    assert.equal(marker.status, 200);
  }
  if (process.env.LOCAL_CAPTURE_WORKER_LOGS === 'true') {
    await new Promise(done => setTimeout(done, 1000));
    const native = runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase());
    const address = new URL(native.origin).hostname;
    const candidates = execFileSync('docker', ['ps', '--format', '{{.Names}}', '--filter', 'label=globalstack.managed=functions'],
      { encoding: 'utf8', timeout: 10000 }).trim().split('\n').filter(Boolean);
    const owned = candidates.filter(name => {
      const info = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8', timeout: 10000 }))[0];
      return Object.values(info.NetworkSettings.Networks).some(network => network.IPAddress === address);
    });
    assert.equal(owned.length, 1, 'Cannot identify the owned native worker for private log capture');
    const logs = spawnSync('docker', ['logs', '--tail', '150', owned[0]],
      { encoding: 'utf8', timeout: 10000, maxBuffer: 256 * 1024 });
    assert.equal(logs.status, 0, 'Native worker log capture failed');
    report.workerLogsPrivate = `${logs.stdout}${logs.stderr}`.slice(-65536);
  }
  await request('DELETE', siteId + '?api-version=2023-12-01'); await runtime.nativeFunctionsLifecycle.settle();
  assert.equal(runtime.nativeFunctionsLifecycle.status(siteId), 'stopped');
} catch (error) { report.error = error.message; }
finally {
  try { await runtime.dispose(); identity.dispose(); report.cleanup = true; } catch { report.error ??= 'Local worker cleanup incomplete'; }
  if (databaseContainer) try { execFileSync('docker', ['rm', '-f', databaseContainer], { stdio: 'ignore' }); }
  catch { report.error ??= 'Local PostgreSQL cleanup incomplete'; }
  for (const server of [arm, facade]) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  report.completedAt = new Date().toISOString(); await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, nativeWorkerState: report.nativeWorkerState, health: report.health,
  databaseDiagnostic: report.databaseDiagnostic, error: report.error, cleanup: report.cleanup }));
if (report.error || !report.cleanup) process.exitCode = 1;
