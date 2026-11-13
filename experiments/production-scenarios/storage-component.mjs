import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, statfs, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isIP } from 'node:net';
import { createServer } from 'node:http';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { storageScope, storageArmClient, cleanupStorage } from './storage-cleanup.mjs';
import { storageCases, storageExchange } from './storage-http.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { productionBudgetPath as budgetPath, reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';
import { configureBlobVersioning, storageVersionCases } from './storage-version-cases.mjs';
import { httpExchange } from './http-exchange.mjs';
import { runBlobEventComponent } from './blob-event-component.mjs';
import { redactQueueEvents } from './redact-queue-events.mjs';
import { storageRangeCases } from './storage-range-cases.mjs';

const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Commit source before live capture');
const disk = await statfs(out);
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB reserve required');
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
const session = azureCli(config, ['account', 'show']);
assert.equal(session.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(session.state, 'Enabled');
assert.equal(azureCli(config, ['resource', 'list', '--subscription', session.id]).length, 0, 'Reconcile existing inventory before provisioning');
const runId = randomBytes(6).toString('hex');
const manifest = { subscription: session.id, runId, group: `gs-storage-${runId}`, account: `gs${runId}`,
  config, parentPid: process.pid, deadline: Date.now() + 20 * 60000,
  ...(process.env.STORAGE_PROBE_EVENTS === '1' ? { eventing: true, roleName: randomUUID(), roleScope: 'account' } : {}) };
const scope = storageScope(manifest);
const token = azureToken(config);
const replacements = [[token, '<redacted>'], [session.id, '<subscription>'], [session.tenantId, '<tenant>'], [manifest.group, '<group>'], [manifest.account, '<storage-account>']];
const emit = createRecording(out, { platform: 'Storage component contracts', revision, sourceDirty: false });
const report = { revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Temporary Storage account API diagnostics. Not a native IaC tool lifecycle or a complete application deployment.',
  portalEvidenceComplete: false, fullProtocolParityEvaluated: false,
  budget: { totalAuthorizedUsd: null, thisRunEnvelopeUsd: 1, runtimeMinutes: 20, cleanupReserveMinutes: 10,
    limits: 'One Standard_LRS StorageV2 account, less than 1 MiB stored, fewer than 200 requests, no added paid features.' }, exchanges: [], cleanup: null };
let phase = 'setup';
const observe = (target, event) => {
  function identify(value) {
    if (!value || typeof value !== 'object') return;
    for (const [name, child] of Object.entries(value)) {
      if (['principalId', 'clientId', 'createdBy', 'updatedBy'].includes(name) && typeof child === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(child) && !replacements.some(([from]) => from === child)) {
        replacements.push([child, `<${target}-${name}-${replacements.length}>`]);
      } else identify(child);
    }
  }
  identify(event);
  const safe = sanitize(redactQueueEvents({ target, phase, at: new Date().toISOString(), ...event }, replacements), replacements);
  report.exchanges.push(safe);
  emit('http', { target, phase, method: event.method, path: safe.path, status: event.status });
  emit('output', { target, phase, text: JSON.stringify(safe, null, 2) + '\n' });
};
const request = storageArmClient({ ...manifest, token }, event => observe('azure', event));
const donePath = resolve(out, 'cleanup.done'), manifestPath = resolve(out, 'private-cleanup.json');
const servers = [], endpoints = {};
let armed = false, runtime;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  assert.equal((await request('GET', `${scope.group}?api-version=2025-04-01`)).status, 404);
  const publicIp = await fetch('https://api.ipify.org', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(publicIp.status, 200);
  const ip = (await publicIp.text()).trim();
  assert.equal(isIP(ip), 4);
  replacements.push([ip, '<runner-ip>']);
  report.budget.ledger = await reserveBudget(budgetPath, { runId, envelopeUsd: report.budget.thisRunEnvelopeUsd, purpose: 'Storage comparison in westus2' });
  report.budget.totalAuthorizedUsd = report.budget.ledger.totalAuthorizedUsd;
  if (manifest.eventing) {
    report.budget.limits = 'One Standard_LRS account, one Event Grid system topic/subscription, one account-scoped queue sender role, less than 1 MiB, fewer than 500 HTTP requests and 100 event operations. No Event Grid namespace or throughput-unit reservation.';
    report.budget.eventGridRate = { usdPerMillionEventOperations: 0.6, region: 'westus2', verified: '2026-11-07', source: 'Azure Retail Prices API, Standard Event Operations' };
  }
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  const watchdog = spawn(process.execPath, [resolve('experiments/production-scenarios/storage-cleanup.mjs'), manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { watchdog.once('spawn', resolve); watchdog.once('error', reject); });
  watchdog.unref(); armed = true;
  const tags = { run: runId, project: 'globalstack-storage-component' };
  assert.ok([200, 201].includes((await request('PUT', `${scope.group}?api-version=2025-04-01`, { location: 'westus2', tags })).status));
  const accountBody = {
    location: 'westus2', tags, kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: {
      allowBlobPublicAccess: false, allowSharedKeyAccess: true, supportsHttpsTrafficOnly: true, minimumTlsVersion: 'TLS1_2',
      publicNetworkAccess: 'Enabled', networkAcls: { bypass: manifest.eventing ? 'AzureServices' : 'None', defaultAction: 'Deny', ipRules: [{ value: ip, action: 'Allow' }] },
    },
  };
  const create = await request('PUT', `${scope.account}?api-version=2023-05-01`, accountBody);
  assert.ok([200, 201, 202].includes(create.status), 'Storage account creation rejected');
  while (true) {
    assert.ok(Date.now() < manifest.deadline - 5 * 60000, 'Storage provisioning runtime exceeded');
    const current = await request('GET', `${scope.account}?api-version=2023-05-01`);
    assert.equal(current.status, 200);
    assert.notEqual(current.body.properties?.provisioningState, 'Failed');
    if (current.body.properties?.provisioningState === 'Succeeded') break;
    await pause(3000);
  }
  const keys = await request('POST', `${scope.account}/listKeys?api-version=2023-05-01`);
  assert.equal(keys.status, 200);
  const key = keys.body.keys[0].value;
  for (const item of keys.body.keys) replacements.push([item.value, '<redacted>']);
  const localKey = randomBytes(64).toString('base64');
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = manifest.subscription;
  const store = new ResourceStore();
  runtime = createEmulatorRuntime({ store });
  const router = runtime.storageRouter;
  const arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  await new Promise(resolve => arm.listen(0, '127.0.0.1', resolve));
  servers.push(arm);
  const localArm = async (method, path, body) => {
    const response = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
    observe('local', { method, path, request: body, ...response });
    return response;
  };
  phase = 'local-storage-setup';
  await localArm('PUT', `${scope.group}?api-version=2025-04-01`, { location: 'westus2', tags });
  assert.ok([200, 201, 202].includes((await localArm('PUT', `${scope.account}?api-version=2023-05-01`, accountBody)).status));
  let localReady = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const current = await localArm('GET', `${scope.account}?api-version=2023-05-01`);
    assert.equal(current.status, 200);
    if (current.body.properties?.provisioningState === 'Succeeded') { localReady = true; break; }
    await pause(250);
  }
  assert.ok(localReady, 'Local Storage account did not finish provisioning');
  router.registerStorageAccount({ accountName: manifest.account, accountKey: localKey });
  for (const surface of ['blob', 'table', 'queue']) {
    const handler = router[`${surface}Handler`]();
    const server = createServer((req, res) => Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    servers.push(server); endpoints[surface] = `http://127.0.0.1:${server.address().port}`;
  }
  phase = 'firewall-readiness';
  const readyDeadline = Date.now() + 180000;
  while (true) {
    const probe = { surface: 'blob', method: 'HEAD', path: '/not-created?restype=container' };
    const response = await storageExchange({ ...probe, account: manifest.account, key, origin: `https://${manifest.account}.blob.core.windows.net` });
    observe('azure', { ...probe, ...response });
    if (response.status === 404) break;
    assert.ok(response.status === 403 && Date.now() < readyDeadline, 'Storage firewall readiness failed');
    await pause(3000);
  }
  for (const template of storageCases) {
    const item = { ...template, body: template.body?.replaceAll('{account}', manifest.account) };
    assert.ok(Date.now() < manifest.deadline - 2 * 60000, 'Storage diagnostic runtime exhausted');
    phase = item.id;
    for (const target of ['azure', 'local']) {
      const startedAt = new Date().toISOString();
      const response = await storageExchange({ ...item, account: manifest.account, key: target === 'azure' ? key : localKey,
        origin: target === 'azure' ? `https://${manifest.account}.${item.surface}.core.windows.net` : endpoints[item.surface] });
      observe(target, { method: item.method, path: item.path, surface: item.surface, request: { headers: item.headers ?? {}, body: item.body ?? '' },
        ...response, startedAt, completedAt: new Date().toISOString() });
    }
  }
  if (process.env.STORAGE_PROBE_VERSIONS === '1') {
    phase = 'enable-blob-versioning';
    await configureBlobVersioning(request, scope.account);
    await configureBlobVersioning(localArm, scope.account);
    report.versionObservations = {};
    for (const target of ['azure', 'local']) {
      try {
        const versions = await storageVersionCases(async item => {
          assert.ok(Date.now() < manifest.deadline - 2 * 60000, 'Version diagnostic runtime exhausted');
          phase = item.id;
          const response = await storageExchange({ ...item, account: manifest.account, key: target === 'azure' ? key : localKey,
            origin: target === 'azure' ? `https://${manifest.account}.blob.core.windows.net` : endpoints.blob });
          observe(target, { method: item.method, path: item.path, surface: 'blob', request: { headers: item.headers, body: item.body }, ...response });
          return response;
        });
        report.versionObservations[target] = { complete: true, ...versions };
      } catch (error) {
        report.versionObservations[target] = { complete: false, error: sanitize(error.message, replacements) };
      }
    }
  }
  if (process.env.STORAGE_PROBE_RANGES === '1') {
    for (const target of ['azure', 'local']) await storageRangeCases(async item => {
      assert.ok(Date.now() < manifest.deadline - 2 * 60000, 'Range diagnostic runtime exhausted');
      phase = item.id;
      const response = await storageExchange({ ...item, account: manifest.account, key: target === 'azure' ? key : localKey,
        origin: target === 'azure' ? `https://${manifest.account}.blob.core.windows.net` : endpoints.blob });
      observe(target, { method: item.method, path: item.path, surface: 'blob', request: { headers: item.headers, body: item.body }, ...response });
      return response;
    });
  }
  if (manifest.eventing) {
    report.eventObservations = sanitize(await runBlobEventComponent({ manifest, scope, out,
      arm: { azure: request, local: localArm }, emit, phase: value => { phase = value; },
      exchange: async (target, item) => {
        const response = await storageExchange({ ...item, account: manifest.account, key: target === 'azure' ? key : localKey,
          origin: target === 'azure' ? `https://${manifest.account}.${item.surface}.core.windows.net` : endpoints[item.surface] });
        observe(target, { method: item.method, path: item.path, surface: item.surface, request: { headers: item.headers ?? {}, body: item.body ?? '' }, ...response });
        return response;
      },
    }), replacements);
    if (!Object.values(report.eventObservations.targets).every(target => target.deliveryObserved)) process.exitCode = 1;
  }
  report.probesComplete = true;
  if (report.versionObservations && !Object.values(report.versionObservations).every(item => item.complete)) process.exitCode = 1;
} catch (error) {
  report.error = sanitize(String(error.message), replacements);
  emit('output', { target: 'runner', phase, text: report.error });
  process.exitCode = 1;
} finally {
  phase = 'cleanup';
  if (armed) {
    try {
      report.cleanup = await cleanupStorage(manifest, request);
      await writeFile(donePath, 'verified\n', { mode: 0o600 });
      await rm(manifestPath);
      await confirmBudgetCleanup(budgetPath, runId);
    } catch (error) { report.cleanupError = sanitize(String(error.message), replacements); process.exitCode = 1; }
  }
  for (const server of servers) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await runtime?.dispose();
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  emit('run-end', { probesComplete: report.probesComplete ?? false, cleanup: report.cleanup });
  console.log(JSON.stringify({ out, probesComplete: report.probesComplete ?? false, cleanup: report.cleanup, error: report.error }));
}
