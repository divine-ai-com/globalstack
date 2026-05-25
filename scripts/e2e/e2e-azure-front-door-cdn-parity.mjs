import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createEdgeRouterServer } from '../../packages/azure-data-plane/src/edge-router.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-front-door-cdn-parity');
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

async function withRuntimeServers(fn) {
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const armServer = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
  });
  const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
  await new Promise(resolve => armServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => edgeServer.listen(0, '127.0.0.1', resolve));
  const armPort = armServer.address().port;
  const edgePort = edgeServer.address().port;
  try {
    return await fn({ armPort, edgePort, runtime });
  } finally {
    await new Promise(resolve => edgeServer.close(resolve));
    await new Promise(resolve => armServer.close(resolve));
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

async function edgeJson(port, method, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(options.host ? { 'x-forwarded-host': options.host } : {}),
      ...(options.protocol ? { 'x-forwarded-proto': options.protocol } : {}),
      ...(options.headers ?? {}),
    },
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

function profilePath(resourceGroup, profileName, apiVersion = '2023-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}`, apiVersion);
}

function afdEndpointPath(resourceGroup, profileName, endpointName, apiVersion = '2023-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/afdEndpoints/${endpointName}`, apiVersion);
}

function afdOriginGroupPath(resourceGroup, profileName, originGroupName, apiVersion = '2024-02-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/originGroups/${originGroupName}`, apiVersion);
}

function afdOriginPath(resourceGroup, profileName, originGroupName, originName, apiVersion = '2024-02-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/originGroups/${originGroupName}/origins/${originName}`, apiVersion);
}

function afdRoutePath(resourceGroup, profileName, endpointName, routeName, apiVersion = '2024-02-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/afdEndpoints/${endpointName}/routes/${routeName}`, apiVersion);
}

function cdnEndpointPath(resourceGroup, profileName, endpointName, apiVersion = '2021-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/endpoints/${endpointName}`, apiVersion);
}

function profileBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'robotics-edge-cdn' },
    sku: { name: 'Standard_AzureFrontDoor', ...(overrides.sku ?? {}) },
    properties: {
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function afdEndpointBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'ai-mlops-front-door' },
    properties: {
      enabledState: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function cdnEndpointBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'ml-artifact-distribution' },
    properties: {
      origins: [
        {
          name: 'origin1',
          properties: {
            hostName: 'example.org',
            httpPort: 80,
            httpsPort: 443,
          },
        },
      ],
      isHttpAllowed: true,
      isHttpsAllowed: true,
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function afdOriginGroupBody(overrides = {}) {
  return {
    properties: {
      sessionAffinityState: 'Disabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function afdOriginBody(overrides = {}) {
  return {
    properties: {
      hostName: 'origin.example.org',
      httpPort: 80,
      httpsPort: 443,
      originHostHeader: 'origin.example.org',
      enabledState: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function afdRouteBody(originGroupId, overrides = {}) {
  return {
    properties: {
      originGroup: { id: originGroupId },
      supportedProtocols: ['Http', 'Https'],
      forwardingProtocol: 'MatchRequest',
      patternsToMatch: ['/mlops/*'],
      enabledState: 'Enabled',
      linkToDefaultDomain: 'Enabled',
      httpsRedirect: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody({ profileName, afdEndpointName, cdnEndpointName }) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Cdn/profiles',
            apiVersion: '2023-05-01',
            name: profileName,
            location: 'eastus',
            sku: profileBody().sku,
            properties: profileBody().properties,
          },
          {
            type: 'Microsoft.Cdn/profiles/afdEndpoints',
            apiVersion: '2023-05-01',
            name: `${profileName}/${afdEndpointName}`,
            location: 'eastus',
            dependsOn: [`Microsoft.Cdn/profiles/${profileName}`],
            properties: afdEndpointBody().properties,
          },
          {
            type: 'Microsoft.Cdn/profiles/endpoints',
            apiVersion: '2021-06-01',
            name: `${profileName}/${cdnEndpointName}`,
            location: 'eastus',
            dependsOn: [`Microsoft.Cdn/profiles/${profileName}`],
            properties: cdnEndpointBody().properties,
          },
        ],
        outputs: {
          profileName: { type: 'string', value: profileName },
          afdEndpointName: { type: 'string', value: afdEndpointName },
          cdnEndpointName: { type: 'string', value: cdnEndpointName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-cdn-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-cdn-missing-${suffix}`;
  const profileName = `cdn-${suffix}`.slice(0, 40);
  const afdEndpointName = `afd-${suffix}`.slice(0, 40);
  const afdOriginGroupName = `og-${suffix}`.slice(0, 40);
  const afdOriginName = `origin-${suffix}`.slice(0, 40);
  const afdRouteName = `route-${suffix}`.slice(0, 40);
  const cdnEndpointName = `endpoint-${suffix}`.slice(0, 40);
  const missingProfileName = `cdn-missing-${suffix}`.slice(0, 40);
  const missingEndpointName = `endpoint-missing-${suffix}`.slice(0, 40);

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

  await withRuntimeServers(async ({ armPort, edgePort }) => {
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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}`), profileBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('profile create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', profilePath(missingResourceGroup, profileName), profileBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('afd endpoint create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', afdEndpointPath(resourceGroup, missingProfileName, afdEndpointName), afdEndpointBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-front-door-cdn-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('profile collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', 'profiles', '2023-05-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('profile delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', profilePath(resourceGroup, missingProfileName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('afd endpoint create requires an existing profile', async () => {
      const result = await httpJson(armPort, 'PUT', afdEndpointPath(resourceGroup, missingProfileName, afdEndpointName), afdEndpointBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['profile empty body is rejected', profileName, {}, 'LocationRequired'],
      ['profile invalid location is rejected', profileName, profileBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['profile invalid name is rejected', `-bad-${suffix}`, profileBody(), 'InvalidResourceName'],
      ['profile missing sku is rejected', profileName, { location: 'eastus', properties: {} }, 'BadRequest'],
      ['profile invalid sku is rejected', profileName, profileBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } }), 'BadRequest'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', profilePath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('profile create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', profilePath(resourceGroup, profileName), profileBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.name, profileName);
      assert.equal(result.body.properties.resourceState, 'Active');
      return { status: result.status, resourceState: result.body.properties.resourceState };
    });

    await record('profile get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', profilePath(resourceGroup, profileName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status };
    });

    await record('afd endpoint collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/afdEndpoints`, '2023-05-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('cdn endpoint collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/endpoints`, '2021-06-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, path, body, expectedCode] of [
      ['afd endpoint invalid location is rejected', afdEndpointPath(resourceGroup, profileName, afdEndpointName), afdEndpointBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['afd endpoint invalid name is rejected', afdEndpointPath(resourceGroup, profileName, `-bad-${suffix}`), afdEndpointBody(), 'InvalidResourceName'],
      ['afd endpoint invalid enabledState is rejected', afdEndpointPath(resourceGroup, profileName, afdEndpointName), afdEndpointBody({ properties: { enabledState: 'Paused' } }), 'BadRequest'],
      ['cdn endpoint invalid location is rejected', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName), cdnEndpointBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['cdn endpoint invalid name is rejected', cdnEndpointPath(resourceGroup, profileName, `-bad-${suffix}`), cdnEndpointBody(), 'InvalidResourceName'],
      ['cdn endpoint missing origins is rejected', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName), cdnEndpointBody({ properties: { origins: [] } }), 'BadRequest'],
      ['cdn endpoint invalid origin host is rejected', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName), cdnEndpointBody({ properties: { origins: [{ name: 'origin1', properties: {} }] } }), 'BadRequest'],
      ['cdn endpoint invalid origin port is rejected', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName), cdnEndpointBody({ properties: { origins: [{ name: 'origin1', properties: { hostName: 'example.org', httpPort: 70000 } }] } }), 'BadRequest'],
      ['cdn endpoint invalid http flag is rejected', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName), cdnEndpointBody({ properties: { isHttpAllowed: 'yes' } }), 'BadRequest'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', path, body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('afd endpoint create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', afdEndpointPath(resourceGroup, profileName, afdEndpointName), afdEndpointBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.hostName, `${afdEndpointName}.azurefd.net`);
      return { status: result.status, hostName: result.body.properties.hostName };
    });

    await record('afd origin group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', afdOriginGroupPath(resourceGroup, profileName, afdOriginGroupName), afdOriginGroupBody());
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('afd origin create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', afdOriginPath(resourceGroup, profileName, afdOriginGroupName, afdOriginName), afdOriginBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.hostName, 'origin.example.org');
      return { status: result.status, hostName: result.body.properties.hostName };
    });

    await record('afd route create succeeds', async () => {
      const originGroupId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Cdn/profiles/${profileName}/originGroups/${afdOriginGroupName}`;
      const result = await httpJson(armPort, 'PUT', afdRoutePath(resourceGroup, profileName, afdEndpointName, afdRouteName), afdRouteBody(originGroupId));
      assert.equal(result.status, 201);
      assert.deepEqual(result.body.properties.patternsToMatch, ['/mlops/*']);
      return { status: result.status };
    });

    await record('afd route get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', afdRoutePath(resourceGroup, profileName, afdEndpointName, afdRouteName));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.properties.patternsToMatch, ['/mlops/*']);
      return { status: result.status };
    });

    await record('cdn endpoint create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName), cdnEndpointBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.hostName, `${cdnEndpointName}.azureedge.net`);
      return { status: result.status, hostName: result.body.properties.hostName };
    });

    await record('local edge router unknown host is not found', async () => {
      const result = await edgeJson(edgePort, 'GET', '/robotics/models/v1', { host: `${missingEndpointName}.azureedge.net` });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'EndpointNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local front door edge route succeeds', async () => {
      const result = await edgeJson(edgePort, 'GET', '/mlops/control-plane/health?region=eastus', { host: `${afdEndpointName}.azurefd.net`, protocol: 'https' });
      assert.equal(result.status, 200);
      assert.equal(result.headers['x-globalstack-edge-route'], `frontdoor/${afdEndpointName}`);
      assert.equal(result.body.kind, 'frontdoor');
      assert.equal(result.body.protocol, 'https');
      assert.equal(result.headers['x-globalstack-origin-host'], 'origin.example.org');
      return { status: result.status, route: result.headers['x-globalstack-edge-route'] };
    });

    await record('local front door edge route rejects unmatched path', async () => {
      const result = await edgeJson(edgePort, 'GET', '/private/model.tar', { host: `${afdEndpointName}.azurefd.net`, protocol: 'https' });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'RouteNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local cdn edge route returns configured origin', async () => {
      const result = await edgeJson(edgePort, 'GET', '/artifacts/robotics/model.onnx', { host: `${cdnEndpointName}.azureedge.net` });
      assert.equal(result.status, 200);
      assert.equal(result.headers['x-globalstack-edge-route'], `cdn/${cdnEndpointName}`);
      assert.equal(result.headers['x-globalstack-origin-host'], 'example.org');
      assert.equal(result.body.originHost, 'example.org');
      return { status: result.status, originHost: result.body.originHost };
    });

    await record('local cdn edge route rejects disabled http', async () => {
      const secureEndpointName = `secure-${suffix}`.slice(0, 40);
      const created = await httpJson(armPort, 'PUT', cdnEndpointPath(resourceGroup, profileName, secureEndpointName), cdnEndpointBody({
        properties: {
          isHttpAllowed: false,
          isHttpsAllowed: true,
        },
      }));
      assert.equal(created.status, 201);
      const result = await edgeJson(edgePort, 'GET', '/private/model.tar', { host: `${secureEndpointName}.azureedge.net`, protocol: 'http' });
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'ProtocolNotAllowed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('afd endpoint get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', afdEndpointPath(resourceGroup, profileName, afdEndpointName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.enabledState, 'Enabled');
      return { status: result.status };
    });

    await record('cdn endpoint get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.resourceState, 'Running');
      return { status: result.status };
    });

    await record('afd endpoint update can disable endpoint', async () => {
      const result = await httpJson(armPort, 'PUT', afdEndpointPath(resourceGroup, profileName, afdEndpointName), afdEndpointBody({ properties: { enabledState: 'Disabled' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.enabledState, 'Disabled');
      return { status: result.status };
    });

    await record('local front door edge route rejects disabled endpoint', async () => {
      const result = await edgeJson(edgePort, 'GET', '/mlops/control-plane/health', { host: `${afdEndpointName}.azurefd.net`, protocol: 'https' });
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'EndpointDisabled');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('profile list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', 'profiles', '2023-05-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === profileName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('afd endpoint list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/afdEndpoints`, '2023-05-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${profileName}/${afdEndpointName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('cdn endpoint list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/endpoints`, '2021-06-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${profileName}/${cdnEndpointName}`));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, path] of [
      ['unsupported cdn rules route fails closed', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/ruleSets/ruleset1`, '2023-05-01')],
      ['unsupported cdn purge action route fails closed', providerPath(resourceGroup, 'Microsoft.Cdn', `profiles/${profileName}/endpoints/${cdnEndpointName}/purge`, '2021-06-01')],
    ]) {
      await record(name, async () => {
        const method = name.includes('purge') ? 'POST' : 'GET';
        const result = await httpJson(armPort, method, path, method === 'POST' ? {} : undefined);
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create front door and cdn endpoints', async () => {
      const deploymentName = `cdn-deploy-${suffix}`;
      const deploymentProfile = `cdn-deploy-${suffix}`.slice(0, 40);
      const deploymentAfd = `afd-deploy-${suffix}`.slice(0, 40);
      const deploymentCdn = `endpoint-deploy-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({ profileName: deploymentProfile, afdEndpointName: deploymentAfd, cdnEndpointName: deploymentCdn }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/profiles/${deploymentProfile}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/afdEndpoints/${deploymentAfd}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/endpoints/${deploymentCdn}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('afd endpoint delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', afdEndpointPath(resourceGroup, profileName, afdEndpointName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('cdn endpoint delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('profile delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', profilePath(resourceGroup, profileName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('afd endpoint get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', afdEndpointPath(resourceGroup, profileName, afdEndpointName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cdn endpoint delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', cdnEndpointPath(resourceGroup, profileName, cdnEndpointName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('profile get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', profilePath(resourceGroup, profileName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    profileName,
    afdEndpointName,
    cdnEndpointName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-front-door-cdn-parity-local-token',
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
    '# Azure Front Door/CDN Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Profile under test: ${report.controlPlane.profileName}`,
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Front Door and CDN profile/endpoint ARM lifecycle, local edge host/protocol/origin routing checks, stricter parameter rejection, unsupported CDN child/action routes failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Front Door or CDN as 99%-complete or cloudValidated for global edge routing, cache invalidation, POP behavior, origin health probes, rules engine behavior, custom domains, TLS certificate lifecycle, WAF attachment behavior, throttling, RBAC, or exact Azure edge/runtime behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Front Door/CDN profile and endpoint ARM lifecycle, local edge routing checks, validation, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Front Door/CDN cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Front Door/CDN parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
