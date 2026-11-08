import { createServer as tlsServer, request as tlsRequest } from 'node:https';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, statfs } from 'node:fs/promises';
import { resolve } from 'node:path';
import { azureToken, azureCli } from './azure-session.mjs';
import { scannerPaths, scannerClient, cleanupScanner } from './scanner-cleanup.mjs';
import { reserveBudget, confirmBudgetCleanup, productionBudgetPath } from './budget-ledger.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { httpExchange } from './http-exchange.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createDockerContainerAppProvisioner } from '../../packages/azure-data-plane/src/docker-container-app-provisioner.mjs';

assert.ok(process.env.PAIRED_RUN_DIR && process.env.SCANNER_IMAGE_ID && process.env.SCANNER_API_AUDIENCE && process.env.ENTRA_TENANT_ID);
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const out = resolve(process.env.PAIRED_RUN_DIR); await mkdir(out, { mode: 0o700 });
const space = await statfs(out); assert.ok(space.bavail * space.bsize >= 40 * 1024 ** 3);
const m = { subscription: process.env.PAIRED_SUBSCRIPTION_ID, group: process.env.PAIRED_RESOURCE_GROUP,
  publisher: process.env.PAIRED_PUBLISHER_OBJECT_ID, config: process.env.PAIRED_AZURE_CONFIG_DIR,
  runId: randomBytes(6).toString('hex'), roles: [randomUUID(), randomUUID()], parentPid: process.pid, deadline: Date.now() + 20 * 60000 };
const s = scannerPaths(m), token = azureToken(m.config), replacements = [[token, '<redacted>'], [m.subscription, '<subscription>'], [m.publisher, '<publisher>']];
const emit = createRecording(out, { platform: 'Scanner ingress: Azure and local ARM', revision, sourceDirty: false });
const report = { revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Native scanner deployment and rejection of unauthenticated and unlisted callers. Valid worker execution on Azure is not tested in this stage.',
  workerAccessTestedOnAzure: false, fullWorkflowCompleted: false, portalEvidenceComplete: false, exchanges: [], cleanup: null };
