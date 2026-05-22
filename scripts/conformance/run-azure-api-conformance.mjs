import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { buildAzureLiveApiCatalog } from '../../packages/core/src/azure-live-api-catalog.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'conformance');
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const localExpectationsPath = join(root, 'fixtures', 'local-expectations', 'azure-derived-local-expectations.json');
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.length ? rest.join('=') : 'true'];
}));

const target = args.get('target') ?? 'local';
const capabilityFilter = args.get('capability');
const resourceTypeFilter = args.get('resource-type');
const operationFilter = args.get('operation');
const caseFilter = args.get('case');
const runAllAzure = args.get('all') === 'true';
const limit = Number(args.get('limit') ?? 0);
const emptyGuid = '00000000-0000-0000-0000-000000000000';
const configuredSubscriptionId = [process.env.AZURE_SUBSCRIPTION_ID, process.env.ARM_SUBSCRIPTION_ID]
  .find(value => value && value.trim())?.trim();
const configuredTenantId = [process.env.AZURE_TENANT_ID, process.env.ARM_TENANT_ID]
  .find(value => value && value.trim())?.trim();
let subscriptionId = configuredSubscriptionId ?? emptyGuid;
let tenantId = configuredTenantId ?? emptyGuid;
const location = process.env.AZURE_LOCATION ?? 'eastus';
const mysqlSeedLocation = process.env.GLOBALSTACK_AZURE_MYSQL_SEED_LOCATION ?? 'westus2';
const cleanupVerifyAttempts = Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_ATTEMPTS ?? 24);
const cleanupVerifyDelayMs = Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_DELAY_MS ?? 5000);
let azureAccessToken;
let localExpectationMap;
let azureAccountContext;

function run(command, commandArgs, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: opts.cwd ?? root,
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
  if (typeof value === 'string') {
    return value
      .replaceAll(subscriptionId, '<subscription-id>')
      .replaceAll(tenantId, '<tenant-id>');
  }
  return value;
}

function sanitizeOperationUrl(value) {
  const redacted = String(value)
    .replaceAll(subscriptionId, '<subscription-id>')
    .replaceAll(tenantId, '<tenant-id>');
  try {
    const url = new URL(redacted);
    const apiVersion = url.searchParams.get('api-version');
    url.search = apiVersion ? `api-version=${apiVersion}&redacted=true` : 'redacted=true';
    return url.toString();
  } catch {
    return redacted.replace(/\?.*$/, '?redacted=true');
  }
}

function suffixFor(value) {
  return createHash('sha256').update(String(value)).digest('hex').slice(0, 10);
}

