import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, writeFile, rm, statfs } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { azureToken } from './azure-session.mjs';
import { scopedWebPaths, scopedWebClient, cleanupScopedWeb } from './scoped-web-cleanup.mjs';
import { httpExchange } from './http-exchange.mjs';
import { throttledDeploymentOperation } from './deployment-progress.mjs';
import { productionBudgetPath, reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit evidence directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const disk = await statfs(out); assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const manifest = { subscription: process.env.PAIRED_SUBSCRIPTION_ID, group: process.env.PAIRED_RESOURCE_GROUP,
  runId: randomBytes(6).toString('hex'), config: process.env.PAIRED_AZURE_CONFIG_DIR, parentPid: process.pid, deadline: Date.now() + 20 * 60000 };
const scope = scopedWebPaths(manifest), token = azureToken(manifest.config);
const replacements = [[token, '<redacted>'], [manifest.subscription, '<subscription>'], [manifest.group, '<group>']];
const emit = createRecording(out, { platform: 'Resource-group scoped Bicep hosting lifecycle', revision, sourceDirty: false });
const report = { schemaVersion: 1, revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Two Linux hosting plans only, deployed inside an existing operator group. No applications or completed business workflow.',
  transport: 'Native Bicep compilation followed by direct ARM requests; not a native CLI deployment capture.',
  portalEvidenceComplete: false, fullProtocolParityEvaluated: false, exchanges: [], cleanup: null,
  budget: { totalAuthorizedUsd: null, thisRunEnvelopeUsd: 1, runtimeMinutes: 20, cleanupReserveMinutes: 10 } };
let phase = 'preflight', arm, watchdog, allocated = false;
const donePath = resolve(out, 'cleanup.done'), manifestPath = resolve(out, 'private-cleanup.json');
function observe(target, event) {
  const safe = sanitize({ target, phase, ...event }, replacements); report.exchanges.push(safe);
  emit('output', { target, phase, text: JSON.stringify(safe, null, 2) + '\n' });
}
const request = scopedWebClient({ ...manifest, token }, event => observe('azure', event));
async function local(method, path, body) {
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
  observe('local', { method, path, request: body, ...result }); return result;
}
async function pair(method, path, body) { const azure = await request(method, path, body); return { azure, local: await local(method, path, body) }; }
try {
  const group = await request('GET', `${scope.group}?api-version=2022-09-01`);
  assert.equal(group.status, 200); assert.equal(group.body.location, 'westus2', 'Use the region with retained hosting price evidence');
  const inventory = await request('GET', `${scope.group}/resources?api-version=2021-04-01`);
  assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink); assert.deepEqual(inventory.body.value, [], 'Test group must be empty');
  const deploymentPath = `${scope.deployment}?api-version=2025-04-01`;
  assert.equal((await request('GET', deploymentPath)).status, 404);
  for (const id of scope.plans) assert.equal((await request('GET', `${id}?api-version=2024-11-01`)).status, 404);
  const image = execFileSync('docker', ['image', 'inspect', 'globalstack/validation-runner:cli-pinned', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
  report.image = image;
  const compiled = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${here}/fixtures:/fixture:ro`, '--entrypoint', '/root/.azure/bin/bicep', image,
    'build', '/fixture/scoped-web-plans.bicep', '--stdout'], { encoding: 'utf8', timeout: 60000 });
  report.templateSha256 = createHash('sha256').update(compiled).digest('hex');
  await writeFile(resolve(out, 'compiled-template.json'), compiled, { mode: 0o600 });
  const body = { properties: { mode: 'Incremental', template: JSON.parse(compiled), parameters: {
    serviceName: { value: scope.service }, location: { value: group.body.location }, runId: { value: manifest.runId } } } };
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = manifest.subscription;
  arm = createArmServer({ store: new ResourceStore() }); await new Promise(done => arm.listen(0, '127.0.0.1', done));
  await local('PUT', `${scope.group}?api-version=2022-09-01`, { location: group.body.location });
  phase = 'provider-validation';
  const validated = await pair('POST', `${scope.deployment}/validate?api-version=2025-04-01`, { properties: { ...body.properties, validationLevel: 'Provider' } });
  assert.ok(validated.azure.status === 200 && !validated.azure.body?.error, 'Azure provider validation rejected or incomplete');
  report.budget.ledger = await reserveBudget(productionBudgetPath, { runId: manifest.runId, envelopeUsd: 1, purpose: 'Scoped hosting comparison in westus2' }); allocated = true;
  report.budget.totalAuthorizedUsd = report.budget.ledger.totalAuthorizedUsd;
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve(here, 'scoped-web-cleanup.mjs'), manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); }); watchdog.unref();
  phase = 'deployment';
  const deployed = await pair('PUT', deploymentPath, body);
  assert.ok([200, 201, 202].includes(deployed.azure.status), 'Azure rejected deployment');
  let nextInspection = 0;
  while (true) {
    assert.ok(Date.now() < manifest.deadline - 5 * 60000, 'Hosting deployment timeout');
    const current = await request('GET', deploymentPath); assert.equal(current.status, 200);
    const state = current.body.properties?.provisioningState;
    assert.ok(!['Failed', 'Canceled'].includes(state), 'Azure hosting deployment failed');
    if (state === 'Succeeded') break;
    if (Date.now() >= nextInspection) {
      const operations = await request('GET', `${scope.deployment}/operations?api-version=2025-04-01`);
      assert.equal(operations.status, 200);
      assert.ok(!throttledDeploymentOperation(operations.body), 'Azure hosting creation is throttled; cleanup required');
      nextInspection = Date.now() + 15000;
    }
    await new Promise(done => setTimeout(done, 3000));
  }
  for (const [index, id] of scope.plans.entries()) {
    const path = `${id}?api-version=2024-11-01`;
    const resource = { location: group.body.location, kind: index === 0 ? 'linux' : 'elastic',
      tags: { run: manifest.runId, project: 'globalstack-production-scenarios' },
      sku: index === 0 ? { name: 'P0v3', tier: 'PremiumV3', capacity: 1 } : { name: 'EP1', tier: 'ElasticPremium', capacity: 1 },
      properties: index === 0 ? { reserved: true, perSiteScaling: false, elasticScaleEnabled: false } : { reserved: true, maximumElasticWorkerCount: 1 } };
    phase = `${resource.sku.name}-read`; assert.equal((await pair('GET', path)).azure.status, 200);
    phase = `${resource.sku.name}-unchanged-put`; await pair('PUT', path, resource);
    phase = `${resource.sku.name}-tag-update`; await pair('PUT', path, { ...resource, tags: { ...resource.tags, purpose: 'lifecycle-update' } });
    phase = `${resource.sku.name}-invalid-sku`; const invalid = await pair('PUT', path, { ...resource, sku: { ...resource.sku, name: 'UnknownHostingSkuForProbe' } });
    assert.ok(invalid.azure.status >= 400, 'Invalid SKU was unexpectedly accepted');
    phase = `${resource.sku.name}-read-after-rejection`; const after = await pair('GET', path);
    assert.equal(after.azure.status, 200); assert.equal(after.azure.body.sku?.name, resource.sku.name);
    assert.equal(after.azure.body.tags?.purpose, 'lifecycle-update');
  }
  report.observationsComplete = true;
} catch (error) {
  report.error = sanitize(error.message, replacements);
  if (allocated) await request('GET', `${scope.deployment}/operations?api-version=2025-04-01`).catch(() => {});
} finally {
  phase = 'cleanup';
  if (allocated) {
    try {
      const cleanupToken = azureToken(manifest.config); replacements.push([cleanupToken, '<redacted>']);
      report.cleanup = await cleanupScopedWeb(manifest, scopedWebClient({ ...manifest, token: cleanupToken }, event => observe('azure', event)));
      await writeFile(donePath, 'verified\n', { mode: 0o600 }); watchdog?.kill('SIGTERM'); await rm(manifestPath, { force: true });
      await confirmBudgetCleanup(productionBudgetPath, manifest.runId);
    } catch { report.cleanup = { cleanupComplete: false, recoveryRequired: true }; }
  }
  if (arm) {
    for (const id of scope.plans) await local('DELETE', `${id}?api-version=2024-11-01`).catch(() => {});
    await local('DELETE', `${scope.deployment}?api-version=2025-04-01`).catch(() => {});
    await new Promise(done => arm.close(done));
  }
  report.completedAt = new Date().toISOString();
  emit('run-end', { summary: report.error ? `Attempt incomplete: ${report.error}` : 'Bounded observations recorded; inspect scope and response differences.' });
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, observationsComplete: report.observationsComplete, error: report.error, cleanup: report.cleanup }));
if (report.error || allocated && !report.cleanup?.plansAbsent) process.exitCode = 1;
