import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, cp, rm, readdir, statfs, symlink, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmRequestHandler } from '../../packages/azure-control-plane/src/server.mjs';
import { localIdentity } from '../../packages/azure-control-plane/src/server-support.mjs';
import { startObserver, sanitize } from '../paired-lifecycle/transport.mjs';
import { platforms } from './platforms.mjs';
import { additionalPolicy, deploymentBody } from './policy.mjs';
import { cleanup } from './cleanup.mjs';
import { createRecording, recordLines, portalMode } from './recording.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const option = (name, fallback) => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const platform = platforms.find(item => item.id === option('platform', 'azure-terraform-hcl'));
assert.ok(platform?.fixture, 'Select a registered --platform');
const target = option('target', 'local');
assert.ok(['local', 'azure', 'both'].includes(target));
const live = target !== 'local';
const portalCapture = portalMode(option('portal', 'required'));
const budget = Number(process.env.PAIRED_AUTHORIZED_USD ?? 0);
if (live) {
  assert.ok(budget > 0 && budget <= 100, 'Explicit authorized USD ceiling, at most 100, required');
  if (portalCapture === 'required') assert.equal(process.env.PAIRED_PORTAL_CAPTURE_READY, '1', 'Enable and verify browser capture before starting an Azure pair');
}
const runId = randomBytes(6).toString('hex');
const group = `gs-pair-${runId}`;
const out = resolve(process.env.PAIRED_RUN_DIR ?? resolve(repo, 'reports/platform-lifecycle', `${platform.fixture}-${runId}`));
await mkdir(dirname(out), { recursive: true });
await mkdir(out, { mode: 0o700 });
const cache = resolve(repo, 'reports/platform-lifecycle-cache');
await mkdir(cache, { recursive: true, mode: 0o700 });
const space = async () => { const d = await statfs(out); assert.ok(d.bavail * d.bsize >= 40 * 1024 ** 3, '40 GiB reserve reached'); };
await space();
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceDir = resolve(here, 'fixtures', platform.fixture);
const sourceHashes = async path => Object.fromEntries(await Promise.all((await readdir(sourceDir)).map(async name => [name, hash(await readFile(resolve(path, name)))])));
const source = await sourceHashes(sourceDir);
const image = execFileSync('docker', ['image', 'inspect', `globalstack/validation-runner:${platform.image}`, '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
const report = { schemaVersion: 2, platform: platform.id, scope: 'Empty resource group; native lifecycle with external identity and endpoint routing', startedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).trim(), image, source, authorizedUsd: budget, targets: [], ok: false };
report.portalCapture = live ? portalCapture : 'not-applicable';
report.portalEvidenceComplete = false;
const record = createRecording(out, { platform: platform.id, revision: report.revision, sourceDirty: report.sourceDirty, source, image, portalCapture: report.portalCapture, target });
const save = () => writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
await save();
console.log(`Results: ${out}`);

async function execute(command, args, timeout = 180000, onOutput = () => {}) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', truncated = false, timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeout);
    const hard = setTimeout(() => child.kill('SIGKILL'), timeout + 5000);
    const collect = which => bytes => {
      onOutput(which, bytes);
      if (which === 'stdout') { stdout += bytes; if (stdout.length > 1048576) { stdout = stdout.slice(0, 1048576); truncated = true; } }
      else { stderr += bytes; if (stderr.length > 1048576) { stderr = stderr.slice(0, 1048576); truncated = true; } }
    };
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    child.on('error', error => { clearTimeout(timer); clearTimeout(hard); fail(error); });
    child.on('close', code => { clearTimeout(timer); clearTimeout(hard); done({ exitCode: code, stdout, stderr, truncated, timedOut }); });
  });
}
async function azure(args) {
  const config = process.env.PAIRED_AZURE_CONFIG_DIR;
  assert.ok(config?.startsWith('/'), 'Absolute private Azure config path required');
  const result = await execute('docker', ['run', '--rm', '--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp', '-e', 'AZURE_CONFIG_DIR=/azure', '-e', 'AZURE_CORE_COLLECT_TELEMETRY=no', '-v', `${config}:/azure`, '--entrypoint', 'az', 'globalstack/validation-runner:cli-pinned', ...args, '-o', 'json']);
  assert.equal(result.exitCode, 0, 'Azure preflight failed; refresh authentication separately');
  return JSON.parse(result.stdout);
}

