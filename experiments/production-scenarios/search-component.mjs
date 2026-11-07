import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, statfs } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createSearchRouterServer } from '../../packages/azure-data-plane/src/search-router.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { cleanupSearch, searchArmClient, searchScope } from './search-cleanup.mjs';
import { httpExchange } from './http-exchange.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', 'Commit all source before capture');
const disk = await statfs(out);
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
const region = process.env.PAIRED_SEARCH_REGION ?? 'westus2';
assert.ok(['eastus2', 'westus2'].includes(region), 'Choose a region with a verified Basic Search price');
const account = azureCli(config, ['account', 'show']);
assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(account.state, 'Enabled');
const runId = randomBytes(6).toString('hex');
const manifest = { subscription: account.id, runId, group: `gs-prod-${runId}`, service: `gs${runId}`, deployment: `gs-search-${runId}`, config,
  parentPid: process.pid, deadline: Date.now() + 30 * 60000 };
const scope = searchScope(manifest);
const token = azureToken(config);
const replacements = [[token, '<redacted>'], [account.id, '<subscription>'], [account.tenantId, '<tenant>'], [manifest.group, '<group>'], [manifest.service, '<search-service>'], [manifest.deployment, '<deployment>']];
const emit = createRecording(out, { platform: 'Search component lifecycle', revision, sourceDirty: false });
const report = { schemaVersion: 1, revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Search-only lifecycle and data-plane probes. Neither full application is deployed.',
  transport: 'Native Bicep compilation followed by ARM template deployment and Search HTTP requests.',
  portalEvidenceComplete: false, fullProtocolParityEvaluated: false, exchanges: [], cleanup: null,
  region,
  budget: { totalAuthorizedUsd: 150, thisRunEnvelopeUsd: 2, rateUsdPerHour: 0.101, runtimeMinutes: 30, cleanupReserveMinutes: 10,
    source: `Azure Retail Prices API, ${region} Basic Search consumption meter, verified 2026-11-07. Cost reporting can lag.` } };
