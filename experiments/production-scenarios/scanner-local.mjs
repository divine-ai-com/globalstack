import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as tlsServer, request } from 'node:https';
import { resolve } from 'node:path';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createManagedIdentityService } from '../../packages/azure-data-plane/src/managed-identity-service.mjs';
import { createDockerContainerAppProvisioner } from '../../packages/azure-data-plane/src/docker-container-app-provisioner.mjs';

assert.ok(process.env.SCANNER_PROBE_DIR && process.env.SCANNER_IMAGE_ID);
const out = resolve(process.env.SCANNER_PROBE_DIR);
await mkdir(out, { mode: 0o700 });
const sub = '00000000-0000-0000-0000-000000000000', tenant = sub;
const audience = '5a1902a9-0a35-4221-a6c6-46dd651a63d4';
const group = `/subscriptions/${sub}/resourceGroups/scanner-pilot`;
const service = 'scannerpilot', workerId = `${group}/providers/Microsoft.Web/sites/worker`;
const identityId = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${service}-worker`;
const scannerId = `${group}/providers/Microsoft.App/containerApps/${service}-scanner`;
const report = { startedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()),
  scope: 'Local ARM deployment and native ClamAV/YARA scanner through authenticated HTTPS ingress. No Azure or full document workflow.',
  imageId: process.env.SCANNER_IMAGE_ID, checks: [], arm: [], cleanup: false };
const store = new ResourceStore(), servers = [];
const broker = await createManagedIdentityService({ store, tenantId: tenant, subscriptionIds: [sub], applicationAudiences: [audience] });
const runtime = createEmulatorRuntime({ store,
  containerAppTokenTrusts: [{ ...broker.trust, configurationIssuer: `https://login.microsoftonline.com/${tenant}/v2.0` }],
  nativeContainerAppProvisioner: createDockerContainerAppProvisioner({ images: new Map([['scanner-image', process.env.SCANNER_IMAGE_ID]]), directory: resolve(out, 'workers') }),
});
async function listen(server) { servers.push(server); await new Promise(done => server.listen(0, '127.0.0.1', done)); return server.address().port; }
let armPort;
async function arm(method, id, body) {
  const response = await fetch(`http://127.0.0.1:${armPort}${id}?api-version=2025-01-01`, { method,
    headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text(), parsed = text ? JSON.parse(text) : null;
  report.arm.push({ method, id, status: response.status, at: new Date().toISOString() });
  assert.ok([200, 201, 202, 204].includes(response.status), `ARM ${method} returned ${response.status}`); return parsed;
}
async function deploy(name, parameters) {
  const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${resolve('experiments/production-scenarios/document-infra')}:/fixture:ro`,
    '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned', 'build', `/fixture/${name}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 });
  await writeFile(resolve(out, `${name}.json`), text);
  return arm('PUT', `${group}/providers/Microsoft.Resources/deployments/${name}`, { properties: { mode: 'Incremental', template: JSON.parse(text),
    parameters: Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, { value }])) } });
}
try {
  armPort = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource }));
  await arm('PUT', group, { location: 'westus2' });
  const worker = await arm('PUT', identityId, { location: 'westus2' });
  await arm('PUT', `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${service}-scanner`, { location: 'westus2' });
  const plan = `${group}/providers/Microsoft.Web/serverfarms/worker`;
  await arm('PUT', plan, { location: 'westus2', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} });
  await arm('PUT', workerId, { location: 'westus2', kind: 'functionapp', identity: { type: 'UserAssigned', userAssignedIdentities: { [identityId]: {} } }, properties: { serverFarmId: plan } });
  const environmentId = `${group}/providers/Microsoft.App/managedEnvironments/scanner`;
  await arm('PUT', environmentId, { location: 'westus2', properties: {} });
  const deployment = await deploy('scanner-app', { serviceName: service, location: 'westus2', runId: randomUUID(), environmentId,
    imageReference: 'scanner-image', registryHost: 'operator-approved.azurecr.io', publicIngress: true });
  assert.equal(deployment.properties.provisioningState, 'Succeeded');
  await runtime.containerAppRouter.lifecycle.settle();
  assert.equal(runtime.containerAppRouter.lifecycle.status(scannerId), 'running');
  const hostname = deployment.properties.outputs.hostname.value;
  const auth = await deploy('scanner-auth', { scannerName: `${service}-scanner`, tenantId: tenant, scannerAudience: audience, workerIdentityName: `${service}-worker` });
  assert.equal(auth.properties.provisioningState, 'Succeeded');
  const privateDir = resolve(out, 'private'); await mkdir(privateDir, { mode: 0o700 });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', `subjectAltName=IP:127.0.0.1,DNS:${hostname}`, '-keyout', resolve(privateDir, 'key'), '-out', resolve(privateDir, 'cert')], { stdio: 'ignore' });
  const ca = await readFile(resolve(privateDir, 'cert'));
  const port = await listen(tlsServer({ key: await readFile(resolve(privateDir, 'key')), cert: ca }, runtime.containerAppRouter.handler()));
  async function token(site, client, resource = `api://${audience}`) {
    const binding = broker.bind(site), endpoint = await listen(createServer(binding.handler));
    const response = await fetch(`http://127.0.0.1:${endpoint}/MSI/token?api-version=2019-08-01&resource=${encodeURIComponent(resource)}&client_id=${client}`, { headers: { 'x-identity-header': binding.identityHeader } });
    assert.equal(response.status, 200); return (await response.json()).access_token;
  }
  const workerToken = await token(workerId, worker.properties.clientId);
  const scannerIdentity = store.resources.get(`${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${service}-scanner`.toLowerCase());
  const unlistedToken = await token(scannerId, scannerIdentity.properties.clientId);
  async function scan(label, content, bearer, expectedStatus, expectedDecision) {
    const correlationId = randomUUID(), started = Date.now();
    const result = await new Promise((done, fail) => {
      const req = request(`https://127.0.0.1:${port}/scan`, { ca, method: 'POST', signal: AbortSignal.timeout(30000), headers: {
        host: hostname, 'content-type': 'text/plain', 'content-length': Buffer.byteLength(content), 'x-correlation-id': correlationId,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
      } }, res => { const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', fail);
        res.on('end', () => done({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) })); });
      req.on('error', fail); req.end(content);
    });
    report.checks.push({ label, correlationId, at: new Date().toISOString(), elapsedMs: Date.now() - started, ...result });
    assert.equal(result.status, expectedStatus);
    if (expectedDecision) {
      assert.equal(result.body.status, expectedDecision);
      assert.equal(result.body.sha256, createHash('sha256').update(content).digest('hex'));
      assert.equal(result.body.engines.length, 2);
    }
  }
  await scan('missing-token', 'clean text', null, 401);
  await scan('wrong-audience', 'clean text', await token(workerId, worker.properties.clientId, 'https://storage.azure.com'), 401);
  const forgedParts = workerToken.split('.');
  forgedParts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(forgedParts[1], 'base64url')), oid: randomUUID() })).toString('base64url');
  await scan('tampered-token', 'clean text', forgedParts.join('.'), 401);
  await scan('valid-unlisted-identity', 'clean text', unlistedToken, 403);
  await scan('clean-file', 'Document scanner authenticated native execution.', workerToken, 200, 'clean');
  await scan('yara-harmless-marker', 'PILOT_DOCUMENT_DETECTION_73261', workerToken, 200, 'detected');
  await scan('clamav-harmless-marker', 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*', workerToken, 200, 'detected');
  await arm('DELETE', `${scannerId}/authConfigs/current`);
  await scan('auth-configuration-removed', 'clean text', workerToken, 501);
  await arm('DELETE', scannerId); await runtime.containerAppRouter.lifecycle.settle();
  await scan('app-deleted', 'clean text', workerToken, 404);
  report.ok = true;
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  try { await runtime.dispose(); report.cleanup = true; }
  catch { report.cleanup = false; report.error ??= 'Native cleanup incomplete'; process.exitCode = 1; }
  broker.dispose();
  for (const server of servers) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  await rm(resolve(out, 'private'), { recursive: true, force: true });
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ out, ok: report.ok, error: report.error, checks: report.checks.length, cleanup: report.cleanup }));
