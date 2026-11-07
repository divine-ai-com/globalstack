import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rm, statfs } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureCli, azureToken } from './azure-session.mjs';
import { cleanupWeb, webArmClient, webScope } from './web-cleanup.mjs';
import { httpExchange } from './http-exchange.mjs';
import { throttledDeploymentOperation } from './deployment-progress.mjs';
import { reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit evidence directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const disk = await statfs(out);
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
const region = process.env.PAIRED_WEB_REGION ?? 'westus2';
assert.ok(['westus2', 'northeurope'].includes(region), 'Choose a region with verified hosting prices');
const budgetPath = resolve(repo, 'reports/production-scenarios/budget-ledger.json');
const account = azureCli(config, ['account', 'show']);
assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
assert.equal(account.state, 'Enabled');
const runId = randomBytes(6).toString('hex');
const manifest = { subscription: account.id, runId, group: `gs-prod-${runId}`, service: `gs${runId}`, deployment: `gs-web-${runId}`,
  config, parentPid: process.pid, deadline: Date.now() + 20 * 60000 };
const scope = webScope(manifest), token = azureToken(config);
const replacements = [[token, '<redacted>'], [account.id, '<subscription>'], [account.tenantId, '<tenant>'],
  [manifest.group, '<group>'], [manifest.service, '<service>'], [manifest.deployment, '<deployment>']];
const emit = createRecording(out, { platform: 'Web hosting plan lifecycle', revision, sourceDirty: false });
const report = { schemaVersion: 1, revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Two Linux hosting plans only. No application, private network or business workflow is deployed.',
  transport: 'One native Bicep compilation, then direct ARM deployment and resource requests.',
  region, portalEvidenceComplete: false, fullProtocolParityEvaluated: false, exchanges: [], cleanup: null,
  budget: { totalAuthorizedUsd: 150, thisRunEnvelopeUsd: 1, runtimeMinutes: 20, cleanupReserveMinutes: 10,
    hourlyRatesUsd: region === 'westus2' ? { P0v3: 0.0775, EP1: 0.16 + 3.5 * 0.0114 } : { P0v3: 0.084, EP1: 0.167 + 3.5 * 0.0119 }, maxInstancesPerPlan: 1,
    source: `Azure Retail Prices API, ${region} Linux P0v3 and Premium Functions CPU/memory, verified 2026-11-07.` } };
let phase = 'preflight', arm, watchdog, manifestPath;
const donePath = resolve(out, 'cleanup.done');
function observe(target, event) {
  const safe = sanitize({ target, phase, ...event }, replacements);
  report.exchanges.push(safe);
  emit('http', { target, phase, method: event.method, path: safe.path, status: event.status });
  emit('output', { target, phase, text: JSON.stringify(safe, null, 2) + '\n' });
}
const request = webArmClient({ ...manifest, token }, event => observe('azure', event));
const pause = () => new Promise(done => setTimeout(done, 3000));
async function local(method, path, body) {
  const startedAt = new Date().toISOString();
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, { method, body,
    headers: { authorization: 'Bearer globalstack-local-token' } });
  observe('local', { method, path, request: body, ...result, startedAt, completedAt: new Date().toISOString() });
  return result;
}
async function pair(method, path, body) {
  assert.ok(Date.now() < manifest.deadline - 60000, 'Probe deadline reached');
  const azure = await request(method, path, body);
  const emulator = await local(method, path, body);
  return { azure, local: emulator };
}
try {
  assert.equal(azureCli(config, ['resource', 'list', '--subscription', manifest.subscription]).length, 0, 'Resolve existing resources before provisioning');
  assert.equal((await request('GET', `${scope.group}?api-version=2025-04-01`)).status, 404);
  const image = execFileSync('docker', ['image', 'inspect', 'globalstack/validation-runner:cli-pinned', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
  report.image = image;
  phase = 'compile';
  emit('command-start', { target: 'azure', phase, command: ['bicep', 'build', 'web-component.bicep', '--stdout'] });
  const compiled = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${here}/fixtures:/fixture:ro`, '--entrypoint', '/root/.azure/bin/bicep', image,
    'build', '/fixture/web-component.bicep', '--stdout'], { encoding: 'utf8', timeout: 60000 });
  report.templateSha256 = createHash('sha256').update(compiled).digest('hex');
  await writeFile(resolve(out, 'compiled-template.json'), compiled, { mode: 0o600 });
  emit('command-end', { target: 'azure', phase, exitCode: 0 });
  const body = { location: report.region, properties: { mode: 'Incremental', template: JSON.parse(compiled), parameters: Object.fromEntries(Object.entries({
    groupName: manifest.group, serviceName: manifest.service, location: report.region, runId,
  }).map(([key, value]) => [key, { value }])) } };
  report.budget.ledger = await reserveBudget(budgetPath, { runId, envelopeUsd: report.budget.thisRunEnvelopeUsd, purpose: `Hosting comparison in ${region}` });
  manifestPath = resolve(out, 'private-cleanup.json');
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve(here, 'web-cleanup.mjs'), manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); }); watchdog.unref();
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = manifest.subscription;
  arm = createArmServer({ store: new ResourceStore() });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  phase = 'azure-deploy';
  let deploymentError;
  try {
    const result = await request('PUT', `${scope.deployment}?api-version=2025-04-01`, body);
    assert.ok([200, 201, 202].includes(result.status), 'Azure rejected the hosting template');
    let nextProviderInspection = Date.now();
    while (true) {
      assert.ok(Date.now() < manifest.deadline - 5 * 60000, 'Hosting deployment timeout');
      const current = await request('GET', `${scope.deployment}?api-version=2025-04-01`);
      assert.equal(current.status, 200);
      const state = current.body.properties?.provisioningState;
      assert.ok(!['Failed', 'Canceled'].includes(state), 'Azure hosting deployment failed');
      if (state === 'Succeeded') break;
      if (Date.now() >= nextProviderInspection) {
        nextProviderInspection = Date.now() + 15000;
        const operations = await request('GET', `${scope.group}/providers/Microsoft.Resources/deployments/web-component/operations?api-version=2025-04-01`);
        assert.ok([200, 404].includes(operations.status), 'Unable to inspect nested hosting progress');
        assert.ok(!throttledDeploymentOperation(operations.body), 'Azure hosting creation is throttled; cancel this attempt and clean up');
      }
      await pause();
    }
  } catch (error) {
    deploymentError = error;
    phase = 'azure-deployment-diagnostic';
    for (const path of [`${scope.deployment}/operations`, `${scope.group}/providers/Microsoft.Resources/deployments/web-component/operations`]) {
      await request('GET', `${path}?api-version=2025-04-01`).catch(() => {});
    }
  }
  phase = 'local-deploy';
  await local('PUT', `${scope.deployment}?api-version=2025-04-01`, body);
  if (deploymentError) throw deploymentError;
  for (const [index, id] of scope.plans.entries()) {
    const sku = index === 0 ? { name: 'P0v3', tier: 'PremiumV3', capacity: 1 } : { name: 'EP1', tier: 'ElasticPremium', capacity: 1 };
    const plan = { location: report.region, kind: index === 0 ? 'linux' : 'elastic', sku,
      properties: index === 0 ? { reserved: true, perSiteScaling: false, elasticScaleEnabled: false } : { reserved: true, maximumElasticWorkerCount: 1 } };
    const path = `${id}?api-version=2024-11-01`;
    phase = `${sku.name}-read`;
    assert.equal((await pair('GET', path)).azure.status, 200);
    phase = `${sku.name}-unchanged-put`;
    await pair('PUT', path, plan);
    phase = `${sku.name}-tag-update`;
    await pair('PUT', path, { ...plan, tags: { purpose: 'lifecycle-update', run: runId } });
    phase = `${sku.name}-invalid-sku`;
    await pair('PUT', path, { ...plan, sku: { ...sku, name: 'UnknownHostingSkuForProbe' } });
    phase = `${sku.name}-read-after-rejected-update`;
    const observed = (await pair('GET', path)).azure;
    assert.equal(observed.status, 200);
    assert.equal(observed.body.sku?.name, sku.name, 'Rejected update changed the Azure SKU');
    assert.equal(observed.body.tags?.purpose, 'lifecycle-update', 'Rejected update changed Azure tags');
  }
  report.observationsComplete = true;
} catch (error) {
  report.error = sanitize(error.message, replacements);
  emit('output', { target: 'azure', phase, text: `Attempt incomplete: ${report.error}\n` });
} finally {
  phase = 'cleanup';
  if (manifestPath) {
    try {
      const cleanupToken = azureToken(config); replacements.push([cleanupToken, '<redacted>']);
      report.cleanup = await cleanupWeb(manifest, webArmClient({ ...manifest, token: cleanupToken }, event => observe('azure', event)));
      await writeFile(donePath, 'verified\n', { mode: 0o600 }); watchdog?.kill('SIGTERM'); await rm(manifestPath);
      await confirmBudgetCleanup(budgetPath, runId);
    } catch { report.cleanup = { cleanupComplete: false, recoveryRequired: true }; }
  }
  if (arm) {
    await local('DELETE', `${scope.group}?api-version=2025-04-01`).catch(() => {});
    report.localCleanup = [];
    for (const path of [scope.group, ...scope.plans]) report.localCleanup.push((await local('GET', `${path}?api-version=2024-11-01`)).status);
    arm.closeAllConnections(); await new Promise(done => arm.close(done));
  }
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  emit('run-end', { ok: false, summary: report.observationsComplete && report.cleanup?.plansAbsent ? 'Hosting component capture complete. Inspect differences; no application pass is claimed.' : 'Attempt incomplete. Inspect cleanup and errors.' });
}
console.log(`Web component evidence: ${out}`);
process.exitCode = !report.observationsComplete || !report.cleanup?.plansAbsent || !report.localCleanup?.every(code => code === 404) ? 1 : 0;
