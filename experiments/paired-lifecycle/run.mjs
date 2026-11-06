import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, cp, rm, readdir, statfs } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmRequestHandler } from '../../packages/azure-control-plane/src/server.mjs';
import { localIdentity } from '../../packages/azure-control-plane/src/server-support.mjs';
import { sanitize, startObserver } from './transport.mjs';
import { removeOwnedGroup } from './cleanup.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const target = process.argv.find(arg => arg.startsWith('--target='))?.slice(9) ?? 'local';
assert.ok(['local', 'both'].includes(target), 'Use --target=local or --target=both');
const budget = Number(process.env.PAIRED_AUTHORIZED_USD ?? 0);
if (target === 'both') assert.ok(budget > 0 && budget <= 100, 'Set the explicitly authorized USD limit, at most 100');
const runId = randomBytes(6).toString('hex');
const group = `gs-pair-${runId}`;
const out = resolve(process.env.PAIRED_RUN_DIR ?? resolve(repo, 'reports/paired-lifecycle', runId));
await mkdir(dirname(out), { recursive: true });
await mkdir(out, { mode: 0o700 });
const disk = await statfs(out);
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, '40 GiB free required');
const image = execFileSync('docker', ['image', 'inspect', process.env.PAIRED_TOOL_IMAGE ?? 'globalstack/validation-runner:cli-pinned', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const source = Object.fromEntries(await Promise.all((await readdir(resolve(here, 'terraform'))).map(async name => [name, hash(await readFile(resolve(here, 'terraform', name)))])));
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), nodeVersion: process.version, image, source, location: 'eastus', authorizedUsd: budget, scope: 'Empty resource-group native lifecycle; ARM transport only; no data-plane or Entra-equivalence claim', targets: [], ok: false };
const save = () => writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
await save();
console.log(`Results: ${out}`);

