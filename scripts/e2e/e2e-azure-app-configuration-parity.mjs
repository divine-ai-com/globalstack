import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createAppConfigurationRouter, createAppConfigurationRouterServer } from '../../packages/azure-data-plane/src/app-configuration-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-app-configuration-parity');
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

async function withAppConfigurationRouter(fn) {
  const router = createAppConfigurationRouter();
  const server = createAppConfigurationRouterServer(router);
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function storePath(resourceGroup, storeName, apiVersion = '2023-03-01') {
  return providerPath(resourceGroup, 'Microsoft.AppConfiguration', `configurationStores/${storeName}`, apiVersion);
}

function storeBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'ai-mlops-configuration' },
    sku: { name: 'free', ...(overrides.sku ?? {}) },
    properties: {
      disableLocalAuth: false,
      publicNetworkAccess: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function deploymentBody(storeName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.AppConfiguration/configurationStores',
            apiVersion: '2023-03-01',
            name: storeName,
            location: 'eastus',
            sku: { name: 'free' },
            properties: { disableLocalAuth: false, publicNetworkAccess: 'Enabled' },
          },
        ],
        outputs: {
          configurationStoreName: { type: 'string', value: storeName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-appcfg-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-appcfg-missing-${suffix}`;
  const storeName = `cfg${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 40);
  const missingStoreName = `cfgmissing${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 40);

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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.AppConfiguration', `configurationStores/${storeName}`), storeBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('configuration store create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', storePath(missingResourceGroup, storeName), storeBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-app-configuration-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('configuration store collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.AppConfiguration', 'configurationStores', '2023-03-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('configuration store delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', storePath(resourceGroup, missingStoreName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['configuration store empty body is rejected', storeName, {}, 'LocationRequired'],
      ['configuration store invalid location is rejected', storeName, storeBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['configuration store invalid name is rejected', `bad-${suffix}-`, storeBody(), 'InvalidResourceName'],
      ['configuration store missing sku is rejected', storeName, { location: 'eastus', properties: { disableLocalAuth: false } }, 'InvalidProperty'],
      ['configuration store invalid sku is rejected', storeName, storeBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } }), 'InvalidProperty'],
      ['configuration store invalid local auth flag is rejected', storeName, storeBody({ properties: { disableLocalAuth: 'false' } }), 'InvalidProperty'],
      ['configuration store invalid public access is rejected', storeName, storeBody({ properties: { publicNetworkAccess: 'PrivateOnly' } }), 'InvalidProperty'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', storePath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('configuration store create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', storePath(resourceGroup, storeName), storeBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.endpoint, `https://${storeName}.azconfig.io`);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status, endpoint: result.body.properties.endpoint };
    });

    await record('configuration store get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', storePath(resourceGroup, storeName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.disableLocalAuth, false);
      return { status: result.status };
    });

    await record('configuration store update can disable local auth', async () => {
      const result = await httpJson(armPort, 'PUT', storePath(resourceGroup, storeName), storeBody({ properties: { disableLocalAuth: true, publicNetworkAccess: 'Disabled' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.disableLocalAuth, true);
      assert.equal(result.body.properties.publicNetworkAccess, 'Disabled');
      return { status: result.status };
    });

    await record('configuration store list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.AppConfiguration', 'configurationStores', '2023-03-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === storeName));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, method, path] of [
      ['unsupported key-values route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.AppConfiguration', `configurationStores/${storeName}/keyValues/app:setting`, '2023-03-01')],
      ['unsupported feature flags route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.AppConfiguration', `configurationStores/${storeName}/featureFlags/myFeature`, '2023-03-01')],
      ['unsupported list keys action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.AppConfiguration', `configurationStores/${storeName}/listKeys`, '2023-03-01')],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, method === 'POST' ? {} : undefined);
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create configuration store', async () => {
      const deploymentName = `appcfg-deploy-${suffix}`;
      const deploymentStore = `cfgdeploy${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentStore),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/configurationStores/${deploymentStore}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('configuration store delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', storePath(resourceGroup, storeName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('configuration store get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', storePath(resourceGroup, storeName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('configuration store delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', storePath(resourceGroup, storeName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return { ok: failed.length === 0, total: cases.length, failedCount: failed.length, resourceGroup, storeName, cases };
}

async function runDataPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const storeName = `cfgdata${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 40);
  const missingStoreName = `cfgmissing${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 40);
  const host = `${storeName}.azconfig.io`;
  const auth = { host, authorization: authHeader };
  let firstEtag = null;
  let updatedEtag = null;

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

  await withAppConfigurationRouter(async (port, router) => {
    router.registerStore({ storeName });

    await record('data-plane request without token is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv/app:setting?api-version=1.0', undefined, { host });
      assert.equal(result.status, 401);
      assert.equal(result.body.name, 'Unauthorized');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane missing api-version is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv/app:setting', undefined, auth);
      assert.equal(result.status, 400);
      assert.equal(result.body.name, 'ApiVersionParameterRequired');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane unsupported api-version is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv/app:setting?api-version=1900-01-01', undefined, auth);
      assert.equal(result.status, 400);
      assert.equal(result.body.name, 'UnsupportedApiVersion');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane unknown store is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv/app:setting?api-version=1.0', undefined, {
        host: `${missingStoreName}.azconfig.io`,
        authorization: authHeader,
      });
      assert.equal(result.status, 404);
      assert.equal(result.body.name, 'StoreNotFound');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane missing key-value is not found', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv/app:setting?api-version=1.0', undefined, auth);
      assert.equal(result.status, 404);
      assert.equal(result.body.name, 'KeyValueNotFound');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane key-value requires string value', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?api-version=1.0', { value: 42 }, auth);
      assert.equal(result.status, 400);
      assert.equal(result.body.name, 'BadRequest');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane key-value rejects invalid tags shape', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?api-version=1.0', { value: 'enabled', tags: 'bad' }, auth);
      assert.equal(result.status, 400);
      assert.equal(result.body.name, 'BadRequest');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane key-value set succeeds', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?api-version=1.0', {
        value: 'enabled',
        content_type: 'text/plain',
        tags: { workload: 'mlops' },
      }, auth);
      assert.equal(result.status, 201);
      assert.equal(result.body.key, 'app:setting');
      assert.equal(result.body.value, 'enabled');
      assert.ok(result.headers.etag);
      firstEtag = result.headers.etag;
      return { status: result.status, etag: firstEtag };
    });

    await record('data-plane key-value get succeeds', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv/app:setting?api-version=1.0', undefined, auth);
      assert.equal(result.status, 200);
      assert.equal(result.body.value, 'enabled');
      assert.equal(result.headers.etag, firstEtag);
      return { status: result.status, etag: result.headers.etag };
    });

    await record('data-plane stale etag update is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?api-version=1.0', { value: 'disabled' }, {
        ...auth,
        'if-match': '"stale"',
      });
      assert.equal(result.status, 412);
      assert.equal(result.body.name, 'PreconditionFailed');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane matching etag update succeeds', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?api-version=1.0', { value: 'disabled' }, {
        ...auth,
        'if-match': firstEtag,
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.value, 'disabled');
      assert.notEqual(result.headers.etag, firstEtag);
      updatedEtag = result.headers.etag;
      return { status: result.status, etag: updatedEtag };
    });

    await record('data-plane if-none-match existing key is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?api-version=1.0', { value: 'blocked' }, {
        ...auth,
        'if-none-match': '*',
      });
      assert.equal(result.status, 412);
      assert.equal(result.body.name, 'PreconditionFailed');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane lock key-value succeeds', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/locks/app:setting?api-version=1.0', undefined, auth);
      assert.equal(result.status, 200);
      assert.equal(result.body.locked, true);
      return { status: result.status, etag: result.headers.etag };
    });

    await record('data-plane locked key-value update is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?api-version=1.0', { value: 'locked-update' }, {
        ...auth,
        'if-match': '*',
      });
      assert.equal(result.status, 409);
      assert.equal(result.body.name, 'KeyValueLocked');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane locked key-value delete is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'DELETE', '/kv/app:setting?api-version=1.0', undefined, auth);
      assert.equal(result.status, 409);
      assert.equal(result.body.name, 'KeyValueLocked');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane unlock key-value succeeds', async () => {
      const result = await httpDataPlaneJson(port, 'DELETE', '/locks/app:setting?api-version=1.0', undefined, auth);
      assert.equal(result.status, 200);
      assert.equal(result.body.locked, false);
      return { status: result.status, etag: result.headers.etag };
    });

    await record('data-plane delete with stale etag is rejected', async () => {
      const result = await httpDataPlaneJson(port, 'DELETE', '/kv/app:setting?api-version=1.0', undefined, {
        ...auth,
        'if-match': updatedEtag,
      });
      assert.equal(result.status, 412);
      assert.equal(result.body.name, 'PreconditionFailed');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane labeled key-value set succeeds', async () => {
      const result = await httpDataPlaneJson(port, 'PUT', '/kv/app:setting?label=prod&api-version=1.0', { value: 'prod-enabled' }, auth);
      assert.equal(result.status, 201);
      assert.equal(result.body.label, 'prod');
      return { status: result.status };
    });

    await record('data-plane key-values list supports key filter', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv?key=app:setting&api-version=1.0', undefined, auth);
      assert.equal(result.status, 200);
      assert.ok(result.body.items.length >= 2);
      return { status: result.status, count: result.body.items.length };
    });

    await record('data-plane key-values list supports label filter', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv?key=app:setting&label=prod&api-version=1.0', undefined, auth);
      assert.equal(result.status, 200);
      assert.equal(result.body.items.length, 1);
      assert.equal(result.body.items[0].value, 'prod-enabled');
      return { status: result.status, count: result.body.items.length };
    });

    await record('data-plane repeated labeled key-values list remains stable across repeated reads', async () => {
      const first = await httpDataPlaneJson(port, 'GET', '/kv?key=app:setting&label=prod&api-version=1.0', undefined, auth);
      const second = await httpDataPlaneJson(port, 'GET', '/kv?key=app:setting&label=prod&api-version=1.0', undefined, auth);
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(
        second.body.items.map(item => ({ key: item.key, label: item.label ?? null, value: item.value })),
        first.body.items.map(item => ({ key: item.key, label: item.label ?? null, value: item.value })),
      );
      return { status: second.status, count: second.body.items.length };
    });

    await record('data-plane unsupported feature-flags route fails closed', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/featureflags/myFeature?api-version=1.0', undefined, auth);
      assert.equal(result.status, 404);
      assert.equal(result.body.name, 'GlobalStackRouteNotImplemented');
      return { status: result.status, errorCode: result.body.name };
    });

    await record('data-plane key-value delete succeeds', async () => {
      const result = await httpDataPlaneJson(port, 'DELETE', '/kv/app:setting?api-version=1.0', undefined, auth);
      assert.equal(result.status, 200);
      assert.equal(result.body.key, 'app:setting');
      return { status: result.status };
    });

    await record('data-plane key-value get after delete is not found', async () => {
      const result = await httpDataPlaneJson(port, 'GET', '/kv/app:setting?api-version=1.0', undefined, auth);
      assert.equal(result.status, 404);
      assert.equal(result.body.name, 'KeyValueNotFound');
      return { status: result.status, errorCode: result.body.name };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return { ok: failed.length === 0, total: cases.length, failedCount: failed.length, storeName, cases };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return { ok: true, skipped: true, reason: '--skip-platforms was provided', expectedPlatforms: azurePlatforms.length, results: [] };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-app-configuration-parity-local-token',
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
    '# Azure App Configuration Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Store under test: ${report.controlPlane.storeName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Data Plane');
  lines.push('');
  lines.push(`- Passed: ${report.dataPlane.total - report.dataPlane.failedCount}/${report.dataPlane.total}`);
  lines.push('');
  lines.push('| Case | Status | HTTP | Error Code |');
  lines.push('|---|---|---:|---|');
  for (const item of report.dataPlane.cases) {
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
  lines.push('This run proves local GlobalStack handling for the listed Azure App Configuration store ARM lifecycle, stricter parameter rejection, local key-value data-plane lifecycle, ETag rejection, labels, unsupported data-plane route fail-closed behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark App Configuration as 99%-complete or cloudValidated for feature flags, snapshots, Key Vault references, revision history, refresh tokens, RBAC, private link, throttling, or exact Azure service runtime behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const dataPlane = await runDataPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && dataPlane.ok && platformMatrix.ok,
  scope: 'Azure App Configuration store ARM lifecycle, local key-value data-plane lifecycle, validation, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure App Configuration cloudValidated claim.',
  controlPlane,
  dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure App Configuration parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
