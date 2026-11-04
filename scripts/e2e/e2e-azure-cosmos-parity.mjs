import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createCosmosSqlRouter, createCosmosSqlRouterServer } from '../../packages/azure-data-plane/src/cosmos-sql-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-cosmos-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const token = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
const authHeader = `Bearer ${token}`;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124 });
    }, options.timeoutMs ?? 900000);
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ code: 127, error: error.message });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1 });
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
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

async function withCosmosSqlRouter(fn) {
  const router = createCosmosSqlRouter();
  const server = createCosmosSqlRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port, router);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function httpJson(port, method, path, body, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(options.auth === false ? {} : { authorization: authHeader }),
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

async function httpCosmos(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const req = request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        ...(payload ? { 'content-length': payload.length } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        let parsed = null;
        if (raw.length > 0) {
          try {
            parsed = JSON.parse(raw.toString('utf8'));
          } catch {
            parsed = raw.toString('utf8');
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
          raw,
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code ?? result.body?.Code ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function accountPath(resourceGroup, accountName, apiVersion = '2024-05-15') {
  return providerPath(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}`, apiVersion);
}

function sqlDatabasePath(resourceGroup, accountName, databaseName, apiVersion = '2024-05-15') {
  return providerPath(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}/sqlDatabases/${databaseName}`, apiVersion);
}

function containerPath(resourceGroup, accountName, databaseName, containerName, apiVersion = '2024-05-15') {
  return providerPath(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}/sqlDatabases/${databaseName}/containers/${containerName}`, apiVersion);
}

function storageAccountPath(resourceGroup, storageName, apiVersion = '2023-01-01') {
  return providerPath(resourceGroup, 'Microsoft.Storage', `storageAccounts/${storageName}`, apiVersion);
}

function storageTablePath(resourceGroup, storageName, tableName, apiVersion = '2023-01-01') {
  return providerPath(resourceGroup, 'Microsoft.Storage', `storageAccounts/${storageName}/tableServices/default/tables/${tableName}`, apiVersion);
}

function accountBody(overrides = {}) {
  return {
    location: 'eastus',
    kind: 'GlobalDocumentDB',
    tags: { workload: 'ai-mlops-cosmos' },
    properties: {
      databaseAccountOfferType: 'Standard',
      locations: [{ locationName: 'eastus', failoverPriority: 0, isZoneRedundant: false }],
      consistencyPolicy: { defaultConsistencyLevel: 'Session' },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function sqlDatabaseBody(databaseName, overrides = {}) {
  return {
    properties: {
      resource: { id: databaseName, ...(overrides.resource ?? {}) },
      options: { throughput: 400, ...(overrides.options ?? {}) },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['resource', 'options', 'properties'].includes(key))),
  };
}

function containerBody(containerName, overrides = {}) {
  return {
    properties: {
      resource: {
        id: containerName,
        partitionKey: { paths: ['/pk'], kind: 'Hash' },
        ...(overrides.resource ?? {}),
      },
      options: { throughput: 400, ...(overrides.options ?? {}) },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['resource', 'options', 'properties'].includes(key))),
  };
}

function storageAccountBody() {
  return {
    location: 'eastus',
    sku: { name: 'Standard_LRS' },
    kind: 'StorageV2',
    properties: { allowBlobPublicAccess: false },
  };
}

function deploymentBody({ accountName, databaseName, containerName, storageName, tableName }) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.DocumentDB/databaseAccounts',
            apiVersion: '2024-05-15',
            name: accountName,
            location: 'eastus',
            kind: 'GlobalDocumentDB',
            properties: accountBody().properties,
          },
          {
            type: 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases',
            apiVersion: '2024-05-15',
            name: `${accountName}/${databaseName}`,
            properties: sqlDatabaseBody(databaseName).properties,
          },
          {
            type: 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers',
            apiVersion: '2024-05-15',
            name: `${accountName}/${databaseName}/${containerName}`,
            properties: containerBody(containerName).properties,
          },
          {
            type: 'Microsoft.Storage/storageAccounts',
            apiVersion: '2023-01-01',
            name: storageName,
            location: 'eastus',
            sku: { name: 'Standard_LRS' },
            kind: 'StorageV2',
            properties: { allowBlobPublicAccess: false },
          },
          {
            type: 'Microsoft.Storage/storageAccounts/tableServices/tables',
            apiVersion: '2023-01-01',
            name: `${storageName}/default/${tableName}`,
            properties: {},
          },
        ],
        outputs: {
          accountName: { type: 'string', value: accountName },
          databaseName: { type: 'string', value: databaseName },
          containerName: { type: 'string', value: containerName },
          tableName: { type: 'string', value: tableName },
        },
      },
    },
  };
}

async function accountReady(port, resourceGroup, accountName) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await httpJson(port, 'GET', accountPath(resourceGroup, accountName));
    if (last.status === 200 && last.body.properties?.provisioningState === 'Succeeded') return last;
  }
  return last;
}

async function storageReady(port, resourceGroup, storageName) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await httpJson(port, 'GET', storageAccountPath(resourceGroup, storageName));
    if (last.status === 200 && last.body.properties?.provisioningState === 'Succeeded') return last;
  }
  return last;
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-cosmos-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-cosmos-missing-${suffix}`;
  const accountName = `cosmos-${suffix}`.slice(0, 40);
  const invalidAccountName = `Cosmos_${suffix}`;
  const missingAccountName = `cosmos-missing-${suffix}`.slice(0, 40);
  const databaseName = `sqldb${suffix}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const containerName = `container${suffix}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  const storageName = `gstable${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
  const tableName = `Table${suffix.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 63);

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      cases.push({ name, ok: true, durationMs: Date.now() - startedAt, ...detail });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error?.stack ?? String(error) });
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  await withCosmosSqlRouter(async (cosmosPort, cosmosRouter) => {
    const cosmosHost = `${accountName}.documents.azure.com`;
    const cosmosHeaders = {
      host: cosmosHost,
      authorization: 'type=master&ver=1.0&sig=globalstack',
      'content-type': 'application/json',
      'x-ms-date': new Date().toUTCString(),
      'x-ms-version': '2024-05-15',
    };

  await withArmServer(async (armPort) => {
    await record('unauthenticated ARM request is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { auth: false });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('malformed bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Token bad' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('wrong bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Bearer wrong-token' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription mismatch is rejected', async () => {
      const path = `/subscriptions/99999999-9999-9999-9999-999999999999/resourceGroups/${resourceGroup}?api-version=2021-04-01`;
      const result = await httpJson(armPort, 'GET', path);
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}`), accountBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(missingResourceGroup, accountName), accountBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-cosmos-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('sql database create with missing account reports resource not found', async () => {
      const result = await httpJson(armPort, 'PUT', sqlDatabasePath(resourceGroup, missingAccountName, databaseName), sqlDatabaseBody(databaseName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DocumentDB', 'databaseAccounts', '2024-05-15'));
      assert.equal(result.status, 200);
      assert.equal(result.body.value.length, 0);
      return { status: result.status, count: result.body.value.length };
    });

    await record('cosmos account delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', accountPath(resourceGroup, missingAccountName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('cosmos account empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, accountName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, accountName), accountBody({ location: 'globalstack-invalid-location' }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account invalid name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, invalidAccountName), accountBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account missing offer type is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, accountName), accountBody({ properties: { databaseAccountOfferType: undefined } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account missing locations is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, accountName), accountBody({ properties: { locations: [] } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account invalid consistency is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, accountName), accountBody({ properties: { consistencyPolicy: { defaultConsistencyLevel: 'GlobalStackInvalid' } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account create returns async Azure shape', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, accountName), accountBody());
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      cosmosRouter.registerAccount({ accountName });
      return { status: result.status };
    });

    await record('cosmos account get reaches Succeeded with endpoint metadata', async () => {
      const result = await accountReady(armPort, resourceGroup, accountName);
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.properties.documentEndpoint, `https://${accountName}.documents.azure.com:443/`);
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('cosmos account update preserves tags', async () => {
      const result = await httpJson(armPort, 'PUT', accountPath(resourceGroup, accountName), accountBody({ tags: { workload: 'robotics-state' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'robotics-state');
      return { status: result.status };
    });

    await record('sql database name mismatch is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', sqlDatabasePath(resourceGroup, accountName, databaseName), sqlDatabaseBody('different-db'));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql database invalid throughput is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', sqlDatabasePath(resourceGroup, accountName, databaseName), sqlDatabaseBody(databaseName, { options: { throughput: 100 } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql database create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', sqlDatabasePath(resourceGroup, accountName, databaseName), sqlDatabaseBody(databaseName));
      assert.equal(result.status, 201);
      assert.equal(result.body.name, `${accountName}/${databaseName}`);
      cosmosRouter.registerDatabase({ accountName, databaseName });
      return { status: result.status };
    });

    await record('sql database get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', sqlDatabasePath(resourceGroup, accountName, databaseName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.resource.id, databaseName);
      return { status: result.status };
    });

    await record('sql database list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}/sqlDatabases`, '2024-05-15'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${accountName}/${databaseName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('sql container create with missing database reports resource not found', async () => {
      const result = await httpJson(armPort, 'PUT', containerPath(resourceGroup, accountName, `missing${databaseName}`, containerName), containerBody(containerName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql container name mismatch is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', containerPath(resourceGroup, accountName, databaseName, containerName), containerBody('different-container'));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql container missing partition key is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', containerPath(resourceGroup, accountName, databaseName, containerName), containerBody(containerName, { resource: { partitionKey: { paths: [] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql container invalid partition key kind is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', containerPath(resourceGroup, accountName, databaseName, containerName), containerBody(containerName, { resource: { partitionKey: { paths: ['/pk'], kind: 'InvalidKind' } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql container create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', containerPath(resourceGroup, accountName, databaseName, containerName), containerBody(containerName));
      assert.equal(result.status, 201);
      assert.equal(result.body.name, `${accountName}/${databaseName}/${containerName}`);
      cosmosRouter.registerContainer({ accountName, databaseName, containerName, partitionKey: '/pk' });
      return { status: result.status };
    });

    await record('sql container get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', containerPath(resourceGroup, accountName, databaseName, containerName));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.properties.resource.partitionKey.paths, ['/pk']);
      return { status: result.status };
    });

    await record('sql container list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}/sqlDatabases/${databaseName}/containers`, '2024-05-15'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${accountName}/${databaseName}/${containerName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('data-plane request without auth is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', '/dbs', undefined, {
        host: cosmosHost,
        'x-ms-date': new Date().toUTCString(),
        'x-ms-version': '2024-05-15',
      });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'Unauthorized');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane request without x-ms-version is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', '/dbs', undefined, {
        host: cosmosHost,
        authorization: 'type=master&ver=1.0&sig=globalstack',
        'x-ms-date': new Date().toUTCString(),
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane request without x-ms-date is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', '/dbs', undefined, {
        host: cosmosHost,
        authorization: 'type=master&ver=1.0&sig=globalstack',
        'x-ms-version': '2024-05-15',
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane unknown account host is not found', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', '/dbs', undefined, {
        host: `${missingAccountName}.documents.azure.com`,
        authorization: 'type=master&ver=1.0&sig=globalstack',
        'x-ms-date': new Date().toUTCString(),
        'x-ms-version': '2024-05-15',
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'NotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane database list includes ARM-created database', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', '/dbs', undefined, cosmosHeaders);
      assert.equal(result.status, 200);
      assert.ok(result.body.Databases.some(item => item.id === databaseName));
      return { status: result.status, count: result.body._count };
    });

    await record('data-plane duplicate database create is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', '/dbs', { id: databaseName }, cosmosHeaders);
      assert.equal(result.status, 409);
      assert.equal(errorCode(result), 'Conflict');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane invalid container create is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls`, { id: 'bad/container', partitionKey: { paths: ['/pk'], kind: 'Hash' } }, cosmosHeaders);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane container get succeeds', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}`, undefined, cosmosHeaders);
      assert.equal(result.status, 200);
      assert.equal(result.body.id, containerName);
      assert.deepEqual(result.body.partitionKey.paths, ['/pk']);
      return { status: result.status };
    });

    await record('data-plane document create without partition key is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { id: 'run-1', pk: 'robotics', score: 0.98 }, cosmosHeaders);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document create with mismatched partition key is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { id: 'run-1', pk: 'robotics', score: 0.98 }, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['mlops']),
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document create succeeds', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { id: 'run-1', pk: 'robotics', score: 0.98 }, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.id, 'run-1');
      assert.equal(result.body.pk, 'robotics');
      return { status: result.status };
    });

    await record('data-plane document list includes created document', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs`, undefined, cosmosHeaders);
      assert.equal(result.status, 200);
      assert.ok(result.body.Documents.some(item => item.id === 'run-1' && item.pk === 'robotics'));
      return { status: result.status, count: result.body._count };
    });

    await record('data-plane duplicate document create is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { id: 'run-1', pk: 'robotics', score: 0.99 }, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 409);
      assert.equal(errorCode(result), 'Conflict');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document get without partition key is not found', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, cosmosHeaders);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'NotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document get with wrong partition key is not found', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['mlops']),
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'NotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document get succeeds', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.score, 0.98);
      return { status: result.status };
    });

    await record('data-plane document replace cannot change partition key', async () => {
      const result = await httpCosmos(cosmosPort, 'PUT', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, { id: 'run-1', pk: 'mlops', score: 0.7 }, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document replace succeeds', async () => {
      const result = await httpCosmos(cosmosPort, 'PUT', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, { id: 'run-1', pk: 'robotics', score: 0.99 }, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.score, 0.99);
      return { status: result.status };
    });

    await record('data-plane SQL query returns created document', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { query: 'SELECT * FROM c' }, {
        ...cosmosHeaders,
        'x-ms-documentdb-isquery': 'true',
      });
      assert.equal(result.status, 200);
      assert.ok(result.body.Documents.some(item => item.id === 'run-1' && item.score === 0.99));
      return { status: result.status, count: result.body._count };
    });

    await record('data-plane SQL query remains stable across repeated reads', async () => {
      const first = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { query: 'SELECT * FROM c' }, {
        ...cosmosHeaders,
        'x-ms-documentdb-isquery': 'true',
      });
      const second = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { query: 'SELECT * FROM c' }, {
        ...cosmosHeaders,
        'x-ms-documentdb-isquery': 'true',
      });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(
        second.body.Documents.map(item => ({ id: item.id, pk: item.pk, score: item.score })),
        first.body.Documents.map(item => ({ id: item.id, pk: item.pk, score: item.score })),
      );
      return { status: second.status, count: second.body._count };
    });

    await record('data-plane non-select query is rejected', async () => {
      const result = await httpCosmos(cosmosPort, 'POST', `/dbs/${databaseName}/colls/${containerName}/docs`, { query: 'DELETE FROM c' }, {
        ...cosmosHeaders,
        'x-ms-documentdb-isquery': 'true',
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document delete with wrong partition key is not found', async () => {
      const result = await httpCosmos(cosmosPort, 'DELETE', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['mlops']),
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'NotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document survives wrong partition delete', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.score, 0.99);
      return { status: result.status };
    });

    await record('data-plane document delete succeeds', async () => {
      const result = await httpCosmos(cosmosPort, 'DELETE', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('data-plane document get after delete is not found', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'NotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane document get after delete remains not found across repeated reads', async () => {
      const first = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      const second = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}/docs/run-1`, undefined, {
        ...cosmosHeaders,
        'x-ms-documentdb-partitionkey': JSON.stringify(['robotics']),
      });
      assert.equal(first.status, 404);
      assert.equal(second.status, 404);
      assert.equal(errorCode(first), 'NotFound');
      assert.equal(errorCode(second), 'NotFound');
      return { status: second.status, errorCode: errorCode(second) };
    });

    await record('cosmos account list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DocumentDB', 'databaseAccounts', '2024-05-15'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === accountName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('storage account create returns async Azure shape', async () => {
      const result = await httpJson(armPort, 'PUT', storageAccountPath(resourceGroup, storageName), storageAccountBody());
      assert.equal(result.status, 202);
      return { status: result.status };
    });

    await record('storage account get reaches Succeeded for table child', async () => {
      const result = await storageReady(armPort, resourceGroup, storageName);
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('storage table invalid name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', storageTablePath(resourceGroup, storageName, '1bad'), { properties: {} });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('storage table create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', storageTablePath(resourceGroup, storageName, tableName), { properties: {} });
      assert.equal(result.status, 200);
      assert.equal(result.body.name, `${storageName}/default/${tableName}`);
      return { status: result.status };
    });

    await record('unsupported mongodb database route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}/mongodbDatabases/mongo`, '2024-05-15'), { properties: { resource: { id: 'mongo' } } });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('unsupported stored procedure route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.DocumentDB', `databaseAccounts/${accountName}/sqlDatabases/${databaseName}/containers/${containerName}/storedProcedures/sproc`, '2024-05-15'), { properties: { resource: { id: 'sproc' } } });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create cosmos and table resources', async () => {
      const deploymentName = `cosmos-deploy-${suffix}`;
      const deploymentAccount = `cosmos-deploy-${suffix}`.slice(0, 40);
      const deploymentDatabase = `sqldeploy${suffix}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
      const deploymentContainer = `ctdeploy${suffix}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
      const deploymentStorage = `gstpl${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
      const deploymentTable = `Tpl${suffix.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 63);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({
          accountName: deploymentAccount,
          databaseName: deploymentDatabase,
          containerName: deploymentContainer,
          storageName: deploymentStorage,
          tableName: deploymentTable,
        }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/databaseAccounts/${deploymentAccount}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/sqlDatabases/${deploymentDatabase}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/containers/${deploymentContainer}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/tableServices/default/tables/${deploymentTable}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('storage table delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', storageTablePath(resourceGroup, storageName, tableName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('storage table get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', storageTablePath(resourceGroup, storageName, tableName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql container delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', containerPath(resourceGroup, accountName, databaseName, containerName));
      assert.equal(result.status, 200);
      cosmosRouter.unregisterContainer({ accountName, databaseName, containerName });
      return { status: result.status };
    });

    await record('data-plane container get after ARM delete is not found', async () => {
      const result = await httpCosmos(cosmosPort, 'GET', `/dbs/${databaseName}/colls/${containerName}`, undefined, cosmosHeaders);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'NotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql container get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', containerPath(resourceGroup, accountName, databaseName, containerName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql container delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', containerPath(resourceGroup, accountName, databaseName, containerName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('sql database delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', sqlDatabasePath(resourceGroup, accountName, databaseName));
      assert.equal(result.status, 200);
      cosmosRouter.unregisterDatabase({ accountName, databaseName });
      return { status: result.status };
    });

    await record('sql database get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', sqlDatabasePath(resourceGroup, accountName, databaseName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cosmos account delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', accountPath(resourceGroup, accountName));
      assert.equal(result.status, 200);
      cosmosRouter.unregisterAccount({ accountName });
      return { status: result.status };
    });

    await record('cosmos account get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', accountPath(resourceGroup, accountName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql database create after account delete reports resource not found', async () => {
      const result = await httpJson(armPort, 'PUT', sqlDatabasePath(resourceGroup, accountName, databaseName), sqlDatabaseBody(databaseName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    accountName,
    databaseName,
    containerName,
    tableName,
    cases,
  };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return {
      ok: true,
      skipped: true,
      reason: '--skip-platforms was provided',
      expectedPlatforms: azurePlatforms.length,
      results: [],
    };
  }

  const env = {
    ...process.env,
    PROVIDER: 'GlobalStack',
    CLOUD_PROVIDER: 'GlobalStack',
  };
  const result = await run('npm', ['run', 'smoke:platform-runners'], { env, timeoutMs: 1800000 });
  const resultsPath = join(root, 'dist', 'platform-lifecycle-smoke-results.json');
  const summary = await readJson(resultsPath).catch(() => ({ generatedAt: null, results: [] }));
  const failed = (summary.results ?? []).filter(item => !item.ok);
  return {
    ok: result.code === 0 && failed.length === 0 && (summary.results ?? []).length === azurePlatforms.length,
    skipped: false,
    exitCode: result.code,
    expectedPlatforms: azurePlatforms.length,
    passedCount: (summary.results ?? []).length - failed.length,
    failedCount: failed.length,
    resultsPath,
    results: summary.results ?? [],
  };
}

function markdown(report) {
  const lines = [
    '# Azure Cosmos DB NoSQL/Table Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Account under test: ${report.controlPlane.accountName}`,
    `- SQL database under test: ${report.controlPlane.databaseName}`,
    `- SQL container under test: ${report.controlPlane.containerName}`,
    `- Storage table under test: ${report.controlPlane.tableName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Platform Matrix');
  lines.push('');
  if (report.platformMatrix.skipped) {
    lines.push(`- Skipped: ${report.platformMatrix.reason}`);
  } else {
    lines.push(`- Passed: ${report.platformMatrix.passedCount}/${report.platformMatrix.expectedPlatforms}`);
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Azure Cosmos DB account, SQL database, SQL container, and Storage Table ARM lifecycle, parameter rejection, Cosmos SQL REST-shaped local item create/read/replace/query/delete behavior, unsupported Cosmos route fail-closed behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Cosmos DB as 99%-complete or cloudValidated for full SQL query semantics, partition routing, indexing policy, consistency, change feed, multi-region failover, throughput autoscale, RBAC, private link, or exact Azure data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Cosmos DB account, NoSQL SQL database/container, Storage Table ARM lifecycle, Cosmos SQL REST-shaped local item data-plane checks, parameter rejection, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Cosmos DB cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Cosmos DB parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
