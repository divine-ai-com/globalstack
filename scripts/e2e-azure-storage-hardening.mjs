import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AzuriteClient } from '../packages/azure-data-plane/src/azurite-client.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-storage-hardening');
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
  throw new Error('Docker is required for the Azurite hardening E2E test but is not available.');
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

function assertStatus(response, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  assert.ok(
    allowed.includes(response.status),
    `${label}: expected HTTP ${allowed.join('/')} but got ${response.status} (${errorCode(response) ?? 'no x-ms-error-code'}) ${response.body}`,
  );
}

function markdown(report) {
  const lines = [
    '# Azure Storage Hardening E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '| Case | Status | HTTP | Error Code | Detail |',
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

await mkdir(outRoot, { recursive: true });

const docker = await dockerCommand();
const client = new AzuriteClient();
const steps = [];
let ok = false;

async function record(name, fn) {
  try {
    const response = await fn();
    steps.push({
      name,
      ok: true,
      httpStatus: response?.status ?? null,
      errorCode: response ? errorCode(response) : null,
      detail: response?.body ? response.body.slice(0, 200).replace(/\s+/g, ' ') : 'ok',
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
  await waitForPort(10002);
  await new Promise(resolve => setTimeout(resolve, 1500));

  const suffix = Date.now().toString(36).slice(-8);
  const container = `hardening-${suffix}`;
  const queue = `hardening-${suffix}`;
  const table = `Hardening${suffix.replace(/[^A-Za-z0-9]/g, '')}`;
  const blob = 'payload.json';
  const payload = JSON.stringify({ scenario: 'storage-hardening', suffix });

  for (const invalidName of ['ABc', 'ab', '-bad', 'bad-', 'bad--name']) {
    await record(`blob invalid container name ${invalidName}`, async () => {
      const response = await client.createContainer(invalidName);
      assertStatus(response, 400, invalidName);
      return response;
    });
  }

  await record('blob create container', async () => {
    const response = await client.createContainer(container);
    assertStatus(response, 201, 'create container');
    return response;
  });

  await record('blob duplicate container create rejected', async () => {
    const response = await client.createContainer(container);
    assertStatus(response, 409, 'duplicate container');
    assert.equal(errorCode(response), 'ContainerAlreadyExists');
    return response;
  });

  await record('blob missing blob rejected', async () => {
    const response = await client.getBlob(container, 'missing.json');
    assertStatus(response, 404, 'missing blob');
    assert.equal(errorCode(response), 'BlobNotFound');
    return response;
  });

  await record('blob missing container rejected', async () => {
    const response = await client.putBlob(`missing-${suffix}`, blob, payload, 'application/json');
    assertStatus(response, 404, 'missing blob container');
    assert.equal(errorCode(response), 'ContainerNotFound');
    return response;
  });

  await record('blob missing blob type header rejected', async () => {
    const response = await client.putBlobRaw(container, 'missing-blob-type.txt', 'no blob type', { 'content-type': 'text/plain' });
    assertStatus(response, 400, 'missing blob type');
    return response;
  });

  await record('blob put block blob', async () => {
    const response = await client.putBlob(container, blob, payload, 'application/json');
    assertStatus(response, 201, 'put block blob');
    return response;
  });

  await record('blob get without authorization rejected', async () => {
    const response = await client.getBlobWithoutAuthorization(container, blob);
    assertStatus(response, 403, 'get blob without authorization');
    assert.equal(errorCode(response), 'AuthorizationFailure');
    return response;
  });

  await record('blob get payload', async () => {
    const response = await client.getBlob(container, blob);
    assertStatus(response, 200, 'get blob');
    assert.equal(response.body, payload);
    return response;
  });

  await record('blob list containers includes created container', async () => {
    const response = await client.listContainers();
    assertStatus(response, 200, 'list containers');
    assert.match(response.body, new RegExp(`<Name>${container}</Name>`));
    return response;
  });

  await record('blob delete blob', async () => {
    const response = await client.deleteBlob(container, blob);
    assertStatus(response, 202, 'delete blob');
    return response;
  });

  await record('blob get after delete rejected', async () => {
    const response = await client.getBlob(container, blob);
    assertStatus(response, 404, 'get deleted blob');
    assert.equal(errorCode(response), 'BlobNotFound');
    return response;
  });

  await record('blob delete container', async () => {
    const response = await client.deleteContainer(container);
    assertStatus(response, 202, 'delete container');
    return response;
  });

  await record('blob get container after delete rejected', async () => {
    const response = await client.getContainerProperties(container);
    assertStatus(response, 404, 'get deleted container');
    assert.equal(errorCode(response), 'ContainerNotFound');
    return response;
  });

  for (const invalidName of ['ABc', 'ab', '-bad', 'bad-', 'bad--name']) {
    await record(`queue invalid queue name ${invalidName}`, async () => {
      const response = await client.createQueue(invalidName);
      assertStatus(response, 400, invalidName);
      return response;
    });
  }

  await record('queue create', async () => {
    const response = await client.createQueue(queue);
    assertStatus(response, 201, 'create queue');
    return response;
  });

  await record('queue duplicate create is idempotent', async () => {
    const response = await client.createQueue(queue);
    assertStatus(response, 204, 'duplicate queue');
    return response;
  });

  await record('queue missing queue metadata rejected', async () => {
    const response = await client.getQueueMetadata(`missing-${suffix}`);
    assertStatus(response, 404, 'missing queue metadata');
    assert.equal(errorCode(response), 'QueueNotFound');
    return response;
  });

  await record('queue malformed message rejected', async () => {
    const response = await client.putQueueMessageRaw(queue, '<QueueMessage><MessageText>unterminated');
    assertStatus(response, 400, 'malformed queue message');
    return response;
  });

  await record('queue put message', async () => {
    const response = await client.putQueueMessage(queue, `ready:${suffix}`);
    assertStatus(response, 201, 'put message');
    return response;
  });

  await record('queue peek message', async () => {
    const response = await client.peekQueueMessages(queue);
    assertStatus(response, 200, 'peek message');
    assert.match(response.body, /<QueueMessagesList>/);
    return response;
  });

  await record('queue list includes created queue', async () => {
    const response = await client.listQueues();
    assertStatus(response, 200, 'list queues');
    assert.match(response.body, new RegExp(`<Name>${queue}</Name>`));
    return response;
  });

  await record('queue delete', async () => {
    const response = await client.deleteQueue(queue);
    assertStatus(response, 204, 'delete queue');
    return response;
  });

  await record('queue peek after delete rejected', async () => {
    const response = await client.peekQueueMessages(queue);
    assertStatus(response, 404, 'peek deleted queue');
    assert.equal(errorCode(response), 'QueueNotFound');
    return response;
  });

  for (const invalidName of ['1bad', 'ab', 'bad-name']) {
    await record(`table invalid table name ${invalidName}`, async () => {
      const response = await client.createTable(invalidName);
      assertStatus(response, 400, invalidName);
      return response;
    });
  }

  await record('table create', async () => {
    const response = await client.createTable(table);
    assertStatus(response, [201, 204], 'create table');
    return response;
  });

  await record('table duplicate create rejected', async () => {
    const response = await client.createTable(table);
    assertStatus(response, 409, 'duplicate table');
    return response;
  });

  await record('table insert entity', async () => {
    const response = await client.insertTableEntity(table, {
      PartitionKey: 'robotics',
      RowKey: `run-${suffix}`,
      Status: 'ready',
      Score: 99,
    });
    assertStatus(response, [201, 204], 'insert table entity');
    return response;
  });

  await record('table duplicate entity insert rejected', async () => {
    const response = await client.insertTableEntity(table, {
      PartitionKey: 'robotics',
      RowKey: `run-${suffix}`,
      Status: 'duplicate',
    });
    assertStatus(response, 409, 'duplicate table entity');
    return response;
  });

  await record('table get entity', async () => {
    const response = await client.getTableEntity(table, 'robotics', `run-${suffix}`);
    assertStatus(response, 200, 'get table entity');
    assert.match(response.body, /"PartitionKey":"robotics"/);
    assert.match(response.body, new RegExp(`"RowKey":"run-${suffix}"`));
    return response;
  });

  await record('table get without authorization rejected', async () => {
    const response = await client.getTableEntityWithoutAuthorization(table, 'robotics', `run-${suffix}`);
    assertStatus(response, [401, 403], 'get table entity without authorization');
    return response;
  });

  await record('table list includes created table', async () => {
    const response = await client.listTables();
    assertStatus(response, 200, 'list tables');
    assert.match(response.body, new RegExp(`"TableName":"${table}"`));
    return response;
  });

  await record('table delete entity', async () => {
    const response = await client.deleteTableEntity(table, 'robotics', `run-${suffix}`);
    assertStatus(response, 204, 'delete table entity');
    return response;
  });

  await record('table get entity after delete rejected', async () => {
    const response = await client.getTableEntity(table, 'robotics', `run-${suffix}`);
    assertStatus(response, 404, 'get deleted table entity');
    return response;
  });

  await record('table delete', async () => {
    const response = await client.deleteTable(table);
    assertStatus(response, 204, 'delete table');
    return response;
  });

  await record('table insert after delete rejected', async () => {
    const response = await client.insertTableEntity(table, {
      PartitionKey: 'robotics',
      RowKey: 'post-delete',
      Status: 'missing-table',
    });
    assertStatus(response, 404, 'insert into deleted table');
    return response;
  });

  ok = true;
} catch {
  ok = false;
} finally {
  await removeAzurite(docker);
}

const report = {
  ok,
  generatedAt: new Date().toISOString(),
  scope: 'Azurite Blob/Queue/Table data-plane hardening: names, duplicates, auth, not-found, delete, malformed payloads',
  caveat: 'Official-emulator evidence only. Real Azure capture is still required before cloudValidated can be true.',
  steps,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Storage hardening E2E ${ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!ok) process.exit(1);
