import { observePolicyPropagation } from './policy-propagation.mjs';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { azureToken, azureCli } from './azure-session.mjs';
import { workerPaths } from './worker-cleanup.mjs';
import { scannerPaths } from './scanner-cleanup.mjs';
import { pairedComponentManifests } from './worker-scanner-cleanup.mjs';
import { documentPaths } from './document-cleanup.mjs';
import { documentPairedClient, cleanupDocumentPaired } from './document-paired-cleanup.mjs';
import { reserveBudget, confirmBudgetCleanup, productionBudgetPath } from './budget-ledger.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { httpExchange } from './http-exchange.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createManagedIdentityService } from '../../packages/azure-data-plane/src/managed-identity-service.mjs';
import { createDockerFunctionsProvisioner } from '../../packages/azure-data-plane/src/docker-functions-provisioner.mjs';
import { createDockerContainerAppProvisioner } from '../../packages/azure-data-plane/src/docker-container-app-provisioner.mjs';
import { createNativeFunctionsPlatform } from '../../packages/azure-data-plane/src/native-functions-platform.mjs';
import { createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';

for (const key of ['PAIRED_RUN_DIR', 'WORKER_IMAGE_ID', 'SCANNER_IMAGE_ID', 'SCANNER_API_AUDIENCE', 'ENTRA_TENANT_ID']) assert.ok(process.env[key], `${key} required`);
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve(process.env.PAIRED_RUN_DIR); await mkdir(out, { mode: 0o700 });
const disk = await statfs(out); assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3);
const m = { subscription: process.env.PAIRED_SUBSCRIPTION_ID, group: process.env.PAIRED_RESOURCE_GROUP,
  publisher: process.env.PAIRED_PUBLISHER_OBJECT_ID, config: process.env.PAIRED_AZURE_CONFIG_DIR,
  runId: randomBytes(6).toString('hex'), roles: Array.from({ length: 7 }, randomUUID), documentRoles: Array.from({ length: 3 }, randomUUID), parentPid: process.pid, deadline: Date.now() + 25 * 60000 };
const manifests = pairedComponentManifests(m), w = workerPaths(manifests.worker), s = scannerPaths(manifests.scanner);
const d = documentPaths(m);
const token = azureToken(m.config), replacements = [[token, '<redacted>'], [m.subscription, '<subscription>'], [m.publisher, '<publisher>']];
const report = { revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Actual Functions HTTP handler, managed identity, native ClamAV/YARA scanner, and document data/Event Grid deployment on both targets. No full document workflow.',
  fullWorkflowCompleted: false, portalEvidenceComplete: false, exchanges: [], calls: [], templates: [], cleanup: null };
const emit = createRecording(out, { platform: 'Functions to scanner: Azure and GlobalStack', revision, sourceDirty: false,
  image: process.env.WORKER_IMAGE_ID, scannerImage: process.env.SCANNER_IMAGE_ID });
