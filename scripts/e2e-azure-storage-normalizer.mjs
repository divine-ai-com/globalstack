import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AzuriteClient } from '../packages/azure-data-plane/src/azurite-client.mjs';
import { listenStorageProxy } from '../packages/azure-data-plane/src/storage-proxy.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-storage-normalizer');
const containerName = 'globalstack-azurite-e2e';

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      env: opts.env ?? process.env,
      stdio: opts.stdio ?? 'pipe',
    });
    const timeoutMs = opts.timeoutMs ?? 120000;
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms` });
    }, timeoutMs);
    if (child.stdout) child.stdout.on('data', chunk => { stdout += chunk; });
    if (child.stderr) child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function dockerCommand() {
  const direct = await run('docker', ['info'], { stdio: 'ignore' });
  if (direct.code === 0) return { command: 'docker', prefix: [] };
  const sudo = await run('sudo', ['-n', 'docker', 'info'], { stdio: 'ignore' });
  if (sudo.code === 0) return { command: 'sudo', prefix: ['-n', 'docker'] };
  throw new Error('Docker is required for the storage normalizer E2E test but is not available.');
}

async function removeAzurite(docker) {
  await run(docker.command, [...docker.prefix, 'rm', '-f', containerName], { stdio: 'ignore' });
}

async function startAzurite(docker) {
  await removeAzurite(docker);
  const result = await run(docker.command, [
    ...docker.prefix,
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-p',
    '10000:10000',
    '-p',
    '10001:10001',
    '-p',
    '10002:10002',
    'mcr.microsoft.com/azure-storage/azurite',
    'azurite',
    '--blobHost',
    '0.0.0.0',
    '--queueHost',
    '0.0.0.0',
    '--tableHost',
    '0.0.0.0',
  ]);
  if (result.code !== 0) {
    throw new Error(`Failed to start Azurite: ${result.stderr || result.stdout}`);
  }
}

async function waitForPort(port, timeoutMs = 90000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const connected = await new Promise(resolve => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(false));
    });
    if (connected) return;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`Azurite did not become reachable on port ${port}.`);
}

function errorCode(response) {
  return response.headers['x-ms-error-code'] ?? null;
}

function assertStatusAndCode(response, status, code, label) {
  assert.equal(response.status, status, `${label}: HTTP status`);
  assert.equal(errorCode(response), code, `${label}: x-ms-error-code`);
}

function markdown(report) {
  const lines = [
    '# Azure Storage Normalizer E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '| Step | Status | HTTP | Error Code | Detail |',
    '|---|---|---:|---|---|',
  ];
  for (const step of report.steps) {
    lines.push(`| ${step.name} | ${step.ok ? 'pass' : 'fail'} | ${step.httpStatus ?? ''} | ${step.errorCode ?? ''} | ${String(step.detail ?? '').replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function errorDetail(error) {
  if (!(error instanceof Error)) return String(error);
  return `${error.message}${error.stack ? `\n${error.stack}` : ''}`;
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise(resolve => server.close(resolve));
}

await mkdir(outRoot, { recursive: true });

const docker = await dockerCommand();
const steps = [];
let ok = false;
let blobProxy;
let queueProxy;

async function record(name, fn) {
  try {
    const response = await fn();
    steps.push({
      name,
      ok: true,
      httpStatus: response?.status ?? null,
      errorCode: response ? errorCode(response) : null,
      detail: response?.body ? response.body.slice(0, 180).replace(/\s+/g, ' ') : 'ok',
    });
    console.log(`PASS ${name}: HTTP ${response?.status ?? 'n/a'} ${response ? errorCode(response) ?? '' : ''}`);
    return response;
  } catch (error) {
    steps.push({
      name,
      ok: false,
      httpStatus: null,
      errorCode: null,
      detail: errorDetail(error),
    });
    console.log(`FAIL ${name}: ${errorDetail(error)}`);
    throw error;
  }
}

try {
  await startAzurite(docker);
  await waitForPort(10000);
  await waitForPort(10001);
  await new Promise(resolve => setTimeout(resolve, 1500));

  blobProxy = await listenStorageProxy({
    service: 'blob',
    targetEndpoint: 'http://127.0.0.1:10000',
  });
  queueProxy = await listenStorageProxy({
    service: 'queue',
    targetEndpoint: 'http://127.0.0.1:10001',
  });

  const blobPort = blobProxy.address().port;
  const queuePort = queueProxy.address().port;
  const raw = new AzuriteClient();
  const normalized = new AzuriteClient({
    blobEndpoint: `http://127.0.0.1:${blobPort}`,
    queueEndpoint: `http://127.0.0.1:${queuePort}`,
  });

  const suffix = Date.now().toString(36).slice(-8);
  const container = `normalizer-${suffix}`;
  const queue = `normalizer-${suffix}`;
  const blob = 'payload.json';
  const payload = JSON.stringify({ scenario: 'storage-normalizer', suffix });

  await record('blob create container through proxy', async () => {
    const response = await normalized.createContainer(container);
    assert.equal(response.status, 201);
    return response;
  });

  await record('raw azurite keeps missing blob type error-code gap', async () => {
    const response = await raw.putBlobRaw(container, 'missing-blob-type-raw.txt', 'no blob type', { 'content-type': 'text/plain' });
    assertStatusAndCode(response, 400, null, 'raw missing blob type');
    return response;
  });

  await record('proxy normalizes missing blob type to Azure', async () => {
    const response = await normalized.putBlobRaw(container, 'missing-blob-type-proxy.txt', 'no blob type', { 'content-type': 'text/plain' });
    assertStatusAndCode(response, 400, 'MissingRequiredHeader', 'proxy missing blob type');
    assert.equal(response.headers['x-globalstack-normalization-rule'], 'blob-missing-blob-type-header');
    return response;
  });

  await record('blob put block blob through proxy', async () => {
    const response = await normalized.putBlob(container, blob, payload, 'application/json');
    assert.equal(response.status, 201);
    return response;
  });

  await record('raw azurite differs for unauthenticated blob get', async () => {
    const response = await raw.getBlobWithoutAuthorization(container, blob);
    assertStatusAndCode(response, 403, 'AuthorizationFailure', 'raw unauthenticated blob get');
    return response;
  });

  await record('proxy normalizes unauthenticated blob get to Azure', async () => {
    const response = await normalized.getBlobWithoutAuthorization(container, blob);
    assertStatusAndCode(response, 401, 'NoAuthenticationInformation', 'proxy unauthenticated blob get');
    assert.equal(response.headers['x-globalstack-normalization-rule'], 'blob-get-without-authorization');
    return response;
  });

  await record('queue create through proxy', async () => {
    const response = await normalized.createQueue(queue);
    assert.equal(response.status, 201);
    return response;
  });

  await record('raw azurite keeps malformed queue XML error-code gap', async () => {
    const response = await raw.putQueueMessageRaw(queue, '<QueueMessage><MessageText>unterminated');
    assertStatusAndCode(response, 400, null, 'raw malformed queue XML');
    return response;
  });

  await record('proxy normalizes malformed queue XML to Azure', async () => {
    const response = await normalized.putQueueMessageRaw(queue, '<QueueMessage><MessageText>unterminated');
    assertStatusAndCode(response, 400, 'InvalidXmlDocument', 'proxy malformed queue XML');
    assert.equal(response.headers['x-globalstack-normalization-rule'], 'queue-malformed-message');
    return response;
  });

  await record('queue put message through proxy', async () => {
    const response = await normalized.putQueueMessage(queue, `ready:${suffix}`);
    assert.equal(response.status, 201);
    return response;
  });

  await record('queue delete through proxy', async () => {
    const response = await normalized.deleteQueue(queue);
    assert.equal(response.status, 204);
    return response;
  });

  await record('queue peek after delete remains unnormalized gap', async () => {
    const response = await normalized.peekQueueMessages(queue);
    assertStatusAndCode(response, 404, 'QueueNotFound', 'peek deleted queue');
    assert.equal(response.headers['x-globalstack-normalization-rule'], undefined);
    return response;
  });

  ok = true;
} catch {
  ok = false;
} finally {
  await closeServer(blobProxy);
  await closeServer(queueProxy);
  await removeAzurite(docker);
}

const report = {
  ok,
  generatedAt: new Date().toISOString(),
  scope: 'GlobalStack Azure Storage proxy normalization for real Azure captured Blob/Queue mismatches.',
  caveat: 'Only implemented for captured safe mismatches. Queue peek-after-delete is deliberately unnormalized until repeat Azure capture.',
  steps,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Storage normalizer E2E ${ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!ok) process.exit(1);
