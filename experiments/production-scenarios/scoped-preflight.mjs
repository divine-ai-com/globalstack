import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, statfs, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azureToken } from './azure-session.mjs';
import { assessWorkloadPermissions, requireWorkloadPermissions } from './permission-preflight.mjs';
import { httpExchange } from './http-exchange.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../..');
const subscription = process.env.PAIRED_SUBSCRIPTION_ID, group = process.env.PAIRED_RESOURCE_GROUP;
assert.match(subscription ?? '', /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i);
assert.match(group ?? '', /^gs-[a-z0-9-]{1,70}$/);
assert.ok(process.env.PAIRED_RUN_DIR, 'An explicit evidence directory is required');
const out = resolve(process.env.PAIRED_RUN_DIR);
await mkdir(out, { recursive: true, mode: 0o700 });
const disk = await statfs(out); assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), '', 'Commit source before capture');
const runId = randomBytes(6).toString('hex'), groupPath = `/subscriptions/${subscription}/resourceGroups/${group}`;
const token = azureToken(process.env.PAIRED_AZURE_CONFIG_DIR);
const replacements = [[token, '<redacted>'], [subscription, '<subscription>'], [group, '<group>']];
const report = { schemaVersion: 1, revision, sourceDirty: false, startedAt: new Date().toISOString(),
  scope: 'Read-only resource-group access and provider validation. No cloud deployment, resource deletion, or business workflow.',
  cloudResourcesProvisioned: false, portalEvidenceComplete: false, exchanges: [] };
const emit = createRecording(out, { platform: 'Scoped Azure hosting preflight', revision, sourceDirty: false });
let arm;
async function request(target, method, path, body) {
  // This runner cannot provision or delete resources even if its identity can.
  assert.ok(method === 'GET' || method === 'POST' && path.endsWith('/validate?api-version=2025-04-01'));
  assert.ok(path.startsWith(`${groupPath}/`) || path.startsWith(`${groupPath}?`));
  const origin = target === 'azure' ? 'https://management.azure.com' : `http://127.0.0.1:${arm.address().port}`;
  const startedAt = new Date().toISOString();
  const result = await httpExchange(origin + path, { method, body, timeoutMs: 60000,
    headers: { authorization: `Bearer ${target === 'azure' ? token : 'globalstack-local-token'}` } });
  const event = sanitize({ target, method, path, request: body, ...result, startedAt, completedAt: new Date().toISOString() }, replacements);
  report.exchanges.push(event);
  emit('output', { target, phase: method === 'POST' ? 'provider-validation' : 'access-preflight', text: JSON.stringify(event, null, 2) + '\n' });
  return result;
}
try {
  const existing = await request('azure', 'GET', `${groupPath}?api-version=2022-09-01`);
  assert.equal(existing.status, 200, 'Cannot access the dedicated resource group');
  report.region = existing.body.location;
  const inventory = await request('azure', 'GET', `${groupPath}/resources?api-version=2021-04-01`);
  assert.equal(inventory.status, 200); assert.ok(!inventory.body.nextLink, 'Inventory is incomplete');
  assert.ok(Array.isArray(inventory.body.value));
  report.resourceCountBefore = inventory.body.value.length;
  assert.equal(report.resourceCountBefore, 0, 'Resolve existing resources before a new deployment');
  const permissions = await request('azure', 'GET', `${groupPath}/providers/Microsoft.Authorization/permissions?api-version=2022-04-01`);
  assert.equal(permissions.status, 200);
  report.workloadRolePermissions = assessWorkloadPermissions(permissions.body);
  if (process.env.PAIRED_REQUIRE_WORKLOAD_ROLES === '1') requireWorkloadPermissions(permissions.body);
  const compiled = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${here}/fixtures:/fixture:ro`,
    '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned', 'build', '/fixture/web-plans.bicep', '--stdout'], { encoding: 'utf8', timeout: 60000 });
  report.templateSha256 = createHash('sha256').update(compiled).digest('hex');
  await writeFile(resolve(out, 'compiled-template.json'), compiled, { mode: 0o600 });
  const body = { properties: { mode: 'Incremental', validationLevel: 'Provider', template: JSON.parse(compiled),
    parameters: { serviceName: { value: `gs${runId}` }, location: { value: report.region } } } };
  const path = `${groupPath}/providers/Microsoft.Resources/deployments/gs-preflight-${runId}/validate?api-version=2025-04-01`;
  const azure = await request('azure', 'POST', path, body);
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = subscription;
  const store = new ResourceStore(); arm = createArmServer({ store });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  // The cloud group was created by the operator. Mirror that prerequisite locally.
  const setup = await httpExchange(`http://127.0.0.1:${arm.address().port}${groupPath}?api-version=2022-09-01`, {
    method: 'PUT', body: { location: report.region }, headers: { authorization: 'Bearer globalstack-local-token' } });
  assert.ok([200, 201].includes(setup.status));
  const local = await request('local', 'POST', path, body);
  report.providerValidation = { azureStatus: azure.status, localStatus: local.status,
    azureAccepted: azure.status === 200 && !azure.body?.error, localAccepted: local.status === 200 && !local.body?.error };
  const after = await request('azure', 'GET', `${groupPath}/resources?api-version=2021-04-01`);
  assert.equal(after.status, 200); assert.ok(!after.body.nextLink); assert.ok(Array.isArray(after.body.value));
  report.resourceCountAfter = after.body.value.length;
  report.cloudGroupPreserved = true;
  assert.equal(report.resourceCountAfter, 0);
} catch (error) { report.error = sanitize(error.message, replacements); process.exitCode = 1; }
finally {
  if (arm) await new Promise(done => arm.close(done));
  report.completedAt = new Date().toISOString();
  emit('run-end', { summary: report.error ? `Attempt incomplete: ${report.error}` : 'Bounded observations recorded; inspect scope and response differences.' });
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
}
console.log(JSON.stringify({ out, providerValidation: report.providerValidation, resources: report.resourceCountAfter, error: report.error }));
