import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createDockerContainerAppProvisioner } from '../../packages/azure-data-plane/src/docker-container-app-provisioner.mjs';
const exec = promisify(execFile);
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createManagedIdentityService } from '../../packages/azure-data-plane/src/managed-identity-service.mjs';
import { createDockerFunctionsProvisioner } from '../../packages/azure-data-plane/src/docker-functions-provisioner.mjs';
import { createNativeFunctionsPlatform } from '../../packages/azure-data-plane/src/native-functions-platform.mjs';
import { createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';
import { httpExchange } from './http-exchange.mjs';

const out = resolve(process.env.WORKER_SCANNER_RUN_DIR ?? `reports/production-scenarios/worker-scanner-${randomBytes(5).toString('hex')}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const sub = '00000000-0000-0000-0000-000000000000', group = `/subscriptions/${sub}/resourceGroups/worker-template`;
const store = new ResourceStore(), audience = randomUUID();
let scannerConfiguration, scannerId, scannerHostname;
const identity = await createManagedIdentityService({ store, tenantId: sub, subscriptionIds: [sub], applicationAudiences: [audience] });
const images = new Map(), image = execFileSync('docker', ['image', 'inspect', 'globalstack/document-functions:pilot', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const imageReference = 'document-pilot@' + image; images.set(imageReference, image);
const scannerImage = execFileSync('docker', ['image', 'inspect', 'globalstack/document-scanner:frozen-20261107', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const scannerReference = 'scanner-pilot@' + scannerImage; images.set(scannerReference, scannerImage);
const report = { sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  scope: 'Local ARM-deployed native Functions container obtains a managed-identity token through the Azure SDK and calls the native scanner. SDK commands execute inside the worker container; this is not a Functions event invocation, Azure comparison or complete business workflow.',
  startedAt: new Date().toISOString(), image, scannerImage, exchanges: [], storage: [], scans: [], cleanup: false };
let runtime;
const provision = createDockerFunctionsProvisioner({ images, directory: resolve(out, 'workers.private'),
  preparePlatform: createNativeFunctionsPlatform({ identityService: identity, storageRouter: () => runtime.storageRouter, store, containerAppRouter: () => runtime.containerAppRouter, containerAppEndpoints: ['SCANNER_ENDPOINT'], observe: event => report.storage.push(event) }) });
runtime = createEmulatorRuntime({ store, storageTokenTrusts: [identity.trust], containerAppTokenTrusts: [{ ...identity.trust, configurationIssuer: `https://login.microsoftonline.com/${sub}/v2.0` }], nativeFunctionsProvisioner: provision, nativeContainerAppProvisioner: createDockerContainerAppProvisioner({ images, directory: resolve(out, 'scanner.private') }) });
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
  async function scannerDeploy(templateName, values) {
    const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${resolve('experiments/production-scenarios/document-infra')}:/fixture:ro`,
      '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned', 'build', `/fixture/${templateName}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 });
    report.templates[templateName] = createHash('sha256').update(text).digest('hex');
    await writeFile(resolve(out, `${templateName}.json`), text);
    const result = await request('PUT', `${group}/providers/Microsoft.Resources/deployments/${templateName}?api-version=2025-04-01`, {
      properties: { mode: 'Incremental', template: JSON.parse(text), parameters: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])) },
    });
    assert.equal(result.body.properties.provisioningState, 'Succeeded'); return result.body;
  }
  for (const stage of ['host', 'app']) {
    if (stage === 'app') {
      const environmentId = `${group}/providers/Microsoft.App/managedEnvironments/${name}-scanner`;
      scannerId = `${group}/providers/Microsoft.App/containerApps/${name}-scanner`;
      await request('PUT', `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${name}-scanner?api-version=2023-01-31`, { location: 'westus2' });
      await request('PUT', `${environmentId}?api-version=2025-01-01`, { location: 'westus2', properties: {} });
      const scanner = await scannerDeploy('scanner-app', { serviceName: name, location: 'westus2', runId: name, environmentId,
        imageReference: scannerReference, registryHost: `${name}images.azurecr.io`, publicIngress: true });
      scannerHostname = scanner.properties.outputs.hostname.value;
      await scannerDeploy('scanner-auth', { scannerName: `${name}-scanner`, tenantId: sub, scannerAudience: audience, workerIdentityName: `${name}-worker` });
      scannerConfiguration = structuredClone(store.resources.get(`${scannerId}/authconfigs/current`.toLowerCase()));
      await runtime.containerAppRouter.lifecycle.settle();
      assert.equal(runtime.containerAppRouter.lifecycle.status(scannerId), 'running');
    }
    const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${resolve('experiments/production-scenarios/document-infra')}:/fixture:ro`,
      '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned', 'build', `/fixture/worker-${stage}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 });
    report.templates[stage] = createHash('sha256').update(text).digest('hex');
    await writeFile(resolve(out, `worker-${stage}.json`), text);
    const parameters = stage === 'host' ? { ...common, publisherPrincipalId: { value: randomUUID() }, roleAssignmentNames: { value: Array.from({ length: 6 }, randomUUID) } }
      : { ...common, imageReference: { value: imageReference }, applicationSettings: { value: [{ name: 'SCANNER_ENDPOINT', value: `https://${scannerHostname}` }, { name: 'SCANNER_SCOPE', value: `api://${audience}/.default` }] } };
    const result = await request('PUT', `${group}/providers/Microsoft.Resources/deployments/worker-${stage}?api-version=2025-04-01`, {
      properties: { mode: 'Incremental', template: JSON.parse(text), parameters },
    });
    assert.equal(result.body.properties.provisioningState, 'Succeeded');
  }
  const siteId = `${group}/providers/Microsoft.Web/sites/${name}-worker`;
  await runtime.nativeFunctionsLifecycle.settle();
  report.nativeWorkerState = runtime.nativeFunctionsLifecycle.status(siteId);
  assert.equal(report.nativeWorkerState, 'running');
  const health = await httpExchange(`http://127.0.0.1:${facade.address().port}/api/health`, { headers: { host: `${name}-worker.azurewebsites.net` } });
  report.health = health; assert.equal(health.status, 200); assert.equal(health.body.worker, 'ready');
  assert.ok(report.storage.length && report.storage.every(event => event.bearer));
  report.discoveredEventGridFunctions = [...runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).eventGridFunctions];
  const workerOrigin = new URL(runtime.functionsRouter.nativeWorkers.get(siteId.toLowerCase()).origin).hostname;
  const containers = (await exec('docker', ['ps', '--filter', 'label=globalstack.managed=functions', '--format', '{{.ID}}'])).stdout.trim().split('\n').filter(Boolean);
  const matching = [];
  for (const id of containers) {
    const item = JSON.parse((await exec('docker', ['inspect', id])).stdout)[0];
    if (Object.values(item.NetworkSettings.Networks).some(network => network.IPAddress === workerOrigin)) matching.push(id);
  }
  assert.equal(matching.length, 1);
  const client = `import { DefaultAzureCredential } from '@azure/identity';
    const credential = new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID });
    const token = await credential.getToken(process.env.SCANNER_SCOPE);
    try {
      const response = await fetch(process.env.SCANNER_ENDPOINT + '/scan', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { authorization: 'Bearer ' + token.token, 'content-type': 'text/plain' }, body: process.argv[1] });
      const text = await response.text(); console.log(JSON.stringify({ status: response.status, body: text ? JSON.parse(text) : null }));
    } catch (error) { console.log(JSON.stringify({ transportError: error.cause?.code ?? 'request_failed' })); }`;
  async function probe(label, payload, expected, decision, extra = []) {
    const result = JSON.parse((await exec('docker', ['exec', ...extra, '-w', '/home/site/wwwroot', matching[0], 'node', '--input-type=module', '-e', client, payload], { timeout: 45000, maxBuffer: 1048576 })).stdout);
    report.scans.push({ label, at: new Date().toISOString(), ...result });
    if (expected !== null) assert.equal(result.status, expected);
    if (decision) assert.equal(result.body.status, decision);
    return result;
  }
  await probe('worker-clean-text', 'Worker identity scanner probe.', 200, 'clean');
  await probe('worker-yara-marker', 'PILOT_DOCUMENT_DETECTION_73261', 200, 'detected');
  const denied = structuredClone(scannerConfiguration.properties);
  denied.identityProviders.azureActiveDirectory.validation.defaultAuthorizationPolicy.allowedApplications = [randomUUID()];
  await request('PUT', `${scannerId}/authConfigs/current?api-version=2025-01-01`, { properties: denied });
  assert.equal((await probe('worker-policy-denied', 'Denied input.', 403)).body, null);
  await request('PUT', `${scannerId}/authConfigs/current?api-version=2025-01-01`, { properties: scannerConfiguration.properties });
  await probe('worker-policy-restored', 'Restored worker access.', 200, 'clean');
  const untrusted = await probe('worker-untrusted-certificate', 'Untrusted transport.', null, null, ['-e', 'NODE_EXTRA_CA_CERTS=/dev/null']);
  assert.ok(['DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(untrusted.transportError));
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
