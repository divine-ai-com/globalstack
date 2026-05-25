import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createKeyVaultRouter, createKeyVaultRouterServer } from '../../packages/azure-data-plane/src/key-vault-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-key-vault-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const tenantId = process.env.GLOBALSTACK_AZURE_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
const token = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
const authHeader = `Bearer ${token}`;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    const timeoutMs = options.timeoutMs ?? 900000;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124 });
    }, timeoutMs);
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

async function withKeyVaultRouter(fn) {
  const router = createKeyVaultRouter();
  const server = createKeyVaultRouterServer(router);
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

async function httpDataPlaneJson(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let parsed = null;
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2023-07-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function vaultBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: {
      tenantId,
      sku: { family: 'A', name: 'standard' },
      accessPolicies: [],
      enabledForDeployment: true,
      enableRbacAuthorization: false,
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function secretArmBody(overrides = {}) {
  return {
    properties: {
      value: 'secret-value-v1',
      contentType: 'text/plain',
      attributes: { enabled: true },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function keyArmBody(overrides = {}) {
  return {
    properties: {
      kty: 'RSA',
      keySize: 2048,
      keyOps: ['encrypt', 'decrypt'],
      attributes: { enabled: true },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody(vaultName, secretName, keyName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        parameters: {
          vaultName: { type: 'string', defaultValue: vaultName },
          secretName: { type: 'string', defaultValue: secretName },
          keyName: { type: 'string', defaultValue: keyName },
        },
        resources: [
          {
            type: 'Microsoft.KeyVault/vaults',
            apiVersion: '2023-07-01',
            name: "[parameters('vaultName')]",
            location: 'eastus',
            properties: {
              tenantId,
              sku: { family: 'A', name: 'standard' },
              accessPolicies: [],
              enabledForDeployment: true,
            },
          },
          {
            type: 'Microsoft.KeyVault/vaults/secrets',
            apiVersion: '2023-07-01',
            name: "[format('{0}/{1}', parameters('vaultName'), parameters('secretName'))]",
            properties: {
              value: 'template-secret-value',
              contentType: 'text/plain',
              attributes: { enabled: true },
            },
          },
          {
            type: 'Microsoft.KeyVault/vaults/keys',
            apiVersion: '2023-07-01',
            name: "[format('{0}/{1}', parameters('vaultName'), parameters('keyName'))]",
            properties: {
              kty: 'RSA',
              keySize: 2048,
              keyOps: ['encrypt', 'decrypt'],
              attributes: { enabled: true },
            },
          },
        ],
        outputs: {
          vaultName: { type: 'string', value: "[parameters('vaultName')]" },
        },
      },
    },
  };
}

async function runControlAndDataPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-kv-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-kv-missing-${suffix}`;
  const vaultName = `kv-${suffix}`.slice(0, 24);
  const missingVaultName = `missing-${suffix}`.slice(0, 24);
  const secretName = `secret-${suffix}`.slice(0, 80);
  const disabledSecretName = `disabled-${suffix}`.slice(0, 80);
  const recoverableSecretName = `recoverable-${suffix}`.slice(0, 80);
  const keyName = `key-${suffix}`.slice(0, 80);
  const encryptOnlyKeyName = `encrypt-only-${suffix}`.slice(0, 80);
  let vaultHost = null;
  let cipherText = null;
  let firstSecretVersion = null;

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      cases.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await withKeyVaultRouter(async (routerPort, router) => {
    await withArmServer(async (armPort) => {
      const vaultPath = `vaults/${vaultName}`;
      const missingVaultPath = `vaults/${missingVaultName}`;
      const secretPath = `${vaultPath}/secrets/${secretName}`;
      const keyPath = `${vaultPath}/keys/${keyName}`;

      await record('unauthenticated ARM request is rejected', async () => {
        const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}`, undefined, { auth: false });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'InvalidAuthenticationToken');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('malformed bearer token is rejected', async () => {
        const result = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath),
          undefined,
          { headers: { authorization: 'Bearer' } },
        );
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'InvalidAuthenticationToken');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('wrong bearer token is rejected', async () => {
        const result = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath),
          undefined,
          { headers: { authorization: 'Bearer not-the-globalstack-local-token' } },
        );
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'InvalidAuthenticationToken');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('subscription mismatch is rejected', async () => {
        const result = await httpJson(
          armPort,
          'GET',
          `/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/${resourceGroup}/providers/Microsoft.KeyVault/${vaultPath}?api-version=2023-07-01`,
        );
        assert.equal(result.status, 403);
        assert.equal(errorCode(result), 'AuthorizationFailed');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('missing api-version is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPathWithoutApiVersion(resourceGroup, 'Microsoft.KeyVault', vaultPath),
          vaultBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'MissingApiVersionParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('vault create requires an existing resource group', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(missingResourceGroup, 'Microsoft.KeyVault', vaultPath),
          vaultBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceGroupNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('resource group create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
          location: 'eastus',
          tags: { purpose: 'globalstack-key-vault-parity', ttl: 'ephemeral' },
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.name, resourceGroup);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('vault empty body is rejected', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath), {});
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'LocationRequired');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('vault invalid location is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath),
          vaultBody({ location: 'globalstack-invalid-location' }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceLocation');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('vault invalid name is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', 'vaults/1bad'),
          vaultBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('vault missing tenantId is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath),
          vaultBody({ properties: { tenantId: undefined } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('vault invalid sku is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath),
          vaultBody({ properties: { sku: { family: 'B', name: 'invalid' } } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('vault accessPolicies must be an array', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath),
          vaultBody({ properties: { accessPolicies: {} } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('valid vault create succeeds with vaultUri metadata', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath), vaultBody({
          tags: { workload: 'genai-secret-store' },
        }));
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.KeyVault/vaults');
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.equal(result.body.properties.vaultUri, `https://${vaultName}.vault.azure.net/`);
        assert.equal(result.body.globalstack.capabilityId, 'key-vault-secrets');
        vaultHost = new URL(result.body.properties.vaultUri).host;
        router.registerVault({ vaultName, vaultUri: result.body.properties.vaultUri });
        return { status: result.status, vaultUri: result.body.properties.vaultUri };
      });

      await record('vault get returns Succeeded', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        return { status: result.status, resourceId: result.body.id };
      });

      await record('vault update preserves vaultUri metadata', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath), vaultBody({
          tags: { workload: 'robotics-signing' },
        }));
        assert.equal(result.status, 200);
        assert.equal(result.body.tags.workload, 'robotics-signing');
        assert.equal(result.body.properties.vaultUri, `https://${vaultName}.vault.azure.net/`);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('vault list includes created vault', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.KeyVault', 'vaults'));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name === vaultName));
        return { status: result.status, count: result.body.value.length };
      });

      await record('secret create with missing vault preserves captured ParentResourceNotFound', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', `${missingVaultPath}/secrets/orphan`),
          secretArmBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ParentResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('key create with missing vault preserves captured ParentResourceNotFound', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', `${missingVaultPath}/keys/orphan`),
          keyArmBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ParentResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('secret invalid name is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', `${vaultPath}/secrets/bad_secret`),
          secretArmBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('secret missing value is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', secretPath),
          secretArmBody({ properties: { value: undefined } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('valid secret ARM create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.KeyVault', secretPath), secretArmBody());
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.KeyVault/vaults/secrets');
        assert.equal(result.body.properties.secretUri, `https://${vaultName}.vault.azure.net/secrets/${secretName}`);
        assert.equal(result.body.globalstack.capabilityId, 'key-vault-secrets');
        router.setSecret({ vaultName, secretName, value: result.body.properties.value, contentType: result.body.properties.contentType });
        return { status: result.status, resourceId: result.body.id };
      });

      await record('secret ARM update succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.KeyVault', secretPath), secretArmBody({
          properties: { value: 'secret-value-v2' },
        }));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.value, 'secret-value-v2');
        router.setSecret({ vaultName, secretName, value: result.body.properties.value, contentType: result.body.properties.contentType });
        return { status: result.status, resourceId: result.body.id };
      });

      await record('secret ARM list includes created secret', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.KeyVault', `${vaultPath}/secrets`));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name.endsWith(secretName)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('secret ARM delete preserves captured DeleteNotSupported', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.KeyVault', secretPath));
        assert.equal(result.status, 405);
        assert.equal(errorCode(result), 'DeleteNotSupported');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('key invalid name is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', `${vaultPath}/keys/bad_key`),
          keyArmBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('key missing kty is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', keyPath),
          keyArmBody({ properties: { kty: undefined } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('key invalid keySize is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', keyPath),
          keyArmBody({ properties: { keySize: 1024 } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('valid key ARM create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.KeyVault', keyPath), keyArmBody());
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.KeyVault/vaults/keys');
        assert.equal(result.body.properties.keyUri, `https://${vaultName}.vault.azure.net/keys/${keyName}`);
        assert.equal(result.body.globalstack.capabilityId, 'key-vault-keys');
        router.createKey({ vaultName, keyName, kty: result.body.properties.kty, keyOps: result.body.properties.keyOps });
        return { status: result.status, resourceId: result.body.id };
      });

      await record('key ARM list includes created key', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.KeyVault', `${vaultPath}/keys`));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name.endsWith(keyName)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('key ARM delete preserves captured DeleteNotSupported', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.KeyVault', keyPath));
        assert.equal(result.status, 405);
        assert.equal(errorCode(result), 'DeleteNotSupported');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane request without token is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}?api-version=7.4`, undefined, { host: vaultHost });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane malformed bearer token is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: 'Bearer' });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane missing api-version is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ApiVersionParameterRequired');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane unsupported api-version is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}?api-version=7.0`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'UnsupportedApiVersion');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane unknown vault is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}?api-version=7.4`, undefined, { host: `${missingVaultName}.vault.azure.net`, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'VaultNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane secret missing value is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${secretName}?api-version=7.4`, {}, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane secret invalid contentType is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${secretName}?api-version=7.4`, {
          value: 'bad-content-type',
          contentType: { invalid: true },
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane secret invalid tags shape is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${secretName}?api-version=7.4`, {
          value: 'bad-tags',
          tags: ['not-an-object'],
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane secret invalid attributes shape is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${secretName}?api-version=7.4`, {
          value: 'bad-attributes',
          attributes: ['not-an-object'],
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane secret invalid enabled attribute is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${secretName}?api-version=7.4`, {
          value: 'bad-enabled',
          attributes: { enabled: 'false' },
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane secret set succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${secretName}?api-version=7.4`, {
          value: 'data-plane-secret',
          contentType: 'text/plain',
          tags: { source: 'parity' },
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.value, 'data-plane-secret');
        assert.ok(result.body.id.includes(`/secrets/${secretName}/`));
        firstSecretVersion = result.body.id.split('/').at(-1);
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane secret second version set succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${secretName}?api-version=7.4`, {
          value: 'data-plane-secret-v2',
          contentType: 'text/plain',
          tags: { source: 'parity', generation: 'second' },
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.value, 'data-plane-secret-v2');
        assert.notEqual(result.body.id.split('/').at(-1), firstSecretVersion);
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane secret get succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.value, 'data-plane-secret-v2');
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane secret get explicit first version succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}/${firstSecretVersion}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.value, 'data-plane-secret');
        assert.ok(result.body.id.endsWith(`/${firstSecretVersion}`));
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane secret missing version is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}/00000000000000000000000000000000?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'SecretNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane secret list includes created secret', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/secrets?api-version=7.4', undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.id.includes(`/secrets/${secretName}/`)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('data-plane secret versions list includes both versions', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}/versions?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.value.length >= 2);
        assert.ok(result.body.value.some(item => item.id.endsWith(`/${firstSecretVersion}`)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('data-plane repeated secret versions list remains stable across repeated reads', async () => {
        const first = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}/versions?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        const second = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}/versions?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.deepEqual(
          second.body.value.map(item => item.id).sort(),
          first.body.value.map(item => item.id).sort(),
        );
        return { status: second.status, count: second.body.value.length };
      });

      await record('data-plane disabled secret set succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${disabledSecretName}?api-version=7.4`, {
          value: 'disabled-secret',
          attributes: { enabled: false },
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.attributes.enabled, false);
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane disabled secret get is forbidden', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${disabledSecretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 403);
        assert.equal(errorCode(result), 'SecretDisabled');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane recoverable secret set succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/secrets/${recoverableSecretName}?api-version=7.4`, {
          value: 'recoverable-secret',
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.id.includes(`/secrets/${recoverableSecretName}/`));
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane recoverable secret delete succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'DELETE', `/secrets/${recoverableSecretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.recoveryId.endsWith(`/deletedsecrets/${recoverableSecretName}`));
        return { status: result.status, recoveryId: result.body.recoveryId };
      });

      await record('data-plane deleted secret get succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/deletedsecrets/${recoverableSecretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.recoveryId.endsWith(`/deletedsecrets/${recoverableSecretName}`));
        return { status: result.status, recoveryId: result.body.recoveryId };
      });

      await record('data-plane deleted secret list includes deleted item', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/deletedsecrets?api-version=7.4', undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.recoveryId.endsWith(`/deletedsecrets/${recoverableSecretName}`)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('data-plane deleted secret recover succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/deletedsecrets/${recoverableSecretName}/recover?api-version=7.4`, {}, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.value, 'recoverable-secret');
        assert.ok(result.body.id.includes(`/secrets/${recoverableSecretName}/`));
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane recovered secret get succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${recoverableSecretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.value, 'recoverable-secret');
        return { status: result.status, id: result.body.id };
      });

      await record('data-plane recovered secret delete succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'DELETE', `/secrets/${recoverableSecretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.recoveryId.endsWith(`/deletedsecrets/${recoverableSecretName}`));
        return { status: result.status, recoveryId: result.body.recoveryId };
      });

      await record('data-plane deleted secret purge succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'DELETE', `/deletedsecrets/${recoverableSecretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 204);
        return { status: result.status };
      });

      await record('data-plane purged deleted secret get is not found', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/deletedsecrets/${recoverableSecretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'SecretNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane key create invalid kty is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/create?api-version=7.4`, { kty: 'oct' }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane key create invalid key_ops is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/create?api-version=7.4`, {
          kty: 'RSA',
          key_ops: ['teleport'],
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane key create invalid key_size is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/create?api-version=7.4`, {
          kty: 'RSA',
          key_size: 1024,
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('key invalid keyOps value is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.KeyVault', keyPath),
          keyArmBody({ properties: { keyOps: ['teleport'] } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane key create succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/create?api-version=7.4`, {
          kty: 'RSA',
          key_size: 2048,
          key_ops: ['encrypt', 'decrypt'],
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.key.kty, 'RSA');
        assert.ok(result.body.key.kid.includes(`/keys/${keyName}/`));
        return { status: result.status, kid: result.body.key.kid };
      });

      await record('data-plane key get succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/keys/${keyName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.body.key.kty, 'RSA');
        return { status: result.status, kid: result.body.key.kid };
      });

      await record('data-plane key list includes created key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/keys?api-version=7.4', undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.key.kid.includes(`/keys/${keyName}/`)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('data-plane encrypt-only key create succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${encryptOnlyKeyName}/create?api-version=7.4`, {
          kty: 'RSA',
          key_size: 2048,
          key_ops: ['encrypt'],
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.key.key_ops, ['encrypt']);
        return { status: result.status, kid: result.body.key.kid };
      });

      await record('data-plane encrypt-only key rejects decrypt operation', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${encryptOnlyKeyName}/decrypt?api-version=7.4`, {
          alg: 'RSA-OAEP',
          value: Buffer.from('payload').toString('base64url'),
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 403);
        assert.equal(errorCode(result), 'Forbidden');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane key encrypt requires supported algorithm', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/encrypt?api-version=7.4`, {
          alg: 'RSA1_5',
          value: Buffer.from('payload').toString('base64url'),
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane key encrypt succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/encrypt?api-version=7.4`, {
          alg: 'RSA-OAEP',
          value: Buffer.from('payload').toString('base64url'),
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.value);
        cipherText = result.body.value;
        return { status: result.status, kid: result.body.kid };
      });

      await record('data-plane key decrypt succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/decrypt?api-version=7.4`, {
          alg: 'RSA-OAEP',
          value: cipherText,
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(Buffer.from(result.body.value, 'base64url').toString('utf8'), 'payload');
        return { status: result.status, kid: result.body.kid };
      });

      await record('data-plane repeated key decrypt remains stable across repeated reads', async () => {
        const first = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/decrypt?api-version=7.4`, {
          alg: 'RSA-OAEP',
          value: cipherText,
        }, { host: vaultHost, authorization: authHeader });
        const second = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/decrypt?api-version=7.4`, {
          alg: 'RSA-OAEP',
          value: cipherText,
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.equal(Buffer.from(first.body.value, 'base64url').toString('utf8'), 'payload');
        assert.equal(Buffer.from(second.body.value, 'base64url').toString('utf8'), 'payload');
        return { status: second.status, kid: second.body.kid };
      });

      await record('data-plane key decrypt invalid ciphertext is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/keys/${keyName}/decrypt?api-version=7.4`, {
          alg: 'RSA-OAEP',
          value: Buffer.from('not-valid-ciphertext').toString('base64url'),
        }, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane unsupported secret action fails closed', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/secrets/${secretName}/recover?api-version=7.4`, {}, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 405);
        assert.equal(errorCode(result), 'MethodNotAllowed');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('inspection route exposes local keys', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/key-vault/vaults/${vaultName}/keys`);
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name === keyName));
        return { status: result.status, count: result.body.value.length };
      });

      await record('inspection route exposes local secrets', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/key-vault/vaults/${vaultName}/secrets`);
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name === secretName));
        return { status: result.status, count: result.body.value.length };
      });

      await record('ARM template deployment can create vault secret and key', async () => {
        const deploymentName = `kv-deploy-${suffix}`;
        const templateVault = `kv-t-${suffix}`.slice(0, 24);
        const templateSecret = `secret-t-${suffix}`.slice(0, 80);
        const templateKey = `key-t-${suffix}`.slice(0, 80);
        const result = await httpJson(
          armPort,
          'PUT',
          `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
          deploymentBody(templateVault, templateSecret, templateKey),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/vaults/${templateVault}`)));
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/secrets/${templateSecret}`)));
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/keys/${templateKey}`)));
        return { status: result.status, deploymentName };
      });

      await record('data-plane secret delete succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'DELETE', `/secrets/${secretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.recoveryId.endsWith(`/deletedsecrets/${secretName}`));
        return { status: result.status, recoveryId: result.body.recoveryId };
      });

      await record('data-plane secret get after delete is not found', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'SecretNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane key delete succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'DELETE', `/keys/${keyName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.ok(result.body.recoveryId.endsWith(`/deletedkeys/${keyName}`));
        return { status: result.status, recoveryId: result.body.recoveryId };
      });

      await record('data-plane key get after delete is not found', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/keys/${keyName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'KeyNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('vault delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath));
        assert.equal(result.status, 200);
        router.unregisterVault(vaultName);
        return { status: result.status };
      });

      await record('vault get after delete is not found', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.KeyVault', vaultPath));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('secret create after vault delete reports missing parent', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.KeyVault', secretPath), secretArmBody());
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ParentResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane request after vault delete is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/secrets/${secretName}?api-version=7.4`, undefined, { host: vaultHost, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'VaultNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('resource group delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', resourceGroupPath(resourceGroup));
        assert.equal(result.status, 200);
        return { status: result.status };
      });

      await record('resource group get after delete is not found', async () => {
        const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceGroupNotFound');
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
    vaultName,
    secretName,
    keyName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-key-vault-parity-local-token',
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
    '# Azure Key Vault Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlAndDataPlane.total - report.controlAndDataPlane.failedCount}/${report.controlAndDataPlane.total}`,
    `- Vault under test: ${report.controlAndDataPlane.vaultName}`,
    `- Secret under test: ${report.controlAndDataPlane.secretName}`,
    `- Key under test: ${report.controlAndDataPlane.keyName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlAndDataPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Platform Matrix');
  lines.push('');
  if (report.platformMatrix.skipped) {
    lines.push(`- Skipped: ${report.platformMatrix.reason}`);
  } else {
    lines.push(`- Passed: ${report.platformMatrix.passedCount}/${report.platformMatrix.expectedPlatforms}`);
    lines.push('');
    lines.push('| Platform | Status | Final Stage | Provisioning State |');
    lines.push('|---|---|---|---|');
    for (const item of report.platformMatrix.results) {
      lines.push(`| ${item.platformId} | ${item.ok ? 'pass' : 'fail'} | ${item.finalStage ?? ''} | ${item.provisioningState ?? ''} |`);
    }
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Key Vault ARM vault/secret/key lifecycle, captured missing-parent and delete-not-supported cases, local secret and RSA key data-plane smoke, disabled-secret rejection, deleted-secret get/recover/purge lifecycle, ARM-template deployment, and all-platform runner deployment paths. It does not mark Key Vault as 99%-complete or cloudValidated for full RBAC, access policies, private endpoints, firewall behavior, managed HSM, certificate surfaces, purge-protection policy parity, every cryptographic algorithm, key import/export constraints, request signing, audit logs, throttling, or every live Azure validation edge.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlAndDataPlane = await runControlAndDataPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlAndDataPlane.ok && platformMatrix.ok,
  scope: 'Azure Key Vault ARM vault/secret/key lifecycle, local secret and RSA key data-plane smoke, disabled/deleted secret lifecycle, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Key Vault cloudValidated claim.',
  controlAndDataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Key Vault parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
