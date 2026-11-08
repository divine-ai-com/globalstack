import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile, rm, statfs } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azureToken, azureDockerArguments, azureCli } from './azure-session.mjs';
import { workerPaths, workerClient, cleanupWorker } from './worker-cleanup.mjs';
import { reserveBudget, confirmBudgetCleanup, productionBudgetPath } from './budget-ledger.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { httpExchange } from './http-exchange.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
assert.ok(process.env.PAIRED_RUN_DIR, 'Evidence directory required');
const out = resolve(process.env.PAIRED_RUN_DIR); await mkdir(out, { recursive: true, mode: 0o700 });
const disk = await statfs(out); assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: repo }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', cwd: repo }).trim(), '');
const m = { subscription: process.env.PAIRED_SUBSCRIPTION_ID, group: process.env.PAIRED_RESOURCE_GROUP,
  publisher: process.env.PAIRED_PUBLISHER_OBJECT_ID, config: process.env.PAIRED_AZURE_CONFIG_DIR,
  runId: randomBytes(6).toString('hex'), roles: Array.from({ length: 6 }, randomUUID), parentPid: process.pid, deadline: Date.now() + 20 * 60000 };
const s = workerPaths(m), token = azureToken(m.config);
const replacements = [[token, '<redacted>'], [m.subscription, '<subscription>'], [m.group, '<group>'], [m.publisher, '<publisher>'], [out, '<run-directory>']];
const emit = createRecording(out, { platform: 'Document worker: Azure CLI and local ARM', revision, sourceDirty: false });
const report = { revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Containerized document Functions package, identity-based host storage and health. Downstream services are not yet configured; no complete document workflow.',
  businessWorkflowCompleted: false, portalEvidenceComplete: false, exchanges: [], cleanup: null, localNativeRuntimeVerified: false };
let phase = 'preflight', allocated = false, watchdog, arm, facade, runtime, imageReference;
const manifestPath = resolve(out, 'private-cleanup.json'), donePath = resolve(out, 'cleanup.done'), dockerConfig = resolve(out, 'private-docker');
const observe = (target, event) => { const safe = sanitize({ target, phase, ...event }, replacements); report.exchanges.push(safe); emit('output', { target, phase, text: JSON.stringify(safe, null, 2) + '\n' }); };
const request = workerClient({ ...m, token }, event => observe('azure', event));
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
  const id = s.deployments[stage === 'host' ? 0 : 1], stem = `worker-${stage}`;
  await writeFile(resolve(out, `${stem}.json`), compiled.text, { mode: 0o600 });
  await writeFile(resolve(out, `${stem}-parameters.json`), JSON.stringify({ parameters }), { mode: 0o600 });
  const body = { properties: { mode: 'Incremental', template: compiled.template, parameters } };
  phase = `${stage}-validation`;
  const validation = await request('POST', `${id}/validate?api-version=2025-04-01`, body);
  await local('POST', `${id}/validate?api-version=2025-04-01`, body);
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
try {
  const group = await request('GET', `${s.group}?api-version=2022-09-01`);
  assert.equal(group.status, 200); assert.equal(group.body.location, 'westus2');
  const inventory = await request('GET', `${s.group}/resources?api-version=2021-04-01`);
  assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink); assert.deepEqual(inventory.body.value, []);
  for (const id of [...s.deployments, ...s.resources]) assert.equal((await request('GET', `${id}?api-version=${s.versions[id] ?? '2025-04-01'}`)).status, 404);
  const host = compile('worker-host'), app = compile('worker-app');
  report.templates = { host: host.sha256, app: app.sha256 };
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = m.subscription;
  const store = new ResourceStore(); runtime = createEmulatorRuntime({ store });
  arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter: runtime.functionsRouter });
  facade = createFunctionsRouterServer(runtime.functionsRouter);
  for (const server of [arm, facade]) await new Promise(done => server.listen(0, '127.0.0.1', done));
  const localGroup = await local('PUT', `${s.group}?api-version=2022-09-01`, { location: group.body.location });
  assert.equal(localGroup.status, 201, 'Local subscription and group setup must succeed before Azure mutation');
  report.budget = await reserveBudget(productionBudgetPath, { runId: m.runId, envelopeUsd: 5, purpose: 'Document worker image publication and short EP1 runtime probe' }); allocated = true;
  await writeFile(manifestPath, JSON.stringify(m), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve(here, 'worker-cleanup.mjs'), manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); }); watchdog.unref();
  const baseParameters = { serviceName: { value: s.service }, location: { value: group.body.location }, runId: { value: m.runId } };
  const hosted = await deploy('host', host, { ...baseParameters, publisherPrincipalId: { value: m.publisher }, roleAssignmentNames: { value: m.roles } });
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
  const deployed = await deploy('app', app, { ...baseParameters, imageReference: { value: report.applicationImage.digest } });
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
  const localHealth = await httpExchange(`http://127.0.0.1:${facade.address().port}/api/health`, { headers: { host: `${s.service}-worker.azurewebsites.net` } });
  observe('local', { method: 'GET', path: '/api/health', ...localHealth });
  report.localHealthStatus = localHealth.status;
  report.observationsComplete = true;
} catch (error) { report.error = sanitize(error.message, replacements); }
finally {
  phase = 'cleanup';
  if (allocated) {
    try {
      const refreshed = azureToken(m.config); replacements.push([refreshed, '<redacted>']);
      report.cleanup = await cleanupWorker(m, workerClient({ ...m, token: refreshed }, event => observe('azure', event)));
      await writeFile(donePath, 'verified\n', { mode: 0o600 }); watchdog?.kill('SIGTERM'); await rm(manifestPath, { force: true });
      await confirmBudgetCleanup(productionBudgetPath, m.runId);
    } catch { report.cleanup = { cleanupComplete: false, recoveryRequired: true }; }
  }
  for (const server of [facade, arm]) if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await runtime?.dispose();
  await rm(dockerConfig, { recursive: true, force: true });
  if (imageReference) try { execFileSync('docker', ['image', 'rm', imageReference], { stdio: 'ignore' }); } catch {}
  report.completedAt = new Date().toISOString(); emit('run-end', { summary: report.error ?? 'Worker observations recorded. No full application workflow.' });
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, error: report.error, azureNativeHealth: report.azureNativeHealth, hostLocalState: report.hostLocalState, appLocalState: report.appLocalState, localHealthStatus: report.localHealthStatus, cleanup: report.cleanup }));
if (report.error || allocated && !report.cleanup?.resourcesAbsent) process.exitCode = 1;
