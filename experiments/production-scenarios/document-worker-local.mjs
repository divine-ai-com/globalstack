import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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

const out = resolve(process.env.LOCAL_WORKER_RUN_DIR ?? `reports/production-scenarios/worker-template-${randomBytes(5).toString('hex')}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const uploadProbe = process.env.LOCAL_UPLOAD_DIAGNOSTIC === 'true';
const sub = '00000000-0000-0000-0000-000000000000', group = `/subscriptions/${sub}/resourceGroups/worker-template`;
const store = new ResourceStore();
const identity = await createManagedIdentityService({ store, tenantId: sub, subscriptionIds: [sub] });
const images = new Map(), image = execFileSync('docker', ['image', 'inspect', process.env.LOCAL_WORKER_IMAGE_ID ?? 'globalstack/document-functions:pilot', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const imageReference = 'document-pilot@' + image; images.set(imageReference, image);
const report = { sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  scope: uploadProbe ? 'Local worker, document data and Event Grid modules with an actual managed-identity Blob upload. No fresh Azure comparison or complete business workflow.'
    : 'Local execution of the worker host/app Bicep templates previously used on Azure. New generated parameters, no fresh Azure comparison or complete business workflow.',
  startedAt: new Date().toISOString(), image, exchanges: [], storage: [], cleanup: false };
let runtime;
const provision = createDockerFunctionsProvisioner({ images, directory: resolve(out, 'workers.private'),
  preparePlatform: createNativeFunctionsPlatform({ identityService: identity, storageRouter: () => runtime.storageRouter,
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
  const data = uploadProbe ? await deploy('data', 'document-data', { accountName: { value: `${name}docs` },
    workerIdentityName: { value: `${name}-worker` }, publisherPrincipalId: { value: randomUUID() },
    roleAssignmentNames: { value: Array.from({ length: 2 }, randomUUID) }, location: common.location }) : null;
  await deploy('app', 'worker-app', { ...common, imageReference: { value: imageReference },
    ...(uploadProbe ? { applicationSettings: { value: [
      { name: 'STORAGE_ENDPOINT', value: data.blobEndpoint.value },
      { name: 'LANDING_CONTAINER', value: 'landing' },
      { name: 'DOCUMENT_UPLOAD_DIAGNOSTIC_ENABLED', value: 'true' },
    ] } } : {}) });
  const siteId = `${group}/providers/Microsoft.Web/sites/${name}-worker`;
  await runtime.nativeFunctionsLifecycle.settle();
  report.nativeWorkerState = runtime.nativeFunctionsLifecycle.status(siteId);
  assert.equal(report.nativeWorkerState, 'running');
  const health = await httpExchange(`http://127.0.0.1:${facade.address().port}/api/health`, { headers: { host: `${name}-worker.azurewebsites.net` } });
  report.health = health; assert.equal(health.status, 200); assert.equal(health.body.worker, 'ready');
  assert.ok(report.storage.length && report.storage.every(event => event.bearer));
  report.discoveredEventGridFunctions = [...runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).eventGridFunctions];
  if (uploadProbe) {
    await deploy('events', 'document-events', { accountName: { value: `${name}docs` },
      workerName: { value: `${name}-worker` }, topicName: { value: `${name}-documents` },
      deadLetterRoleName: { value: randomUUID() }, location: common.location });
    const key = (await readFile(runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).masterKeyFile, 'utf8')).trim();
    const endpoint = `http://127.0.0.1:${facade.address().port}`;
    const headers = { host: `${name}-worker.azurewebsites.net`, 'x-functions-key': key };
    const discovered = await httpExchange(endpoint + '/admin/functions', { headers });
    report.uploadFunctionDiscovered = discovered.status === 200 && Array.isArray(discovered.body)
      && discovered.body.some(item => item.name === 'uploadDiagnostic');
    assert.ok(report.uploadFunctionDiscovered);
    const input = { tenant: 'pilot', text: 'Local document event diagnostic.' };
    const uploaded = await httpExchange(endpoint + '/api/upload-diagnostic', { method: 'POST', body: input, headers });
    report.upload = { status: uploaded.status, body: uploaded.body };
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.inputSha256, createHash('sha256').update(input.text).digest('hex'));
    assert.ok(report.storage.some(event => event.surface === 'blob-app' && event.method === 'PUT' && event.status === 201));
    const event = [...runtime.storageEventDelivery.pending.values()].find(item => item.event.subject.endsWith(uploaded.body.blobName));
    assert.ok(event, 'BlobCreated did not match the deployed Event Grid subscription');
    const eventDeadline = Date.now() + 15000;
    while (Date.now() < eventDeadline && !runtime.storageEventDelivery.diagnostics.some(item => item.eventId === event.event.id)) {
      await new Promise(done => setTimeout(done, 250));
    }
    report.eventDelivery = runtime.storageEventDelivery.diagnostics.filter(item => item.eventId === event.event.id);
    assert.ok(report.eventDelivery.length, 'Event Grid did not attempt the native Function delivery');
  }
  await request('DELETE', siteId + '?api-version=2023-12-01'); await runtime.nativeFunctionsLifecycle.settle();
  assert.equal(runtime.nativeFunctionsLifecycle.status(siteId), 'stopped');
} catch (error) { report.error = error.message; }
finally {
  try { await runtime.dispose(); identity.dispose(); report.cleanup = true; } catch { report.error ??= 'Local worker cleanup incomplete'; }
  for (const server of [arm, facade]) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  report.completedAt = new Date().toISOString(); await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, nativeWorkerState: report.nativeWorkerState, health: report.health, error: report.error, cleanup: report.cleanup }));
if (report.error || !report.cleanup) process.exitCode = 1;
