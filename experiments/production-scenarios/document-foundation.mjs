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
import { azureToken, azureDockerArguments } from './azure-session.mjs';
import { scopedWebPaths, scopedWebClient, cleanupScopedWeb } from './scoped-web-cleanup.mjs';
import { httpExchange } from './http-exchange.mjs';
import { productionBudgetPath, reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit evidence directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const disk = await statfs(out); assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const manifest = { scenario: 'document-foundation', subscription: process.env.PAIRED_SUBSCRIPTION_ID,
  group: process.env.PAIRED_RESOURCE_GROUP, runId: randomBytes(6).toString('hex'), config: process.env.PAIRED_AZURE_CONFIG_DIR,
  parentPid: process.pid, deadline: Date.now() + 20 * 60000 };
const scope = scopedWebPaths(manifest), token = azureToken(manifest.config);
const replacements = [[token, '<redacted>'], [manifest.subscription, '<subscription>'], [manifest.group, '<group>'], [out, '<run-directory>']];
const emit = createRecording(out, { platform: 'Document foundation: native Azure CLI and local ARM', revision, sourceDirty: false });
const report = { revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Three managed identities and five delegated/private-endpoint subnets. No application runtime, private endpoints or effective network isolation tested.',
  azureTransport: 'Native Azure CLI group deployment of the compiled Bicep template', localTransport: 'Direct ARM submission of the same compiled template and parameters',
  businessWorkflowCompleted: false, portalEvidenceComplete: false, exchanges: [], comparisons: [], cleanup: null };
let phase = 'preflight', arm, watchdog, allocated = false;
const manifestPath = resolve(out, 'private-cleanup.json'), donePath = resolve(out, 'cleanup.done');
function observe(target, event) {
  const safe = sanitize({ target, phase, ...event }, replacements); report.exchanges.push(safe);
  emit('output', { target, phase, text: JSON.stringify(safe, null, 2) + '\n' });
}
const request = scopedWebClient({ ...manifest, token }, event => observe('azure', event));
async function local(method, path, body) {
  const result = await httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
  observe('local', { method, path, request: body, ...result }); return result;
}
try {
  const group = await request('GET', `${scope.group}?api-version=2022-09-01`);
  assert.equal(group.status, 200); assert.equal(group.body.location, 'westus2');
  const inventory = await request('GET', `${scope.group}/resources?api-version=2021-04-01`);
  assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink); assert.deepEqual(inventory.body.value, []);
  const deploymentPath = `${scope.deployment}?api-version=2025-04-01`;
  assert.equal((await request('GET', deploymentPath)).status, 404);
  for (const id of scope.plans) assert.equal((await request('GET', `${id}?api-version=${scope.versions[id]}`)).status, 404);
  report.image = execFileSync('docker', ['image', 'inspect', 'globalstack/validation-runner:cli-pinned', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
  const compiled = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${here}/document-infra:/fixture:ro`, '--entrypoint', '/root/.azure/bin/bicep', report.image,
    'build', '/fixture/foundation.bicep', '--stdout'], { encoding: 'utf8', timeout: 60000 });
  report.templateSha256 = createHash('sha256').update(compiled).digest('hex');
  await writeFile(resolve(out, 'compiled-template.json'), compiled, { mode: 0o600 });
  const parameters = { serviceName: { value: scope.service }, location: { value: group.body.location }, runId: { value: manifest.runId } };
  const body = { properties: { mode: 'Incremental', template: JSON.parse(compiled), parameters } };
  phase = 'provider-validation';
  const validated = await request('POST', `${scope.deployment}/validate?api-version=2025-04-01`, { properties: { ...body.properties, validationLevel: 'Provider' } });
  assert.ok(validated.status === 200 && !validated.body?.error, 'Azure provider validation rejected or incomplete');
  report.budget = await reserveBudget(productionBudgetPath, { runId: manifest.runId, envelopeUsd: 1, purpose: 'Scoped document foundation comparison; no compute or private endpoint meters' });
  allocated = true;
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  watchdog = spawn(process.execPath, [resolve(here, 'scoped-web-cleanup.mjs'), manifestPath, donePath, resolve(out, 'watchdog.json')], { detached: true, stdio: 'ignore' });
  await new Promise((done, fail) => { watchdog.once('spawn', done); watchdog.once('error', fail); }); watchdog.unref();
  phase = 'deployment';
  const args = azureDockerArguments(manifest.config, ['deployment', 'group', 'create', '--subscription', manifest.subscription,
    '--resource-group', manifest.group, '--name', scope.deployment.split('/').at(-1), '--template-file', '/evidence/compiled-template.json',
    '--parameters', `serviceName=${scope.service}`, `location=${group.body.location}`, `runId=${manifest.runId}`]);
  args.splice(args.indexOf('--entrypoint'), 0, '-v', `${out}:/evidence:ro`);
  let azureDeployment;
  try {
    azureDeployment = JSON.parse(execFileSync('docker', args, { encoding: 'utf8', timeout: 600000, stdio: ['ignore', 'pipe', 'pipe'] }));
    observe('azure', { command: ['az', 'deployment', 'group', 'create'], exitCode: 0, body: azureDeployment });
  } catch (error) {
    observe('azure', { command: ['az', 'deployment', 'group', 'create'], exitCode: error.status,
      stdout: String(error.stdout ?? '').slice(0, 65536), stderr: String(error.stderr ?? '').slice(0, 65536) });
    throw new Error('Native Azure CLI deployment failed; inspect retained diagnostics');
  }
  assert.equal(azureDeployment.properties.provisioningState, 'Succeeded');
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = manifest.subscription;
  arm = createArmServer({ store: new ResourceStore() }); await new Promise(done => arm.listen(0, '127.0.0.1', done));
  await local('PUT', `${scope.group}?api-version=2022-09-01`, { location: group.body.location });
  const deployed = await local('PUT', deploymentPath, body);
  report.localDeploymentState = deployed.body?.properties?.provisioningState;
  phase = 'readback';
  for (const id of scope.plans) {
    const path = `${id}?api-version=${scope.versions[id]}`, azure = await request('GET', path), emulator = await local('GET', path);
    const identity = id.includes('/userAssignedIdentities/');
    const properties = item => identity ? { principalIdPresent: /^[a-f0-9-]{36}$/i.test(item?.properties?.principalId ?? ''), clientIdPresent: /^[a-f0-9-]{36}$/i.test(item?.properties?.clientId ?? '') }
      : { addressSpace: item?.properties?.addressSpace, subnets: item?.properties?.subnets?.map(subnet => ({ name: subnet.name,
        prefix: subnet.properties?.addressPrefix, delegations: (subnet.properties?.delegations ?? []).map(value => value.properties?.serviceName) })) };
    const observed = { resource: id.split('/').at(-1), azureStatus: azure.status, localStatus: emulator.status, azure: properties(azure.body), local: properties(emulator.body) };
    observed.selectedFieldsMatch = azure.status === 200 && emulator.status === 200 && JSON.stringify(observed.azure) === JSON.stringify(observed.local);
    report.comparisons.push(observed);
  }
  report.observationsComplete = true;
} catch (error) { report.error = sanitize(error.message, replacements); }
finally {
  phase = 'cleanup';
  if (allocated) {
    try {
      const refreshed = azureToken(manifest.config); replacements.push([refreshed, '<redacted>']);
      report.cleanup = await cleanupScopedWeb(manifest, scopedWebClient({ ...manifest, token: refreshed }, event => observe('azure', event)));
      await writeFile(donePath, 'verified\n', { mode: 0o600 }); watchdog?.kill('SIGTERM'); await rm(manifestPath, { force: true });
      await confirmBudgetCleanup(productionBudgetPath, manifest.runId);
    } catch { report.cleanup = { cleanupComplete: false, recoveryRequired: true }; }
  }
  if (arm) await new Promise(done => arm.close(done));
  report.completedAt = new Date().toISOString();
  emit('run-end', { summary: report.error ?? 'Foundation observations recorded. No application workflow.' });
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, error: report.error, localDeploymentState: report.localDeploymentState, comparisons: report.comparisons, cleanup: report.cleanup }));
if (report.error || allocated && !report.cleanup?.resourcesAbsent) process.exitCode = 1;
