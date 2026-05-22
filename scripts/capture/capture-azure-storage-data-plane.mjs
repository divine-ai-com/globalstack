import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { AzuriteClient } from '../../packages/azure-data-plane/src/azurite-client.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-storage-data-plane-captures');
const reportRoot = join(root, 'docs', 'coverage');
const distRoot = join(root, 'dist', 'captures', 'azure-storage-data-plane');
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID ?? process.env.ARM_SUBSCRIPTION_ID;
const location = process.env.AZURE_LOCATION ?? 'eastus';
const cleanupVerifyAttempts = Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_ATTEMPTS ?? 120);
const cleanupVerifyDelayMs = Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_DELAY_MS ?? 5000);
const requestTimeoutMs = Number(process.env.GLOBALSTACK_AZURE_REQUEST_TIMEOUT_MS ?? 300000);
let accessToken;

if (process.env.GLOBALSTACK_REAL_AZURE_CONFORMANCE !== '1') {
  throw new Error('Set GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 before running real Azure storage data-plane capture.');
}
if (!subscriptionId) {
  throw new Error('Set AZURE_SUBSCRIPTION_ID before running real Azure storage data-plane capture.');
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

function suffixFor(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 10);
}

function sanitizeText(value, replacements) {
  if (value === null || value === undefined) return value;
  let out = String(value);
  for (const [needle, replacement] of replacements) {
    if (needle) out = out.split(needle).join(replacement);
  }
  out = out.replace(/([?&](?:c|s|h|t)=)[^&"\s]+/g, '$1<redacted>');
  return out;
}

function sanitize(value, replacements) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(item => sanitize(item, replacements));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      const lower = key.toLowerCase();
      out[key] = lower.includes('secret') || lower.includes('password') || lower.includes('token') || lower.includes('key') || lower.includes('authorization')
        ? '<redacted>'
        : sanitize(nested, replacements);
    }
    return out;
  }
  return sanitizeText(value, replacements);
}

function sanitizeHeaders(headers = {}, replacements) {
  const keep = new Set([
    'content-type',
    'date',
    'etag',
    'location',
    'retry-after',
    'server',
    'x-ms-error-code',
    'x-ms-request-id',
    'x-ms-version',
    'x-ms-version-id',
  ]);
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('token') || lower.includes('key')) continue;
    if (keep.has(lower) || lower.startsWith('x-ms-')) out[key] = sanitizeText(value, replacements);
  }
  return out;
}

