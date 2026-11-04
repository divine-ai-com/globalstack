import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createAzureFilesRouter, createAzureFilesRouterServer } from '../../packages/azure-data-plane/src/azure-files-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-files-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const token = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
const authHeader = `Bearer ${token}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function withAzureFilesRouter(fn) {
  const router = createAzureFilesRouter();
  const server = createAzureFilesRouterServer(router);
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

async function httpFiles(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2023-01-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function operationStatusPath(asyncOperationUrl) {
  const parsed = new URL(asyncOperationUrl);
  return `${parsed.pathname}${parsed.search}`;
}

function storageAccountBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Standard_LRS', ...(overrides.sku ?? {}) },
    kind: 'StorageV2',
    properties: {
      allowBlobPublicAccess: false,
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function fileShareBody(overrides = {}) {
  return {
    properties: {
      shareQuota: 32,
      enabledProtocols: 'SMB',
      accessTier: 'TransactionOptimized',
      ...(overrides.properties ?? {}),
    },
  };
}

function deploymentBody(accountName, shareName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Storage/storageAccounts',
            apiVersion: '2023-01-01',
            name: accountName,
            location: 'eastus',
            sku: { name: 'Standard_LRS' },
            kind: 'StorageV2',
            properties: { allowBlobPublicAccess: false },
          },
          {
            type: 'Microsoft.Storage/storageAccounts/fileServices/shares',
            apiVersion: '2023-01-01',
            name: `${accountName}/default/${shareName}`,
            properties: { shareQuota: 32, enabledProtocols: 'SMB', accessTier: 'TransactionOptimized' },
          },
        ],
        outputs: {
          storageAccountName: { type: 'string', value: accountName },
          shareName: { type: 'string', value: shareName },
        },
      },
    },
  };
}

async function waitForStorageReady(port, resourceGroup, accountName) {
  const path = providerPath(resourceGroup, 'Microsoft.Storage', `storageAccounts/${accountName}`);
  let latest = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    latest = await httpJson(port, 'GET', path);
    if (latest.status === 200 && latest.body?.properties?.provisioningState === 'Succeeded') return latest;
    await sleep(25);
  }
  return latest;
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-files-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-files-missing-${suffix}`;
  const accountName = `gsfiles${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
  const shareName = `models-${suffix}`;
  const missingShareName = `missing-${suffix}`;
  const templateAccount = `gsfiletpl${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
  const templateShare = `tpl-${suffix}`;
  const accountBase = `storageAccounts/${accountName}`;
  const sharePath = `${accountBase}/fileServices/default/shares/${shareName}`;
  const shareCollectionPath = `${accountBase}/fileServices/default/shares`;
  const netAppVolumePath = `netAppAccounts/anf${suffix}/capacityPools/pool${suffix}/volumes/vol${suffix}`;
  const netAppVolumeCollectionPath = `netAppAccounts/anf${suffix}/capacityPools/pool${suffix}/volumes`;

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

  await withAzureFilesRouter(async (filesPort, filesRouter) => {
    const fileHost = `${accountName}.file.core.windows.net`;
    const fileHeaders = {
      host: fileHost,
      authorization: 'SharedKey globalstack:faketestkey',
      'x-ms-version': '2023-01-03',
      'x-ms-date': new Date().toUTCString(),
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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Storage', sharePath), fileShareBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('storage account create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(missingResourceGroup, 'Microsoft.Storage', accountBase), storageAccountBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-files-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('file share create before storage account reports missing parent', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', sharePath), fileShareBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    let asyncOperation = null;
    await record('storage account create is async accepted', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', accountBase), storageAccountBody());
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      asyncOperation = result.headers['azure-asyncoperation'];
      return { status: result.status };
    });

    await record('file share create before storage readiness is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', sharePath), fileShareBody());
      assert.equal(result.status, 409);
      assert.equal(errorCode(result), 'StorageAccountIsNotProvisioned');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('async operation status reaches Succeeded', async () => {
      const result = await httpJson(armPort, 'GET', operationStatusPath(asyncOperation));
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Succeeded');
      return { status: result.status };
    });

    await record('storage account get reaches Succeeded', async () => {
      const result = await waitForStorageReady(armPort, resourceGroup, accountName);
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status };
    });

    await record('file share collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', shareCollectionPath));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('file share delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Storage', `${accountBase}/fileServices/default/shares/${missingShareName}`));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['file share invalid name is rejected', `${accountBase}/fileServices/default/shares/ab`, fileShareBody(), 'InvalidResourceName'],
      ['file share invalid quota is rejected', sharePath, fileShareBody({ properties: { shareQuota: 0 } }), 'InvalidHeaderValue'],
      ['file share invalid protocol is rejected', sharePath, fileShareBody({ properties: { enabledProtocols: 'FTP' } }), 'InvalidHeaderValue'],
      ['file share invalid access tier is rejected', sharePath, fileShareBody({ properties: { accessTier: 'Archive' } }), 'InvalidHeaderValue'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('file share create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', sharePath), fileShareBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.shareQuota, 32);
      assert.equal(result.body.properties.enabledProtocols, 'SMB');
      assert.equal(result.body.globalstack.capabilityId, 'azure-files');
      filesRouter.registerShare({ accountName, shareName, shareQuota: result.body.properties.shareQuota });
      return { status: result.status };
    });

    await record('file share get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', sharePath));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.accessTier, 'TransactionOptimized');
      return { status: result.status };
    });

    await record('file share update can change quota and access tier', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', sharePath), fileShareBody({ properties: { shareQuota: 64, accessTier: 'Hot' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.shareQuota, 64);
      assert.equal(result.body.properties.accessTier, 'Hot');
      return { status: result.status };
    });

    await record('file share list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', shareCollectionPath));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.id.includes(sharePath)));
      return { status: result.status, count: result.body.value.length };
    });

    await record('data-plane request without auth is rejected', async () => {
      const result = await httpFiles(filesPort, 'GET', `/${shareName}?restype=share`, undefined, {
        host: fileHost,
        'x-ms-version': '2023-01-03',
      });
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthenticationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane request without x-ms-version is rejected', async () => {
      const result = await httpFiles(filesPort, 'GET', `/${shareName}?restype=share`, undefined, {
        host: fileHost,
        authorization: 'SharedKey globalstack:faketestkey',
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingRequiredHeader');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane unknown share is not found', async () => {
      const result = await httpFiles(filesPort, 'GET', `/missing-${suffix}?restype=share`, undefined, fileHeaders);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ShareNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane share properties get succeeds', async () => {
      const result = await httpFiles(filesPort, 'GET', `/${shareName}?restype=share`, undefined, fileHeaders);
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.shareQuota, 32);
      assert.equal(result.headers['x-ms-share-quota'], '32');
      return { status: result.status, shareQuota: result.body.properties.shareQuota };
    });

    await record('data-plane invalid path traversal is rejected', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models/..%2Fbad?restype=directory`, undefined, fileHeaders);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane nested directory before parent is rejected', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models/nested?restype=directory`, undefined, fileHeaders);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane directory create succeeds', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models?restype=directory`, undefined, fileHeaders);
      assert.equal(result.status, 201);
      assert.equal(result.headers['x-ms-resource-type'], 'directory');
      return { status: result.status };
    });

    await record('data-plane file create requires file type header', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models/model.bin`, undefined, {
        ...fileHeaders,
        'x-ms-content-length': '11',
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidHeaderValue');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane file create invalid content length is rejected', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models/model.bin`, undefined, {
        ...fileHeaders,
        'x-ms-type': 'file',
        'x-ms-content-length': '-1',
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidHeaderValue');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane file create succeeds', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models/model.bin`, undefined, {
        ...fileHeaders,
        'x-ms-type': 'file',
        'x-ms-content-length': '11',
      });
      assert.equal(result.status, 201);
      assert.equal(result.headers['x-ms-content-length'], '11');
      return { status: result.status };
    });

    await record('data-plane range upload invalid range is rejected', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models/model.bin?comp=range`, Buffer.from('hello'), {
        ...fileHeaders,
        'x-ms-write': 'update',
        'x-ms-range': 'bytes=0-10',
      });
      assert.equal(result.status, 416);
      assert.equal(errorCode(result), 'InvalidRange');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('data-plane range upload succeeds', async () => {
      const result = await httpFiles(filesPort, 'PUT', `/${shareName}/models/model.bin?comp=range`, Buffer.from('hello files'), {
        ...fileHeaders,
        'x-ms-write': 'update',
        'x-ms-range': 'bytes=0-10',
      });
      assert.equal(result.status, 201);
      assert.equal(result.headers['x-ms-range'], 'bytes=0-10');
      return { status: result.status };
    });

    await record('data-plane file read succeeds', async () => {
      const result = await httpFiles(filesPort, 'GET', `/${shareName}/models/model.bin`, undefined, fileHeaders);
      assert.equal(result.status, 200);
      assert.equal(result.raw.toString('utf8'), 'hello files');
      assert.equal(result.headers['x-ms-content-length'], '11');
      return { status: result.status, bytes: result.raw.length };
    });

    await record('data-plane file read stays stable across repeated reads', async () => {
      const first = await httpFiles(filesPort, 'GET', `/${shareName}/models/model.bin`, undefined, fileHeaders);
      const second = await httpFiles(filesPort, 'GET', `/${shareName}/models/model.bin`, undefined, fileHeaders);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(first.raw.toString('utf8'), 'hello files');
      assert.equal(second.raw.toString('utf8'), first.raw.toString('utf8'));
      assert.equal(second.headers['x-ms-content-length'], first.headers['x-ms-content-length']);
      return { status: second.status, bytes: second.raw.length };
    });

    await record('data-plane directory list includes file', async () => {
      const result = await httpFiles(filesPort, 'GET', `/${shareName}/models?restype=directory&comp=list`, undefined, fileHeaders);
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.type === 'File' && item.name === 'model.bin'));
      return { status: result.status, count: result.body.value.length };
    });

    await record('data-plane file delete succeeds', async () => {
      const result = await httpFiles(filesPort, 'DELETE', `/${shareName}/models/model.bin`, undefined, fileHeaders);
      assert.equal(result.status, 202);
      return { status: result.status };
    });

    await record('data-plane file get after delete is not found', async () => {
      const result = await httpFiles(filesPort, 'GET', `/${shareName}/models/model.bin`, undefined, fileHeaders);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, method, path] of [
      ['unsupported file share snapshot route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.Storage', `${sharePath}/snapshots/snap1`)],
      ['unsupported file share lease action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.Storage', `${sharePath}/lease`)],
      ['unsupported file share restore action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.Storage', `${sharePath}/restore`)],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, method === 'POST' ? {} : undefined);
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('NetApp volume create is explicit parent gap until parents are modeled', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.NetApp', netAppVolumePath, '2023-11-01'), { location: 'eastus', properties: { usageThreshold: 1099511627776 } });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('NetApp volume list is explicit parent gap until parents are modeled', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.NetApp', netAppVolumeCollectionPath, '2023-11-01'));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('unsupported NetApp volume snapshot route fails closed', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.NetApp', `${netAppVolumePath}/snapshots/snap1`, '2023-11-01'));
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create storage account and file share', async () => {
      const deploymentName = `files-deploy-${suffix}`;
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(templateAccount, templateShare),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/storageAccounts/${templateAccount}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/shares/${templateShare}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('file share delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Storage', sharePath));
      assert.equal(result.status, 200);
      filesRouter.unregisterShare({ accountName, shareName });
      return { status: result.status };
    });

    await record('data-plane share get after ARM delete is not found', async () => {
      const result = await httpFiles(filesPort, 'GET', `/${shareName}?restype=share`, undefined, fileHeaders);
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ShareNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('file share get after delete is Azure-shaped 404', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', sharePath));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ShareNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('storage account delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Storage', accountBase));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('storage account get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', accountBase));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
    });
  });

  const failed = cases.filter(item => !item.ok);
  return { ok: failed.length === 0, total: cases.length, failedCount: failed.length, resourceGroup, accountName, shareName, cases };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return { ok: true, skipped: true, reason: '--skip-platforms was provided', expectedPlatforms: azurePlatforms.length, results: [] };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-files-parity-local-token',
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
    '# Azure Files Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Storage account under test: ${report.controlPlane.accountName}`,
    `- Share under test: ${report.controlPlane.shareName}`,
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Files share ARM lifecycle, stricter parameter rejection, Azure Files REST-shaped local directory/file create, range upload, read, list, delete, unsupported share route fail-closed behavior, explicit Azure NetApp parent-gap behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Azure Files as 99%-complete or cloudValidated for SMB/NFS protocol behavior, Shared Key signature validation, identity-based mount, snapshots, leases, backup/restore, quota enforcement, Azure NetApp Files lifecycle, RBAC, private link, throttling, or exact Azure service runtime behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Files share ARM lifecycle, Azure Files REST-shaped local file data-plane checks, validation, unsupported route fail-closed checks, explicit NetApp gap checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Files cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Files parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