let phase = 'preflight', allocated = false, watchdog, arm, facade, runtime, identity;
const images = new Map(), tags = [], compiled = new Map(), dockerConfig = resolve(out, 'private-docker');
const manifestPath = resolve(out, 'private-cleanup.json'), donePath = resolve(out, 'cleanup.done');
const observe = (target, event) => { const safe = sanitize({ target, phase, ...event }, replacements); report.exchanges.push(safe); emit('output', { target, phase, text: JSON.stringify(safe) + '\n' }); };
const request = documentPairedClient({ ...m, token }, event => observe('azure', event));
const pause = ms => new Promise(done => setTimeout(done, ms));
async function local(method, path, body) {
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
  observe('local', { method, path, request: body, ...result }); return result;
}
async function deploy(name, id, values, localValues = values) {
  assert.ok(Date.now() < m.deadline - 180000, 'Deployment time budget exhausted');
  phase = name;
  const { text, template } = compiled.get(name);
  await writeFile(resolve(out, `${name}.json`), text);
  const body = input => ({ properties: { mode: 'Incremental', template,
    parameters: Object.fromEntries(Object.entries({ ...input, runId: m.runId }).map(([key, value]) => [key, { value }])) } });
  let azure = await request('PUT', `${id}?api-version=2025-04-01`, body(values));
  if ([200, 201, 202].includes(azure.status)) {
    while (!['Succeeded', 'Failed', 'Canceled'].includes(azure.body?.properties?.provisioningState)) {
      assert.ok(Date.now() < m.deadline - 180000, 'Deployment time budget exhausted'); await pause(3000);
      azure = await request('GET', `${id}?api-version=2025-04-01`); assert.equal(azure.status, 200);
    }
  }
  const counterpart = await local('PUT', `${id}?api-version=2025-04-01`, body(localValues));
  assert.equal(azure.body?.properties?.provisioningState, 'Succeeded', `Azure ${name} failed`);
  assert.equal(counterpart.body?.properties?.provisioningState, 'Succeeded', `Local ${name} failed`);
  return { azure: azure.body, local: counterpart.body };
}
async function publish(name, imageId, registry) {
  const tag = `${registry}/${name}:${revision.slice(0, 12)}`; tags.push(tag);
  observe('azure', { operation: 'image-publication-started', name, imageId });
  execFileSync('docker', ['tag', imageId, tag], { stdio: 'pipe' });
  execFileSync('docker', ['--config', dockerConfig, 'push', tag], { stdio: 'pipe', timeout: 240000 });
  const item = JSON.parse(execFileSync('docker', ['image', 'inspect', tag], { encoding: 'utf8' }))[0];
  const reference = item.RepoDigests.find(value => value.startsWith(registry + '/')); assert.ok(reference);
  images.set(reference, item.Id); report[name] = { id: item.Id, reference };
  observe('azure', { operation: 'image-publication-completed', name, ...report[name] }); return reference;
}
try {
  const group = await request('GET', `${w.group}?api-version=2022-09-01`); assert.equal(group.status, 200); assert.equal(group.body.location, 'westus2');
  const inventory = await request('GET', `${w.group}/resources?api-version=2021-04-01`); assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink); assert.deepEqual(inventory.body.value, []);
  for (const id of new Set([...w.resources, ...s.resources, ...d.resources, ...w.deployments, ...s.deployments, ...d.deployments])) {
    assert.equal((await request('GET', `${id}?api-version=${w.versions[id] ?? s.versions[id] ?? d.versions[id] ?? '2025-04-01'}`)).status, 404);
  }
  for (const name of ['worker-host', 'worker-app', 'scanner-host', 'scanner-app', 'scanner-auth', 'document-data', 'document-events']) {
    const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${resolve('experiments/production-scenarios/document-infra')}:/fixture:ro`, '--entrypoint', '/root/.azure/bin/bicep',
      'globalstack/validation-runner:cli-pinned', 'build', `/fixture/${name}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 });
    compiled.set(name, { text, template: JSON.parse(text) }); report.templates.push({ name, sha256: createHash('sha256').update(text).digest('hex') });
  }
  for (const id of [process.env.WORKER_IMAGE_ID, process.env.SCANNER_IMAGE_ID]) {
    assert.match(id, /^sha256:[a-f0-9]{64}$/);
    assert.equal(execFileSync('docker', ['image', 'inspect', id, '--format', '{{.Id}}'], { encoding: 'utf8' }).trim(), id);
  }
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = m.subscription;
  process.env.GLOBALSTACK_AZURE_TENANT_ID = process.env.ENTRA_TENANT_ID;
  const store = new ResourceStore(), tenant = process.env.ENTRA_TENANT_ID, audience = process.env.SCANNER_API_AUDIENCE;
  identity = await createManagedIdentityService({ store, tenantId: tenant, subscriptionIds: [m.subscription], applicationAudiences: [audience] });
  const preparePlatform = createNativeFunctionsPlatform({ identityService: identity, storageRouter: () => runtime.storageRouter, store,
    containerAppRouter: () => runtime.containerAppRouter, containerAppEndpoints: ['SCANNER_ENDPOINT'], observe: event => observe('local-transport', event) });
  runtime = createEmulatorRuntime({ store, storageTokenTrusts: [identity.trust],
    containerAppTokenTrusts: [{ ...identity.trust, configurationIssuer: `https://login.microsoftonline.com/${tenant}/v2.0` }],
    nativeFunctionsProvisioner: input => createDockerFunctionsProvisioner({ images, directory: resolve(out, 'workers.private'), preparePlatform })(input),
    nativeContainerAppProvisioner: createDockerContainerAppProvisioner({ images, directory: resolve(out, 'scanner.private') }) });
  arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter: runtime.functionsRouter });
  facade = createFunctionsRouterServer(runtime.functionsRouter);
  for (const server of [arm, facade]) await new Promise(done => server.listen(0, '127.0.0.1', done));
  assert.equal((await local('PUT', `${w.group}?api-version=2022-09-01`, { location: 'westus2' })).status, 201);
  report.budget = await reserveBudget(productionBudgetPath, { runId: m.runId, envelopeUsd: 12, purpose: 'Paired native document worker, scanner, data and Event Grid deployment' }); allocated = true;
  await writeFile(manifestPath, JSON.stringify(m), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve('experiments/production-scenarios/document-paired-cleanup.mjs'), manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); }); watchdog.unref();
  const base = { serviceName: w.service, location: 'westus2' };
  await deploy('worker-host', w.deployments[0], { ...base, publisherPrincipalId: m.publisher, roleAssignmentNames: manifests.worker.roles });
  const hosted = await deploy('scanner-host', s.deployments[0], { ...base, publisherPrincipalId: m.publisher, roleAssignmentNames: manifests.scanner.roles });
  const registry = hosted.azure.properties.outputs.registryHost.value; assert.equal(registry, `${w.service}images.azurecr.io`);
  phase = 'image-publication'; await mkdir(dockerConfig, { mode: 0o700 });
  const credential = azureCli(m.config, ['acr', 'login', '--name', `${w.service}images`, '--expose-token']); replacements.push([credential.accessToken, '<redacted>']);
  execFileSync('docker', ['--config', dockerConfig, 'login', registry, '--username', '00000000-0000-0000-0000-000000000000', '--password-stdin'], { input: credential.accessToken, stdio: 'pipe', timeout: 60000 });
  const scannerImage = await publish('document-scanner', process.env.SCANNER_IMAGE_ID, registry);
  const workerImage = await publish('document-worker', process.env.WORKER_IMAGE_ID, registry);
  const app = { ...base, environmentId: s.environment, imageReference: scannerImage, registryHost: registry, publicIngress: false };
  await deploy('scanner-app', s.deployments[1], app);
  await deploy('scanner-auth', s.deployments[2], { scannerName: `${s.service}-scanner`, tenantId: tenant, scannerAudience: audience, workerIdentityName: `${w.service}-worker` });
  const exposed = await deploy('scanner-app', s.deployments[3], { ...app, publicIngress: true });
  const azureScanner = exposed.azure.properties.outputs.hostname.value, localScanner = exposed.local.properties.outputs.hostname.value;
  assert.ok(azureScanner.startsWith(`${s.service}-scanner.`) && azureScanner.endsWith('.azurecontainerapps.io'));
  assert.match(localScanner, /^[a-z0-9.-]+$/);
  const settings = hostname => [{ name: 'SCANNER_ENDPOINT', value: `https://${hostname}` }, { name: 'SCANNER_SCOPE', value: `api://${audience}/.default` }, { name: 'SCANNER_DIAGNOSTIC_ENABLED', value: 'true' }];
  report.environmentMapping = { azureScanner, localScanner, differences: ['SCANNER_ENDPOINT is the deployed scanner output on each target; application and template bytes are identical.'] };
  const worker = await deploy('worker-app', w.deployments[1], { ...base, imageReference: workerImage, applicationSettings: settings(azureScanner) }, { ...base, imageReference: workerImage, applicationSettings: settings(localScanner) });
  const hostname = worker.azure.properties.outputs.hostname.value; assert.ok(hostname.startsWith(`${w.service}-worker`) && hostname.endsWith('.azurewebsites.net'));
  phase = 'worker-readiness';
  const healthDeadline = Math.min(Date.now() + 240000, m.deadline - 120000);
  let ready = false;
  do {
    try { const result = await httpExchange(`https://${hostname}/api/health`, { timeoutMs: 10000 }); observe('azure', { method: 'GET', path: '/api/health', ...result }); ready = result.status === 200 && result.body?.worker === 'ready'; }
    catch { observe('azure', { path: '/api/health', error: 'Health transport failed' }); }
    if (ready) break; await pause(5000);
  } while (Date.now() < healthDeadline);
  assert.ok(ready, 'Azure Functions host did not become ready');
  await runtime.containerAppRouter.lifecycle.settle(); await runtime.nativeFunctionsLifecycle.settle();
  assert.equal(runtime.nativeFunctionsLifecycle.status(w.app), 'running');
  const data = await deploy('document-data', d.deployments[0], { accountName: `${w.service}docs`, workerIdentityName: `${w.service}-worker`, publisherPrincipalId: m.publisher,
    roleAssignmentNames: m.documentRoles.slice(0, 2), location: 'westus2' });
  report.documentDataDeployed = true;
  assert.equal(data.azure.properties.outputs.accountId.value.toLowerCase(), d.account.toLowerCase());
  assert.equal(data.local.properties.outputs.accountId.value.toLowerCase(), d.account.toLowerCase());
  await deploy('document-events', d.deployments[1], { accountName: `${w.service}docs`, workerName: `${w.service}-worker`,
    topicName: `${w.service}-documents`, deadLetterRoleName: m.documentRoles[2], location: 'westus2' });
  report.documentEventSubscriptionDeployed = true;
  const keys = await request('POST', `${w.app}/host/default/listkeys?api-version=2024-11-01`); assert.equal(keys.status, 200);
  const azureKey = keys.body.masterKey; assert.ok(typeof azureKey === 'string' && azureKey.length > 20); replacements.push([azureKey, '<redacted>']);
  const localKey = (await readFile(runtime.functionsRouter.nativeWorkers.get(w.app.toLowerCase()).masterKeyFile, 'utf8')).trim(); replacements.push([localKey, '<redacted>']);
  async function invoke(target, text, authenticated = true) {
    const endpoint = target === 'azure' ? `https://${hostname}` : `http://127.0.0.1:${facade.address().port}`;
    const headers = { ...(target === 'local' ? { host: `${w.service}-worker.azurewebsites.net` } : {}),
      ...(authenticated ? { 'x-functions-key': target === 'azure' ? azureKey : localKey } : {}) };
    const result = await httpExchange(endpoint + '/api/scanner-diagnostic', { method: 'POST', body: { text }, headers, timeoutMs: 45000 });
    observe(target, { method: 'POST', path: '/api/scanner-diagnostic', authenticated, inputSha256: createHash('sha256').update(text).digest('hex'), ...result }); return result;
  }
  phase = 'missing-host-key';
  for (const target of ['azure', 'local']) assert.equal((await invoke(target, 'Denied input.', false)).status, 401);
  phase = 'managed-identity-scans';
  for (const [label, text, decision] of [['clean', 'Actual Functions managed identity scan.', 'clean'], ['yara', 'PILOT_DOCUMENT_DETECTION_73261', 'detected'], ['clamav-harmless-marker', 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*', 'detected']]) {
    const azure = await invoke('azure', text), counterpart = await invoke('local', text);
    report.calls.push({ label, azure, local: counterpart });
    for (const result of [azure, counterpart]) {
      assert.equal(result.status, 200); assert.equal(result.body.upstreamStatus, 200); assert.equal(result.body.scan.status, decision);
      assert.equal(result.body.inputSha256, createHash('sha256').update(text).digest('hex')); assert.equal(result.body.scan.sha256, result.body.inputSha256);
    }
    const stable = result => JSON.parse(JSON.stringify(result.body.scan, (key, value) => key === 'durationMs' ? undefined : value));
    assert.deepEqual(stable(azure), stable(counterpart));
  }
  report.workerAccessTestedOnAzure = true;
  const authPath = `${s.auth}?api-version=2025-01-01`;
  const originalAzure = await request('GET', authPath), originalLocal = await local('GET', authPath);
  assert.equal(originalAzure.status, 200); assert.equal(originalLocal.status, 200);
  const deniedClient = randomUUID();
  const revoke = properties => {
    const value = structuredClone(properties);
    value.identityProviders.azureActiveDirectory.validation.defaultAuthorizationPolicy.allowedApplications = [deniedClient];
    return { properties: value };
  };
  report.policyTransitions = [];
  for (const [label, expectedStatus, azureBody, localBody] of [
    ['worker-policy-revoked', 403, revoke(originalAzure.body.properties), revoke(originalLocal.body.properties)],
    ['worker-policy-restored', 200, { properties: originalAzure.body.properties }, { properties: originalLocal.body.properties }],
  ]) {
    phase = label;
    assert.ok([200, 201].includes((await request('PUT', authPath, azureBody)).status));
    assert.ok([200, 201].includes((await local('PUT', authPath, localBody)).status));
    const counterpart = await invoke('local', 'Policy transition scan.');
    assert.equal(counterpart.status, expectedStatus); assert.equal(counterpart.body.upstreamStatus, expectedStatus);
    const attempts = [];
    const readiness = await observePolicyPropagation({ expectedStatus,
      request: () => invoke('azure', 'Policy transition scan.'), observe: event => attempts.push(event) });
    report.policyTransitions.push({ label, local: counterpart, azure: { ...readiness, attempts } });
    assert.ok(readiness.ready, `Azure ${label} did not reach the expected outcome`);
    const final = attempts.at(-1);
    assert.equal(final.body.upstreamStatus, expectedStatus);
    if (expectedStatus === 200) {
      for (const result of [counterpart, final]) {
        assert.equal(result.body.scan.status, 'clean');
        assert.equal(result.body.scan.sha256, createHash('sha256').update('Policy transition scan.').digest('hex'));
      }
    }
  }
  report.componentChecksPassed = true;
} catch (error) { report.error = sanitize(error.message, replacements); }
finally {
  // Preserve measured outcomes before a potentially long cloud deletion.
  try { await writeFile(resolve(out, 'observations.json'), JSON.stringify({ ...report, checkpointAt: new Date().toISOString(), cleanupPending: allocated }, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); }
  catch { report.evidenceCheckpointFailed = true; }
  phase = 'cleanup';
  for (const server of [facade, arm]) if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  try { await runtime?.dispose(); report.localCleanupComplete = true; } catch { report.localCleanupComplete = false; report.error ??= 'Local cleanup incomplete'; }
  try { identity?.dispose(); await rm(dockerConfig, { recursive: true, force: true }); }
  catch { report.localCleanupComplete = false; report.error ??= 'Local credential cleanup incomplete'; }
  for (const tag of tags) try { execFileSync('docker', ['image', 'rm', tag], { stdio: 'ignore' }); } catch {}

  if (allocated) {
    try {
      const refreshed = azureToken(m.config); replacements.push([refreshed, '<redacted>']);
      report.cleanup = await cleanupDocumentPaired(m, documentPairedClient({ ...m, token: refreshed }, event => observe('azure', event)));
      await writeFile(donePath, 'verified\n', { mode: 0o600 }); watchdog?.kill('SIGTERM'); await rm(manifestPath, { force: true }); await confirmBudgetCleanup(productionBudgetPath, m.runId);
    } catch (error) { report.cleanup = { cleanupComplete: false, recoveryRequired: true, error: sanitize(error.message, replacements) }; }
  }
  report.completedAt = new Date().toISOString();
  emit('run-end', { summary: report.error ?? (allocated && !report.cleanup?.resourcesAbsent ? 'Cleanup incomplete' : 'Component checks recorded. Full workflow remains untested.') });
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, error: report.error, componentChecksPassed: report.componentChecksPassed, cleanup: report.cleanup }));
if (report.error || allocated && !report.cleanup?.resourcesAbsent || !report.localCleanupComplete) process.exitCode = 1;