async function armRequest(method, path, body, replacements = []) {
  const token = await getAccessToken();
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      response = await fetch(`https://management.azure.com${path}`, {
        method,
        signal: AbortSignal.timeout(requestTimeoutMs),
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: body === undefined || body === null ? undefined : JSON.stringify(body),
      });
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`ARM ${method} ${path.replace(subscriptionId, '<subscription-id>')} retry ${attempt + 1}: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
    }
  }
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 1000);
  }
  const result = {
    status: response.status,
    ok: response.ok,
    headers: sanitizeHeaders(Object.fromEntries(response.headers.entries()), replacements),
    body: sanitize(parsed, replacements),
  };
  Object.defineProperty(result, 'rawBody', {
    value: parsed,
    enumerable: false,
  });
  return result;
}

async function waitForStorageAccountReady(storageAccountPath, replacements) {
  let latest;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    latest = await armRequest('GET', storageAccountPath, null, replacements);
    console.log(`storage-account.wait-ready.${attempt + 1}: HTTP ${latest.status} ${latest.body?.properties?.provisioningState ?? ''}`);
    if (latest.status === 200 && latest.body?.properties?.provisioningState === 'Succeeded') return latest;
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  throw new Error('Storage account did not reach provisioningState=Succeeded before data-plane capture.');
}

function errorCode(response) {
  return response.headers?.['x-ms-error-code'] ?? response.headers?.['x-ms-error-Code'] ?? null;
}

function responseShape(response, replacements) {
  return {
    status: response.status,
    errorCode: errorCode(response),
    headers: sanitizeHeaders(response.headers, replacements),
    body: sanitizeText(response.body, replacements)?.slice(0, 2000) ?? '',
  };
}

async function captureCase(cases, id, description, fn, replacements) {
  const response = await fn();
  const captured = {
    id,
    description,
    response: responseShape(response, replacements),
  };
  cases.push(captured);
  console.log(`${id}: HTTP ${captured.response.status} ${captured.response.errorCode ?? ''}`);
  return response;
}

async function readAzuriteResults() {
  const path = join(root, 'dist', 'e2e', 'azure-storage-hardening', 'results.json');
  try {
    const doc = JSON.parse(await readFile(path, 'utf8'));
    return Object.fromEntries((doc.steps ?? []).map(step => [step.name, step]));
  } catch {
    return {};
  }
}

function compareToAzurite(cases, azuriteByName) {
  const byName = {
    'blob-invalid-container-uppercase': 'blob invalid container name ABc',
    'blob-invalid-container-too-short': 'blob invalid container name ab',
    'blob-invalid-container-leading-dash': 'blob invalid container name -bad',
    'blob-invalid-container-trailing-dash': 'blob invalid container name bad-',
    'blob-invalid-container-consecutive-dash': 'blob invalid container name bad--name',
    'blob-duplicate-container-create': 'blob duplicate container create rejected',
    'blob-missing-blob': 'blob missing blob rejected',
    'blob-missing-container': 'blob missing container rejected',
    'blob-missing-blob-type-header': 'blob missing blob type header rejected',
    'blob-get-without-authorization': 'blob get without authorization rejected',
    'blob-get-after-delete': 'blob get after delete rejected',
    'queue-invalid-uppercase': 'queue invalid queue name ABc',
    'queue-invalid-too-short': 'queue invalid queue name ab',
    'queue-invalid-leading-dash': 'queue invalid queue name -bad',
    'queue-invalid-trailing-dash': 'queue invalid queue name bad-',
    'queue-invalid-consecutive-dash': 'queue invalid queue name bad--name',
    'queue-duplicate-create': 'queue duplicate create is idempotent',
    'queue-missing-metadata': 'queue missing queue metadata rejected',
    'queue-malformed-message': 'queue malformed message rejected',
    'queue-peek-after-delete': 'queue peek after delete rejected',
  };
  return cases
    .filter(item => byName[item.id])
    .map(item => {
      const local = azuriteByName[byName[item.id]];
      return {
        id: item.id,
        azuriteStep: byName[item.id],
        azureStatus: item.response.status,
        azureErrorCode: item.response.errorCode,
        azuriteStatus: local?.httpStatus ?? null,
        azuriteErrorCode: local?.errorCode ?? null,
        matchesStatus: local ? local.httpStatus === item.response.status : null,
        matchesErrorCode: local ? (local.errorCode ?? null) === (item.response.errorCode ?? null) : null,
      };
    });
}

function markdown(fixture, comparison) {
  const lines = [
    '# Azure Storage Data-Plane Capture Wave 1',
    '',
    `Captured: ${fixture.capturedAt}`,
    `Cleanup verified: ${fixture.cleanup.verifiedDeleted ? 'yes' : 'no'}`,
    '',
    'This report records real Azure Blob/Queue data-plane behavior for the first storage hardening wave. It does not mark storage as `cloudValidated`; mismatches remain explicit gaps until normalized into local expectations.',
    '',
    '## Azure Cases',
    '',
    '| Case | HTTP | Error Code |',
    '|---|---:|---|',
  ];
  for (const item of fixture.cases) {
    lines.push(`| ${item.id} | ${item.response.status} | ${item.response.errorCode ?? ''} |`);
  }
  lines.push('', '## Azurite Comparison', '', '| Case | Azure | Azurite | Status Match | Error Match |', '|---|---|---|---|---|');
  for (const item of comparison) {
    lines.push(`| ${item.id} | ${item.azureStatus} ${item.azureErrorCode ?? ''} | ${item.azuriteStatus ?? ''} ${item.azuriteErrorCode ?? ''} | ${item.matchesStatus === true ? 'yes' : item.matchesStatus === false ? 'no' : 'n/a'} | ${item.matchesErrorCode === true ? 'yes' : item.matchesErrorCode === false ? 'no' : 'n/a'} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const suffix = suffixFor(`storage-data-plane-${new Date().toISOString()}`);
const resourceGroupName = `rg-gs-store-${suffix}`;
const storageAccountName = `gsstore${suffix}`.slice(0, 24);
const container = `hardening-${suffix}`;
const queue = `hardening-${suffix}`;
const blob = 'payload.json';
const payload = JSON.stringify({ scenario: 'storage-data-plane-capture', suffix });
const replacements = [
  [subscriptionId, '<subscription-id>'],
  [resourceGroupName, '<resource-group>'],
  [storageAccountName, '<storage-account>'],
];
const rgPath = `/subscriptions/${subscriptionId}/resourcegroups/${resourceGroupName}?api-version=2021-04-01`;
const storageAccountPath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}?api-version=2023-01-01`;
const listKeysPath = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/listKeys?api-version=2023-01-01`;
const setup = [];
const cases = [];
const cleanup = {
  attempted: false,
  status: null,
  verificationStatus: null,
  verifiedDeleted: false,
};