let phase = 'preflight', allocated = false, watchdog, arm, facade, runtime, imageTag, localHostname;
const images = new Map(), manifest = resolve(out, 'private-cleanup.json'), done = resolve(out, 'cleanup.done'), dockerConfig = resolve(out, 'private-docker');
const observe = (target, event) => { const safe = sanitize({ target, phase, ...event }, replacements); report.exchanges.push(safe); emit('output', { target, phase, text: JSON.stringify(safe) + '\n' }); };
const request = scannerClient({ ...m, token }, event => observe('azure', event));
async function local(method, id, body) {
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${id}`, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
  observe('local', { method, path: id, request: body, ...result }); return result;
}
const compiled = new Map();
function compile(name) {
  const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${resolve('experiments/production-scenarios/document-infra')}:/fixture:ro`,
    '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned', 'build', `/fixture/${name}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 });
  compiled.set(name, { text, template: JSON.parse(text), sha256: createHash('sha256').update(text).digest('hex') });
}
async function deploy(stage, templateName, values) {
  assert.ok(Date.now() < m.deadline - 180000, 'Insufficient time before cleanup');
  const item = compiled.get(templateName), id = s.deployments[['host', 'app', 'auth', 'public'].indexOf(stage)];
  const body = { properties: { mode: 'Incremental', template: item.template,
    parameters: Object.fromEntries(Object.entries({ ...values, runId: m.runId }).map(([key, value]) => [key, { value }])) } };
  await writeFile(resolve(out, `${stage}-template.json`), item.text);
  await writeFile(resolve(out, `${stage}-parameters.json`), JSON.stringify(body.properties.parameters, null, 2));
  phase = `${stage}-deployment`;
  const submitted = await request('PUT', `${id}?api-version=2025-04-01`, body);
  let state = submitted;
  if ([200, 201, 202].includes(submitted.status)) {
    do {
      assert.ok(Date.now() < m.deadline - 180000, 'Deployment deadline reached');
      await new Promise(done => setTimeout(done, 3000));
      state = await request('GET', `${id}?api-version=2025-04-01`);
      assert.equal(state.status, 200);
    } while (!['Succeeded', 'Failed', 'Canceled'].includes(state.body?.properties?.provisioningState));
  }
  const counterpart = await local('PUT', `${id}?api-version=2025-04-01`, body);
  if (stage === 'public') localHostname = counterpart.body?.properties?.outputs?.hostname?.value;
  report[`${stage}States`] = { azureStatus: state.status, azure: state.body?.properties?.provisioningState ?? state.body?.error?.code,
    localStatus: counterpart.status, local: counterpart.body?.properties?.provisioningState ?? counterpart.body?.error?.code };
  assert.equal(state.body?.properties?.provisioningState, 'Succeeded', `Azure ${stage} deployment did not succeed`);
  return state.body;
}
try {
  const group = await request('GET', `${s.group}?api-version=2022-09-01`); assert.equal(group.status, 200); assert.equal(group.body.location, 'westus2');
  const inventory = await request('GET', `${s.group}/resources?api-version=2021-04-01`); assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink); assert.deepEqual(inventory.body.value, []);
  for (const id of [...s.resources, ...s.deployments]) assert.equal((await request('GET', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`)).status, 404);
  for (const name of ['scanner-host', 'scanner-app', 'scanner-auth']) compile(name);
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = m.subscription;
  const issuer = `https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0`;
  const keyResponse = await fetch(`https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/discovery/v2.0/keys`, { signal: AbortSignal.timeout(10000) });
  assert.equal(keyResponse.status, 200);
  const keys = (await keyResponse.json()).keys.filter(key => key.kty === 'RSA' && key.use === 'sig').map(key => ({ ...key, alg: 'RS256' }));
  const store = new ResourceStore();
  runtime = createEmulatorRuntime({ store, containerAppTokenTrusts: [{ issuer, tenantId: process.env.ENTRA_TENANT_ID, subscriptionIds: [m.subscription], jwks: { keys } }], nativeContainerAppProvisioner: input => createDockerContainerAppProvisioner({ images, directory: resolve(out, 'local-workers') })(input) });
  arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  assert.equal((await local('PUT', `${s.group}?api-version=2022-09-01`, { location: 'westus2' })).status, 201);
  report.budget = await reserveBudget(productionBudgetPath, { runId: m.runId, envelopeUsd: 6, purpose: 'Frozen scanner Container Apps ingress and authentication pilot' }); allocated = true;
  await writeFile(manifest, JSON.stringify(m), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve('experiments/production-scenarios/scanner-cleanup.mjs'), manifest, done, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); }); watchdog.unref();
  const base = { serviceName: s.service, location: 'westus2' };
  const host = await deploy('host', 'scanner-host', { ...base, publisherPrincipalId: m.publisher, roleAssignmentNames: m.roles });
  const registryHost = host.properties.outputs.registryHost.value; assert.equal(registryHost, `${s.service}images.azurecr.io`);
  phase = 'image-publication'; await mkdir(dockerConfig, { mode: 0o700 });
  const credential = azureCli(m.config, ['acr', 'login', '--name', `${s.service}images`, '--expose-token']); replacements.push([credential.accessToken, '<redacted>']);
  execFileSync('docker', ['--config', dockerConfig, 'login', registryHost, '--username', '00000000-0000-0000-0000-000000000000', '--password-stdin'],
    { input: credential.accessToken, stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
  imageTag = `${registryHost}/document-scanner:${revision.slice(0, 12)}`;
  execFileSync('docker', ['tag', process.env.SCANNER_IMAGE_ID, imageTag], { stdio: 'pipe', timeout: 10000 });
  execFileSync('docker', ['--config', dockerConfig, 'push', imageTag], { stdio: 'pipe', timeout: 180000 });
  const image = JSON.parse(execFileSync('docker', ['image', 'inspect', imageTag], { encoding: 'utf8' }))[0];
  const imageReference = image.RepoDigests.find(value => value.startsWith(registryHost + '/')); assert.ok(imageReference);
  report.image = { id: image.Id, reference: imageReference }; images.set(imageReference, image.Id);
  const appValues = { ...base, environmentId: s.environment, imageReference, registryHost, publicIngress: false };
  await deploy('app', 'scanner-app', appValues);
  await deploy('auth', 'scanner-auth', { scannerName: `${s.service}-scanner`, tenantId: process.env.ENTRA_TENANT_ID,
    scannerAudience: process.env.SCANNER_API_AUDIENCE, workerIdentityName: `${s.service}-worker` });
  const config = await request('GET', `${s.auth}?api-version=2025-01-01`); assert.equal(config.status, 200);
  assert.equal(config.body.properties.platform.enabled, true);
  assert.equal(config.body.properties.httpSettings.requireHttps, true);
  assert.equal(config.body.properties.globalValidation.unauthenticatedClientAction, 'Return401');
  assert.equal(config.body.properties.identityProviders.azureActiveDirectory.enabled, true);
  assert.deepEqual(config.body.properties.identityProviders.azureActiveDirectory.validation.allowedAudiences, [process.env.SCANNER_API_AUDIENCE]);
  assert.deepEqual(config.body.properties.identityProviders.azureActiveDirectory.validation.defaultAuthorizationPolicy.allowedPrincipals.identities, [host.properties.outputs.workerPrincipalId.value]);
  assert.deepEqual(config.body.properties.identityProviders.azureActiveDirectory.validation.defaultAuthorizationPolicy.allowedApplications, [host.properties.outputs.workerClientId.value]);
  const exposed = await deploy('public', 'scanner-app', { ...appValues, publicIngress: true });
  const hostname = exposed.properties.outputs.hostname.value; assert.ok(hostname.startsWith(`${s.service}-scanner.`) && hostname.endsWith('.azurecontainerapps.io'));
  await runtime.containerAppRouter.lifecycle.settle();
  assert.ok(typeof localHostname === 'string' && /^[a-z0-9.-]+$/.test(localHostname));
  const tlsDir = resolve(out, 'private-tls'); await mkdir(tlsDir, { mode: 0o700 });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', `subjectAltName=IP:127.0.0.1,DNS:${localHostname}`, '-keyout', resolve(tlsDir, 'key'), '-out', resolve(tlsDir, 'cert')], { stdio: 'ignore' });
  const ca = await readFile(resolve(tlsDir, 'cert'));
  facade = tlsServer({ key: await readFile(resolve(tlsDir, 'key')), cert: ca }, runtime.containerAppRouter.handler());
  await new Promise(done => facade.listen(0, '127.0.0.1', done));
  async function localIngress(bearer) {
    return new Promise((done, fail) => {
      const req = tlsRequest(`https://127.0.0.1:${facade.address().port}/scan`, { ca, method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { host: localHostname, ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', fail);
        res.on('end', () => done({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }));
      }); req.on('error', fail); req.end();
    });
  }
  phase = 'ingress-negative-controls';
  const pilot = azureCli(m.config, ['account', 'get-access-token', '--scope', `api://${process.env.SCANNER_API_AUDIENCE}/.default`]).accessToken; replacements.push([pilot, '<redacted>']);
  for (const [name, bearer, expected] of [['missing-token', null, 401], ['wrong-audience', token, 401], ['valid-unlisted-pilot', pilot, 403]]) {
    const response = await httpExchange(`https://${hostname}/scan`, { method: 'POST', body: { harmlessProbe: true }, headers: bearer ? { authorization: `Bearer ${bearer}` } : {}, timeoutMs: 20000 });
    observe('azure', { control: name, path: '/scan', ...response });
    const localResponse = await localIngress(bearer); observe('local', { control: name, path: '/scan', ...localResponse });
    report[name] = { azure: response.status, local: localResponse.status, expected, statusMatched: response.status === localResponse.status };
  }
  await runtime.containerAppRouter.lifecycle.settle();
  report.localRuntimeState = runtime.containerAppRouter.lifecycle.status(s.app);
  report.observationsComplete = true;
} catch (error) { report.error = sanitize(String(error.message).slice(0, 2000), replacements); }
finally {
  phase = 'cleanup';
  if (allocated) {
    try {
      const refreshed = azureToken(m.config); replacements.push([refreshed, '<redacted>']);
      report.cleanup = await cleanupScanner(m, scannerClient({ ...m, token: refreshed }, event => observe('azure', event)));
      await writeFile(done, 'verified\n', { mode: 0o600 }); watchdog?.kill('SIGTERM'); await rm(manifest, { force: true }); await confirmBudgetCleanup(productionBudgetPath, m.runId);
    } catch { report.cleanup = { recoveryRequired: true }; }
  }
  for (const server of [facade, arm]) if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  try { await runtime?.dispose(); report.localCleanup = true; } catch { report.localCleanup = false; }
  await rm(dockerConfig, { recursive: true, force: true });
  await rm(resolve(out, 'private-tls'), { recursive: true, force: true });
  if (imageTag) try { execFileSync('docker', ['image', 'rm', imageTag], { stdio: 'ignore' }); } catch {}
  report.completedAt = new Date().toISOString(); emit('run-end', { summary: report.error ?? 'Ingress observations recorded; full pipeline remains untested.' });
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ out, error: report.error, observationsComplete: report.observationsComplete, cleanup: report.cleanup }));
if (report.error || allocated && !report.cleanup?.resourcesAbsent || report.localCleanup === false) process.exitCode = 1;
