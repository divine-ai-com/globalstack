import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'fixtures', 'azure-lifecycle-captures');
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID ?? process.env.ARM_SUBSCRIPTION_ID;
const location = process.env.AZURE_LOCATION ?? 'eastus';
const waitForReady = args.get('wait-ready') === 'true';
const cleanupVerifyAttempts = Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_ATTEMPTS ?? 120);
const cleanupVerifyDelayMs = Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_DELAY_MS ?? 5000);
const requestTimeoutMs = Number(process.env.GLOBALSTACK_AZURE_REQUEST_TIMEOUT_MS ?? 300000);
let accessToken;

if (process.env.GLOBALSTACK_REAL_AZURE_CONFORMANCE !== '1') {
  throw new Error('Set GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 before running real Azure lifecycle capture.');
}
if (!subscriptionId) {
  throw new Error('Set AZURE_SUBSCRIPTION_ID before running real Azure lifecycle capture.');
}

function run(command, commandArgs) {
  return new Promise(resolve => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function getAccessToken() {
  if (accessToken) return accessToken;
  const result = await run('az', [
    'account',
    'get-access-token',
    '--resource',
    'https://management.azure.com/',
    '--query',
    'accessToken',
    '--output',
    'tsv',
  ]);
  if (result.code !== 0 || !result.stdout.trim()) {
    throw new Error(`Unable to get Azure access token: ${result.stderr || result.stdout}`);
  }
  accessToken = result.stdout.trim();
  return accessToken;
}

function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const lower = key.toLowerCase();
      out[key] = lower.includes('secret') || lower.includes('password') || lower.includes('token') || lower.includes('key')
        ? '<redacted>'
        : sanitize(nested);
    }
    return out;
  }
  return value;
}

function sanitizeHeaders(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('token') || lower.includes('key')) continue;
    if (['x-ms-request-id', 'x-ms-correlation-request-id', 'x-ms-routing-request-id', 'location', 'azure-asyncoperation', 'retry-after', 'content-type'].includes(lower)) {
      out[key] = value;
    }
  }
  return out;
}

async function azureRequest(method, path, body) {
  const token = await getAccessToken();
  const response = await fetch(`https://management.azure.com${path}`, {
    method,
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 500);
  }
  return {
    status: response.status,
    ok: response.ok,
    headers: sanitizeHeaders(response.headers),
    body: sanitize(parsed),
  };
}

async function captureStep(steps, step) {
  const response = await azureRequest(step.method, step.path, step.body);
  const captured = {
    id: step.id,
    description: step.description,
    method: step.method,
    path: step.path.replace(subscriptionId, '<subscription-id>'),
    body: sanitize(step.body ?? null),
    response,
  };
  steps.push(captured);
  console.log(`${step.id}: HTTP ${response.status}`);
  return response;
}

async function waitForStorageAccountReady(steps, path) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await captureStep(steps, {
      id: `storage-account.wait-ready.${attempt + 1}`,
      description: 'Poll storage account until Azure reports Succeeded.',
      method: 'GET',
      path,
    });
    if (response.body?.properties?.provisioningState === 'Succeeded') return response;
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error('Storage account did not reach provisioningState=Succeeded before lifecycle child operations.');
}