try {
  setup.push({
    id: 'resource-group.create',
    response: await armRequest('PUT', rgPath, { location, tags: { purpose: 'globalstack-storage-data-plane-capture', ttl: 'ephemeral' } }, replacements),
  });
  console.log(`resource-group.create: HTTP ${setup.at(-1).response.status}`);
  setup.push({
    id: 'storage-account.create',
    response: await armRequest('PUT', storageAccountPath, {
      location,
      sku: { name: 'Standard_LRS' },
      kind: 'StorageV2',
      properties: {
        allowBlobPublicAccess: false,
        allowSharedKeyAccess: true,
      },
    }, replacements),
  });
  console.log(`storage-account.create: HTTP ${setup.at(-1).response.status}`);
  setup.push({
    id: 'storage-account.ready',
    response: await waitForStorageAccountReady(storageAccountPath, replacements),
  });
  const listKeys = await armRequest('POST', listKeysPath, null, replacements);
  setup.push({ id: 'storage-account.list-keys', response: { ...listKeys, body: '<redacted>' } });
  const accountKey = listKeys.rawBody?.keys?.[0]?.value;
  if (!accountKey) throw new Error(`Unable to list storage account keys: HTTP ${listKeys.status}`);

  const client = new AzuriteClient({
    account: { name: storageAccountName, key: accountKey },
    blobEndpoint: `https://${storageAccountName}.blob.core.windows.net`,
    queueEndpoint: `https://${storageAccountName}.queue.core.windows.net`,
    pathStyle: false,
  });

  await captureCase(cases, 'blob-invalid-container-uppercase', 'Create container with uppercase name.', () => client.createContainer('ABc'), replacements);
  await captureCase(cases, 'blob-invalid-container-too-short', 'Create container with two-character name.', () => client.createContainer('ab'), replacements);
  await captureCase(cases, 'blob-invalid-container-leading-dash', 'Create container with leading dash.', () => client.createContainer('-bad'), replacements);
  await captureCase(cases, 'blob-invalid-container-trailing-dash', 'Create container with trailing dash.', () => client.createContainer('bad-'), replacements);
  await captureCase(cases, 'blob-invalid-container-consecutive-dash', 'Create container with consecutive dash.', () => client.createContainer('bad--name'), replacements);
  await captureCase(cases, 'blob-create-container', 'Create valid container.', () => client.createContainer(container), replacements);
  await captureCase(cases, 'blob-duplicate-container-create', 'Create duplicate container.', () => client.createContainer(container), replacements);
  await captureCase(cases, 'blob-missing-blob', 'Read missing blob.', () => client.getBlob(container, 'missing.json'), replacements);
  await captureCase(cases, 'blob-missing-container', 'Put blob into missing container.', () => client.putBlob(`missing-${suffix}`, blob, payload, 'application/json'), replacements);
  await captureCase(cases, 'blob-missing-blob-type-header', 'Put blob without x-ms-blob-type.', () => client.putBlobRaw(container, 'missing-blob-type.txt', 'no blob type', { 'content-type': 'text/plain' }), replacements);
  await captureCase(cases, 'blob-put-block-blob', 'Put valid block blob.', () => client.putBlob(container, blob, payload, 'application/json'), replacements);
  await captureCase(cases, 'blob-get-without-authorization', 'Read blob without Authorization header.', () => client.getBlobWithoutAuthorization(container, blob), replacements);
  await captureCase(cases, 'blob-get-payload', 'Read valid blob.', () => client.getBlob(container, blob), replacements);
  await captureCase(cases, 'blob-list-containers', 'List containers.', () => client.listContainers(), replacements);
  await captureCase(cases, 'blob-delete-blob', 'Delete blob.', () => client.deleteBlob(container, blob), replacements);
  await captureCase(cases, 'blob-get-after-delete', 'Read blob after delete.', () => client.getBlob(container, blob), replacements);
  await captureCase(cases, 'blob-delete-container', 'Delete container.', () => client.deleteContainer(container), replacements);
  await captureCase(cases, 'blob-get-container-after-delete', 'Read container after delete.', () => client.getContainerProperties(container), replacements);

  await captureCase(cases, 'queue-invalid-uppercase', 'Create queue with uppercase name.', () => client.createQueue('ABc'), replacements);
  await captureCase(cases, 'queue-invalid-too-short', 'Create queue with two-character name.', () => client.createQueue('ab'), replacements);
  await captureCase(cases, 'queue-invalid-leading-dash', 'Create queue with leading dash.', () => client.createQueue('-bad'), replacements);
  await captureCase(cases, 'queue-invalid-trailing-dash', 'Create queue with trailing dash.', () => client.createQueue('bad-'), replacements);
  await captureCase(cases, 'queue-invalid-consecutive-dash', 'Create queue with consecutive dash.', () => client.createQueue('bad--name'), replacements);
  await captureCase(cases, 'queue-create', 'Create valid queue.', () => client.createQueue(queue), replacements);
  await captureCase(cases, 'queue-duplicate-create', 'Create duplicate queue.', () => client.createQueue(queue), replacements);
  await captureCase(cases, 'queue-missing-metadata', 'Read metadata for missing queue.', () => client.getQueueMetadata(`missing-${suffix}`), replacements);
  await captureCase(cases, 'queue-malformed-message', 'Put malformed queue message XML.', () => client.putQueueMessageRaw(queue, '<QueueMessage><MessageText>unterminated'), replacements);
  await captureCase(cases, 'queue-put-message', 'Put valid queue message.', () => client.putQueueMessage(queue, `ready:${suffix}`), replacements);
  await captureCase(cases, 'queue-peek-message', 'Peek queue message.', () => client.peekQueueMessages(queue), replacements);
  await captureCase(cases, 'queue-list', 'List queues.', () => client.listQueues(), replacements);
  await captureCase(cases, 'queue-delete', 'Delete queue.', () => client.deleteQueue(queue), replacements);
  await captureCase(cases, 'queue-peek-after-delete', 'Peek queue after delete.', () => client.peekQueueMessages(queue), replacements);
} finally {
  const deleteResponse = await armRequest('DELETE', rgPath, null, replacements);
  cleanup.attempted = true;
  cleanup.status = deleteResponse.status;
  for (let attempt = 0; attempt < cleanupVerifyAttempts; attempt += 1) {
    const verify = await armRequest('GET', rgPath, null, replacements);
    cleanup.verificationStatus = verify.status;
    if (verify.status === 404) {
      cleanup.verifiedDeleted = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, cleanupVerifyDelayMs));
  }
}

