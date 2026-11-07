import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { mkdir, statfs, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createStorageDataPlaneRouter } from '../../packages/azure-data-plane/src/storage-router.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';

const exec = promisify(execFile);
const id = randomBytes(5).toString('hex'), name = `gs-functions-probe-${id}`;
const out = resolve(process.env.FUNCTIONS_PROBE_DIR ?? `reports/production-scenarios/functions-storage-${id}`);
await mkdir(out, { recursive: true, mode: 0o700 });
const space = await statfs(out);
assert.ok(space.bavail * space.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const account = `gsprobe${id}`, key = randomBytes(64).toString('base64');
const router = createStorageDataPlaneRouter();
router.registerStorageAccount({ accountName: account, accountKey: key });
const report = { scope: 'Local official Functions host against GlobalStack Storage routers. No Azure comparison or full application success.',
  sourceRevision: (await exec('git', ['rev-parse', 'HEAD'])).stdout.trim(),
  sourceDirty: Boolean((await exec('git', ['status', '--porcelain'])).stdout.trim()),
  startedAt: new Date().toISOString(), configurationMode: 'host-storage-only', requests: [], workerHealthReady: false, durableWorkerStarted: false, hostLeaseAcquired: false, businessWorkflowCompleted: false, cleanup: false };
const servers = [];
let connection, systemKey, nativeRuntime, masterKeyFileOwned = false;
const masterKeyFile = resolve(out, 'native-master-key.private');
const privateHostKeys = [];
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: options.method ?? 'GET', headers: options.headers, signal: options.signal }, response => {
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('error', reject);
      response.on('end', () => resolve(new Response([204, 304].includes(response.statusCode) ? null : Buffer.concat(chunks),
        { status: response.statusCode, headers: response.headers })));
    });
    req.on('error', reject); req.end(options.body);
  });
}
try {
  report.imageId = (await exec('docker', ['image', 'inspect', 'globalstack/document-functions:pilot', '--format', '{{.Id}}'])).stdout.trim();
  await exec('docker', ['network', 'create', '--internal', '--label', 'globalstack.experiment=functions-storage', name]);
  const network = JSON.parse((await exec('docker', ['network', 'inspect', name])).stdout)[0];
  const gateway = network.IPAM.Config[0].Gateway;
  const endpoints = {};
  for (const [surface, handler] of [['blob', router.blobHandler()], ['queue', router.queueHandler()], ['table', router.tableHandler()]]) {
    const server = createServer((req, res) => {
      const started = Date.now();
      const requestChunks = []; let capturedBytes = 0;
      req.on('data', chunk => { capturedBytes += chunk.length; if (capturedBytes <= 256 * 1024) requestChunks.push(chunk); });
      res.once('finish', () => {
        const url = new URL(req.url, 'http://localhost');
        report.requests.push({ surface, method: req.method, path: url.pathname, comp: url.searchParams.get('comp'),
          restype: url.searchParams.get('restype'), queryNames: [...url.searchParams.keys()], query: Object.fromEntries([...url.searchParams].filter(([name]) => ['$filter', '$select', '$top', '$format', 'timeout', 'NextPartitionKey', 'NextRowKey'].includes(name))), requestHeaders: Object.fromEntries(Object.entries(req.headers).filter(([name]) => ['x-ms-lease-action', 'x-ms-lease-id', 'x-ms-proposed-lease-id', 'x-ms-lease-duration', 'if-match', 'if-none-match'].includes(name))), requestBody: process.env.FUNCTIONS_PROBE_ORCHESTRATION === '1' && capturedBytes <= 256 * 1024 ? Buffer.concat(requestChunks).toString('utf8') : undefined, status: res.statusCode, durationMs: Date.now() - started });
      });
      Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
    });
    await new Promise(resolve => server.listen(0, gateway, resolve));
    servers.push(server);
    endpoints[surface] = `http://${account}.${surface}.core.windows.net:${server.address().port}`;
  }
  connection = `DefaultEndpointsProtocol=http;AccountName=${account};AccountKey=${key};BlobEndpoint=${endpoints.blob};QueueEndpoint=${endpoints.queue};TableEndpoint=${endpoints.table}`;
  await exec('docker', ['run', '-d', '--name', name, '--network', name, '--label', 'globalstack.experiment=functions-storage',
    '--memory', '1g', '--cpus', '2', '--pids-limit', '256', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    ...['blob', 'queue', 'table'].flatMap(surface => ['--add-host', `${account}.${surface}.core.windows.net:${gateway}`]),
    '-e', 'AzureWebJobsStorage', '-e', 'AzureWebJobsSecretStorageType=files', '-e', 'WEBSITE_HOSTNAME=localhost',
    report.imageId], { env: { ...process.env, AzureWebJobsStorage: connection } });
  const container = JSON.parse((await exec('docker', ['inspect', name])).stdout)[0];
  const address = container.NetworkSettings.Networks[name].IPAddress;
  let workerEndpoint = `http://${address}`, workerHost;
  let armEndpoint, siteId;
  const arm = async (method, resourceId, body) => {
    const response = await request(`${armEndpoint}${resourceId}?api-version=2023-12-01`, { method,
      headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    report.nativeRouting.arm.push({ method, resourceId, status: response.status });
    assert.ok([200, 201, 202, 204].includes(response.status), `Local ARM setup failed: ${response.status} ${text}`);
  };
  if (process.env.FUNCTIONS_PROBE_NATIVE_ROUTING === '1') {
    const subscription = '00000000-0000-0000-0000-000000000000';
    const group = `/subscriptions/${subscription}/resourceGroups/${name}`;
    siteId = `${group}/providers/Microsoft.Web/sites/${name}`;
    const planId = `${group}/providers/Microsoft.Web/serverfarms/${name}`;
    const store = new ResourceStore();
    nativeRuntime = createEmulatorRuntime({ store, nativeFunctionsWorkers: [{ appResourceId: siteId, origin: workerEndpoint, masterKeyFile }] });
    const armServer = createArmServer({ store, onResourcePut: nativeRuntime.syncResource, onResourceDelete: nativeRuntime.unsyncResource,
      functionsRouter: nativeRuntime.functionsRouter });
    const proxy = createServer(nativeRuntime.functionsRouter.handler());
    for (const server of [armServer, proxy]) { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); servers.push(server); }
    armEndpoint = `http://127.0.0.1:${armServer.address().port}`;
    workerEndpoint = `http://127.0.0.1:${proxy.address().port}`;
    workerHost = `${name}.azurewebsites.net`;
    report.nativeRouting = { scope: 'Operator-bound native host; ARM manages routing only, not container provisioning or package deployment.', arm: [], requests: [] };
    await arm('PUT', group, { location: 'westus2' });
    await arm('PUT', planId, { location: 'westus2', kind: 'functionapp', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} });
    await arm('PUT', siteId, { location: 'westus2', kind: 'functionapp,linux', properties: { serverFarmId: planId } });
  }
  const workerRequest = async (path, options = {}) => {
    const response = await request(`${workerEndpoint}${path}`, { ...options,
      headers: { ...options.headers, ...(workerHost ? { host: workerHost } : {}) } });
    if (report.nativeRouting) report.nativeRouting.requests.push({ method: options.method ?? 'GET', path, status: response.status, at: new Date().toISOString() });
    return response;
  };
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await workerRequest('/api/health', { signal: AbortSignal.timeout(2000) });
      if (response.status === 200 && (await response.json()).worker === 'ready') { report.workerHealthReady = true; break; }
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  // Observe background Durable storage setup even if the HTTP worker is ready.
  await new Promise(resolve => setTimeout(resolve, 15000));
  if (process.env.FUNCTIONS_PROBE_ORCHESTRATION === '1' && report.workerHealthReady) {
    report.configurationMode = 'expected-application-failure';
    // This diagnostic deliberately lacks service settings. It must persist a
    // real Failed orchestration, not report a completed document workflow.
    const secrets = JSON.parse((await exec('docker', ['exec', name, 'node', '-e',
      "const fs=require('fs');for(const p of ['/azure-functions-host/Secrets/host.json','/home/data/Functions/secrets/host.json']){if(fs.existsSync(p)){process.stdout.write(fs.readFileSync(p));process.exit(0)}}process.exit(1)"])).stdout.replace(/^\uFEFF/, ''));
    privateHostKeys.push(...[secrets.masterKey, ...(secrets.functionKeys ?? []), ...(secrets.systemKeys ?? [])].map(item => item?.value).filter(Boolean));
    const entry = secrets.systemKeys?.find(item => item.name === 'durabletask_extension');
    assert.ok(entry?.value && !entry.encrypted, 'A plaintext local Durable system key is required');
    systemKey = entry.value;
    if (report.nativeRouting) {
      assert.ok(secrets.masterKey?.value && !secrets.masterKey.encrypted, 'Native host management needs its plaintext local master key');
      await writeFile(masterKeyFile, secrets.masterKey.value, { mode: 0o600, flag: 'wx' });
      masterKeyFileOwned = true;
      const keysResponse = await request(`${armEndpoint}${siteId}/host/default/listKeys?api-version=2023-12-01`, {
        method: 'POST', headers: { authorization: 'Bearer globalstack-local-token' }, signal: AbortSignal.timeout(35000),
      });
      assert.equal(keysResponse.status, 200, 'ARM must read the actual native host keys');
      const keys = await keysResponse.json();
      assert.equal(keys.masterKey, secrets.masterKey.value);
      assert.equal(keys.systemKeys.durabletask_extension, entry.value);
      report.nativeRouting.hostKeys = { status: keysResponse.status, masterMatches: true,
        systemKeyNames: Object.keys(keys.systemKeys), functionKeyNames: Object.keys(keys.functionKeys), durableKeyMatches: true };
      systemKey = keys.systemKeys.durabletask_extension;
    }
    const instance = `probe-${id}`;
    const headers = { 'x-functions-key': systemKey, 'content-type': 'application/json' };
    if (report.nativeRouting) {
      const unauthorized = await workerRequest(`/runtime/webhooks/durabletask/instances/${instance}`, { signal: AbortSignal.timeout(10000) });
      report.nativeRouting.unauthorizedStatus = unauthorized.status; await unauthorized.arrayBuffer();
      assert.equal(unauthorized.status, 401, 'Native host key checks must remain enforced');
    }
    const response = await workerRequest(`/runtime/webhooks/durabletask/orchestrators/documentWorkflow/${instance}`, {
      method: 'POST', headers, body: JSON.stringify({ correlationId: instance, tenant: 'diagnostic' }), signal: AbortSignal.timeout(20000),
    });
    report.orchestrationStart = { status: response.status };
    await response.arrayBuffer();
    const finish = Date.now() + 45000;
    report.orchestrationPolls = [];
    while (Date.now() < finish && response.status === 202) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const state = await workerRequest(`/runtime/webhooks/durabletask/instances/${instance}?showHistory=true`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      const body = await state.json();
      report.orchestrationPolls.push({ status: state.status, runtimeStatus: body.runtimeStatus, history: body.history });
      if (['Failed', 'Completed', 'Terminated'].includes(body.runtimeStatus)) break;
    }
    report.expectedFailurePersisted = report.orchestrationPolls.at(-1)?.runtimeStatus === 'Failed';
  }
  if (report.nativeRouting) {
    await exec('docker', ['stop', '--time', '10', name]);
    const unavailable = await workerRequest('/api/health', { signal: AbortSignal.timeout(10000) });
    report.nativeRouting.stoppedWorkerStatus = unavailable.status; await unavailable.arrayBuffer();
    assert.equal(unavailable.status, 502, 'Stopped workers must not fall back to simulated success');
    await arm('DELETE', siteId);
    const removed = await workerRequest('/api/health', { signal: AbortSignal.timeout(10000) });
    report.nativeRouting.deletedSiteStatus = removed.status; await removed.arrayBuffer();
    assert.equal(removed.status, 404, 'Deleted ARM sites must no longer route to the worker');
  }

} catch (error) {
  report.error = String(error.message).split(connection ?? '\0').join('<local-storage-connection>').split(key).join('<local-storage-key>').split(systemKey ?? '\0').join('<local-system-key>');
  for (const value of privateHostKeys) report.error = report.error.split(value).join('<native-host-key>');
} finally {
  try {
    const logs = await exec('docker', ['logs', name], { maxBuffer: 8 * 1024 ** 2 });
    let safe = `${logs.stdout}\n${logs.stderr}`.split(connection ?? '\0').join('<local-storage-connection>').split(key).join('<local-storage-key>').split(systemKey ?? '\0').join('<local-system-key>');
    for (const value of privateHostKeys) safe = safe.split(value).join('<native-host-key>');
    report.durableWorkerStarted = safe.includes('Task hub worker started.');
    report.hostLeaseAcquired = safe.includes('Host lock lease acquired');
    report.missingApplicationSettings = [...new Set([...safe.matchAll(/Missing application setting ([A-Z_]+)/g)].map(match => match[1]))];
    report.timerInvocations = [...safe.matchAll(/Executed 'Functions\.(retryIndexChanges|settleDocumentFailures)' \((Succeeded|Failed)/g)].map(match => ({ function: match[1], outcome: match[2] }));
    await writeFile(resolve(out, 'host.log'), safe, { mode: 0o600 });
  } catch {}
  const removed = await exec('docker', ['rm', '-f', name]).then(() => true, () => false);
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await nativeRuntime?.dispose();
  if (masterKeyFileOwned) { await rm(masterKeyFile); report.nativeRouting.managementCredentialRemoved = true; }
  const networkRemoved = await exec('docker', ['network', 'rm', name]).then(() => true, () => false);
  report.cleanup = removed && networkRemoved;
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
const failures = [...new Set(report.requests.filter(item => item.status >= 400).map(item => `${item.surface} ${item.method} ${item.path} ${item.restype ?? ''} ${item.comp ?? ''} ${item.status}`))];
console.log(JSON.stringify({ out, workerHealthReady: report.workerHealthReady, cleanup: report.cleanup, durableWorkerStarted: report.durableWorkerStarted, hostLeaseAcquired: report.hostLeaseAcquired, nativeRouting: report.nativeRouting, missingApplicationSettings: report.missingApplicationSettings, orchestrationStart: report.orchestrationStart, expectedFailurePersisted: report.expectedFailurePersisted, error: report.error, nonSuccessResponses: failures }, null, 2));

if (report.error || !report.cleanup || !report.workerHealthReady || !report.durableWorkerStarted || process.env.FUNCTIONS_PROBE_ORCHESTRATION === '1' && !report.expectedFailurePersisted) process.exitCode = 1;