function suffixFor(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

const suffix = suffixFor(`storage-lifecycle-${new Date().toISOString()}`);
const resourceGroupName = `rg-gs-life-${suffix}`;
const storageAccountName = `gslife${suffix}`.slice(0, 24);
const containerName = `c${suffix}`.slice(0, 63);
const queueName = `q${suffix}`.slice(0, 63);
const shareName = `share${suffix}`.slice(0, 63);
const tableName = `table${suffix}`.slice(0, 63);
const rgPath = `/subscriptions/${subscriptionId}/resourcegroups/${resourceGroupName}?api-version=2021-04-01`;
const base = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}`;

const steps = [];
const cleanup = {
  attempted: false,
  status: null,
  verificationStatus: null,
  verifiedDeleted: false,
};

try {
  await captureStep(steps, {
    id: 'resource-group.create',
    description: 'Create ephemeral lifecycle resource group.',
    method: 'PUT',
    path: rgPath,
    body: { location, tags: { purpose: 'globalstack-lifecycle', ttl: 'ephemeral' } },
  });
  const storageAccountPath = `${base}?api-version=2023-01-01`;
  await captureStep(steps, {
    id: 'storage-account.create',
    description: 'Create storage account parent.',
    method: 'PUT',
    path: storageAccountPath,
    body: { location, sku: { name: 'Standard_LRS' }, kind: 'StorageV2', properties: { allowBlobPublicAccess: false } },
  });
  await captureStep(steps, {
    id: 'storage-account.get-after-create',
    description: 'Read storage account after create.',
    method: 'GET',
    path: storageAccountPath,
  });
  if (waitForReady) {
    await waitForStorageAccountReady(steps, storageAccountPath);
  }

  const childSteps = [
    {
      id: 'blob-container',
      type: 'Microsoft.Storage/storageAccounts/blobServices/containers',
      path: `${base}/blobServices/default/containers/${containerName}?api-version=2023-01-01`,
      listPath: `${base}/blobServices/default/containers?api-version=2023-01-01`,
      body: { properties: { publicAccess: 'None' } },
    },
    {
      id: 'queue',
      type: 'Microsoft.Storage/storageAccounts/queueServices/queues',
      path: `${base}/queueServices/default/queues/${queueName}?api-version=2023-01-01`,
      listPath: `${base}/queueServices/default/queues?api-version=2023-01-01`,
      body: { properties: {} },
    },
    {
      id: 'file-share',
      type: 'Microsoft.Storage/storageAccounts/fileServices/shares',
      path: `${base}/fileServices/default/shares/${shareName}?api-version=2023-01-01`,
      listPath: `${base}/fileServices/default/shares?api-version=2023-01-01`,
      body: { properties: { shareQuota: 1 } },
    },
    {
      id: 'table',
      type: 'Microsoft.Storage/storageAccounts/tableServices/tables',
      path: `${base}/tableServices/default/tables/${tableName}?api-version=2023-01-01`,
      listPath: `${base}/tableServices/default/tables?api-version=2023-01-01`,
      body: { properties: {} },
    },
  ];

  for (const child of childSteps) {
    await captureStep(steps, {
      id: `${child.id}.create`,
      description: `Create ${child.type}.`,
      method: 'PUT',
      path: child.path,
      body: child.body,
    });
    await captureStep(steps, {
      id: `${child.id}.get-after-create`,
      description: `Read ${child.type} after create.`,
      method: 'GET',
      path: child.path,
    });
    await captureStep(steps, {
      id: `${child.id}.list-after-create`,
      description: `List ${child.type} after create.`,
      method: 'GET',
      path: child.listPath,
    });
  }

  for (const child of childSteps) {
    await captureStep(steps, {
      id: `${child.id}.delete`,
      description: `Delete ${child.type}.`,
      method: 'DELETE',
      path: child.path,
    });
    await captureStep(steps, {
      id: `${child.id}.get-after-delete`,
      description: `Read ${child.type} after delete.`,
      method: 'GET',
      path: child.path,
    });
  }

  await captureStep(steps, {
    id: 'storage-account.delete',
    description: 'Delete storage account parent.',
    method: 'DELETE',
    path: storageAccountPath,
  });
  await captureStep(steps, {
    id: 'storage-account.get-after-delete',
    description: 'Read storage account after delete.',
    method: 'GET',
    path: storageAccountPath,
  });
} finally {
  const deleteResponse = await azureRequest('DELETE', rgPath, null);
  cleanup.attempted = true;
  cleanup.status = deleteResponse.status;
  for (let attempt = 0; attempt < cleanupVerifyAttempts; attempt += 1) {
    const verify = await azureRequest('GET', rgPath, null);
    cleanup.verificationStatus = verify.status;
    if (verify.status === 404) {
      cleanup.verifiedDeleted = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, cleanupVerifyDelayMs));
  }
}

const fixture = {
  id: waitForReady ? 'storage-arm-lifecycle-ready' : 'storage-arm-lifecycle-immediate',
  capturedAt: new Date().toISOString(),
  target: 'azure',
  subscriptionId: '<subscription-id>',
  location,
  resourceGroupName,
  storageAccountName,
  cleanup,
  steps,
  globalstack: {
    validationDepth: 'live-lifecycle',
    cloudValidated: false,
    caveat: 'Sequence fixture validates observed Azure lifecycle responses for this run; local parity still requires normalized replay tests.',
  },
};

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, waitForReady ? 'storage-arm-lifecycle-ready.json' : 'storage-arm-lifecycle-immediate.json'), `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Storage lifecycle capture complete: ${cleanup.verifiedDeleted ? 'cleanup verified' : 'cleanup not verified'}`);
if (!cleanup.verifiedDeleted) process.exit(1);