for (const name of target === 'both' ? ['local', 'azure'] : [target]) {
  const entry = { name, phases: [], traces: [], probes: [], portal: [], cleanup: {}, source, ok: false };
  report.targets.push(entry);
  record('target-start', { target: name });
  const dir = resolve(out, name), privateDir = resolve(dir, 'private');
  await mkdir(privateDir, { recursive: true, mode: 0o700 });
  await cp(sourceDir, resolve(privateDir, 'task'), { recursive: true });
  await mkdir(resolve(privateDir, 'home')); await mkdir(resolve(privateDir, 'shims')); await mkdir(resolve(privateDir, 'pulumi')); await mkdir(resolve(privateDir, 'backend'));
  await mkdir(resolve(cache, 'plugins'), { recursive: true });
  await symlink('/cache/plugins', resolve(privateDir, 'pulumi/plugins'));
  let server, observer, phase = 'preflight', manifest, mayHaveCreated = false, prepared = false, template;
  const context = { runId, group, location: 'eastus', expires: new Date(Date.now() + 30 * 60000).toISOString(), subscription: localIdentity.subscriptionId, tenant: localIdentity.tenantId, token: localIdentity.accessToken };
  let origin, replacements = [], revision = 'one';
  const redact = value => sanitize(value, replacements);
  const groupPath = () => `/subscriptions/${context.subscription}/resourcegroups/${group}`;
  const container = `gs-paired-${runId}-${name}`;
  let command, probe;
  try {
    let tokenObject;
    if (name === 'azure') {
      const account = await azure(['account', 'show']);
      assert.equal(account.id, process.env.PAIRED_SUBSCRIPTION_ID);
      assert.equal(account.state, 'Enabled');
      tokenObject = await azure(['account', 'get-access-token', '--resource', 'https://management.azure.com/']);
      assert.ok(Number(tokenObject.expires_on) * 1000 > Date.now() + 30 * 60000, 'Refresh the Azure token before this pilot');
      Object.assign(context, { subscription: account.id, tenant: account.tenantId, token: tokenObject.accessToken });
      origin = 'https://management.azure.com';
    } else {
      server = createServer(createArmRequestHandler({ store: new ResourceStore() }));
      await new Promise(done => server.listen(0, '127.0.0.1', done));
      origin = `http://127.0.0.1:${server.address().port}`;
      tokenObject = { accessToken: context.token, expiresOn: '2099-01-01 00:00:00.000000', expires_on: 4070908800, subscription: context.subscription, tenant: context.tenant, tokenType: 'Bearer' };
    }
    replacements = [[context.token, '<redacted>'], [context.subscription, '<subscription>'], [context.tenant, '<tenant>'], [group, '<group>'], [runId, '<run>'], [context.expires, '<expiry>']];
    await writeFile(resolve(privateDir, 'token.json'), JSON.stringify(tokenObject), { mode: 0o600 });
    await writeFile(resolve(privateDir, 'account.json'), JSON.stringify({ id: context.subscription, tenantId: context.tenant, name: 'Paired test', state: 'Enabled', environmentName: 'AzureCloud', user: { type: 'user', name: 'paired-test@example.invalid' } }), { mode: 0o600 });
    await writeFile(resolve(privateDir, 'shims/az'), `#!/usr/bin/python3\nimport json,os,sys\na=sys.argv[1:]\nif a[:2]==['account','get-access-token']: print(open('/private/token.json').read())\nelif a[:2]==['account','show']:\n d=json.load(open('/private/account.json')); print(json.dumps(d.get(a[a.index('--query')+1])) if '--query' in a else json.dumps(d))\nelif a[:2]==['cloud','show']:\n d={'name':'AzureCloud','endpoints':{'resourceManager':'https://management.azure.com/','activeDirectory':'https://login.microsoftonline.com/','activeDirectoryResourceId':'https://management.core.windows.net/'}}; print(json.dumps(d.get(a[a.index('--query')+1])) if '--query' in a else json.dumps(d))\nelse: os.execv('/usr/bin/az',['az']+a)\n`, { mode: 0o700 });
    const cert = await execute('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1', '-keyout', resolve(privateDir, 'key.pem'), '-out', resolve(privateDir, 'cert.pem'), '-subj', '/CN=management.azure.com', '-addext', 'subjectAltName=DNS:management.azure.com']);
    assert.equal(cert.exitCode, 0);
    await writeFile(resolve(privateDir, 'ca.pem'), Buffer.concat([await readFile('/etc/ssl/certs/ca-certificates.crt'), await readFile(resolve(privateDir, 'cert.pem'))]), { mode: 0o600 });
    command = async (label, binary, args, expected = [0], observed = true) => {
      phase = label;
      if (!label.startsWith('destroy')) { await space(); if (manifest) assert.ok(Date.now() < manifest.deadline - 240000, 'Cleanup reserve reached'); }
      const env = { HOME: '/private/home', PATH: '/private/shims:/root/.pulumi/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', SSL_CERT_FILE: '/private/ca.pem', REQUESTS_CA_BUNDLE: '/private/ca.pem', NODE_EXTRA_CA_CERTS: '/private/ca.pem', ARM_USE_CLI: 'true', ARM_SUBSCRIPTION_ID: context.subscription, ARM_TENANT_ID: context.tenant, AZURE_SUBSCRIPTION_ID: context.subscription, ANSIBLE_AZURE_AUTH_SOURCE: 'cli', ANSIBLE_COLLECTIONS_PATH: '/root/.ansible/collections', ANSIBLE_LOCAL_TEMP: '/private/ansible-tmp', ANSIBLE_NOCOLOR: '1', AZURE_CONFIG_DIR: '/private/azure', AZURE_CORE_COLLECT_TELEMETRY: 'no', AZURE_ACCESS_TOKEN: context.token, TF_IN_AUTOMATION: '1', CHECKPOINT_DISABLE: '1', TF_VAR_subscription_id: context.subscription, TF_VAR_resource_group_name: group, TF_VAR_location: context.location, TF_VAR_run_id: runId, TF_VAR_expires_at: context.expires, TF_VAR_revision: revision, GROUP_NAME: group, LOCATION: context.location, RUN_ID: runId, EXPIRES: context.expires, REVISION: revision, PULUMI_HOME: '/private/pulumi', PULUMI_CONFIG_PASSPHRASE: '', PULUMI_SKIP_UPDATE_CHECK: 'true', PULUMI_BACKEND_URL: 'file:///private/backend', PYTHONPATH: '/cache/python', npm_config_cache: '/cache/npm', PIP_CACHE_DIR: '/cache/pip' };
      if (observed && observer) Object.assign(env, { HTTPS_PROXY: observer.url, HTTP_PROXY: observer.url, NO_PROXY: '127.0.0.1,localhost' });
      const startedAt = new Date().toISOString();
      record('command-start', { target: name, phase: label, command: redact([binary, ...args]) });
      const lines = recordLines((stream, text) => record('output', { target: name, phase: label, stream, text }), redact);
      let result;
      try { result = await execute('docker', ['run', '--rm', '--name', container, '--network', 'host', '--cap-drop', 'ALL', '--cap-add', 'DAC_OVERRIDE', '--cap-add', 'FOWNER', '--security-opt', 'no-new-privileges', '-v', `${privateDir}:/private`, '-v', `${cache}:/cache`, '-w', '/private/task', ...Object.entries(env).flatMap(([key, value]) => ['-e', `${key}=${value}`]), '--entrypoint', 'sh', image, '-c', 'umask 000; exec "$@"', 'runner', binary, ...args], 180000, lines.write); }
      finally { lines.end(); try { execFileSync('docker', ['rm', '-f', container], { stdio: 'ignore' }); } catch {} }
      entry.phases.push({ phase: label, command: redact([binary, ...args]), expectedExitCodes: expected, startedAt, completedAt: new Date().toISOString(), ...redact(result) });
      record('command-end', { target: name, phase: label, exitCode: result.exitCode, timedOut: result.timedOut });
      await save();
      assert.ok(expected.includes(result.exitCode) && !result.timedOut, `${platform.id}/${name}/${label} failed; inspect the sanitized record`);
      return result.stdout;
    };
    probe = async (label, method = 'GET', body) => {
      phase = label; const startedAt = new Date().toISOString();
      const response = await fetch(`${origin}${groupPath()}?api-version=2021-04-01`, { method, redirect: 'error', signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${context.token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      entry.probes.push(redact({ phase, method, path: groupPath(), apiVersion: '2021-04-01', requestBody: body ?? null, status: response.status, body: payload, startedAt, completedAt: new Date().toISOString() })); await save();
      record('probe', { target: name, phase: label, method, status: response.status, revision: payload?.tags?.revision });
      return { status: response.status, body: payload };
    };
    assert.equal((await probe('preflight')).status, 404);
    if (platform.fixture === 'bicep') {
      await command('version', '/root/.azure/bin/bicep', ['--version'], [0], false);
      await command('compile', '/root/.azure/bin/bicep', ['build', 'main.bicep', '--outfile', '/private/template.json'], [0], false);
      template = JSON.parse(await readFile(resolve(privateDir, 'template.json'), 'utf8'));
    } else if (platform.fixture === 'arm') {
      await command('validate-json', 'python3', ['-m', 'json.tool', 'main.json'], [0], false);
      template = JSON.parse(await readFile(resolve(privateDir, 'task/main.json'), 'utf8'));
    }
    if (template) {
      assert.equal(template.resources.length, 1);
      assert.equal(template.resources[0].type.toLowerCase(), 'microsoft.resources/resourcegroups');
      entry.compiledTemplateSha256 = hash(JSON.stringify(template));
    }
    observer = await startObserver({ targetOrigin: origin, groupPath: groupPath(), cert: await readFile(resolve(privateDir, 'cert.pem')), key: await readFile(resolve(privateDir, 'key.pem')), replacements, phase: () => phase, record: event => { entry.traces.push(event); record('http', { target: name, phase: event.phase, method: event.method, path: event.path, status: event.status, blocked: event.blocked, transportError: event.transportError }); }, additionalPolicy: additionalPolicy(context, template) });
    const { prepare, deploy, stable, update, refresh, forgetImport, destroy } = await import('./stages.mjs').then(module => module.stages({ platform, command, context, privateDir, template, setRevision: value => { revision = value; } }));
    await prepare(); prepared = true;
    if (name === 'azure') {
      manifest = { subscription: context.subscription, group, runId, token: context.token, parentPid: process.pid, container, templateDeployment: !!template, deadline: Date.now() + 20 * 60000 };
      await writeFile(resolve(privateDir, 'recovery.json'), JSON.stringify(manifest), { mode: 0o600 });
      const watchdog = spawn(process.execPath, [resolve(here, 'cleanup.mjs'), resolve(privateDir, 'recovery.json'), resolve(dir, 'cleanup.done'), resolve(dir, 'watchdog.json')], { detached: true, stdio: 'ignore' }); watchdog.unref();
    }
    const portal = async label => {
      if (name !== 'azure') return;
      if (portalCapture === 'deferred') { record('portal-pending', { target: name, phase: label, reason: 'Terminal/API run only; Azure Portal capture is pending' }); return; }
      const request = { platform: platform.id, phase: label, resourceId: groupPath(), url: `https://portal.azure.com/#@${context.tenant}/resource${groupPath()}/overview`, requestedAt: new Date().toISOString() };
      await writeFile(resolve(dir, 'portal-request.json'), JSON.stringify(request), { mode: 0o600 });
      console.log(`Portal capture required: ${dir} (${label})`);
      const deadline = Date.now() + 120000;
      while (Date.now() < deadline) {
        try {
          const capture = JSON.parse(await readFile(resolve(dir, `portal-${label}.json`), 'utf8'));
          assert.equal(capture.phase, label); assert.equal(capture.resourceId, groupPath());
          assert.ok(Date.parse(capture.capturedAt) >= Date.parse(request.requestedAt));
          assert.equal(capture.source, 'Azure Portal');
          assert.ok(capture.file && !capture.file.includes('/') && capture.file.endsWith('.png'));
          assert.equal(hash(await readFile(resolve(dir, capture.file))), capture.sha256);
          entry.portal.push(redact(capture)); await save(); return;
        } catch (error) { if (error.code !== 'ENOENT') throw error; }
        await new Promise(done => setTimeout(done, 1000));
      }
      throw new Error('Portal capture deadline reached; cleaning up');
    };
    mayHaveCreated = true; await deploy();
    assert.equal((await probe('read-create')).body?.tags?.revision, 'one');
    await portal('created');
    await stable('stable'); await refresh(); await update();
    const changed = await probe('read-update'); assert.equal(changed.body?.tags?.revision, 'two');
    await portal('updated');
    assert.equal((await probe('inject-drift', 'PATCH', { tags: { ...changed.body.tags, revision: 'external' } })).status, 200);
    await refresh('drift'); await deploy('repair');
    assert.equal((await probe('read-repair')).body?.tags?.revision, 'two');
    await forgetImport(); await stable(['hcl', 'pulumi'].includes(platform.family) ? 'imported' : 'final');
    await destroy(); entry.cleanup.nativeDestroyAccepted = true;
    const absenceDeadline = Date.now() + 120000;
    let absent = false, poll = 0;
    do {
      const observed = await probe(`post-destroy-read-${poll++}`);
      if (observed.status === 404) { absent = true; break; }
      assert.ok([200, 409].includes(observed.status), 'Unexpected deletion verification response');
      await new Promise(done => setTimeout(done, 2000));
    } while (Date.now() < absenceDeadline);
    assert.equal(absent, true, 'Native destruction did not establish absence within the observation window');
    entry.cleanup.nativeDestroy = true;
    entry.ok = true;
  } catch (error) { entry.error = redact(error.message); }
  finally {
    // Azure template recovery must establish terminal deployment state before deleting its group.
    const templateRecovery = name === 'azure' && !!template;
    if (mayHaveCreated && !entry.cleanup.nativeDestroy && command && prepared && !templateRecovery) {
      try {
        const { destroy } = (await import('./stages.mjs')).stages({ platform, command, context, privateDir, template, setRevision: value => { revision = value; } });
        await destroy(); entry.cleanup.nativeDestroy = true;
      } catch (error) { entry.cleanup.nativeDestroy = false; entry.cleanup.error = redact(error.message); }
    }
    try {
      if (name === 'azure' && manifest) Object.assign(entry.cleanup, await cleanup(manifest, event => entry.probes.push(redact(event))));
      else if (origin && probe) {
        const response = await probe('cleanup-read');
        if (response.status !== 404 && mayHaveCreated) {
          await probe('cleanup-fallback-delete', 'DELETE');
          entry.cleanup.fallbackDelete = true;
        }
        const absent = await probe('cleanup-absence');
        entry.cleanup.absent = absent.status === 404;
        if (template) {
          const path = `/subscriptions/${context.subscription}/providers/Microsoft.Resources/deployments/${group}?api-version=2022-09-01`;
          const startedAt = new Date().toISOString();
          const checked = await fetch(origin + path, { headers: { authorization: `Bearer ${context.token}` }, signal: AbortSignal.timeout(30000) });
          entry.probes.push(redact({ phase: 'cleanup-deployment', method: 'GET', path, status: checked.status, body: await checked.json().catch(() => null), startedAt, completedAt: new Date().toISOString() }));
          entry.cleanup.deploymentAbsent = checked.status === 404;
          if (!entry.cleanup.deploymentAbsent) entry.ok = false;
        }
      } else entry.cleanup.absent = !mayHaveCreated;
      assert.equal(entry.cleanup.absent, true, 'Cleanup incomplete');
      entry.sourceUnchanged = JSON.stringify(await sourceHashes(resolve(privateDir, 'task'))) === JSON.stringify(source);
      await writeFile(resolve(dir, 'cleanup.done'), 'verified\n', { mode: 0o600 });
      const cleared = await execute('docker', ['run', '--rm', '--network', 'none', '-v', `${privateDir}:/private`, '--entrypoint', 'find', image, '/private', '-mindepth', '1', '-maxdepth', '1', '-exec', 'rm', '-rf', '--', '{}', '+']);
      assert.equal(cleared.exitCode, 0, 'Private directory cleanup failed');
      await rm(privateDir, { recursive: true, force: true }); entry.cleanup.privateFilesRemoved = true;
    } catch (error) { entry.cleanup.error = redact(error.message); entry.ok = false; }
    if (observer) await observer.close();
    if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
    if (!entry.sourceUnchanged || !entry.cleanup.nativeDestroy) entry.ok = false;
    record('target-end', { target: name, ok: entry.ok, error: entry.error, cleanup: entry.cleanup });
    await save();
  }
  if (!entry.ok || !entry.cleanup.absent || !entry.cleanup.privateFilesRemoved) break;
}
report.completedAt = new Date().toISOString();
report.ok = report.targets.length === (target === 'both' ? 2 : 1) && report.targets.every(entry => entry.ok);
report.portalEvidenceComplete = live && report.targets.some(entry => entry.name === 'azure' && ['created', 'updated'].every(phase => entry.portal.some(capture => capture.phase === phase)));
record('run-end', { ok: report.ok, portalEvidenceComplete: report.portalEvidenceComplete });
await save();
console.log(JSON.stringify({ platform: platform.id, ok: report.ok, targets: report.targets.map(({ name, ok, error, cleanup, phases, traces }) => ({ name, ok, error, cleanup, stages: phases.length, exchanges: traces.length })) }, null, 2));
if (!report.ok) process.exitCode = 1;