function fixtureIdFor(call, variance) {
  return `${call.id}.${variance.id}`.replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function loadLocalExpectationMap() {
  if (localExpectationMap) return localExpectationMap;
  localExpectationMap = new Map();
  const text = await readFile(localExpectationsPath, 'utf8').catch(() => '');
  if (!text) return localExpectationMap;
  const parsed = JSON.parse(text);
  for (const expectation of parsed.expectations ?? []) {
    localExpectationMap.set(expectation.id, expectation);
  }
  return localExpectationMap;
}

function valuesFor(call, varianceId) {
  const suffix = suffixFor(`${call.capabilityId}-${call.resourceType}-${varianceId}`);
  return {
    subscriptionId,
    resourceGroupName: `rg-gs-conf-${suffix}`.slice(0, 60),
    location,
    tenantId,
    serverFarmId: `/subscriptions/${subscriptionId}/resourceGroups/rg-gs-conf-${suffix}/providers/Microsoft.Web/serverfarms/plan-${suffix}`,
    storageAccountsName: `gs${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24),
    containersName: `c${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 63),
    queuesName: `q${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 63),
    sharesName: `share${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 63),
    sitesName: `site-${suffix}`.slice(0, 60),
    serverfarmsName: `plan-${suffix}`.slice(0, 40),
    serviceName: `apim-${suffix}`.slice(0, 40),
    apisName: `api-${suffix}`.slice(0, 40),
    userAssignedIdentitiesName: `id-${suffix}`.slice(0, 40),
    roleAssignmentsName: '11111111-1111-4111-8111-111111111111',
    roleDefinitionsName: '22222222-2222-4222-8222-222222222222',
    vaultsName: `kv-${suffix}`.slice(0, 24),
    secretsName: `secret-${suffix}`.slice(0, 60),
    keysName: `key-${suffix}`.slice(0, 60),
    flexibleServersName: `db-${suffix}`.slice(0, 40),
    databasesName: `db${suffix}`.slice(0, 40),
    databaseAccountsName: `cosmos-${suffix}`.slice(0, 40),
    sqlDatabasesName: `sqldb${suffix}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40),
    tablesName: `table${suffix}`.slice(0, 40),
    namespacesName: `ns-${suffix}`.slice(0, 40),
    topicsName: `topic-${suffix}`.slice(0, 40),
    subscriptionsName: `sub-${suffix}`.slice(0, 40),
    eventSubscriptionsName: `sub-${suffix}`.slice(0, 40),
    registriesName: `acr${suffix}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40),
    managedClustersName: `aks-${suffix}`.slice(0, 40),
    workspacesName: `ws-${suffix}`.slice(0, 40),
    diagnosticSettingsName: `diag-${suffix}`.slice(0, 40),
    metricAlertsName: `alert-${suffix}`.slice(0, 40),
    actionGroupsName: `ag-${suffix}`.slice(0, 40),
    virtualNetworksName: `vnet-${suffix}`.slice(0, 40),
    privateEndpointsName: `pe-${suffix}`.slice(0, 40),
    privateDnsZonesName: `${suffix}.internal`,
    virtualNetworkLinksName: `link-${suffix}`.slice(0, 40),
    redisName: `redis-${suffix}`.slice(0, 40),
    redisEnterpriseName: `redisent-${suffix}`.slice(0, 40),
    workflowsName: `workflow-${suffix}`.slice(0, 40),
    dnsZonesName: `${suffix}.example.test`,
    AName: `a-${suffix}`.slice(0, 40),
    AAAAName: `aaaa-${suffix}`.slice(0, 40),
    CAAName: `caa-${suffix}`.slice(0, 40),
    CNAMEName: `cname-${suffix}`.slice(0, 40),
    MXName: `mx-${suffix}`.slice(0, 40),
    NSName: `ns-${suffix}`.slice(0, 40),
    PTRName: `ptr-${suffix}`.slice(0, 40),
    SOAName: '@',
    SRVName: `_service._tcp.${suffix}`.slice(0, 60),
    TXTName: `txt-${suffix}`.slice(0, 40),
    applicationGatewaysName: `agw-${suffix}`.slice(0, 40),
    loadBalancersName: `lb-${suffix}`.slice(0, 40),
    profilesName: `cdn-${suffix}`.slice(0, 40),
    afdEndpointsName: `afd-${suffix}`.slice(0, 40),
    endpointsName: `endpoint-${suffix}`.slice(0, 40),
    securityPoliciesName: `security-${suffix}`.slice(0, 40),
    ApplicationGatewayWebApplicationFirewallPoliciesName: `waf-${suffix}`.slice(0, 40),
    systemTopicsName: `system-${suffix}`.slice(0, 40),
    netAppAccountsName: `netapp-${suffix}`.slice(0, 40),
    capacityPoolsName: `pool-${suffix}`.slice(0, 40),
    volumesName: `volume-${suffix}`.slice(0, 40),
    eventhubsName: `hub-${suffix}`.slice(0, 40),
    sqlPoolsName: `sqlpool${suffix}`.slice(0, 40),
    configurationStoresName: `cfg${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 40),
    projectsName: `project-${suffix}`.slice(0, 40),
    managedEnvironmentsName: `env-${suffix}`.slice(0, 40),
    containerAppsName: `app-${suffix}`.slice(0, 40),
  };
}

function interpolate(value, replacements) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.replace(/\{([^}]+)\}/g, (_, key) => replacements[key] ?? `{${key}}`);
  }
  if (Array.isArray(value)) return value.map(item => interpolate(item, replacements));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, interpolate(nested, replacements)]));
  }
  return value;
}

async function httpJson(baseUrl, method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text.slice(0, 500);
  }
  return { status: response.status, body: parsed };
}

async function withLocalArm(fn) {
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function azRest(method, path, body) {
  void method;
  void path;
  void body;
  throw new Error('azRest is no longer used; use azureRequest so status codes and headers are captured directly.');
}

async function getAzureAccessToken() {
  if (azureAccessToken) return azureAccessToken;
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
  azureAccessToken = result.stdout.trim();
  return azureAccessToken;
}

async function getAzureAccountContext() {
  if (azureAccountContext) return azureAccountContext;
  const result = await run('az', ['account', 'show', '--output', 'json']);
  if (result.code !== 0 || !result.stdout.trim()) {
    throw new Error(`Unable to get Azure account context: ${result.stderr || result.stdout}`);
  }
  azureAccountContext = JSON.parse(result.stdout);
  return azureAccountContext;
}

function sanitizeHeaders(headers) {
  const out = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('token') || lower.includes('key')) continue;
    if (['x-ms-request-id', 'x-ms-correlation-request-id', 'x-ms-routing-request-id', 'location', 'azure-asyncoperation', 'retry-after', 'content-type'].includes(lower)) {
      out[key] = ['location', 'azure-asyncoperation'].includes(lower) ? sanitizeOperationUrl(value) : sanitize(value);
    }
  }
  return out;
}

async function azureRequest(method, path, body) {
  const token = await getAzureAccessToken();
  const targetUrl = String(path).startsWith('https://') ? String(path) : `https://management.azure.com${path}`;
  const response = await fetch(targetUrl, {
    method,
    signal: AbortSignal.timeout(Number(process.env.GLOBALSTACK_AZURE_REQUEST_TIMEOUT_MS ?? 300000)),
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
    body: sanitize(parsed),
    headers: sanitizeHeaders(response.headers),
    rawHeaders: Object.fromEntries(response.headers.entries()),
  };
}

function requestPath(call, replacements, { omitApiVersion = false, apiVersionOverride = null, pathTemplateOverride = null } = {}) {
  const path = interpolate(pathTemplateOverride ?? call.pathTemplate, replacements);
  return omitApiVersion ? path : `${path}?api-version=${apiVersionOverride ?? call.apiVersion}`;
}

function responseErrorCode(response) {
  return response.body?.error?.code ?? response.body?.code ?? null;
}

function adjustAzureBody(call, variance, body) {
  if (call.resourceType === 'Microsoft.DBforMySQL/flexibleServers'
    && variance.id !== 'invalid-location'
    && body
    && typeof body === 'object'
    && 'location' in body) {
    return {
      ...body,
      location: mysqlSeedLocation,
    };
  }
  return body;
}

async function waitForResourceReady(requestFn, path, {
  readyStates = ['Succeeded'],
  attempts = Number(process.env.GLOBALSTACK_AZURE_PARENT_READY_ATTEMPTS ?? 30),
  delayMs = Number(process.env.GLOBALSTACK_AZURE_PARENT_READY_DELAY_MS ?? 5000),
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await requestFn('GET', path, null);
    const provisioningState = response.body?.properties?.provisioningState ?? response.body?.properties?.state ?? null;
    if (response.status >= 200 && response.status < 300 && (!provisioningState || readyStates.includes(provisioningState))) {
      return response;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error(`Timed out waiting for Azure parent readiness: ${path}`);
}

async function waitForAsyncOperation(requestFn, response, {
  attempts = Number(process.env.GLOBALSTACK_AZURE_ASYNC_ATTEMPTS ?? 60),
  defaultDelayMs = Number(process.env.GLOBALSTACK_AZURE_ASYNC_DELAY_MS ?? 10000),
} = {}) {
  const asyncUrl = response.rawHeaders?.['azure-asyncoperation'] ?? response.rawHeaders?.location ?? null;
  if (!asyncUrl) return response;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const operation = await requestFn('GET', asyncUrl, null);
    const status = String(operation.body?.status ?? operation.body?.properties?.provisioningState ?? '').toLowerCase();
    if (status === 'succeeded' || (operation.status >= 200 && operation.status < 300 && operation.body === null)) {
      return operation;
    }
    if (status === 'failed' || status === 'canceled') {
      throw new Error(`Azure async operation failed: HTTP ${operation.status} ${JSON.stringify(operation.body)}`);
    }
    const retryAfter = Number(response.rawHeaders?.['retry-after'] ?? operation.rawHeaders?.['retry-after'] ?? defaultDelayMs / 1000);
    await new Promise(resolve => setTimeout(resolve, Math.max(1, retryAfter) * 1000));
  }
  throw new Error(`Timed out waiting for Azure async operation: ${asyncUrl}`);
}

async function seedParents(requestFn, call, variance, replacements) {
  if (call.resourceType.startsWith('Microsoft.Network/dnsZones/')) {
    const zonePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.Network/dnsZones/${replacements.dnsZonesName}?api-version=2018-05-01`;
    await requestFn('PUT', zonePath, { location: 'global', properties: {} });
    return;
  }

  if (call.resourceType.startsWith('Microsoft.Network/privateDnsZones/')) {
    const zonePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.Network/privateDnsZones/${replacements.privateDnsZonesName}?api-version=2020-06-01`;
    await requestFn('PUT', zonePath, { location: 'global', properties: {} });
    if (call.resourceType === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks') {
      const vnetPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.Network/virtualNetworks/${replacements.virtualNetworksName}?api-version=2023-09-01`;
      await requestFn('PUT', vnetPath, {
        location,
        properties: {
          addressSpace: { addressPrefixes: ['10.62.0.0/16'] },
          subnets: [{ name: 'default', properties: { addressPrefix: '10.62.1.0/24' } }],
        },
      });
    }
    return;
  }

  if (call.resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers/databases') {
    const serverPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${replacements.flexibleServersName}?api-version=2023-06-01-preview`;
    const createResponse = await requestFn('PUT', serverPath, {
      location: mysqlSeedLocation,
      sku: { name: 'Standard_B1ms', tier: 'Burstable' },
      properties: {
        administratorLogin: 'globalstack',
        administratorLoginPassword: 'Globalstack1!',
        version: '16',
      },
    });
    if (createResponse.status < 200 || createResponse.status >= 300) {
      throw new Error(`Failed to seed PostgreSQL flexible server parent: HTTP ${createResponse.status} ${JSON.stringify(createResponse.body)}`);
    }
    await waitForAsyncOperation(requestFn, createResponse);
    await waitForResourceReady(requestFn, serverPath);
    return;
  }

  if (call.resourceType === 'Microsoft.DBforMySQL/flexibleServers/databases') {
    const serverPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.DBforMySQL/flexibleServers/${replacements.flexibleServersName}?api-version=2023-12-30`;
    const createResponse = await requestFn('PUT', serverPath, {
      location,
      sku: { name: 'Standard_B1ms', tier: 'Burstable' },
      properties: {
        administratorLogin: 'globalstack',
        administratorLoginPassword: 'Globalstack1!',
        version: '8.0.21',
      },
    });
    if (createResponse.status < 200 || createResponse.status >= 300) {
      throw new Error(`Failed to seed MySQL flexible server parent: HTTP ${createResponse.status} ${JSON.stringify(createResponse.body)}`);
    }
    await waitForAsyncOperation(requestFn, createResponse);
    await waitForResourceReady(requestFn, serverPath);
    return;
  }

  if (call.resourceType === 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases') {
    const accountPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${replacements.databaseAccountsName}?api-version=2024-05-15`;
    await requestFn('PUT', accountPath, {
      location,
      kind: 'GlobalDocumentDB',
      properties: {
        databaseAccountOfferType: 'Standard',
        locations: [{ locationName: location, failoverPriority: 0, isZoneRedundant: false }],
        consistencyPolicy: { defaultConsistencyLevel: 'Session' },
      },
    });
    return;
  }

  if (call.resourceType === 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers') {
    const accountPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${replacements.databaseAccountsName}?api-version=2024-05-15`;
    await requestFn('PUT', accountPath, {
      location,
      kind: 'GlobalDocumentDB',
      properties: {
        databaseAccountOfferType: 'Standard',
        locations: [{ locationName: location, failoverPriority: 0, isZoneRedundant: false }],
        consistencyPolicy: { defaultConsistencyLevel: 'Session' },
      },
    });
    const databasePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.DocumentDB/databaseAccounts/${replacements.databaseAccountsName}/sqlDatabases/${replacements.sqlDatabasesName}?api-version=2024-05-15`;
    await requestFn('PUT', databasePath, {
      properties: {
        resource: { id: replacements.sqlDatabasesName },
        options: { throughput: 400 },
      },
    });
    return;
  }

  if (call.resourceType === 'Microsoft.Storage/storageAccounts/blobServices/containers'
    || call.resourceType === 'Microsoft.Storage/storageAccounts/queueServices/queues'
    || call.resourceType === 'Microsoft.Storage/storageAccounts/fileServices/shares'
    || call.resourceType === 'Microsoft.Storage/storageAccounts/tableServices/tables') {
    const storagePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${replacements.storageAccountsName}?api-version=2023-01-01`;
    await requestFn('PUT', storagePath, {
      location,
      sku: { name: 'Standard_LRS' },
      kind: 'StorageV2',
      properties: { allowBlobPublicAccess: false },
    });
    return;
  }

  if (call.resourceType === 'Microsoft.KeyVault/vaults/secrets' || call.resourceType === 'Microsoft.KeyVault/vaults/keys') {
    const vaultPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.KeyVault/vaults/${replacements.vaultsName}?api-version=2023-07-01`;
    await requestFn('PUT', vaultPath, {
      location,
      properties: {
        tenantId,
        sku: { family: 'A', name: 'standard' },
        accessPolicies: [],
      },
    });
    return;
  }

  if (call.resourceType === 'Microsoft.Web/sites') {
    const serverFarmPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.Web/serverfarms/${replacements.serverfarmsName}?api-version=2023-12-01`;
    await requestFn('PUT', serverFarmPath, {
      location,
      sku: { name: 'Y1', tier: 'Dynamic' },
      properties: { reserved: false },
      kind: 'functionapp',
    });
    return;
  }

  if (call.resourceType === 'Microsoft.App/containerApps') {
    const environmentPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.App/managedEnvironments/${replacements.managedEnvironmentsName}?api-version=2023-05-01`;
    await requestFn('PUT', environmentPath, {
      location,
      properties: {
        zoneRedundant: false,
      },
    });
    return;
  }

  if (call.resourceType === 'Microsoft.Network/privateEndpoints') {
    const vnetPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.Network/virtualNetworks/${replacements.virtualNetworksName}?api-version=2023-09-01`;
    await requestFn('PUT', vnetPath, {
      location,
      properties: {
        addressSpace: { addressPrefixes: ['10.52.0.0/16'] },
        subnets: [{ name: 'default', properties: { addressPrefix: '10.52.1.0/24' } }],
      },
    });
    const storagePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${replacements.storageAccountsName}?api-version=2023-01-01`;
    await requestFn('PUT', storagePath, {
      location,
      sku: { name: 'Standard_LRS' },
      kind: 'StorageV2',
      properties: { allowBlobPublicAccess: false },
    });
    return;
  }

  if (call.resourceType === 'Microsoft.ServiceBus/namespaces/queues'
    || call.resourceType === 'Microsoft.ServiceBus/namespaces/topics'
    || call.resourceType === 'Microsoft.ServiceBus/namespaces/topics/subscriptions') {
    const namespacePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.ServiceBus/namespaces/${replacements.namespacesName}?api-version=2021-11-01`;
    const namespaceResponse = await requestFn('PUT', namespacePath, {
      location,
      sku: { name: 'Standard', tier: 'Standard' },
      properties: {},
    });
    if (namespaceResponse.status < 200 || namespaceResponse.status >= 300) return;
    if (call.resourceType === 'Microsoft.ServiceBus/namespaces/topics/subscriptions') {
      const topicPath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.ServiceBus/namespaces/${replacements.namespacesName}/topics/${replacements.topicsName}?api-version=2021-11-01`;
      await requestFn('PUT', topicPath, { properties: {} });
    }
    return;
  }

  if (call.resourceType === 'Microsoft.EventHub/namespaces/eventhubs') {
    const namespacePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.EventHub/namespaces/${replacements.namespacesName}?api-version=2024-01-01`;
    await requestFn('PUT', namespacePath, {
      location,
      sku: { name: 'Standard', tier: 'Standard', capacity: 1 },
      properties: {},
    });
    return;
  }

  if (call.resourceType === 'Microsoft.ApiManagement/service/apis') {
    const servicePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.ApiManagement/service/${replacements.serviceName}?api-version=2023-05-01-preview`;
    await requestFn('PUT', servicePath, {
      location,
      sku: { name: 'Developer', capacity: 1 },
      properties: {
        publisherEmail: 'platform@example.com',
        publisherName: 'GlobalStack Platform',
      },
    });
    return;
  }

  if (call.resourceType === 'Microsoft.DataMigration/services/projects') {
    const servicePath = `/subscriptions/${subscriptionId}/resourceGroups/${replacements.resourceGroupName}/providers/Microsoft.DataMigration/services/${replacements.serviceName}?api-version=2022-03-30-preview`;
    await requestFn('PUT', servicePath, {
      location,
      sku: { name: 'Standard_1vCore' },
      properties: { publicNetworkAccess: 'Enabled' },
    });
  }
}

async function classifyLocal(call, variance, response) {
  const expectations = await loadLocalExpectationMap();
  const expectation = expectations.get(fixtureIdFor(call, variance));
  if (expectation && response.status === expectation.expected.status && responseErrorCode(response) === expectation.expected.errorCode) {
    return 'pass';
  }
  if (variance.id === 'valid-minimal') return response.status >= 200 && response.status < 300 ? 'pass' : 'local-gap-needs-azure-capture';
  if (variance.id === 'missing-api-version') return response.status === 400 ? 'pass' : 'fail';
  return response.status >= 200 && response.status < 300 ? 'local-gap-needs-azure-capture' : 'local-rejected-unvalidated';
}

async function runLocalCase(baseUrl, call, variance) {
  const replacements = valuesFor(call, variance.id);
  const resourceGroupPath = `/subscriptions/${subscriptionId}/resourcegroups/${replacements.resourceGroupName}?api-version=2021-04-01`;
  await httpJson(baseUrl, 'PUT', resourceGroupPath, { location, tags: { purpose: 'globalstack-conformance' } });
  await seedParents((method, path, body) => httpJson(baseUrl, method, path, body), call, variance, replacements);

  const body = interpolate(variance.body, replacements);
  const path = requestPath(call, replacements, {
    omitApiVersion: variance.omitApiVersion,
    apiVersionOverride: variance.apiVersionOverride,
    pathTemplateOverride: variance.pathTemplateOverride,
  });
  const response = await httpJson(baseUrl, call.method, path, body);
  const classification = await classifyLocal(call, variance, response);
  return {
    callId: call.id,
    capabilityId: call.capabilityId,
    tier: call.tier,
    resourceType: call.resourceType,
    operation: call.operation,
    varianceId: variance.id,
    target: 'local',
    status: response.status,
    classification,
    ok: classification !== 'fail',
    requiresRealAzure: variance.requiresRealAzure,
    responseBody: sanitize(response.body),
  };
}

async function runAzureCase(call, variance) {
  if (process.env.GLOBALSTACK_REAL_AZURE_CONFORMANCE !== '1') {
    throw new Error('Real Azure conformance is disabled. Set GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 to execute Azure calls.');
  }
  if (!runAllAzure && !caseFilter) {
    throw new Error('Real Azure conformance requires --case=<variance-id> or --all so calls are intentionally scoped.');
  }
  const replacements = valuesFor(call, variance.id);
  const fixtureId = fixtureIdFor(call, variance);
  const rgPath = `/subscriptions/${subscriptionId}/resourcegroups/${replacements.resourceGroupName}?api-version=2021-04-01`;
  const inventory = {
    resourceGroupName: replacements.resourceGroupName,
    resourceGroupPath: rgPath,
    trackedResourcePath: requestPath(call, replacements, {
      omitApiVersion: variance.omitApiVersion,
      apiVersionOverride: variance.apiVersionOverride,
      pathTemplateOverride: variance.pathTemplateOverride,
    }),
    cleanup: {
      attempted: false,
      verifiedDeleted: false,
      status: null,
      verificationStatus: null,
    },
  };
  const rgCreate = await azureRequest('PUT', rgPath, { location, tags: { purpose: 'globalstack-conformance', ttl: 'ephemeral' } });
  if (rgCreate.status < 200 || rgCreate.status >= 300) {
    throw new Error(`Azure resource group bootstrap failed for ${fixtureId}: HTTP ${rgCreate.status} ${JSON.stringify(rgCreate.body)}`);
  }
  await seedParents(azureRequest, call, variance, replacements);
  const response = await azureRequest(
    call.method,
    inventory.trackedResourcePath,
    adjustAzureBody(call, variance, interpolate(variance.body, replacements)),
  );
  const deleteResponse = await azureRequest('DELETE', rgPath, null);
  inventory.cleanup.attempted = true;
  inventory.cleanup.status = deleteResponse.status;
  for (let attempt = 0; attempt < cleanupVerifyAttempts; attempt += 1) {
    const verify = await azureRequest('GET', rgPath, null);
    inventory.cleanup.verificationStatus = verify.status;
    if (verify.status === 404) {
      inventory.cleanup.verifiedDeleted = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, cleanupVerifyDelayMs));
  }
  const result = {
    fixtureId,
    callId: call.id,
    capabilityId: call.capabilityId,
    tier: call.tier,
    resourceType: call.resourceType,
    operation: call.operation,
    varianceId: variance.id,
    target: 'azure',
    status: response.status,
    classification: 'captured-real-azure',
    ok: inventory.cleanup.verifiedDeleted,
    requiresRealAzure: variance.requiresRealAzure,
    resourceGroupCreate: {
      status: rgCreate.status,
      body: rgCreate.body,
      headers: rgCreate.headers,
    },
    inventory,
    requestPath: inventory.trackedResourcePath,
    responseBody: response.body,
    responseHeaders: response.headers,
  };
  await writeAzureFixture(result, call, variance);
  return result;
}

async function writeAzureFixture(result, call, variance) {
  await mkdir(fixtureRoot, { recursive: true });
  const fixture = {
    id: result.fixtureId,
    capturedAt: new Date().toISOString(),
    target: 'azure',
    subscriptionId: '<subscription-id>',
    tenantId: '<tenant-id>',
    capabilityId: call.capabilityId,
    tier: call.tier,
    resourceType: call.resourceType,
    operation: call.operation,
    varianceId: variance.id,
    request: {
      method: call.method,
      path: result.requestPath.replace(subscriptionId, '<subscription-id>'),
      body: sanitize(variance.body),
      apiVersionOverride: variance.apiVersionOverride ?? null,
    },
    response: {
      status: result.status,
      headers: result.responseHeaders,
      body: result.responseBody,
    },
    cleanup: {
      resourceGroupName: result.inventory.resourceGroupName,
      deleteStatus: result.inventory.cleanup.status,
      verificationStatus: result.inventory.cleanup.verificationStatus,
      verifiedDeleted: result.inventory.cleanup.verifiedDeleted,
    },
    globalstack: {
      normalizedIntoLocalConformance: false,
    },
  };
  await writeFile(join(fixtureRoot, `${result.fixtureId}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
}

function selectedCreateCalls(catalog) {
  let calls = catalog.calls.filter(call => operationFilter ? call.operation === operationFilter : call.operation === 'CreateOrUpdate');
  if (capabilityFilter) calls = calls.filter(call => call.capabilityId === capabilityFilter);
  if (resourceTypeFilter) calls = calls.filter(call => call.resourceType.toLowerCase() === resourceTypeFilter.toLowerCase());
  if (limit > 0) calls = calls.slice(0, limit);
  return calls;
}

function selectedVariances(call) {
  let variances = call.varianceCases.length > 0 ? call.varianceCases : [{
    id: call.operation === 'ListByResourceGroup' ? 'empty-list' : 'not-found',
    description: `${call.operation} against an existing ephemeral resource group without precreating the target resource.`,
    body: null,
    expectedAzure: 'Capture provider-specific not-found, empty-list, or provider-registration behavior.',
    localAssertion: 'record-gap-until-real-azure-captured',
    requiresRealAzure: false,
  }];
  if (caseFilter) variances = variances.filter(variance => variance.id === caseFilter);
  if (target === 'local') return variances;
  return variances.filter(variance => runAllAzure || !variance.requiresRealAzure || variance.id === caseFilter);
}

function markdown(report) {
  const lines = [
    '# Azure API Conformance Report',
    '',
    `Target: ${report.target}`,
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    `Cases: ${report.results.length}`,
    '',
    '| Capability | Resource Type | Variance | Status | Classification |',
    '|---|---|---|---|---|',
  ];
  for (const result of report.results) {
    lines.push(`| ${result.capabilityId} | ${result.resourceType} | ${result.varianceId} | ${result.status} | ${result.classification} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });
if (target === 'azure' && (subscriptionId === emptyGuid || tenantId === emptyGuid)) {
  const account = await getAzureAccountContext();
  subscriptionId = subscriptionId === emptyGuid ? account.id ?? emptyGuid : subscriptionId;
  tenantId = tenantId === emptyGuid ? account.tenantId ?? emptyGuid : tenantId;
  if (subscriptionId === emptyGuid || tenantId === emptyGuid) {
    throw new Error('Real Azure conformance requires an active Azure CLI account with subscription and tenant context.');
  }
}
const catalog = buildAzureLiveApiCatalog();
const calls = selectedCreateCalls(catalog);
const results = [];

if (target === 'local') {
  await withLocalArm(async (baseUrl) => {
    for (const call of calls) {
      for (const variance of selectedVariances(call)) {
        results.push(await runLocalCase(baseUrl, call, variance));
      }
    }
  });
} else if (target === 'azure') {
  for (const call of calls) {
    for (const variance of selectedVariances(call)) {
      results.push(await runAzureCase(call, variance));
    }
  }
} else {
  throw new Error(`Unsupported target: ${target}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  target,
  catalogCallCount: catalog._meta.callCount,
  selectedCreateCallCount: calls.length,
  filters: {
    capability: capabilityFilter ?? null,
    resourceType: resourceTypeFilter ?? null,
    operation: operationFilter ?? null,
    case: caseFilter ?? null,
    all: runAllAzure,
  },
  ok: results.every(result => result.ok),
  results,
};

await writeFile(join(outRoot, `azure-api-conformance-${target}.json`), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, `azure-api-conformance-${target}.md`), markdown(report));

console.log(`Azure API conformance ${target}: ${report.ok ? 'passed' : 'failed'} (${results.length} cases).`);
if (!report.ok) process.exit(1);
