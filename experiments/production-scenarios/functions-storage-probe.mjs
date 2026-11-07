import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createStorageDataPlaneRouter } from '../../packages/azure-data-plane/src/storage-router.mjs';

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
let connection, systemKey;
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
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${address}/api/health`, { signal: AbortSignal.timeout(2000) });
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
    const entry = secrets.systemKeys?.find(item => item.name === 'durabletask_extension');
    assert.ok(entry?.value && !entry.encrypted, 'A plaintext local Durable system key is required');
    systemKey = entry.value;
    const instance = `probe-${id}`;
    const headers = { 'x-functions-key': systemKey, 'content-type': 'application/json' };
    const response = await fetch(`http://${address}/runtime/webhooks/durabletask/orchestrators/documentWorkflow/${instance}`, {
      method: 'POST', headers, body: JSON.stringify({ correlationId: instance, tenant: 'diagnostic' }), signal: AbortSignal.timeout(20000),
    });
    report.orchestrationStart = { status: response.status };
    await response.arrayBuffer();
    const finish = Date.now() + 45000;
    report.orchestrationPolls = [];
    while (Date.now() < finish && response.status === 202) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const state = await fetch(`http://${address}/runtime/webhooks/durabletask/instances/${instance}?showHistory=true`, {
        headers, signal: AbortSignal.timeout(10000),
      });
      const body = await state.json();
      report.orchestrationPolls.push({ status: state.status, runtimeStatus: body.runtimeStatus, history: body.history });
      if (['Failed', 'Completed', 'Terminated'].includes(body.runtimeStatus)) break;
    }
    report.expectedFailurePersisted = report.orchestrationPolls.at(-1)?.runtimeStatus === 'Failed';
  }

} catch (error) {
  report.error = String(error.message).split(connection ?? '\0').join('<local-storage-connection>').split(key).join('<local-storage-key>').split(systemKey ?? '\0').join('<local-system-key>');
} finally {
  try {
    const logs = await exec('docker', ['logs', name], { maxBuffer: 8 * 1024 ** 2 });
    const safe = `${logs.stdout}\n${logs.stderr}`.split(connection ?? '\0').join('<local-storage-connection>').split(key).join('<local-storage-key>').split(systemKey ?? '\0').join('<local-system-key>');
    report.durableWorkerStarted = safe.includes('Task hub worker started.');
    report.hostLeaseAcquired = safe.includes('Host lock lease acquired');
    report.missingApplicationSettings = [...new Set([...safe.matchAll(/Missing application setting ([A-Z_]+)/g)].map(match => match[1]))];
    report.timerInvocations = [...safe.matchAll(/Executed 'Functions\.(retryIndexChanges|settleDocumentFailures)' \((Succeeded|Failed)/g)].map(match => ({ function: match[1], outcome: match[2] }));
    await writeFile(resolve(out, 'host.log'), safe, { mode: 0o600 });
  } catch {}
  const removed = await exec('docker', ['rm', '-f', name]).then(() => true, () => false);
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  const networkRemoved = await exec('docker', ['network', 'rm', name]).then(() => true, () => false);
  report.cleanup = removed && networkRemoved;
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
const failures = [...new Set(report.requests.filter(item => item.status >= 400).map(item => `${item.surface} ${item.method} ${item.path} ${item.restype ?? ''} ${item.comp ?? ''} ${item.status}`))];
console.log(JSON.stringify({ out, workerHealthReady: report.workerHealthReady, cleanup: report.cleanup, durableWorkerStarted: report.durableWorkerStarted, hostLeaseAcquired: report.hostLeaseAcquired, missingApplicationSettings: report.missingApplicationSettings, orchestrationStart: report.orchestrationStart, expectedFailurePersisted: report.expectedFailurePersisted, error: report.error, nonSuccessResponses: failures }, null, 2));

if (report.error || !report.cleanup || !report.workerHealthReady || !report.durableWorkerStarted || process.env.FUNCTIONS_PROBE_ORCHESTRATION === '1' && !report.expectedFailurePersisted) process.exitCode = 1;
