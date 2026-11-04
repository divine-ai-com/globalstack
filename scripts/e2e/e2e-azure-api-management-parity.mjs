import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createApiManagementRouter, createApiManagementRouterServer } from '../../packages/azure-data-plane/src/api-management-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-api-management-parity');
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

async function withApiManagementRouter(fn) {
  const router = createApiManagementRouter();
  const server = createApiManagementRouterServer(router);
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2023-05-01-preview') {
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

function serviceBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Developer', capacity: 1 },
    properties: {
      publisherEmail: 'platform@example.com',
      publisherName: 'GlobalStack Platform',
    },
    ...overrides,
  };
}

function apiBody(overrides = {}) {
  return {
    properties: {
      displayName: 'ingestion-api',
      path: 'ingest',
      protocols: ['https'],
      serviceUrl: 'https://backend.example.com/api',
      subscriptionRequired: false,
    },
    ...overrides,
  };
}

function deploymentBody(resourceGroup, serviceName, apiName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.ApiManagement/service',
            apiVersion: '2023-05-01-preview',
            name: serviceName,
            location: 'eastus',
            sku: { name: 'Developer', capacity: 1 },
            properties: {
              publisherEmail: 'platform@example.com',
              publisherName: 'GlobalStack Platform',
            },
          },
          {
            type: 'Microsoft.ApiManagement/service/apis',
            apiVersion: '2023-05-01-preview',
            name: `${serviceName}/${apiName}`,
            properties: apiBody({
              properties: {
                displayName: 'contract-api',
                path: 'contract',
                protocols: ['https'],
                serviceUrl: 'https://backend.example.com/contract',
                subscriptionRequired: false,
              },
            }).properties,
          },
        ],
        outputs: {
          resourceGroup: { type: 'string', value: resourceGroup },
        },
      },
    },
  };
}

async function runControlPlaneAndGatewayMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-apim-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-apim-missing-${suffix}`;
  const serviceName = `apim-${suffix}`.slice(0, 50);
  const missingServiceName = `missing-${suffix}`.slice(0, 50);
  const apiName = `api-${suffix}`.slice(0, 60);
  const secureApiName = `secure-${suffix}`.slice(0, 60);
  const servicePath = `service/${serviceName}`;
  const apiPath = `${servicePath}/apis/${apiName}`;
  const secureApiPath = `${servicePath}/apis/${secureApiName}`;
  let gatewayHost = null;

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

  await withApiManagementRouter(async (routerPort, router) => {
    await withArmServer(async (armPort) => {
      await record('unauthenticated ARM request is rejected', async () => {
        const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}`, undefined, { auth: false });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'InvalidAuthenticationToken');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('malformed bearer token is rejected', async () => {
        const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}`, undefined, {
          auth: false,
          headers: { authorization: 'token globalstack-local-token' },
        });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'InvalidAuthenticationToken');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('wrong bearer token is rejected', async () => {
        const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}`, undefined, {
          headers: { authorization: 'Bearer wrong-globalstack-token' },
        });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'InvalidAuthenticationToken');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('subscription mismatch is rejected', async () => {
        const result = await httpJson(
          armPort,
          'GET',
          '/subscriptions/11111111-1111-1111-1111-111111111111',
        );
        assert.equal(result.status, 403);
        assert.equal(errorCode(result), 'AuthorizationFailed');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('missing api-version is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPathWithoutApiVersion(resourceGroup, 'Microsoft.ApiManagement', servicePath),
          serviceBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'MissingApiVersionParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('service create requires an existing resource group', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(missingResourceGroup, 'Microsoft.ApiManagement', servicePath),
          serviceBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceGroupNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('resource group create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
          location: 'eastus',
          tags: { purpose: 'globalstack-api-management-parity', ttl: 'ephemeral' },
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.name, resourceGroup);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('service collection list is empty before create', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ApiManagement', 'service'));
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.value, []);
        return { status: result.status, count: result.body.value.length };
      });

      await record('service delete missing returns no content', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.ApiManagement', `service/${missingServiceName}`));
        assert.equal(result.status, 204);
        assert.equal(result.body, null);
        return { status: result.status };
      });

      await record('service empty body is rejected', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath), {});
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'LocationRequired');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('service invalid location is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath),
          serviceBody({ location: 'globalstack-invalid-location' }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceLocation');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('service missing sku preserves captured rejection', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath),
          { location: 'eastus', properties: {} },
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidParameters');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('service missing publisher metadata is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath),
          serviceBody({ properties: { publisherEmail: 'platform@example.com' } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('service invalid name is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', 'service/1bad'),
          serviceBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      let asyncOperation = null;
      await record('valid service create returns async Azure shape', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath), serviceBody({
          tags: { workload: 'genai-ingestion' },
        }));
        assert.equal(result.status, 201);
        assert.ok(result.headers['azure-asyncoperation']);
        assert.equal(result.headers['retry-after'], '0');
        assert.equal(result.body.type, 'Microsoft.ApiManagement/service');
        assert.equal(result.body.properties.provisioningState, 'Creating');
        assert.ok(result.body.properties.gatewayUrl.endsWith('.azure-api.net'));
        asyncOperation = result.headers['azure-asyncoperation'];
        gatewayHost = new URL(result.body.properties.gatewayUrl).host;
        return { status: result.status, provisioningState: result.body.properties.provisioningState };
      });

      await record('service get exposes transitional provisioning state', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Creating');
        return { status: result.status, provisioningState: result.body.properties.provisioningState };
      });

      await record('async operation status reaches Succeeded', async () => {
        const result = await httpJson(armPort, 'GET', operationStatusPath(asyncOperation));
        assert.equal(result.status, 200);
        assert.equal(result.body.status, 'Succeeded');
        return { status: result.status };
      });

      await record('service get reaches Succeeded', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.equal(result.body.globalstack.capabilityId, 'api-management');
        router.registerService({ serviceName, gatewayUrl: result.body.properties.gatewayUrl });
        return { status: result.status, gatewayUrl: result.body.properties.gatewayUrl };
      });

      await record('service update preserves gateway metadata', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath), serviceBody({
          tags: { workload: 'robotics-control' },
        }));
        assert.equal(result.status, 200);
        assert.equal(result.body.tags.workload, 'robotics-control');
        assert.ok(result.body.properties.gatewayUrl.endsWith('.azure-api.net'));
        return { status: result.status, resourceId: result.body.id };
      });

      await record('api collection list is empty before child create', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ApiManagement', `${servicePath}/apis`));
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.value, []);
        return { status: result.status, count: result.body.value.length };
      });

      await record('api create with missing parent preserves captured ResourceNotFound', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', `service/${missingServiceName}/apis/orphan`),
          apiBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('api list with missing parent is rejected', async () => {
        const result = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', `service/${missingServiceName}/apis`),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('api missing path is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', apiPath),
          { properties: { displayName: 'missing-path' } },
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('api protocols must be an array', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', apiPath),
          apiBody({ properties: { displayName: 'bad-protocols', path: 'bad-protocols', protocols: 'https' } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('api invalid identifier is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', `${servicePath}/apis/bad%23api`),
          apiBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('api create succeeds with documented path shape', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ApiManagement', apiPath), apiBody());
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.ApiManagement/service/apis');
        assert.equal(result.body.properties.path, 'ingest');
        assert.equal(result.body.globalstack.capabilityId, 'api-management');
        router.registerApi({ serviceName, apiId: apiName, properties: result.body.properties });
        return { status: result.status, resourceId: result.body.id };
      });

      await record('api idempotent update succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ApiManagement', apiPath), apiBody({
          properties: {
            displayName: 'ingestion-api-v2',
            path: 'ingest',
            protocols: ['https'],
            serviceUrl: 'https://backend.example.com/api/v2',
            subscriptionRequired: false,
          },
        }));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.displayName, 'ingestion-api-v2');
        router.registerApi({ serviceName, apiId: apiName, properties: result.body.properties });
        return { status: result.status, resourceId: result.body.id };
      });

      await record('subscription-required api create succeeds for gateway rejection tests', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ApiManagement', secureApiPath), apiBody({
          properties: {
            displayName: 'secure-api',
            path: 'secure',
            protocols: ['https'],
            serviceUrl: 'https://backend.example.com/secure',
            subscriptionRequired: true,
          },
        }));
        assert.equal(result.status, 201);
        router.registerApi({ serviceName, apiId: secureApiName, properties: result.body.properties });
        return { status: result.status, resourceId: result.body.id };
      });

      await record('api list includes created resources', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ApiManagement', `${servicePath}/apis`));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name.endsWith(apiName)));
        assert.ok(result.body.value.some(item => item.name.endsWith(secureApiName)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('service unsupported subscription action fails closed', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.ApiManagement', `${servicePath}/subscriptions/master/listSecrets`),
          {},
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'GlobalStackRouteNotImplemented');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('gateway unknown host is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/ingest/documents', undefined, { host: 'unknown.azure-api.net' });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('gateway unknown api path is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/unknown/ping', undefined, { host: gatewayHost });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'OperationNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('gateway subscription-required api rejects missing key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/secure/status', undefined, { host: gatewayHost });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'AccessDenied');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('gateway subscription-required api accepts provided local key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/secure/status', undefined, {
          host: gatewayHost,
          'ocp-apim-subscription-key': 'globalstack-local-subscription-key',
        });
        assert.equal(result.status, 200);
        assert.equal(result.body.apiId, secureApiName);
        return { status: result.status, route: result.headers['x-globalstack-apim-route'] };
      });

      await record('gateway routes configured api locally', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/ingest/documents', { documentId: 'doc-001' }, { host: gatewayHost });
        assert.equal(result.status, 200);
        assert.equal(result.body.serviceName, serviceName);
        assert.equal(result.body.apiId, apiName);
        assert.equal(result.body.body.documentId, 'doc-001');
        return { status: result.status, route: result.headers['x-globalstack-apim-route'] };
      });

      await record('gateway route remains stable across repeated requests', async () => {
        const first = await httpDataPlaneJson(routerPort, 'POST', '/ingest/documents', { documentId: 'doc-001' }, { host: gatewayHost });
        const second = await httpDataPlaneJson(routerPort, 'POST', '/ingest/documents', { documentId: 'doc-002' }, { host: gatewayHost });
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.equal(first.headers['x-globalstack-apim-route'], second.headers['x-globalstack-apim-route']);
        assert.equal(second.body.serviceName, serviceName);
        assert.equal(second.body.apiId, apiName);
        assert.equal(second.body.body.documentId, 'doc-002');
        return { status: second.status, route: second.headers['x-globalstack-apim-route'] };
      });

      await record('inspection route exposes local apis', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/apim/services/${serviceName}/apis`);
        assert.equal(result.status, 200);
        assert.equal(result.body.value.length, 2);
        return { status: result.status, count: result.body.value.length };
      });

      await record('inspection route rejects unknown service', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/apim/services/${missingServiceName}/apis`);
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('ARM template deployment can create service and api', async () => {
        const deploymentName = `apim-deploy-${suffix}`;
        const deploymentService = `apimd${suffix}`.slice(0, 50);
        const deploymentApi = `contract-${suffix}`.slice(0, 60);
        const result = await httpJson(
          armPort,
          'PUT',
          `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
          deploymentBody(resourceGroup, deploymentService, deploymentApi),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/service/${deploymentService}`)));
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/apis/${deploymentApi}`)));
        return { status: result.status, deploymentName };
      });

      for (const child of [
        { name: 'secure api', path: secureApiPath, routePath: 'secure' },
        { name: 'api', path: apiPath, routePath: 'ingest' },
      ]) {
        await record(`${child.name} delete succeeds`, async () => {
          const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.ApiManagement', child.path));
          assert.equal(result.status, 200);
          router.unregisterApi({ serviceName, path: child.routePath });
          return { status: result.status };
        });

        await record(`${child.name} get after delete is not found`, async () => {
          const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ApiManagement', child.path));
          assert.equal(result.status, 404);
          assert.equal(errorCode(result), 'ResourceNotFound');
          return { status: result.status, errorCode: errorCode(result) };
        });

        await record(`${child.name} gateway route after delete is rejected`, async () => {
          const result = await httpDataPlaneJson(routerPort, 'GET', `/${child.routePath}/status`, undefined, {
            host: gatewayHost,
            'ocp-apim-subscription-key': 'globalstack-local-subscription-key',
          });
          assert.equal(result.status, 404);
          assert.equal(errorCode(result), 'OperationNotFound');
          return { status: result.status, errorCode: errorCode(result) };
        });
      }

      await record('service delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath));
        assert.equal(result.status, 200);
        router.unregisterService(serviceName);
        return { status: result.status };
      });

      await record('service get after delete is not found', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ApiManagement', servicePath));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('gateway after service delete is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/ingest/documents', undefined, { host: gatewayHost });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('api create after service delete reports missing parent', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ApiManagement', apiPath), apiBody());
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
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
    serviceName,
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
    '# Azure API Management Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Gateway Plane',
    '',
    `- Passed: ${report.controlAndGatewayPlane.total - report.controlAndGatewayPlane.failedCount}/${report.controlAndGatewayPlane.total}`,
    `- Service under test: ${report.controlAndGatewayPlane.serviceName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlAndGatewayPlane.cases) {
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
  lines.push('This run proves local GlobalStack handling for the listed API Management service/API ARM lifecycle, captured rejection cases, ARM-template deployment path, and local gateway route smoke. It does not mark API Management as 99%-complete or cloudValidated for the full policy engine, products, subscriptions, custom domains, certificates, developer portal, backend credentials, private networking, transforms, quotas, or every live Azure validation edge.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlAndGatewayPlane = await runControlPlaneAndGatewayMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlAndGatewayPlane.ok && platformMatrix.ok,
  scope: 'Azure API Management ARM service/API lifecycle, local gateway route smoke, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure API Management cloudValidated claim.',
  controlAndGatewayPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure API Management parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