let phase = 'preflight', arm, search, runtime, watchdog, manifestPath;
const donePath = resolve(out, 'cleanup.done');
function observe(target, event) {
  const safe = sanitize({ target, phase, ...event }, replacements);
  report.exchanges.push(safe);
  emit('http', { target, phase, method: event.method, path: safe.path, status: event.status });
  emit('output', { target, phase, text: JSON.stringify(safe, null, 2) + '\n' });
}
const request = searchArmClient({ ...manifest, token }, event => observe('azure', event));
async function pause(ms = 3000) { await new Promise(resolve => setTimeout(resolve, ms)); }
async function json(target, origin, method, path, body, headers) {
  const startedAt = new Date().toISOString();
  const response = await httpExchange(origin + path, { method, body, headers });
  const event = { method, path, request: body, ...response, startedAt, completedAt: new Date().toISOString() };
  observe(target, event);
  return response;
}
try {
  // Refuse to overlap any owned paid-resource experiment or silently exceed the
  // run envelope. The empty historical resource-group runs created no services.
  const resources = azureCli(config, ['resource', 'list', '--subscription', manifest.subscription]);
  assert.equal(resources.length, 0, 'Inventory is not empty; reconcile existing costs and ownership before provisioning');
  assert.equal((await request('GET', `${scope.group}?api-version=2025-04-01`)).status, 404);
  const ipResponse = await fetch('https://api.ipify.org', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  assert.equal(ipResponse.status, 200);
  const ip = (await ipResponse.text()).trim();
  assert.equal(isIP(ip), 4, 'An IPv4 runner address is required for the service IP rule');
  replacements.push([ip, '<runner-ip>']);
  const image = execFileSync('docker', ['image', 'inspect', 'globalstack/validation-runner:cli-pinned', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
  report.image = image;
  phase = 'compile';
  emit('command-start', { target: 'azure', phase, command: ['bicep', 'build', 'search-component.bicep', '--stdout'] });
  const compiled = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${here}/fixtures:/fixture:ro`, '--entrypoint', '/root/.azure/bin/bicep', image,
    'build', '/fixture/search-component.bicep', '--stdout'], { encoding: 'utf8', timeout: 60000 });
  report.templateSha256 = createHash('sha256').update(compiled).digest('hex');
  await writeFile(resolve(out, 'compiled-template.json'), compiled, { mode: 0o600 });
  emit('command-end', { target: 'azure', phase, exitCode: 0 });
  const body = { location: region, properties: { mode: 'Incremental', template: JSON.parse(compiled), parameters: Object.fromEntries(Object.entries({
    groupName: manifest.group, serviceName: manifest.service, location: region, runId, runnerIp: `${ip}/32`,
  }).map(([key, value]) => [key, { value }])) } };
  manifestPath = resolve(out, 'private-cleanup.json');
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve(here, 'search-cleanup.mjs'), manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((resolve, reject) => { watchdog.once('spawn', resolve); watchdog.once('error', reject); });
  watchdog.unref();
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = manifest.subscription;
  const store = new ResourceStore();
  runtime = createEmulatorRuntime({ store });
  arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  search = createSearchRouterServer(runtime.searchRouter);
  for (const server of [arm, search]) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  phase = 'azure-deploy';
  let deploymentError;
  try {
    const deployed = await request('PUT', `${scope.deployment}?api-version=2025-04-01`, body);
    assert.ok([200, 201, 202].includes(deployed.status), 'Azure rejected the compiled template');
    while (true) {
      assert.ok(Date.now() < manifest.deadline - 5 * 60000, 'Deployment exceeded its allocated runtime');
      const current = await request('GET', `${scope.deployment}?api-version=2025-04-01`);
      assert.equal(current.status, 200);
      const state = current.body.properties?.provisioningState;
      assert.ok(!['Failed', 'Canceled'].includes(state), 'Azure deployment failed; preserve its response and clean up');
      if (state === 'Succeeded') break;
      await pause();
    }
  } catch (error) {
    deploymentError = error;
    phase = 'azure-deployment-diagnostic';
    for (const path of [
      `${scope.deployment}/operations`,
      `${scope.group}/providers/Microsoft.Resources/deployments/search-component`,
      `${scope.group}/providers/Microsoft.Resources/deployments/search-component/operations`,
    ]) {
      // Read nested provider errors before cleanup removes the deployment. A
      // failed diagnostic must never prevent replay or resource removal.
      await request('GET', `${path}?api-version=2025-04-01`).catch(() => {});
    }
  }
  // Replay failed Azure attempts too. A successful local create after an Azure
  // rejection is evidence of a gap, not a reason to discard the attempted pair.
  phase = 'local-deploy';
  const localDeployment = await json('local', `http://127.0.0.1:${arm.address().port}`, 'PUT', `${scope.deployment}?api-version=2025-04-01`, body, { authorization: 'Bearer globalstack-local-token' });
  if (deploymentError) throw deploymentError;
  assert.ok([200, 201, 202].includes(localDeployment.status), 'Local deployment rejected the Azure-accepted template');
  phase = 'azure-resource-read';
  assert.equal((await request('GET', `${scope.service}?api-version=2025-05-01`)).status, 200);
  const keys = await request('POST', `${scope.service}/listAdminKeys?api-version=2025-05-01`);
  assert.equal(keys.status, 200);
  const key = keys.body.primaryKey;
  assert.equal(typeof key, 'string');
  replacements.push([key, '<redacted>'], [keys.body.secondaryKey, '<redacted>']);
  const data = (target, method, path, payload) => json(target,
    target === 'azure' ? `https://${manifest.service}.search.windows.net` : `http://127.0.0.1:${search.address().port}`,
    method, `${path}?api-version=2024-07-01`, payload,
    { 'api-key': target === 'azure' ? key : 'local-test-key', ...(target === 'local' ? { host: `${manifest.service}.search.windows.net` } : {}) });
  phase = 'data-plane-ready';
  const readyDeadline = Date.now() + 120000;
  while (true) {
    const ready = await data('azure', 'GET', '/indexes');
    if (ready.status === 200) break;
    assert.ok([403, 503].includes(ready.status) && Date.now() < readyDeadline, 'Azure Search did not become reachable within its readiness window');
    await pause();
  }
  assert.equal((await data('local', 'GET', '/indexes')).status, 200);
  const indexPath = "/indexes('documents')";
  const definition = { name: 'documents', fields: [
    { name: 'id', type: 'Edm.String', key: true, searchable: false },
    { name: 'text', type: 'Edm.String', searchable: true },
    { name: 'tenant', type: 'Edm.String', filterable: true },
    { name: 'embedding', type: 'Collection(Edm.Single)', searchable: true, dimensions: 3, vectorSearchProfile: 'profile' },
  ], vectorSearch: { profiles: [{ name: 'profile', algorithm: 'hnsw' }], algorithms: [{ name: 'hnsw', kind: 'hnsw' }] } };
  const steps = [
    ['invalid-index-keys', 'PUT', indexPath, { ...definition, fields: definition.fields.map(field => field.name === 'text' ? { ...field, key: true } : field) }],
    ['corrected-index', 'PUT', indexPath, definition],
    ['index-documents', 'POST', `${indexPath}/docs/search.index`, { value: [
      { '@search.action': 'upload', id: 'a', text: 'financial report', tenant: 'alpha', embedding: [1, 0, 0] },
      { '@search.action': 'upload', id: 'b', text: 'unrelated document', tenant: 'beta', embedding: [0, 1, 0] },
    ] }],
    ['search-fuzzy', 'POST', `${indexPath}/docs/search`, { search: 'financal~1', queryType: 'full' }],
    ['search-invalid-vector', 'POST', `${indexPath}/docs/search`, { vectorQueries: [{ kind: 'vector', vector: [1, 0, 0], fields: 'missing-vector-field', k: 1 }] }],
    ['search-valid-vector', 'POST', `${indexPath}/docs/search`, { vectorQueries: [{ kind: 'vector', vector: [1, 0, 0], fields: 'embedding', k: 1 }] }],
    ['delete-index', 'DELETE', indexPath], ['deleted-index-read', 'GET', indexPath],
  ];
  for (const [name, method, path, payload] of steps) {
    assert.ok(Date.now() < manifest.deadline - 2 * 60000, 'Data-plane runtime budget exhausted');
    phase = name;
    for (const target of ['azure', 'local']) {
      const result = await data(target, method, path, payload);
      if (['corrected-index', 'index-documents'].includes(name)) assert.ok(result.status < 400, 'A required data-plane setup step failed');
    }
    if (name === 'index-documents') {
      phase = 'index-visibility';
      const deadline = Date.now() + 60000;
      while (true) {
        const result = await data('azure', 'POST', `${indexPath}/docs/search`, { search: 'financial' });
        if (result.body?.value?.some(item => item.id === 'a')) break;
        assert.ok(Date.now() < deadline, 'Azure indexing did not become visible');
        await pause(2000);
      }
    }
  }
  report.probesComplete = true;
} catch (error) {
  report.error = sanitize(error.message, replacements);
  emit('output', { target: 'azure', phase, text: `Stopped this attempt: ${report.error}\n` });
} finally {
  phase = 'cleanup';
  if (manifestPath) {
    try {
      const cleanupToken = azureToken(config);
      replacements.push([cleanupToken, '<redacted>']);
      report.cleanup = await cleanupSearch(manifest, searchArmClient({ ...manifest, token: cleanupToken }, event => observe('azure', event)));
      await writeFile(donePath, 'verified\n', { mode: 0o600 });
      watchdog?.kill('SIGTERM');
      await rm(manifestPath);
    } catch { report.cleanup = { cleanupComplete: false, recoveryRequired: true }; }
  }
  if (arm) {
    await json('local', `http://127.0.0.1:${arm.address().port}`, 'DELETE', `${scope.group}?api-version=2025-04-01`, undefined, { authorization: 'Bearer globalstack-local-token' }).catch(() => {});
  }
  for (const server of [search, arm].filter(Boolean)) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await runtime?.dispose();
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  emit('run-end', { ok: false, summary: report.probesComplete && report.cleanup?.serviceAbsent ? 'Component capture complete and Azure cleanup verified. Inspect recorded differences; full application tests remain pending.' : 'Component attempt incomplete. Inspect the error and cleanup report.' });
}
console.log(`Search component evidence: ${out}`);
process.exitCode = !report.probesComplete || !report.cleanup?.serviceAbsent ? 1 : 0;