async function execute(args, { timeout = 180000 } = {}) {
  return new Promise((done, fail) => {
    const child = spawn(args[0], args.slice(1), { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    const hard = setTimeout(() => child.kill('SIGKILL'), timeout + 5000);
    child.stdout.on('data', data => { stdout += data; }); child.stderr.on('data', data => { stderr += data; });
    child.once('error', error => { clearTimeout(timer); clearTimeout(hard); fail(error); });
    child.once('close', code => { clearTimeout(timer); clearTimeout(hard); done({ code, stdout, stderr, timedOut }); });
  });
}

async function az(args) {
  const config = process.env.PAIRED_AZURE_CONFIG_DIR;
  assert.ok(config && config.startsWith('/'), 'Set an absolute private PAIRED_AZURE_CONFIG_DIR');
  const result = await execute(['docker', 'run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp', '-e', 'AZURE_CONFIG_DIR=/azure', '-e', 'AZURE_CORE_COLLECT_TELEMETRY=no', '-v', `${config}:/azure`, '--entrypoint', 'az', image, ...args, '--output', 'json']);
  assert.equal(result.code, 0, 'Azure account preflight failed; inspect authentication separately');
  return JSON.parse(result.stdout);
}

const expires = new Date(Date.now() + 20 * 60 * 1000).toISOString();
for (const name of target === 'both' ? ['local', 'azure'] : ['local']) {
  const entry = { name, phases: [], traces: [], probes: [], cleanup: {}, source, ok: false };
  report.targets.push(entry);
  const dir = resolve(out, name); await mkdir(dir, { mode: 0o700 });
  const temporary = resolve(dir, 'private'); await mkdir(temporary, { mode: 0o700 });
  await mkdir(resolve(dir, 'logs'));
  await cp(resolve(here, 'terraform'), resolve(temporary, 'task'), { recursive: true });
  let phase = 'preflight', observer, server, tf, initialized = false, mayHaveCreated = false, watchdog;
  let subscription = localIdentity.subscriptionId, tenant = localIdentity.tenantId, token = localIdentity.accessToken;
  let origin, groupPath, replacements = [], manifest;
  const redact = value => sanitize(value, replacements);
  try {
    let tokenObject;
    if (name === 'azure') {
      const account = await az(['account', 'show']);
      assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID, 'Explicit subscription must match the signed-in account');
      assert.equal(account.state, 'Enabled');
      subscription = account.id; tenant = account.tenantId;
      tokenObject = await az(['account', 'get-access-token', '--resource', 'https://management.azure.com/']);
      assert.ok(Number(tokenObject.expires_on) * 1000 > Date.now() + 30 * 60 * 1000, 'Refresh Azure sign-in before this bounded pilot');
      token = tokenObject.accessToken; origin = 'https://management.azure.com';
    } else {
      server = createServer(createArmRequestHandler({ store: new ResourceStore() }));
      await new Promise(done => server.listen(0, '127.0.0.1', done));
      origin = `http://127.0.0.1:${server.address().port}`;
      tokenObject = { accessToken: token, expiresOn: '2099-01-01 00:00:00.000000', expires_on: 4070908800, subscription, tenant, tokenType: 'Bearer' };
    }
    replacements = [[token, '<redacted>'], [subscription, '<subscription>'], [tenant, '<tenant>'], [group, '<group>'], [runId, '<run>'], [expires, '<expiry>']];
    groupPath = `/subscriptions/${subscription}/resourcegroups/${group}`;
    const probe = async (method, body) => {
      const response = await fetch(`${origin}${groupPath}?api-version=2021-04-01`, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      entry.probes.push({ phase, method, status: response.status, body: redact(payload) });
      return { status: response.status, body: payload };
    };
    assert.equal((await probe('GET')).status, 404, 'Refuse an existing group');
    await writeFile(resolve(temporary, 'token.json'), JSON.stringify(tokenObject), { mode: 0o600 });
    await writeFile(resolve(temporary, 'account.json'), JSON.stringify({ id: subscription, tenantId: tenant, name: 'Paired test', environmentName: 'AzureCloud', user: { type: 'user', name: 'paired-test@example.invalid' } }), { mode: 0o600 });
    await writeFile(resolve(temporary, 'cloud.json'), JSON.stringify({ name: 'AzureCloud', endpoints: { resourceManager: 'https://management.azure.com/', activeDirectory: 'https://login.microsoftonline.com/', activeDirectoryResourceId: 'https://management.core.windows.net/' } }), { mode: 0o600 });
    await mkdir(resolve(temporary, 'shims'));
    await writeFile(resolve(temporary, 'shims/az'), '#!/bin/sh\ncase "$1 $2" in\n"account get-access-token") cat /private/token.json;;\n"account show") cat /private/account.json;;\n"cloud show") cat /private/cloud.json;;\n*) exit 1;;\nesac\n', { mode: 0o700 });
    const certificate = await execute(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-keyout', resolve(temporary, 'key.pem'), '-out', resolve(temporary, 'cert.pem'), '-subj', '/CN=management.azure.com', '-addext', 'subjectAltName=DNS:management.azure.com']);
    assert.equal(certificate.code, 0);
    await writeFile(resolve(temporary, 'ca.pem'), Buffer.concat([await readFile('/etc/ssl/certs/ca-certificates.crt'), await readFile(resolve(temporary, 'cert.pem'))]), { mode: 0o600 });
    observer = await startObserver({ targetOrigin: origin, groupPath, cert: await readFile(resolve(temporary, 'cert.pem')), key: await readFile(resolve(temporary, 'key.pem')), replacements, phase: () => phase, record: event => entry.traces.push(event) });
    let revision = 'one';
    tf = async (label, args, expected = 0, observed = true) => {
      phase = label;
      if (!label.startsWith('destroy')) {
        const free = await statfs(dir); assert.ok(free.bavail * free.bsize >= 40 * 1024 ** 3, '40 GiB reserve reached');
        if (manifest) assert.ok(Date.now() < manifest.deadline - 240000, 'Pilot cleanup deadline reached');
      }
      const container = `gs-paired-${runId}-${name}`;
      const env = { HOME: '/tmp', PATH: '/private/shims:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', SSL_CERT_FILE: '/private/ca.pem', ARM_USE_CLI: 'true', ARM_SUBSCRIPTION_ID: subscription, ARM_TENANT_ID: tenant, TF_IN_AUTOMATION: '1', CHECKPOINT_DISABLE: '1', TF_VAR_subscription_id: subscription, TF_VAR_resource_group_name: group, TF_VAR_location: 'eastus', TF_VAR_run_id: runId, TF_VAR_expires_at: expires, TF_VAR_revision: revision };
      if (observed) { env.HTTPS_PROXY = observer.url; env.HTTP_PROXY = observer.url; }
      const start = Date.now();
      let result;
      try { result = await execute(['docker', 'run', '--rm', '--name', container, '--network', 'host', '--user', `${process.getuid()}:${process.getgid()}`, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '-v', `${temporary}:/private`, '-w', '/private/task', ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), '--entrypoint', 'terraform', image, ...args]); }
      finally { try { execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' }); } catch {} }
      await writeFile(resolve(dir, 'logs', `${label}.log`), redact(result.stdout + '\n' + result.stderr));
      entry.phases.push({ phase: label, exitCode: result.code, expected, timedOut: result.timedOut, elapsedMs: Date.now() - start });
      await save();
      assert.equal(result.code, expected, `${name}/${label} failed; see retained log`);
      return result.stdout;
    };
    assert.equal(JSON.parse(await tf('version', ['version', '-json'], 0, false)).terraform_version, '1.17.1');
    await tf('format', ['fmt', '-check'], 0, false);
    await tf('init', ['init', '-input=false', '-lockfile=readonly', '-no-color'], 0, false); initialized = true;
    await tf('validate', ['validate', '-no-color']);
    await tf('plan-create', ['plan', '-input=false', '-detailed-exitcode', '-no-color'], 2);
    if (name === 'azure') {
      manifest = { subscription, group, runId, token, parentPid: process.pid, container: `gs-paired-${runId}-azure`, deadline: Date.now() + 15 * 60 * 1000 };
      await writeFile(resolve(temporary, 'recovery.json'), JSON.stringify(manifest), { mode: 0o600 });
      watchdog = spawn(process.execPath, [resolve(here, 'cleanup.mjs'), resolve(temporary, 'recovery.json'), resolve(dir, 'cleanup.done'), resolve(dir, 'watchdog.json')], { detached: true, stdio: 'ignore' }); watchdog.unref();
    }
    mayHaveCreated = true;
    await tf('apply-create', ['apply', '-auto-approve', '-input=false', '-no-color']);
    await tf('plan-stable', ['plan', '-input=false', '-detailed-exitcode', '-no-color']);
    await tf('refresh', ['apply', '-refresh-only', '-auto-approve', '-input=false', '-no-color']);
    revision = 'two';
    await tf('plan-update', ['plan', '-input=false', '-detailed-exitcode', '-no-color'], 2);
    await tf('apply-update', ['apply', '-auto-approve', '-input=false', '-no-color']);
    phase = 'read-update'; const updated = await probe('GET'); assert.equal(updated.status, 200); assert.equal(updated.body.tags.revision, 'two');
    phase = 'inject-drift'; assert.equal((await probe('PATCH', { tags: { ...updated.body.tags, revision: 'external' } })).status, 200);
    await tf('plan-drift', ['plan', '-input=false', '-detailed-exitcode', '-no-color'], 2);
    await tf('apply-repair', ['apply', '-auto-approve', '-input=false', '-no-color']);
    phase = 'read-repair'; assert.equal((await probe('GET')).body.tags.revision, 'two');
    await tf('state-remove', ['state', 'rm', 'azapi_resource.group']);
    await tf('import', ['import', '-input=false', '-no-color', 'azapi_resource.group', groupPath]);
    await tf('plan-imported', ['plan', '-input=false', '-detailed-exitcode', '-no-color']);
    entry.ok = true;
  } catch (error) { entry.error = redact(error.message); }
  finally {
    if (initialized && mayHaveCreated) {
      try { await tf('destroy', ['destroy', '-auto-approve', '-input=false', '-no-color']); entry.cleanup.nativeDestroy = true; }
      catch (error) { entry.cleanup.nativeDestroy = false; entry.cleanup.error = redact(error.message); entry.ok = false; }
    }
    try {
      if (name === 'azure' && manifest) Object.assign(entry.cleanup, await removeOwnedGroup(manifest));
      else if (origin && groupPath) {
        const response = await fetch(`${origin}${groupPath}?api-version=2021-04-01`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000), redirect: 'error' });
        entry.cleanup.absent = response.status === 404;
      }
    } catch (error) { entry.cleanup.absent = false; entry.cleanup.verificationError = redact(error.message); }
    if (entry.cleanup.absent || !mayHaveCreated) {
      await writeFile(resolve(dir, 'cleanup.done'), 'verified\n');
      if (watchdog) { try { process.kill(watchdog.pid, 'SIGTERM'); } catch {} }
      const copied = Object.fromEntries(await Promise.all(Object.keys(source).map(async file => [file, hash(await readFile(resolve(temporary, 'task', file)))])));
      entry.sourceUnchanged = JSON.stringify(source) === JSON.stringify(copied);
      await rm(temporary, { recursive: true, force: true }); entry.cleanup.privateFilesRemoved = true;
    }
    if (observer) await observer.close();
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    entry.ok = entry.ok && entry.sourceUnchanged && entry.cleanup.absent === true && entry.cleanup.nativeDestroy === true && !entry.traces.some(item => item.blocked || item.transportError);
    await save();
  }
  if (entry.cleanup.absent === false) { report.haltedForCleanup = true; break; }
}
report.ok = report.targets.every(entry => entry.ok) && report.targets.length === (target === 'both' ? 2 : 1);
report.completedAt = new Date().toISOString(); await save();
console.log(JSON.stringify({ lifecyclePassed: report.ok, targets: report.targets.map(({ name, ok, error, cleanup, traces }) => ({ name, ok, error, cleanup, exchanges: traces.length })) }, null, 2));
if (!report.ok) process.exitCode = 1;