const azuriteByName = await readAzuriteResults();
const comparison = compareToAzurite(cases, azuriteByName);
const fixture = {
  id: 'storage-data-plane-blob-queue-wave-1',
  capturedAt: new Date().toISOString(),
  target: 'azure',
  location,
  subscriptionId: '<subscription-id>',
  resourceGroupName: '<resource-group>',
  storageAccountName: '<storage-account>',
  cleanup,
  setup: sanitize(setup, replacements),
  cases,
  comparison,
  globalstack: {
    validationDepth: 'live-data-plane',
    cloudValidated: false,
    caveat: 'Real Azure data-plane capture wave. Normalize into local expectations and document Azurite mismatches before changing support claims.',
  },
};

await mkdir(fixtureRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });
await mkdir(distRoot, { recursive: true });
await writeFile(join(fixtureRoot, 'storage-data-plane-blob-queue-wave-1.json'), `${JSON.stringify(fixture, null, 2)}\n`);
await writeFile(join(distRoot, 'storage-data-plane-blob-queue-wave-1.json'), `${JSON.stringify(fixture, null, 2)}\n`);
await writeFile(join(reportRoot, 'storage-data-plane-wave-1.md'), markdown(fixture, comparison));
console.log(`Storage data-plane capture complete: ${cleanup.verifiedDeleted ? 'cleanup verified' : 'cleanup not verified'}`);
if (!cleanup.verifiedDeleted) process.exit(1);
