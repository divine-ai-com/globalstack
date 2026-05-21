import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import {
  createFunctionsRouter,
  createFunctionsRouterServer,
  deterministicPublishingPassword,
  deterministicPublishingUsername,
} from '../packages/azure-data-plane/src/functions-router.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-functions-parity');
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

async function withArmServer(fn, options = {}) {
  const server = createArmServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function withFunctionsRouter(fn) {
  const router = createFunctionsRouter();
  const server = createFunctionsRouterServer(router);
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

function syncFunctionsResource(router, { resourceType, providerRoute, resource }) {
  if (resourceType === 'Microsoft.Web/sites') {
    router.registerApp({
      appName: resource.name,
      defaultHostName: resource.properties?.defaultHostName,
    });
    return;
  }
  if (resourceType === 'Microsoft.Web/sites/functions') {
    const [, appName, , functionName] = providerRoute.typePath.split('/');
    router.registerFunctionResource({
      appName,
      functionName,
      config: resource.properties?.config ?? {},
    });
  }
}

function unsyncFunctionsResource(router, { resourceType, providerRoute, resource }) {
  if (resourceType === 'Microsoft.Web/sites') {
    router.unregisterApp(resource?.name ?? providerRoute.typePath.split('/')[1]);
    return;
  }
  if (resourceType === 'Microsoft.Web/sites/functions') {
    const [, appName, , functionName] = providerRoute.typePath.split('/');
    router.unregisterFunctionResource({
      appName,
      functionName,
      config: resource?.properties?.config ?? {},
    });
  }
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2023-12-01') {
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

function serverFarmId(resourceGroup, planName) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Web/serverfarms/${planName}`;
}

function planBody(overrides = {}) {
  return {
    location: 'eastus',
    kind: 'functionapp',
    sku: { name: 'Y1', tier: 'Dynamic' },
    properties: {
      reserved: false,
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function functionAppBody(resourceGroup, planName, overrides = {}) {
  return {
    location: 'eastus',
    kind: 'functionapp',
    properties: {
      serverFarmId: serverFarmId(resourceGroup, planName),
      httpsOnly: true,
      siteConfig: {
        appSettings: [
          { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' },
          { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' },
        ],
      },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody(resourceGroup, planName, appName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        parameters: {
          planName: { type: 'string', defaultValue: planName },
          appName: { type: 'string', defaultValue: appName },
        },
        resources: [
          {
            type: 'Microsoft.Web/serverfarms',
            apiVersion: '2023-12-01',
            name: "[parameters('planName')]",
            location: 'eastus',
            kind: 'functionapp',
            sku: { name: 'Y1', tier: 'Dynamic' },
            properties: { reserved: false },
          },
          {
            type: 'Microsoft.Web/sites',
            apiVersion: '2023-12-01',
            name: "[parameters('appName')]",
            location: 'eastus',
            kind: 'functionapp',
            properties: {
              serverFarmId: "[format('/subscriptions/{0}/resourceGroups/{1}/providers/Microsoft.Web/serverfarms/{2}', subscription().subscriptionId, resourceGroup().name, parameters('planName'))]",
              httpsOnly: true,
              siteConfig: {
                appSettings: [
                  { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' },
                  { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' },
                ],
              },
            },
          },
        ],
        outputs: {
          functionAppName: { type: 'string', value: "[parameters('appName')]" },
          resourceGroup: { type: 'string', value: resourceGroup },
        },
      },
    },
  };
}

function functionResourceBody({ route, authLevel = 'function', methods = ['POST'] }) {
  return {
    properties: {
      config: {
        bindings: [
          {
            authLevel,
            type: 'httpTrigger',
            direction: 'in',
            name: 'req',
            methods,
            route,
          },
          {
            type: 'http',
            direction: 'out',
            name: '$return',
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function durableOrchestratorResourceBody() {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'orchestrationTrigger',
            direction: 'in',
            name: 'context',
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function durableActivityResourceBody() {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'activityTrigger',
            direction: 'in',
            name: 'input',
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function timerTriggerResourceBody({ schedule = '0 */5 * * * *' } = {}) {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'timerTrigger',
            direction: 'in',
            name: 'timerInfo',
            schedule,
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function queueTriggerResourceBody({ queueName = 'robot-events' } = {}) {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'queueTrigger',
            direction: 'in',
            name: 'message',
            queueName,
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function blobTriggerResourceBody({ path = 'model-artifacts/{name}' } = {}) {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'blobTrigger',
            direction: 'in',
            name: 'blob',
            path,
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function eventGridTriggerResourceBody({ eventType = 'ModelPromoted' } = {}) {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'eventGridTrigger',
            direction: 'in',
            name: 'event',
            eventType,
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function serviceBusTriggerResourceBody({ queueName = 'robot-bus' } = {}) {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'serviceBusTrigger',
            direction: 'in',
            name: 'message',
            queueName,
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

function eventHubTriggerResourceBody({ eventHubName = 'robot-hub' } = {}) {
  return {
    properties: {
      config: {
        bindings: [
          {
            type: 'eventHubTrigger',
            direction: 'in',
            name: 'events',
            eventHubName,
          },
        ],
      },
      files: {
        'function.json': '{}',
      },
      testData: '',
    },
  };
}

async function httpRaw(port, method, path, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload ?? ''), 'utf8');
    const req = request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        ...(body.length > 0 ? { 'content-length': body.length } : {}),
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
    if (body.length > 0) req.write(body);
    req.end();
  });
}

async function runControlAndDataPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-func-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-func-missing-${suffix}`;
  const planName = `plan-${suffix}`.slice(0, 40);
  const appName = `func-${suffix}`.slice(0, 60);
  const missingPlanName = `missing-${suffix}`.slice(0, 40);
  let securedFunctionKey = null;
  let hostFunctionKey = null;
  let planOperation = null;
  let appOperation = null;
  let functionHost = null;
  let durableWaitInstanceId = null;
  let durableTerminateInstanceId = null;
  let publishingUser = null;
  let publishingPassword = null;

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

  await withFunctionsRouter(async (routerPort, router) => {
    await withArmServer(async (armPort) => {
      const planPath = `serverfarms/${planName}`;
      const appPath = `sites/${appName}`;

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
          providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Web', planPath),
          planBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'MissingApiVersionParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('server farm create requires an existing resource group', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(missingResourceGroup, 'Microsoft.Web', planPath),
          planBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceGroupNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('resource group create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
          location: 'eastus',
          tags: { purpose: 'globalstack-functions-parity', ttl: 'ephemeral' },
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.name, resourceGroup);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('server farm collection list is empty before create', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', 'serverfarms'));
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.value, []);
        return { status: result.status, count: result.body.value.length };
      });

      await record('server farm delete missing returns no content', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Web', `serverfarms/${missingPlanName}`));
        assert.equal(result.status, 204);
        assert.equal(result.body, null);
        return { status: result.status };
      });

      await record('server farm empty body is rejected', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Web', planPath), {});
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'LocationRequired');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('server farm invalid location is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', planPath),
          planBody({ location: 'globalstack-invalid-location' }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceLocation');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('server farm invalid sku preserves captured rejection', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', planPath),
          planBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance', tier: 'Dynamic' } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('server farm minimal body preserves captured quota rejection', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', planPath),
          { location: 'eastus', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} },
        );
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('server farm invalid name is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', 'serverfarms/bad-'),
          planBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('valid server farm create returns async Azure shape', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Web', planPath), planBody({
          tags: { workload: 'mlops-http-triggers' },
        }));
        assert.equal(result.status, 201);
        assert.ok(result.headers['azure-asyncoperation']);
        assert.equal(result.body.type, 'Microsoft.Web/serverfarms');
        assert.equal(result.body.properties.provisioningState, 'Creating');
        planOperation = result.headers['azure-asyncoperation'];
        return { status: result.status, provisioningState: result.body.properties.provisioningState };
      });

      await record('server farm get exposes transitional provisioning state', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', planPath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Creating');
        return { status: result.status, provisioningState: result.body.properties.provisioningState };
      });

      await record('server farm async operation reaches Succeeded', async () => {
        const result = await httpJson(armPort, 'GET', operationStatusPath(planOperation));
        assert.equal(result.status, 200);
        assert.equal(result.body.status, 'Succeeded');
        return { status: result.status };
      });

      await record('server farm get reaches Succeeded', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', planPath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.equal(result.body.globalstack.capabilityId, 'azure-functions');
        return { status: result.status, resourceId: result.body.id };
      });

      await record('function app collection list is empty before create', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', 'sites'));
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.value, []);
        return { status: result.status, count: result.body.value.length };
      });

      await record('function app delete missing returns no content', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Web', `sites/missing-${suffix}`));
        assert.equal(result.status, 204);
        assert.equal(result.body, null);
        return { status: result.status };
      });

      await record('function app create with missing server farm preserves captured NotFound', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', appPath),
          functionAppBody(resourceGroup, missingPlanName),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'NotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app empty body is rejected', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Web', appPath), {});
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'LocationRequired');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app invalid location is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', appPath),
          functionAppBody(resourceGroup, planName, { location: 'globalstack-invalid-location' }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceLocation');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app invalid name is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', 'sites/bad-'),
          functionAppBody(resourceGroup, planName),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app missing serverFarmId is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', appPath),
          functionAppBody(resourceGroup, planName, { properties: { serverFarmId: undefined } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app invalid kind is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', appPath),
          functionAppBody(resourceGroup, planName, { kind: 'app' }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app invalid httpsOnly type is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', appPath),
          functionAppBody(resourceGroup, planName, { properties: { httpsOnly: 'true' } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'ValidationError');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('valid function app create returns async Azure shape', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Web', appPath), functionAppBody(resourceGroup, planName, {
          tags: { workload: 'robotics-command-router' },
        }));
        assert.equal(result.status, 201);
        assert.ok(result.headers['azure-asyncoperation']);
        assert.equal(result.body.type, 'Microsoft.Web/sites');
        assert.equal(result.body.properties.provisioningState, 'Creating');
        assert.equal(result.body.properties.defaultHostName, `${appName}.azurewebsites.net`);
        appOperation = result.headers['azure-asyncoperation'];
        return { status: result.status, provisioningState: result.body.properties.provisioningState };
      });

      await record('function app get exposes transitional provisioning state', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', appPath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Creating');
        assert.equal(result.body.properties.state, 'Starting');
        return { status: result.status, provisioningState: result.body.properties.provisioningState };
      });

      await record('function app async operation reaches Succeeded', async () => {
        const result = await httpJson(armPort, 'GET', operationStatusPath(appOperation));
        assert.equal(result.status, 200);
        assert.equal(result.body.status, 'Succeeded');
        return { status: result.status };
      });

      await record('function app get reaches Succeeded and registers local host', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', appPath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.equal(result.body.properties.state, 'Running');
        assert.equal(result.body.globalstack.capabilityId, 'azure-functions');
        functionHost = result.body.properties.defaultHostName;
        publishingUser = deterministicPublishingUsername(appName);
        publishingPassword = deterministicPublishingPassword(appName);
        return { status: result.status, host: functionHost };
      });

      await record('function app update preserves host metadata', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Web', appPath), functionAppBody(resourceGroup, planName, {
          tags: { workload: 'genai-batch-ingestion' },
        }));
        assert.equal(result.status, 200);
        assert.equal(result.body.tags.workload, 'genai-batch-ingestion');
        assert.equal(result.body.properties.defaultHostName, functionHost);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('function child resource create succeeds', async () => {
        const intake = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/intake`),
          functionResourceBody({ route: 'intake', authLevel: 'anonymous', methods: ['POST'] }),
        );
        assert.equal(intake.status, 201);
        assert.equal(intake.body.type, 'Microsoft.Web/sites/functions');
        const score = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/score`),
          functionResourceBody({ route: 'score/{id}', authLevel: 'function', methods: ['POST'] }),
        );
        assert.equal(score.status, 201);
        return { status: score.status, count: 2 };
      });

      await record('function listKeys returns deterministic key', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/score/listKeys`),
          {},
        );
        assert.equal(result.status, 200);
        assert.ok(result.body.keys?.default);
        securedFunctionKey = result.body.keys.default;
        return { status: result.status };
      });

      await record('function listSecrets returns trigger URL and key', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/score/listSecrets`),
          {},
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.key, securedFunctionKey);
        assert.match(result.body.trigger_url, new RegExp(`https?://${functionHost.replace('.', '\\.')}/api/score/\\{id\\}\\?code=`));
        return { status: result.status };
      });

      await record('function host listKeys returns host keys', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/host/default/listKeys`),
          {},
        );
        assert.equal(result.status, 200);
        assert.ok(result.body.masterKey);
        assert.ok(result.body.functionKeys?.default);
        hostFunctionKey = result.body.functionKeys.default;
        return { status: result.status };
      });

      await record('function app syncfunctiontriggers action succeeds', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/syncfunctiontriggers`),
          {},
        );
        assert.equal(result.status, 204);
        assert.equal(result.body, null);
        return { status: result.status };
      });

      await record('function app listsyncfunctiontriggerstatus reports registered functions', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/listsyncfunctiontriggerstatus`),
          {},
        );
        assert.equal(result.status, 200);
        assert.ok(Array.isArray(result.body.value));
        assert.ok(result.body.value.some(item => item.functionName === 'score' && item.status === 'Success'));
        return { status: result.status, count: result.body.value.length };
      });

      await record('function host status endpoint succeeds', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/admin/host/status?code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.state, 'Running');
        assert.equal(result.body.functionCount, 2);
        return { status: result.status, state: result.body.state };
      });

      await record('timer trigger function resource create succeeds', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/heartbeatTimer`),
          timerTriggerResourceBody(),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.Web/sites/functions');
        return { status: result.status };
      });

      await record('queue trigger function resource create succeeds', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/robotQueue`),
          queueTriggerResourceBody({ queueName: 'robot-events' }),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.Web/sites/functions');
        return { status: result.status };
      });

      await record('blob trigger function resource create succeeds', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/modelBlob`),
          blobTriggerResourceBody({ path: 'model-artifacts/{name}' }),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.Web/sites/functions');
        return { status: result.status };
      });

      await record('event grid trigger function resource create succeeds', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/modelEvents`),
          eventGridTriggerResourceBody({ eventType: 'ModelPublished' }),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.Web/sites/functions');
        return { status: result.status };
      });

      await record('service bus trigger function resource create succeeds', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/robotBus`),
          serviceBusTriggerResourceBody({ queueName: 'robot-bus' }),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.Web/sites/functions');
        return { status: result.status };
      });

      await record('event hub trigger function resource create succeeds', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/robotStream`),
          eventHubTriggerResourceBody({ eventHubName: 'robot-hub' }),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.Web/sites/functions');
        return { status: result.status };
      });

      await record('durable function resources create succeeds', async () => {
        const orchestrator = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/robotOrchestrator`),
          durableOrchestratorResourceBody(),
        );
        assert.equal(orchestrator.status, 201);
        const activity = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/scoreActivity`),
          durableActivityResourceBody(),
        );
        assert.equal(activity.status, 201);
        const archive = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/archiveActivity`),
          durableActivityResourceBody(),
        );
        assert.equal(archive.status, 201);
        const child = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/childOrchestrator`),
          durableOrchestratorResourceBody(),
        );
        assert.equal(child.status, 201);
        const fanout = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/fanoutOrchestrator`),
          durableOrchestratorResourceBody(),
        );
        assert.equal(fanout.status, 201);
        return { status: fanout.status, count: 5 };
      });

      await record('durable orchestration start rejects missing key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/runtime/webhooks/durabletask/orchestrators/robotOrchestrator', {
          waitForExternalEvent: 'approved',
        }, { host: functionHost });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('durable orchestration start rejects unknown orchestrator', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/runtime/webhooks/durabletask/orchestrators/missingFlow?code=' + encodeURIComponent(hostFunctionKey), {
          waitForExternalEvent: 'approved',
        }, { host: functionHost });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'OrchestratorNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('durable orchestration start rejects unknown activity', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            callActivities: ['missingActivity'],
          },
          { host: functionHost },
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ActivityFunctionNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('durable orchestration start returns management payload', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`, {
          waitForExternalEvent: 'approved',
          customStatus: 'waiting-review',
        }, { host: functionHost });
        assert.equal(result.status, 202);
        assert.ok(result.body.id);
        assert.ok(result.body.statusQueryGetUri);
        assert.ok(result.body.sendEventPostUri);
        durableWaitInstanceId = result.body.id;
        return { status: result.status, instanceId: durableWaitInstanceId };
      });

      await record('durable orchestration status query shows running instance', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.runtimeStatus, 'Running');
        assert.equal(result.body.customStatus, 'waiting-review');
        assert.ok(Array.isArray(result.body.history));
        return { status: result.status, runtimeStatus: result.body.runtimeStatus };
      });

      await record('durable orchestration executes declared activity history', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            callActivities: ['scoreActivity'],
            activityPayloads: {
              scoreActivity: { robotId: 'robot-19', score: 0.97 },
            },
          },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        const instanceId = started.body.id;
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${instanceId}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.runtimeStatus, 'Completed');
        assert.equal(result.body.output.activityResults.scoreActivity.input.robotId, 'robot-19');
        assert.ok(result.body.history.some(item => item.eventType === 'TaskScheduled' && item.name === 'scoreActivity'));
        assert.ok(result.body.history.some(item => item.eventType === 'TaskCompleted' && item.name === 'scoreActivity'));
        return { status: result.status, runtimeStatus: result.body.runtimeStatus };
      });

      await record('durable orchestration replay history is recorded', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            replayCount: 2,
            callActivities: ['scoreActivity'],
          },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        const replayEvents = result.body.history.filter(item => item.eventType === 'OrchestratorReplayed');
        assert.equal(replayEvents.length, 2);
        return { status: result.status, replayCount: replayEvents.length };
      });

      await record('durable orchestration future timer keeps instance running', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            durableTimers: [{ name: 'approvalTimeout', fireAfterMs: 60000 }],
          },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.runtimeStatus, 'Running');
        assert.ok(result.body.history.some(item => item.eventType === 'TimerCreated' && item.name === 'approvalTimeout'));
        assert.ok(!result.body.history.some(item => item.eventType === 'TimerFired' && item.name === 'approvalTimeout'));
        return { status: result.status, runtimeStatus: result.body.runtimeStatus };
      });

      await record('durable orchestration elapsed timer completes instance', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            durableTimers: [{ name: 'fastTimer', fireAfterMs: 10 }],
          },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        await new Promise(resolve => setTimeout(resolve, 25));
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.runtimeStatus, 'Completed');
        assert.equal(result.body.output.timerResults.fastTimer.fired, true);
        assert.ok(result.body.history.some(item => item.eventType === 'TimerCreated' && item.name === 'fastTimer'));
        assert.ok(result.body.history.some(item => item.eventType === 'TimerFired' && item.name === 'fastTimer'));
        return { status: result.status, runtimeStatus: result.body.runtimeStatus };
      });

      await record('durable orchestration fan out batches preserve checkpoints', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            callActivityBatches: [
              ['scoreActivity', 'archiveActivity'],
              ['scoreActivity'],
            ],
            activityPayloads: {
              scoreActivity: { robotId: 'robot-33', score: 0.99 },
              archiveActivity: { blob: 'robot-33.json' },
            },
          },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.runtimeStatus, 'Completed');
        assert.deepEqual(result.body.output.activityBatches[0].activities, ['scoreActivity', 'archiveActivity']);
        assert.deepEqual(result.body.output.checkpoints['checkpoint-1'].completedActivities, ['scoreActivity', 'archiveActivity']);
        assert.ok(result.body.history.some(item => item.eventType === 'CheckpointSaved' && item.batchIndex === 1));
        return { status: result.status, runtimeStatus: result.body.runtimeStatus };
      });

      await record('durable orchestration staged replay persists checkpoints across waits', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            replayStages: [
              { activities: ['scoreActivity'], waitForExternalEvent: 'approved' },
              { activities: ['archiveActivity'], durableTimer: { name: 'archive-delay', fireAfterMs: 10 } },
              { activities: ['scoreActivity'] },
            ],
            activityPayloads: {
              scoreActivity: { robotId: 'robot-41', score: 0.88 },
              archiveActivity: { blob: 'robot-41.json' },
            },
          },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        const firstStatus = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(firstStatus.status, 200);
        assert.equal(firstStatus.body.runtimeStatus, 'Running');
        assert.ok(firstStatus.body.history.some(item => item.eventType === 'CheckpointSaved' && item.batchIndex === 1));
        assert.ok(!firstStatus.body.history.some(item => item.name === 'archiveActivity' && item.eventType === 'TaskCompleted'));
        const raised = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/instances/${started.body.id}/raiseEvent/approved?code=${encodeURIComponent(hostFunctionKey)}`,
          { approved: true },
          { host: functionHost },
        );
        assert.equal(raised.status, 202);
        const secondStatus = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(secondStatus.status, 200);
        assert.equal(secondStatus.body.runtimeStatus, 'Running');
        assert.ok(secondStatus.body.history.some(item => item.eventType === 'CheckpointLoaded' && item.stageIndex === 2));
        assert.ok(secondStatus.body.history.some(item => item.eventType === 'TaskCompleted' && item.name === 'archiveActivity'));
        await new Promise(resolve => setTimeout(resolve, 25));
        const finalStatus = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(finalStatus.status, 200);
        assert.equal(finalStatus.body.runtimeStatus, 'Completed');
        assert.ok(finalStatus.body.history.some(item => item.eventType === 'CheckpointLoaded' && item.stageIndex === 3));
        assert.equal(finalStatus.body.output.checkpoints['checkpoint-3'].reason, 'replay-stage');
        return { status: finalStatus.status, runtimeStatus: finalStatus.body.runtimeStatus };
      });

      await record('durable orchestration staged replay preserves sub orchestration history', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          {
            replayStages: [
              { activities: ['scoreActivity'], subOrchestrations: ['childOrchestrator'], waitForExternalEvent: 'release' },
              { subOrchestrations: ['fanoutOrchestrator'], durableTimer: { name: 'fanout-delay', fireAfterMs: 10 } },
              { activities: ['archiveActivity'] },
            ],
            activityPayloads: {
              scoreActivity: { robotId: 'robot-59', score: 0.93 },
              archiveActivity: { blob: 'robot-59.json' },
            },
            subOrchestrationPayloads: {
              childOrchestrator: { shard: 'alpha' },
              fanoutOrchestrator: { shard: 'beta' },
            },
          },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        const raised = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/instances/${started.body.id}/raiseEvent/release?code=${encodeURIComponent(hostFunctionKey)}`,
          { allowed: true },
          { host: functionHost },
        );
        assert.equal(raised.status, 202);
        await new Promise(resolve => setTimeout(resolve, 25));
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${started.body.id}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.runtimeStatus, 'Completed');
        assert.ok(result.body.history.some(item => item.eventType === 'SubOrchestrationInstanceCreated' && item.name === 'childOrchestrator'));
        assert.ok(result.body.history.some(item => item.eventType === 'SubOrchestrationInstanceCompleted' && item.name === 'fanoutOrchestrator'));
        assert.equal(result.body.output.subOrchestrationResults.childOrchestrator.orchestratorName, 'childOrchestrator');
        assert.equal(result.body.output.subOrchestrationResults.fanoutOrchestrator.input.shard, 'beta');
        assert.ok(result.body.output.checkpoints['checkpoint-2'].fingerprint);
        return { status: result.status, runtimeStatus: result.body.runtimeStatus };
      });

      await record('durable orchestration rejects duplicate instance id', async () => {
        const instanceId = `durable-${suffix}`;
        const first = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}&instanceId=${instanceId}`,
          {
            waitForExternalEvent: 'dup-check',
          },
          { host: functionHost },
        );
        assert.equal(first.status, 202);
        const duplicate = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}&instanceId=${instanceId}`,
          {
            waitForExternalEvent: 'dup-check',
          },
          { host: functionHost },
        );
        assert.equal(duplicate.status, 409);
        assert.equal(errorCode(duplicate), 'InstanceAlreadyExists');
        return { status: duplicate.status, errorCode: errorCode(duplicate) };
      });

      await record('durable orchestration suspend and resume succeed', async () => {
        const suspend = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}/suspend?code=${encodeURIComponent(hostFunctionKey)}`,
          {},
          { host: functionHost },
        );
        assert.equal(suspend.status, 202);
        const suspended = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}?code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(suspended.body.runtimeStatus, 'Suspended');
        const resume = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}/resume?code=${encodeURIComponent(hostFunctionKey)}`,
          {},
          { host: functionHost },
        );
        assert.equal(resume.status, 202);
        const resumed = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}?code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(resumed.body.runtimeStatus, 'Running');
        return { status: resumed.status, runtimeStatus: resumed.body.runtimeStatus };
      });

      await record('durable orchestration rejects unexpected external event', async () => {
        const raised = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}/raiseEvent/unexpected?code=${encodeURIComponent(hostFunctionKey)}`,
          { reviewer: 'ops-bot' },
          { host: functionHost },
        );
        assert.equal(raised.status, 409);
        assert.equal(errorCode(raised), 'UnexpectedEvent');
        const status = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(status.status, 200);
        assert.equal(status.body.runtimeStatus, 'Running');
        assert.ok(!status.body.history.some(item => item.eventType === 'ExternalEventRaised' && item.name === 'unexpected'));
        return { status: raised.status, errorCode: errorCode(raised) };
      });

      await record('durable orchestration raise event completes instance', async () => {
        const raised = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}/raiseEvent/approved?code=${encodeURIComponent(hostFunctionKey)}`,
          { reviewer: 'ops-bot', approved: true },
          { host: functionHost },
        );
        assert.equal(raised.status, 202);
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${durableWaitInstanceId}?showHistory=true&code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.runtimeStatus, 'Completed');
        assert.equal(result.body.output.events[0].name, 'approved');
        assert.ok(result.body.history.some(item => item.eventType === 'ExecutionCompleted'));
        assert.ok(result.body.history.some(item => item.eventType === 'OrchestratorReplayed' && item.reason === 'external-event'));
        return { status: result.status, runtimeStatus: result.body.runtimeStatus };
      });

      await record('durable orchestration terminate and purge succeed', async () => {
        const started = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/orchestrators/robotOrchestrator?code=${encodeURIComponent(hostFunctionKey)}`,
          { waitForExternalEvent: 'terminateLater' },
          { host: functionHost },
        );
        assert.equal(started.status, 202);
        durableTerminateInstanceId = started.body.id;
        const terminate = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/runtime/webhooks/durabletask/instances/${durableTerminateInstanceId}/terminate?code=${encodeURIComponent(hostFunctionKey)}`,
          { reason: 'operator stop' },
          { host: functionHost },
        );
        assert.equal(terminate.status, 202);
        const terminated = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${durableTerminateInstanceId}?code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(terminated.status, 200);
        assert.equal(terminated.body.runtimeStatus, 'Terminated');
        const purge = await httpDataPlaneJson(
          routerPort,
          'DELETE',
          `/runtime/webhooks/durabletask/instances/${durableTerminateInstanceId}?code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(purge.status, 200);
        const missing = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/runtime/webhooks/durabletask/instances/${durableTerminateInstanceId}?code=${encodeURIComponent(hostFunctionKey)}`,
          undefined,
          { host: functionHost },
        );
        assert.equal(missing.status, 404);
        assert.equal(errorCode(missing), 'OrchestrationNotFound');
        return { status: purge.status, purged: true };
      });

      await record('function app unsupported function action fails closed', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Web', `${appPath}/functions/intake/token`),
          {},
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'GlobalStackRouteNotImplemented');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app list includes created resource', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', 'sites'));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name === appName));
        return { status: result.status, count: result.body.value.length };
      });

      await record('function route on unknown app is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/intake', { id: 'doc-001' }, { host: `missing-${suffix}.azurewebsites.net` });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('unknown function route is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/unknown', { id: 'doc-001' }, { host: functionHost });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'FunctionNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function route rejects disallowed method', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/api/intake', undefined, { host: functionHost });
        assert.equal(result.status, 405);
        assert.equal(errorCode(result), 'MethodNotAllowed');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('secured function rejects missing key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/score/robot-7', { score: 0.92 }, { host: functionHost });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('secured function rejects wrong query key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/score/robot-7?code=wrong-key', { score: 0.92 }, { host: functionHost });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('secured function rejects wrong header key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/score/robot-7', { score: 0.92 }, {
          host: functionHost,
          'x-functions-key': 'wrong-key',
        });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('anonymous HTTP trigger succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/intake', { documentId: 'doc-001' }, { host: functionHost });
        assert.equal(result.status, 200);
        assert.equal(result.body.appName, appName);
        assert.equal(result.body.functionName, 'intake');
        assert.equal(result.body.body.documentId, 'doc-001');
        return { status: result.status, route: result.headers['x-globalstack-functions-route'] };
      });

      await record('anonymous HTTP trigger succeeds without api prefix', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/intake', { documentId: 'doc-002' }, { host: functionHost });
        assert.equal(result.status, 200);
        assert.equal(result.body.appName, appName);
        assert.equal(result.body.functionName, 'intake');
        assert.equal(result.body.body.documentId, 'doc-002');
        return { status: result.status, route: result.headers['x-globalstack-functions-route'] };
      });

      await record('secured HTTP trigger accepts query code', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', `/api/score/robot-7?code=${securedFunctionKey}`, { score: 0.88 }, { host: functionHost });
        assert.equal(result.status, 200);
        assert.equal(result.body.functionName, 'score');
        assert.equal(result.body.params.id, 'robot-7');
        assert.equal(result.body.body.score, 0.88);
        return { status: result.status, route: result.headers['x-globalstack-functions-route'] };
      });

      await record('secured HTTP trigger accepts x-functions-key header', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/score/robot-8', { score: 0.99 }, { host: functionHost, 'x-functions-key': securedFunctionKey });
        assert.equal(result.status, 200);
        assert.equal(result.body.functionName, 'score');
        assert.equal(result.body.params.id, 'robot-8');
        assert.equal(result.body.body.score, 0.99);
        return { status: result.status, route: result.headers['x-globalstack-functions-route'] };
      });

      await record('inspection route exposes local functions', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/functions/apps/${appName}/functions`);
        assert.equal(result.status, 200);
        assert.equal(result.body.value.length, 2);
        return { status: result.status, count: result.body.value.length };
      });

      await record('inspection route rejects unknown app', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/functions/apps/missing-${suffix}/functions`);
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('admin trigger invocation rejects missing key', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/admin/functions/heartbeatTimer', { pastDue: false }, { host: functionHost });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('timer trigger admin invocation succeeds', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/admin/functions/heartbeatTimer?code=${encodeURIComponent(hostFunctionKey)}`,
          { pastDue: false },
          { host: functionHost },
        );
        assert.equal(result.status, 202);
        assert.equal(result.body.triggerType, 'timerTrigger');
        assert.equal(result.body.schedule, '0 */5 * * * *');
        return { status: result.status };
      });

      await record('queue trigger admin invocation succeeds', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/admin/functions/robotQueue?code=${encodeURIComponent(hostFunctionKey)}`,
          { id: 'msg-1', body: 'robot ready' },
          { host: functionHost },
        );
        assert.equal(result.status, 202);
        assert.equal(result.body.triggerType, 'queueTrigger');
        assert.equal(result.body.queueName, 'robot-events');
        assert.equal(result.body.input.id, 'msg-1');
        return { status: result.status };
      });

      await record('blob trigger admin invocation succeeds', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/admin/functions/modelBlob?code=${encodeURIComponent(hostFunctionKey)}`,
          { blobName: 'model-v5.bin' },
          { host: functionHost },
        );
        assert.equal(result.status, 202);
        assert.equal(result.body.triggerType, 'blobTrigger');
        assert.equal(result.body.path, 'model-artifacts/{name}');
        return { status: result.status };
      });

      await record('event grid trigger admin invocation succeeds', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/admin/functions/modelEvents?code=${encodeURIComponent(hostFunctionKey)}`,
          { eventType: 'ModelPublished', subject: '/models/v5' },
          { host: functionHost },
        );
        assert.equal(result.status, 202);
        assert.equal(result.body.triggerType, 'eventGridTrigger');
        assert.equal(result.body.eventType, 'ModelPublished');
        return { status: result.status };
      });

      await record('service bus trigger admin invocation succeeds', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/admin/functions/robotBus?code=${encodeURIComponent(hostFunctionKey)}`,
          { id: 'bus-1', body: 'robot bus message' },
          { host: functionHost },
        );
        assert.equal(result.status, 202);
        assert.equal(result.body.triggerType, 'serviceBusTrigger');
        assert.equal(result.body.queueName, 'robot-bus');
        assert.equal(result.body.input.id, 'bus-1');
        return { status: result.status };
      });

      await record('event hub trigger admin invocation succeeds', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'POST',
          `/admin/functions/robotStream?code=${encodeURIComponent(hostFunctionKey)}`,
          [{ sequenceNumber: 7, body: 'robot stream event' }],
          { host: functionHost },
        );
        assert.equal(result.status, 202);
        assert.equal(result.body.triggerType, 'eventHubTrigger');
        assert.equal(result.body.eventHubName, 'robot-hub');
        assert.equal(result.body.input[0].sequenceNumber, 7);
        return { status: result.status };
      });

      await record('zipdeploy rejects missing publishing credentials', async () => {
        const result = await httpRaw(
          routerPort,
          'POST',
          '/api/zipdeploy',
          Buffer.from('fake-zip-payload'),
          { host: `${appName}.scm.azurewebsites.net` },
        );
        assert.equal(result.status, 401);
        return { status: result.status };
      });

      await record('zipdeploy accepts deterministic publishing credentials', async () => {
        const result = await httpRaw(
          routerPort,
          'POST',
          '/api/zipdeploy',
          Buffer.from('fake-zip-payload-v1'),
          {
            host: `${appName}.scm.azurewebsites.net`,
            authorization: `Basic ${Buffer.from(`${publishingUser}:${publishingPassword}`).toString('base64')}`,
          },
        );
        assert.equal(result.status, 202);
        assert.equal(result.body.complete, true);
        assert.ok(result.body.packageHash);
        return { status: result.status, deploymentId: result.body.id };
      });

      await record('latest zipdeploy status exposes package metadata', async () => {
        const result = await httpRaw(
          routerPort,
          'GET',
          '/api/deployments/latest',
          undefined,
          {
            host: `${appName}.scm.azurewebsites.net`,
            authorization: `Basic ${Buffer.from(`${publishingUser}:${publishingPassword}`).toString('base64')}`,
          },
        );
        assert.equal(result.status, 200);
        assert.equal(result.body.status_text, 'Success');
        assert.equal(result.body.packageSizeBytes, Buffer.byteLength('fake-zip-payload-v1'));
        return { status: result.status, packageHash: result.body.packageHash };
      });

      await record('latest zipdeploy log exposes deployment messages', async () => {
        const result = await httpRaw(
          routerPort,
          'GET',
          '/api/deployments/latest/log',
          undefined,
          {
            host: `${appName}.scm.azurewebsites.net`,
            authorization: `Basic ${Buffer.from(`${publishingUser}:${publishingPassword}`).toString('base64')}`,
          },
        );
        assert.equal(result.status, 200);
        assert.ok(Array.isArray(result.body));
        assert.equal(result.body[0].type, 'Message');
        assert.match(result.body[0].message, /deployment completed successfully/i);
        return { status: result.status, logCount: result.body.length };
      });

      await record('ARM template deployment can create server farm and function app', async () => {
        const deploymentName = `func-deploy-${suffix}`;
        const deploymentPlan = `pland${suffix}`.slice(0, 40);
        const deploymentApp = `funcd${suffix}`.slice(0, 60);
        const result = await httpJson(
          armPort,
          'PUT',
          `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
          deploymentBody(resourceGroup, deploymentPlan, deploymentApp),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/serverfarms/${deploymentPlan}`)));
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/sites/${deploymentApp}`)));
        return { status: result.status, deploymentName };
      });

      await record('function app delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Web', appPath));
        assert.equal(result.status, 200);
        return { status: result.status };
      });

      await record('function app get after delete is not found', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', appPath));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('function app list after delete is empty', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', 'sites'));
        assert.equal(result.status, 200);
        assert.ok(!result.body.value.some(item => item.name === appName));
        return { status: result.status, count: result.body.value.length };
      });

      await record('function route after app delete is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/intake', { documentId: 'doc-002' }, { host: functionHost });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('server farm delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Web', planPath));
        assert.equal(result.status, 200);
        return { status: result.status };
      });

      await record('server farm get after delete is not found', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Web', planPath));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('server farm delete after delete returns no content', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.Web', planPath));
        assert.equal(result.status, 204);
        assert.equal(result.body, null);
        return { status: result.status };
      });

      await record('function app create after server farm delete reports missing parent', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.Web', appPath),
          functionAppBody(resourceGroup, planName),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'NotFound');
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
    }, {
      onResourcePut: context => syncFunctionsResource(router, context),
      onResourceDelete: context => unsyncFunctionsResource(router, context),
    });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    planName,
    appName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-functions-parity-local-token',
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
    '# Azure Functions Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlAndDataPlane.total - report.controlAndDataPlane.failedCount}/${report.controlAndDataPlane.total}`,
    `- Server farm under test: ${report.controlAndDataPlane.planName}`,
    `- Function App under test: ${report.controlAndDataPlane.appName}`,
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Functions server farm and Function App ARM lifecycle, Function child-resource create/listKeys/listSecrets and bounded trigger-sync behavior, bounded SCM zipdeploy plus deployment-log inspection, bounded Durable orchestration management plus activity-history, replay-marker, timer, fan-out, checkpoint, and unexpected-event rejection routes, captured rejection cases, ARM-template deployment path, and local HTTP-trigger route smoke. It does not mark Azure Functions as 99%-complete or cloudValidated for deployment packaging, full trigger-sync fidelity, scale controller behavior, non-HTTP triggers, full Durable Functions replay/history/activity semantics, deployment slots, runtime image build, managed identity tokens, binding retries, or every live Azure validation edge.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlAndDataPlane = await runControlAndDataPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlAndDataPlane.ok && platformMatrix.ok,
  scope: 'Azure Functions server farm and Function App ARM lifecycle, Function child-resource and listKeys/listSecrets behavior, bounded trigger-sync actions, SCM zipdeploy plus deployment-log inspection, bounded Durable orchestration management, activity-history, replay-marker, timer, fan-out, checkpoint, and unexpected-event rejection routes, local HTTP-trigger route smoke, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Functions cloudValidated claim.',
  controlAndDataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Functions parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
