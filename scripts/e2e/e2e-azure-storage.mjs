import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { AzuriteClient } from '../../packages/azure-data-plane/src/azurite-client.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-storage');
const containerName = 'globalstack-azurite-e2e';
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const accessToken = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      env: opts.env ?? process.env,
      stdio: opts.stdio ?? 'pipe',
    });
    const timeoutMs = opts.timeoutMs ?? 120000;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124, stdout, stderr: `${stderr}\nTimed out after ${timeoutMs}ms` });
    }, timeoutMs);
    let stdout = '';
    let stderr = '';
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
  throw new Error('Docker is required for the Azurite E2E test but is not available.');
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

async function waitForAzurite(timeoutMs = 90000) {
  const started = Date.now();
  for (const port of [10000, 10001, 10002]) {
    await waitForAzuritePort(port, Math.max(1000, timeoutMs - (Date.now() - started)));
  }
}

async function waitForAzuritePort(port, timeoutMs = 90000) {
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

function httpJson(port, method, path, body) {
  const url = `http://127.0.0.1:${port}${path}`;
  return fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async response => ({
    status: response.status,
    body: await response.text().then(text => {
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }),
  }));
}

async function waitForStorageAccountReady(port, resourceGroup, storageAccount, attempts = 6) {
  let latest;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await httpJson(
      port,
      'GET',
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccount}?api-version=2023-01-01`,
    );
    if (latest.status === 200 && latest.body?.properties?.provisioningState === 'Succeeded') return latest;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  return latest;
}

async function withArmServer(fn) {
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

function markdown(report) {
  const lines = [
    '# Azure Storage E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '| Step | Status | Detail |',
    '|---|---|---|',
  ];
  for (const step of report.steps) {
    lines.push(`| ${step.name} | ${step.ok ? 'pass' : 'fail'} | ${step.detail.replace(/\|/g, '\\|')} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function errorDetail(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error
    ? `\nCause: ${error.cause.message}`
    : error.cause === undefined
      ? ''
      : `\nCause: ${JSON.stringify(error.cause)}`;
  return `${error.message}${cause}${error.stack ? `\n${error.stack}` : ''}`;
}

await mkdir(outRoot, { recursive: true });

const docker = await dockerCommand();
const steps = [];
let ok = false;

function record(name, passed, detail) {
  steps.push({ name, ok: passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
}

try {
  await startAzurite(docker);
  record('start azurite', true, 'Azurite container started on ports 10000, 10001, 10002');
  await waitForAzurite();
  record('wait for azurite', true, 'Blob endpoint reachable');
  await new Promise(resolve => setTimeout(resolve, 1500));

  await withArmServer(async (armPort) => {
    const suffix = Date.now().toString(36).slice(-6);
    const resourceGroup = `rg-gs-e2e-${suffix}`;
    const storageAccount = `gse2e${suffix}`.slice(0, 24);
    const blobContainer = `features-${suffix}`;
    const queueName = `queue${suffix}`.toLowerCase();
    const tableName = `Features${suffix.replace(/[^A-Za-z0-9]/g, '')}`;
    const blobName = 'feature-batch.json';
    const blobPayload = JSON.stringify({ workflow: 'mlops-feature-intake', suffix });

    const rg = await httpJson(armPort, 'PUT', `/subscriptions/${subscriptionId}/resourcegroups/${resourceGroup}?api-version=2021-04-01`, {
      location: 'eastus',
      tags: { purpose: 'globalstack-e2e', ttl: 'ephemeral' },
    });
    assert.equal(rg.status, 201);
    record('arm create resource group', true, rg.body.id);

    const sa = await httpJson(
      armPort,
      'PUT',
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccount}?api-version=2023-01-01`,
      {
        location: 'eastus',
        sku: { name: 'Standard_LRS' },
        kind: 'StorageV2',
        properties: { allowBlobPublicAccess: false },
      },
    );
    assert.equal(sa.status, 202);
    const readyStorageAccount = await waitForStorageAccountReady(armPort, resourceGroup, storageAccount);
    assert.equal(readyStorageAccount.status, 200);
    assert.equal(readyStorageAccount.body.properties.provisioningState, 'Succeeded');
    assert.equal(readyStorageAccount.body.globalstack.capabilityId, 'blob-storage');
    record('arm create storage account', true, `${readyStorageAccount.body.id} mapped to ${readyStorageAccount.body.globalstack.capabilityId}`);

    const armContainer = await httpJson(
      armPort,
      'PUT',
      `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccount}/blobServices/default/containers/${blobContainer}?api-version=2023-01-01`,
      { properties: { publicAccess: 'None' } },
    );
    assert.equal(armContainer.status, 201);
    assert.equal(armContainer.body.globalstack.capabilityId, 'blob-storage');
    record('arm create blob container resource', true, armContainer.body.id);

    const azurite = new AzuriteClient();
    const createContainer = await azurite.createContainer(blobContainer);
    assert.ok([201, 202].includes(createContainer.status), createContainer.body);
    record('azurite create blob container', true, `HTTP ${createContainer.status}`);

    const putBlob = await azurite.putBlob(blobContainer, blobName, blobPayload, 'application/json');
    assert.ok([201, 202].includes(putBlob.status), putBlob.body);
    record('azurite put blob', true, `HTTP ${putBlob.status}`);

    const getBlob = await azurite.getBlob(blobContainer, blobName);
    assert.equal(getBlob.status, 200, getBlob.body);
    assert.equal(getBlob.body, blobPayload);
    record('azurite get blob', true, 'Payload round-tripped');

    const createQueue = await azurite.createQueue(queueName);
    assert.ok([201, 202, 204].includes(createQueue.status), createQueue.body);
    record('azurite create queue', true, `HTTP ${createQueue.status}`);

    const messageText = `feature-ready:${suffix}`;
    const putMessage = await azurite.putQueueMessage(queueName, messageText);
    assert.ok([201, 202].includes(putMessage.status), putMessage.body);
    record('azurite put queue message', true, `HTTP ${putMessage.status}`);

    const peekMessage = await azurite.peekQueueMessages(queueName);
    assert.equal(peekMessage.status, 200, peekMessage.body);
    assert.ok(peekMessage.body.includes(Buffer.from(messageText).toString('base64')), peekMessage.body);
    record('azurite peek queue message', true, 'Queue message round-tripped');

    const createTable = await azurite.createTable(tableName);
    assert.ok([201, 204].includes(createTable.status), createTable.body);
    record('azurite create table', true, `HTTP ${createTable.status}`);

    const insertEntity = await azurite.insertTableEntity(tableName, {
      PartitionKey: 'mlops',
      RowKey: `feature-${suffix}`,
      Workflow: 'feature-intake',
    });
    assert.ok([201, 204].includes(insertEntity.status), insertEntity.body);
    record('azurite insert table entity', true, `HTTP ${insertEntity.status}`);

    const getEntity = await azurite.getTableEntity(tableName, 'mlops', `feature-${suffix}`);
    assert.equal(getEntity.status, 200, getEntity.body);
    assert.match(getEntity.body, /"PartitionKey":"mlops"/);
    record('azurite get table entity', true, 'Table entity round-tripped');

    const coverage = await httpJson(armPort, 'GET', '/_globalstack/coverage');
    assert.equal(coverage.status, 200);
    const blobStorage = coverage.body.capabilities.find(item => item.id === 'blob-storage');
    assert.ok(blobStorage);
    assert.equal(blobStorage.cloudValidated, false);
    assert.ok(blobStorage.knownGaps.length > 0);
    record('coverage explicit gaps', true, 'blob-storage remains explicit about non-cloud-validated gaps');
  });

  ok = true;
} catch (error) {
  record('e2e failure', false, errorDetail(error));
} finally {
  await removeAzurite(docker);
  record('cleanup azurite', true, 'Azurite container removed');
}

const report = {
  ok,
  generatedAt: new Date().toISOString(),
  scope: 'ARM facade + Azurite Blob/Queue/Table data plane',
  steps,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Storage E2E ${ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!ok) process.exit(1);
