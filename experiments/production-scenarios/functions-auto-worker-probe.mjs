import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer, request } from 'node:http';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createDockerFunctionsProvisioner } from '../../packages/azure-data-plane/src/docker-functions-provisioner.mjs';
import { prepareWorkerIdentity } from './functions-identity-probe.mjs';

const exec = promisify(execFile), suffix = randomBytes(5).toString('hex'), name = `gs-auto-${suffix}`;
const out = resolve(process.env.FUNCTIONS_AUTO_PROBE_DIR ?? `reports/production-scenarios/${name}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const store = new ResourceStore(), servers = [], cleanups = [], secrets = [];
const sub = '00000000-0000-0000-0000-000000000000';
const siteId = `/subscriptions/${sub}/resourceGroups/${name}/providers/Microsoft.Web/sites/${name}`;
const report = { scope: 'Local ARM-triggered native Node Functions container lifecycle with externally prepared identity/storage transport. Not a full application or Azure comparison.',
  sourceRevision: (await exec('git', ['rev-parse', 'HEAD'])).stdout.trim(), sourceDirty: Boolean((await exec('git', ['status', '--porcelain'])).stdout.trim()),
  startedAt: new Date().toISOString(), stages: [], cleanup: false };
let runtime, networkCreated = false;
try {
  const image = (await exec('docker', ['image', 'inspect', 'globalstack/document-functions:pilot', '--format', '{{.Id}}'])).stdout.trim();
  report.image = image;
  await exec('docker', ['network', 'create', '--internal', '--label', 'globalstack.experiment=automatic-functions', name]); networkCreated = true;
  const gateway = JSON.parse((await exec('docker', ['network', 'inspect', name])).stdout)[0].IPAM.Config[0].Gateway;
  const identity = await prepareWorkerIdentity({ store, gateway, name, suffix, out, servers, secrets,
    registerCleanup: callback => cleanups.push(callback), hostStorageIdentity: true });
  report.identity = identity.report;
  const env = { ...identity.env, AzureWebJobsSecretStorageType: 'files', WEBSITE_HOSTNAME: `${name}.azurewebsites.net` };
  const hosts = [], mounts = [];
  for (let i = 0; i < identity.dockerArgs.length; i += 2) {
    if (identity.dockerArgs[i] === '--add-host') hosts.push(identity.dockerArgs[i + 1]);
    if (identity.dockerArgs[i] === '-v') mounts.push(identity.dockerArgs[i + 1]);
  }
  const provision = createDockerFunctionsProvisioner({ images: new Map([['document-pilot@' + image, image]]), directory: resolve(out, 'workers.private'),
    preparePlatform: async () => ({ network: name, env, extraHosts: hosts, mounts, dispose: async () => {} }) });
  runtime = createEmulatorRuntime({ store, nativeFunctionsProvisioner: provision });
  const armServer = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter: runtime.functionsRouter });
  const facade = createServer(runtime.functionsRouter.handler());
  for (const server of [armServer, facade]) { servers.push(server); await new Promise(done => server.listen(0, '127.0.0.1', done)); }
  const original = structuredClone(store.resources.get(siteId.toLowerCase()));
  const body = { location: 'westus2', kind: 'functionapp,linux,container', identity: original.identity, properties: {
    serverFarmId: original.properties.serverFarmId, siteConfig: { linuxFxVersion: 'DOCKER|document-pilot@' + image, appSettings: [] },
  } };
  async function arm(method, payload) {
    const res = await fetch(`http://127.0.0.1:${armServer.address().port}${siteId}?api-version=2023-12-01`, {
      method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}),
    });
    await res.arrayBuffer(); report.stages.push({ action: method, status: res.status, at: new Date().toISOString() });
    assert.ok([200, 201, 202, 204].includes(res.status));
  }
  async function health(expected) {
    const status = await new Promise((done, reject) => {
      const req = request(`http://127.0.0.1:${facade.address().port}/api/health`, { headers: { host: `${name}.azurewebsites.net` } }, res => { res.resume(); res.on('end', () => done(res.statusCode)); });
      req.on('error', reject); req.end();
    });
    report.stages.push({ action: 'health', status, expected, at: new Date().toISOString() }); assert.equal(status, expected);
  }
  await arm('PUT', body); await health(503);
  await runtime.nativeFunctionsLifecycle.settle();
  assert.equal(runtime.nativeFunctionsLifecycle.status(siteId), 'running'); await health(200);
  const nativeBinding = runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase());
  assert.ok(nativeBinding.eventGridFunctions.has('documentuploaded'));
  report.stages.push({ action: 'native-event-trigger-discovery', functions: [...nativeBinding.eventGridFunctions] });
  const delivery = await runtime.functionsRouter.deliverEventGrid(`${siteId}/functions/documentUploaded`, {
    id: `event-${suffix}`, eventType: 'Microsoft.Storage.BlobCreated', subject: '/blobServices/default/containers/landing/blobs/document.txt',
    eventTime: new Date().toISOString(), dataVersion: '1.0', data: {},
  });
  report.stages.push({ action: 'native-event-handler', ...delivery });
  assert.equal(delivery.reason, 'NativeEventGridHttp500', 'Incomplete application configuration must fail in the real handler');
  const names = (await exec('docker', ['ps', '--filter', `network=${name}`, '--filter', 'label=globalstack.managed=functions', '--format', '{{.Names}}'])).stdout.trim().split('\n');
  assert.equal(names.length, 1);
  const logs = await exec('docker', ['logs', names[0]], { maxBuffer: 4 * 1024 ** 2 });
  const text = logs.stdout + logs.stderr;
  const observation = { action: 'native-handler-log', failed: /Executed 'Functions\.documentUploaded' \(Failed/.test(text),
    missingSettings: [...new Set([...text.matchAll(/Missing application setting ([A-Z_]+)/g)].map(match => match[1]))] };
  report.stages.push(observation); assert.ok(observation.failed && observation.missingSettings.includes('STORAGE_RESOURCE_ID'));
  const first = nativeBinding.masterKeyFile;
  await arm('PUT', { ...body, tags: { observation: 'unchanged-worker' } }); await runtime.nativeFunctionsLifecycle.settle();
  assert.equal(runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).masterKeyFile, first);
  report.stages.push({ action: 'tag-update-kept-worker', passed: true });
  body.properties.siteConfig.appSettings = [{ name: 'PILOT_REVISION', value: 'two' }];
  await arm('PUT', body); await runtime.nativeFunctionsLifecycle.settle(); await health(200);
  assert.notEqual(runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).masterKeyFile, first);
  report.stages.push({ action: 'settings-update-replaced-worker', passed: true });
  await arm('PUT', { ...body, properties: { ...body.properties, siteConfig: { ...body.properties.siteConfig, linuxFxVersion: 'DOCKER|unapproved-image' } } });
  await runtime.nativeFunctionsLifecycle.settle(); assert.equal(runtime.nativeFunctionsLifecycle.status(siteId), 'failed'); await health(503);
  report.stages.push({ action: 'unapproved-image-rejected', passed: true });
  await arm('PUT', body); await runtime.nativeFunctionsLifecycle.settle(); await health(200);
  await arm('DELETE'); await runtime.nativeFunctionsLifecycle.settle(); await health(404);
  assert.equal(runtime.nativeFunctionsLifecycle.status(siteId), 'stopped');
  assert.ok(report.identity.requests.length > 0 && report.identity.requests.every(item => item.bearer));
} catch (error) {
  report.error = error instanceof assert.AssertionError ? `Assertion failed: ${error.message}` : 'Automatic worker diagnostic failed';
  for (const secret of secrets) report.error = report.error.split(secret).join('<private-value>');
} finally {
  try {
    await runtime?.dispose();
    for (const server of servers) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    for (const cleanup of cleanups) await cleanup();
    if (networkCreated) await exec('docker', ['network', 'rm', name]);
    report.cleanup = true;
  } catch { report.error ??= 'Automatic worker diagnostic cleanup failed'; }
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, stages: report.stages, cleanup: report.cleanup, error: report.error }, null, 2));
if (report.error || !report.cleanup) process.exitCode = 1;
