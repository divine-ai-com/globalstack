import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, statfs } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { localIdentity } from '../../packages/azure-control-plane/src/server-support.mjs';
import { sanitize } from '../paired-lifecycle/transport.mjs';
import { createRecording } from '../platform-lifecycle/recording.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const out = resolve(process.env.PAIRED_RUN_DIR);
const subscription = process.env.PAIRED_SUBSCRIPTION_ID;
assert.match(subscription ?? '', /^[a-f0-9-]{36}$/i);
const config = process.env.PAIRED_AZURE_CONFIG_DIR;
assert.ok(config?.startsWith('/'));
await mkdir(out, { recursive: true, mode: 0o700 });
const space = await statfs(out);
assert.ok(space.bavail * space.bsize >= 40 * 1024 ** 3);
const hash = data => createHash('sha256').update(data).digest('hex');
const source = Object.fromEntries(await Promise.all(['search-validation.bicep', 'search-service.bicep'].map(async name => [name, hash(await readFile(resolve(here, 'fixtures', name)))])));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const sourceDirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim();
assert.equal(sourceDirty, false, 'Commit the validation harness before capturing a pair');
const image = execFileSync('docker', ['image', 'inspect', 'globalstack/validation-runner:cli-pinned', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const record = createRecording(out, { platform: 'Scenario 1 Search foundation validation', revision, sourceDirty, source, image });
const cli = args => JSON.parse(execFileSync('docker', ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp', '-e', 'AZURE_CONFIG_DIR=/azure', '-e', 'AZURE_CORE_COLLECT_TELEMETRY=no', '-v', `${config}:/azure`, '--entrypoint', 'az', image, ...args, '-o', 'json', '--only-show-errors'], { encoding: 'utf8', timeout: 120000, stdio: ['ignore', 'pipe', 'pipe'] }));
const account = cli(['account', 'show']);
assert.equal(account.id, subscription); assert.equal(account.state, 'Enabled');
const token = cli(['account', 'get-access-token', '--resource', 'https://management.azure.com/']).accessToken;
const runId = randomBytes(6).toString('hex');
const group = `gs-prod-${runId}`, deployment = `gs-validation-${runId}`;
const replacements = [[token, '<redacted>'], [subscription, '<subscription>'], [account.tenantId, '<tenant>'], [group, '<group>'], [deployment, '<deployment>']];
const report = { schemaVersion: 1, revision, sourceDirty, source, image, startedAt: new Date().toISOString(),
  scope: 'Bicep-compiled Search foundation ARM validation, not full scenario deployment or integration.',
  transport: 'Native Bicep compilation followed by direct ARM validation requests, not a native deployment CLI trace.',
  attempts: [], probes: [], portalEvidenceComplete: false, provisioningPerformed: false };
let server;
try {
  record('command-start', { target: 'azure', phase: 'shared-compile', command: ['bicep', 'build', 'search-validation.bicep', '--stdout'] });
  const compiled = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${here}/fixtures:/fixture:ro`, '--entrypoint', '/root/.azure/bin/bicep', image, 'build', '/fixture/search-validation.bicep', '--stdout'], { encoding: 'utf8', timeout: 60000 });
  const template = JSON.parse(compiled);
  await writeFile(resolve(out, 'compiled-template.json'), compiled);
  report.compiledSha256 = hash(compiled);
  record('output', { target: 'azure', phase: 'shared-compile', text: `Compiled once for both targets. SHA-256 ${report.compiledSha256}\n` });
  record('command-end', { target: 'azure', phase: 'shared-compile', exitCode: 0 });
  // Configure the emulator externally so both requests use the same subscription scope.
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = subscription;
  server = createArmServer({ store: new ResourceStore() });
  await new Promise(done => server.listen(0, '127.0.0.1', done));

  async function exchange(target, method, path, body, phase) {
    const origin = target === 'azure' ? 'https://management.azure.com' : `http://127.0.0.1:${server.address().port}`;
    const startedAt = new Date().toISOString();
    const response = await fetch(origin + path, { method, redirect: 'error', signal: AbortSignal.timeout(60000),
      headers: { authorization: `Bearer ${target === 'azure' ? token : localIdentity.accessToken}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
    const entry = sanitize({ target, phase, method, path, startedAt, completedAt: new Date().toISOString(), request: body ?? null,
      status: response.status, headers: Object.fromEntries([...response.headers].filter(([name]) => !['set-cookie', 'www-authenticate'].includes(name))), body: parsed }, replacements);
    record('http', { target, phase, method, status: entry.status, path: entry.path });
    record('output', { target, phase, text: JSON.stringify({ status: entry.status, headers: entry.headers, body: entry.body }, null, 2) + '\n' });
    return entry;
  }

  // The two parameter sets preserve the source template; validation cannot create resources.
  for (const [phase, serviceName, validationLevel] of [
    ['missing-location-parameter', `gs${runId}`, 'Template'],
    ['invalid-search-name-template', 'Invalid_Search_Name', 'Template'],
    ['invalid-search-name-provider', 'Invalid_Search_Name', 'Provider'],
    ['corrected-search-name-provider', `gs${runId}`, 'Provider'],
  ]) {
    const body = { location: 'eastus2', properties: { mode: 'Incremental', validationLevel, template,
      parameters: { groupName: { value: group }, serviceName: { value: serviceName }, location: { value: 'eastus2' } } } };
    if (phase === 'missing-location-parameter') delete body.properties.parameters.location;
    const path = `/subscriptions/${subscription}/providers/Microsoft.Resources/deployments/${deployment}/validate?api-version=2025-04-01`;
    const attempt = { phase, validationLevel, requestSha256: hash(JSON.stringify(body)), targets: [] };
    report.attempts.push(attempt);
    for (const target of ['azure', 'local']) {
      record('command-start', { target, phase, command: ['POST', sanitize(path, replacements), `body-sha256=${attempt.requestSha256}`] });
      const observed = await exchange(target, 'POST', path, body, phase);
      attempt.targets.push(observed);
      record('command-end', { target, phase, exitCode: observed.status >= 400 ? 1 : 0 });
    }
    const [azure, local] = attempt.targets;
    attempt.sameStatusAndErrorCode = azure.status === local.status && azure.body?.error?.code === local.body?.error?.code;
  }
  for (const target of ['azure', 'local']) {
    for (const [phase, path] of [
      ['group-absence', `/subscriptions/${subscription}/resourceGroups/${group}?api-version=2025-04-01`],
      ['deployment-absence', `/subscriptions/${subscription}/providers/Microsoft.Resources/deployments/${deployment}?api-version=2025-04-01`],
    ]) report.probes.push(await exchange(target, 'GET', path, undefined, phase));
  }
  report.noResourcesCreated = report.probes.every(probe => probe.status === 404);
  report.statusCodeParityObserved = report.attempts.every(attempt => attempt.sameStatusAndErrorCode);
} catch (error) {
  report.error = sanitize(error.message, replacements);
  record('output', { target: 'azure', phase: 'harness-error', text: `[Harness failure] ${report.error}\n` });
} finally {
  if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
  report.completedAt = new Date().toISOString();
  report.fullProtocolParityEvaluated = false;
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  record('run-end', { ok: report.statusCodeParityObserved === true && report.noResourcesCreated === true });
}
console.log(`Validation evidence: ${out}`);
process.exitCode = report.error || !report.noResourcesCreated ? 1 : 0;
