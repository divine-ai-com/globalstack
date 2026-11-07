import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { mkdir, readFile, writeFile, cp, rm, statfs } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const experiment = dirname(fileURLToPath(import.meta.url));
const repo = resolve(experiment, '../..');
const product = repo;
const output = resolve(process.env.CLAIMS_RUN_DIR || resolve(repo, 'reports/claims-evidence', randomUUID()));
const imageName = 'globalstack/claims-terraform:1.17.1';
const load = path => import(pathToFileURL(resolve(product, path)));
const { ResourceStore } = await load('packages/core/src/resource-store.mjs');
const { createEmulatorRuntime } = await load('packages/azure-data-plane/src/emulator-runtime.mjs');
const { createArmRequestHandler } = await load('packages/azure-control-plane/src/server.mjs');
const { localIdentity } = await load('packages/azure-control-plane/src/server-support.mjs');
const { AzuriteClient } = await load('packages/azure-data-plane/src/azurite-client.mjs');
const bundle = resolve(experiment, 'terraform');
const metadata = JSON.parse(await readFile(resolve(bundle, 'metadata.json')));
const names = metadata.resourceNames;
const revision = root => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty = root => !!execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
const record = { schemaVersion: 2, nodeVersion: process.version, platform: process.platform, architecture: process.arch, recordedAt: new Date().toISOString(), sourceRevision: revision(repo), productRevision: revision(product),
  sourceDirty: dirty(repo), productDirty: dirty(product), stages: [], episodes: [], cleanup: {}, error: null,
  scope: 'One refined Terraform configuration; local reference HTTP worker; no Azure deployment or model call',
  limits: ['Synthetic local identity; no RBAC or live Azure fidelity claim', 'Synchronous delivery interval; no delayed duplicate or retry guarantee',
    'Service Bus, Event Hubs, Files and App Configuration are provisioned but outside the event path', 'Not the historical seven-stage shipment runner'],
};
assert.equal(process.platform, 'linux', 'The native experiment requires Linux');
assert.equal(process.arch, 'x64', 'The pinned image supports Linux x86_64');
await mkdir(dirname(output), { recursive: true });
await mkdir(output, { mode: 0o700 });
const initialDisk = await statfs(output);
assert.ok(initialDisk.bavail * initialDisk.bsize / 1024 ** 3 >= 40, 'At least 40 GiB free is required');
// Avoid silently reusing state or replacing an earlier attempt.
await writeFile(resolve(output, 'attempt.json'), JSON.stringify(record), { flag: 'wx' });
const save = async () => writeFile(resolve(output, 'result.json'), JSON.stringify(record, null, 2) + '\n');
await mkdir(resolve(output, 'logs'), { recursive: true });
await cp(bundle, resolve(output, 'task'), { recursive: true });
await mkdir(resolve(output, 'certs'));
await mkdir(resolve(output, 'shims'));
let commandIndex = 0;
const containers = new Set();
async function command(label, executable, args, options = {}) {
  const disk = await statfs(output); const freeGiB = disk.bavail * disk.bsize / 1024 ** 3;
  record.minimumFreeGiB = Math.min(record.minimumFreeGiB ?? Infinity, freeGiB);
  if (freeGiB < 40 && !label.startsWith('destroy')) throw new Error('40 GiB disk reserve reached');
  const result = await new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd ?? repo, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    const timer = setTimeout(() => { child.kill('SIGTERM'); }, 240000);
    const killTimer = setTimeout(() => { child.kill('SIGKILL'); }, 250000);
    child.once('error', e => { clearTimeout(timer); clearTimeout(killTimer); reject(e); });
    child.once('close', code => { clearTimeout(timer); clearTimeout(killTimer); resolveCommand({ code, stdout, stderr }); });
  });
  const log = `${String(++commandIndex).padStart(2, '0')}-${label}.log`;
  await writeFile(resolve(output, 'logs', log), result.stdout + '\n' + result.stderr);
  record.stages.push({ label, exitCode: result.code, log });
  await save();
  if (result.code !== 0) throw new Error(`${label} exited ${result.code}; see logs/${log}`);
  return result.stdout;
}
const store = new ResourceStore();
const runtime = createEmulatorRuntime({ store });
const servers = [], boundaries = [], deliveries = [], workerErrors = [];
async function listen(server) {
  servers.push(server);
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return `http://127.0.0.1:${server.address().port}`;
}
function observed(service, host, handler) {
  return (req, res) => {
    req.headers.host = host;
    res.once('finish', () => boundaries.push({ service, method: req.method, path: req.url, status: res.statusCode }));
    return handler(req, res);
  };
}
let tfReady = false, armEndpoint, storage, eventEndpoint, eventKey;
const group = `/subscriptions/${localIdentity.subscriptionId}/resourceGroups/${names.resourceGroup}`;
const storagePath = `${group}/providers/Microsoft.Storage/storageAccounts/${names.storageAccount}`;
const topicPath = `${group}/providers/Microsoft.EventGrid/topics/${names.eventGridTopic}`;
async function arm(method, path, body) {
  const res = await fetch(armEndpoint + path, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { authorization: `Bearer ${localIdentity.accessToken}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text(); return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function publish(events) {
  const res = await fetch(`${eventEndpoint}/api/events?api-version=2018-01-01`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { 'aeg-sas-key': eventKey, 'content-type': 'application/json' }, body: JSON.stringify(events),
  });
  const text = await res.text(); return { status: res.status, body: text };
}
let tf;
try {
  await command('certificate', 'openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '2', '-nodes',
    '-keyout', resolve(output, 'certs/key.pem'), '-out', resolve(output, 'certs/cert.pem'), '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost']);
  await writeFile(resolve(output, 'certs/ca.pem'), Buffer.concat([await readFile('/etc/ssl/certs/ca-certificates.crt'), await readFile(resolve(output, 'certs/cert.pem'))]));
  const armHandler = createArmRequestHandler({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  armEndpoint = await listen(httpServer(armHandler));
  const tls = httpsServer({ key: await readFile(resolve(output, 'certs/key.pem')), cert: await readFile(resolve(output, 'certs/cert.pem')) }, armHandler);
  await listen(tls);
  const tlsEndpoint = `https://127.0.0.1:${tls.address().port}/`;
  const blob = await listen(httpServer(observed('blob', `${names.storageAccount}.blob.core.windows.net`, runtime.storageRouter.blobHandler())));
  const queue = await listen(httpServer(observed('queue', `${names.storageAccount}.queue.core.windows.net`, runtime.storageRouter.queueHandler())));
  const table = await listen(httpServer(observed('table', `${names.storageAccount}.table.core.windows.net`, runtime.storageRouter.tableHandler())));
  eventEndpoint = await listen(httpServer(observed('event-grid', `${names.eventGridTopic}.eastus-1.eventgrid.azure.net`, runtime.eventGridRouter.handler())));
  const receiver = await listen(httpServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/_observations') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ deliveries, boundaries, workerErrors })); return;
      }
      let text = ''; for await (const chunk of req) text += chunk;
      const events = JSON.parse(text); deliveries.push({ path: req.url, body: events });
      if (req.url === '/claims') {
        assert.equal(events.length, 1);
        const event = events[0];
        const blobRead = await storage.getBlob(names.blobContainerName, event.data.blobName);
        assert.equal(blobRead.status, 200);
        const input = JSON.parse(blobRead.body);
        assert.equal(input.claimId, event.data.claimId); assert.equal(input.correlationId, event.id);
        const item = { correlationId: event.id, claimId: input.claimId, blobName: event.data.blobName,
          sha256: createHash('sha256').update(blobRead.body).digest('hex') };
        assert.equal((await storage.putQueueMessage(names.queueName, JSON.stringify(item))).status, 201);
        const entity = { PartitionKey: 'claims', RowKey: event.id, ...item, status: 'queued' };
        const inserted = await storage.insertTableEntity(names.tableName, entity);
        if (inserted.status === 409) {
          assert.equal(JSON.parse(inserted.body)['odata.error'].code, 'EntityAlreadyExists');
          const existing = await storage.getTableEntity(names.tableName, 'claims', event.id);
          assert.equal(existing.status, 200);
          const retained = JSON.parse(existing.body);
          for (const [key, value] of Object.entries(entity)) assert.deepEqual(retained[key], value);
        } else assert.equal(inserted.status, 201);
      }
      res.writeHead(200).end('{}');
    } catch (e) { workerErrors.push(e.message); res.writeHead(500).end('{"error":"worker failure"}'); }
  }));
  const token = JSON.stringify({ accessToken: localIdentity.accessToken, expiresOn: '2099-01-01 00:00:00.000000', expires_on: 4070908800, subscription: localIdentity.subscriptionId, tenant: localIdentity.tenantId, tokenType: 'Bearer' });
  const account = JSON.stringify({ id: localIdentity.subscriptionId, tenantId: localIdentity.tenantId, name: 'Local test', state: 'Enabled', environmentName: 'AzureCloud', user: { type: 'user', name: 'test@example.invalid' } });
  const cloud = JSON.stringify({ name: 'AzureCloud', endpoints: { resourceManager: tlsEndpoint, activeDirectory: tlsEndpoint, activeDirectoryResourceId: tlsEndpoint } });
  await writeFile(resolve(output, 'shims/az'), `#!/bin/sh\ncase "$1 $2" in\n'account get-access-token') echo '${token}';;\n'account show') echo '${account}';;\n'cloud show') echo '${cloud}';;\n'version ') echo '{"azure-cli":"test-shim"}';;\n*) exit 1;;\nesac\n`, { mode: 0o755 });
  const inspected = JSON.parse(execFileSync('docker', ['image', 'inspect', imageName], { encoding: 'utf8' }))[0];
  record.runnerImage = { name: imageName, id: inspected.Id };
  tf = async (label, args) => {
    const name = `gs-claims-${process.pid}-${commandIndex}`; containers.add(name);
    try {
      return await command(label, 'docker', ['run', '--rm', '--name', name, '--network', 'host', '--cpus', '2', '--memory', '2g',
        '--user', `${process.getuid()}:${process.getgid()}`, '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
        '-v', `${resolve(output, 'task/lib')}:/work`, '-v', `${resolve(output, 'certs')}:/certs:ro`, '-v', `${resolve(output, 'shims')}:/shims:ro`,
        '-w', '/work', '-e', 'PATH=/shims:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', '-e', 'HOME=/tmp',
        '-e', `ARM_RESOURCE_MANAGER_ENDPOINT=${tlsEndpoint}`, '-e', 'ARM_USE_CLI=true', '-e', `ARM_SUBSCRIPTION_ID=${localIdentity.subscriptionId}`,
        '-e', `ARM_TENANT_ID=${localIdentity.tenantId}`, '-e', 'SSL_CERT_FILE=/certs/ca.pem', '-e', 'AZURE_IDENTITY_DISABLE_INSTANCE_DISCOVERY=true',
        '-e', 'TF_IN_AUTOMATION=1', '--entrypoint', 'terraform', imageName, ...args]);
    } finally { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {} containers.delete(name); }
  };
  const setConfig = async (count, path = '/claims') => writeFile(resolve(output, 'task/lib/terraform.tfvars.json'), JSON.stringify({
    subscription_id: localIdentity.subscriptionId, claims_worker_url: receiver + path, claims_subscription_count: count,
  }, null, 2));
  await setConfig(1);
  record.terraformVersion = JSON.parse(await tf('version', ['version', '-json'])).terraform_version;
  assert.equal(record.terraformVersion, '1.17.1', 'Use the pinned experiment image');
  await tf('format-check', ['fmt', '-check', '-recursive']);
  await command('source-unit', 'python3', ['test/terraform.unit.test.py'], { cwd: resolve(output, 'task') });
  await tf('init', ['init', '-input=false', '-lockfile=readonly', '-no-color']); tfReady = true;
  await tf('validate', ['validate', '-no-color']);
  async function apply(label, count, path = '/claims') {
    await setConfig(count, path);
    await tf(`apply-${label}`, ['apply', '-auto-approve', '-input=false', '-no-color']);
    await tf(`plan-${label}`, ['plan', '-detailed-exitcode', '-input=false', '-no-color']);
  }
  await apply('connected', 1);
  const values = JSON.parse(await tf('outputs', ['output', '-json']));
  for (const [key, value] of Object.entries(metadata.expectedOutputs)) assert.equal(values[key]?.value, value);
  assert.equal(values.ClaimsAuditSubscriptionIds.value.length, 1);
  record.managementChecks = [];
  for (const check of metadata.integrationChecks) {
    const response = await arm('GET', `${group}/providers/${check.provider}/${check.typePath}?api-version=${check.apiVersion}`);
    assert.equal(response.status, 200); assert.equal(response.body.type, check.expectedType);
    record.managementChecks.push({ label: check.label, status: response.status, type: response.body.type });
  }
  const accountKeys = await arm('POST', `${storagePath}/listKeys?api-version=2023-01-01`, {});
  assert.equal(accountKeys.status, 200);
  const topicKeys = await arm('POST', `${topicPath}/listKeys?api-version=2022-06-15`, {});
  assert.equal(topicKeys.status, 200); eventKey = topicKeys.body.key1;
  storage = new AzuriteClient({ account: { name: names.storageAccount, key: accountKeys.body.keys[0].value },
    blobEndpoint: blob, queueEndpoint: queue, tableEndpoint: table, pathStyle: false });
  async function episode(label, shouldPass) {
    const contextFile = resolve(output, 'context.json');
    await writeFile(contextFile, JSON.stringify({ label, expectedOutcome: shouldPass, names,
      account: { name: names.storageAccount, key: accountKeys.body.keys[0].value }, eventKey,
      storageClientModule: resolve(product, 'packages/azure-data-plane/src/azurite-client.mjs'),
      endpoints: { blob, queue, table, event: eventEndpoint, observations: receiver + '/_observations' },
    }), { mode: 0o600 });
    const raw = await command(`behavior-${label}`, process.execPath, ['test/claims-behavior.int.test.mjs'], {
      cwd: resolve(output, 'task'), env: { PATH: process.env.PATH, CLAIMS_CONTEXT_PATH: contextFile },
    });
    record.episodes.push(JSON.parse(raw)); await save();
  }
  await episode('connected', true);
  for (const [label, count, path] of [['wrong-destination', 1, '/wrong'], ['missing-subscription', 0, '/claims'], ['duplicate-subscription', 2, '/claims']]) {
    await apply(label, count, path); await episode(label, false);
    await apply(`restored-${label}`, 1); await episode(`restored-${label}`, true);
  }
  await cp(resolve(output, 'task/lib/.terraform.lock.hcl'), resolve(output, 'provider.lock.hcl'));
} catch (e) {
  record.error = { name: e.name, message: e.message };
} finally {
  try {
    if (tfReady) {
      await tf('destroy', ['destroy', '-auto-approve', '-input=false', '-no-color']);
      record.cleanup.groupStatus = (await arm('GET', `${group}?api-version=2021-04-01`)).status;
      assert.equal(record.cleanup.groupStatus, 404);
      record.cleanup.resourceStatuses = [];
      for (const check of metadata.integrationChecks) {
        const r = await arm('GET', `${group}/providers/${check.provider}/${check.typePath}?api-version=${check.apiVersion}`);
        record.cleanup.resourceStatuses.push({ label: check.label, status: r.status }); assert.equal(r.status, 404);
      }
      if (storage) {
        const sample = record.episodes[0];
        assert.ok(sample, 'No completed behavioral episode is available for post-delete observation');
        record.cleanup.blobStatus = (await storage.getBlob(names.blobContainerName, sample.expectedRecord.blobName)).status;
        record.cleanup.queueStatus = (await storage.peekQueueMessages(names.queueName)).status;
        record.cleanup.tableStatus = (await storage.getTableEntity(names.tableName, 'claims', sample.event.id)).status;
        record.cleanup.eventStatus = (await publish([sample.event])).status;
        assert.ok(['blobStatus', 'queueStatus', 'tableStatus', 'eventStatus'].every(key => record.cleanup[key] === 404));
      }
    }
  } catch (e) { record.cleanup.error = { name: e.name, message: e.message }; }
  for (const server of servers.reverse()) { server.closeAllConnections(); await new Promise(ok => server.close(ok)); }
  await runtime.dispose();
  for (const name of containers) { try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch {} }
  // Keep only the reviewed evidence allowlist; local credentials and provider state are disposable.
  for (const path of ['task', 'certs', 'shims', 'context.json']) await rm(resolve(output, path), { recursive: true, force: true });
  record.localFilesRemoved = true;
  record.completedAt = new Date().toISOString();
  record.ok = record.error === null && !record.cleanup.error && record.episodes.length === 7 && record.cleanup.eventStatus === 404;
  await save();
  console.log(JSON.stringify({ ok: record.ok, episodes: record.episodes.length, error: record.error, cleanup: record.cleanup, output }, null, 2));
  if (!record.ok) process.exitCode = 1;
}
