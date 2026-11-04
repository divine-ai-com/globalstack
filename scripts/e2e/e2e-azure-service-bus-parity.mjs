import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-service-bus-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const skipEmulator = process.argv.includes('--skip-emulator');
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

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2021-11-01') {
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

function namespaceBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Standard', tier: 'Standard' },
    properties: {},
    ...overrides,
  };
}

function deploymentBody(namespaceName, topicName, queueName, subscriptionName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.ServiceBus/namespaces',
            apiVersion: '2021-11-01',
            name: namespaceName,
            location: 'eastus',
            sku: { name: 'Standard', tier: 'Standard' },
            properties: {},
          },
          {
            type: 'Microsoft.ServiceBus/namespaces/topics',
            apiVersion: '2021-11-01',
            name: `${namespaceName}/${topicName}`,
            properties: { defaultMessageTimeToLive: 'P7D' },
          },
          {
            type: 'Microsoft.ServiceBus/namespaces/topics/subscriptions',
            apiVersion: '2021-11-01',
            name: `${namespaceName}/${topicName}/${subscriptionName}`,
            properties: { maxDeliveryCount: 5 },
          },
          {
            type: 'Microsoft.ServiceBus/namespaces/queues',
            apiVersion: '2021-11-01',
            name: `${namespaceName}/${queueName}`,
            properties: { maxDeliveryCount: 3 },
          },
        ],
        outputs: {
          namespaceName: { type: 'string', value: namespaceName },
          topicName: { type: 'string', value: topicName },
          queueName: { type: 'string', value: queueName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-sb-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-sb-missing-${suffix}`;
  const namespace = `sbus${suffix}`.slice(0, 50);
  const templateNamespace = `sbt${suffix}`.slice(0, 50);
  const topic = `model-events-${suffix}`;
  const queue = `robot-${suffix}`;
  const subscription = `processor-${suffix}`;
  const namespaceBase = `namespaces/${namespace}`;
  const topicPath = `${namespaceBase}/topics/${topic}`;
  const queuePath = `${namespaceBase}/queues/${queue}`;
  const subscriptionPath = `${topicPath}/subscriptions/${subscription}`;

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

  await withArmServer(async (port) => {
    await record('unauthenticated ARM request is rejected', async () => {
      const result = await httpJson(port, 'GET', `/subscriptions/${subscriptionId}`, undefined, { auth: false });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('malformed bearer token is rejected', async () => {
      const result = await httpJson(
        port,
        'GET',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase),
        undefined,
        { headers: { authorization: 'Bearer' } },
      );
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('wrong bearer token is rejected', async () => {
      const result = await httpJson(
        port,
        'GET',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase),
        undefined,
        { headers: { authorization: 'Bearer not-the-globalstack-local-token' } },
      );
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription mismatch is rejected', async () => {
      const result = await httpJson(
        port,
        'GET',
        `/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/${resourceGroup}/providers/Microsoft.ServiceBus/${namespaceBase}?api-version=2021-11-01`,
      );
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPathWithoutApiVersion(resourceGroup, 'Microsoft.ServiceBus', namespaceBase),
        namespaceBody(),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace create requires an existing resource group', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(missingResourceGroup, 'Microsoft.ServiceBus', namespaceBase),
        namespaceBody(),
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(port, 'PUT', resourceGroupPath(resourceGroup), {
        location: 'eastus',
        tags: { purpose: 'globalstack-service-bus-parity', ttl: 'ephemeral' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.name, resourceGroup);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('namespace delete not-found preserves Azure no-content shape', async () => {
      const result = await httpJson(port, 'DELETE', providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('namespace list is empty before create', async () => {
      const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', 'namespaces'));
      assert.equal(result.status, 200);
      assert.equal(result.body.value.length, 0);
      return { status: result.status, count: result.body.value.length };
    });

    await record('topic create before namespace reports missing parent', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', topicPath), {
        properties: {},
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('queue create before namespace reports missing parent', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', queuePath), {
        properties: {},
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('topic list before namespace reports missing parent', async () => {
      const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', `${namespaceBase}/topics`));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace empty body is rejected', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace invalid location is rejected', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase),
        namespaceBody({ location: 'globalstack-invalid-location' }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace invalid sku is rejected', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase),
        namespaceBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ValidateResourceInfoFailedWithInvalidSkuName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('namespace invalid name is rejected by official naming rules', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', 'namespaces/1bad'),
        namespaceBody(),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    let asyncOperation = null;
    await record('valid namespace create returns async Azure shape', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase), namespaceBody());
      assert.equal(result.status, 201);
      assert.ok(result.headers['azure-asyncoperation']);
      assert.ok(result.headers.location);
      assert.equal(result.headers['retry-after'], '0');
      assert.equal(result.body.properties.provisioningState, 'Creating');
      assert.equal(result.body.properties.status, 'Creating');
      asyncOperation = result.headers['azure-asyncoperation'];
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('namespace get exposes transitional provisioning state', async () => {
      const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Creating');
      assert.equal(result.body.properties.status, 'Creating');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('async operation status reaches Succeeded', async () => {
      const result = await httpJson(port, 'GET', operationStatusPath(asyncOperation));
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Succeeded');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('namespace get reaches Succeeded', async () => {
      const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.properties.status, 'Succeeded');
      assert.equal(result.body.globalstack.capabilityId, 'service-bus-topics');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('namespace update preserves resource shape', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase),
        namespaceBody({ tags: { workload: 'robotics' }, properties: { disableLocalAuth: false } }),
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'robotics');
      assert.equal(result.body.properties.disableLocalAuth, false);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('topic invalid name is rejected by official naming rules', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', `${namespaceBase}/topics/bad_`),
        { properties: {} },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('topic invalid max size is rejected', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', topicPath), {
        properties: { maxSizeInMegabytes: 0 },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('topic invalid default message ttl is rejected', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', topicPath), {
        properties: { defaultMessageTimeToLive: 'not-a-duration' },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('queue invalid name is rejected by official naming rules', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', `${namespaceBase}/queues/-bad`),
        { properties: {} },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('topic create succeeds', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', topicPath), {
        properties: { defaultMessageTimeToLive: 'P14D' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.globalstack.capabilityId, 'service-bus-topics');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('subscription create before topic reports missing parent', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', `${namespaceBase}/topics/missing-topic/subscriptions/${subscription}`), {
        properties: { maxDeliveryCount: 5 },
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('topic idempotent update succeeds', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', topicPath), {
        properties: { defaultMessageTimeToLive: 'P7D' },
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.defaultMessageTimeToLive, 'P7D');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('subscription invalid name is rejected by official naming rules', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', `${topicPath}/subscriptions/bad_`),
        { properties: {} },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription invalid max delivery count is rejected', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', subscriptionPath), {
        properties: { maxDeliveryCount: 0 },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription create succeeds', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', subscriptionPath), {
        properties: { maxDeliveryCount: 5 },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.globalstack.capabilityId, 'service-bus-topics');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('subscription list includes created resource', async () => {
      const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', `${topicPath}/subscriptions`));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.id.includes(subscriptionPath)));
      return { status: result.status, count: result.body.value.length };
    });

    await record('subscription list remains stable across repeated reads', async () => {
      const first = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', `${topicPath}/subscriptions`));
      const second = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', `${topicPath}/subscriptions`));
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(
        second.body.value.map(item => item.id).sort(),
        first.body.value.map(item => item.id).sort(),
      );
      return { status: second.status, count: second.body.value.length };
    });

    await record('queue create succeeds', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', queuePath), {
        properties: { maxDeliveryCount: 3 },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.globalstack.capabilityId, 'queue-storage');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('queue idempotent update succeeds', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', queuePath), {
        properties: { maxDeliveryCount: 7 },
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.maxDeliveryCount, 7);
      return { status: result.status, resourceId: result.body.id };
    });

    for (const child of [
      { name: 'namespace', path: 'namespaces', expectedId: namespaceBase },
      { name: 'topic', path: `${namespaceBase}/topics`, expectedId: topicPath },
      { name: 'queue', path: `${namespaceBase}/queues`, expectedId: queuePath },
    ]) {
      await record(`${child.name} list includes created resource`, async () => {
        const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', child.path));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.id.includes(child.expectedId)));
        return { status: result.status, count: result.body.value.length };
      });
    }

    await record('unsupported authorization rule action fails closed', async () => {
      const result = await httpJson(
        port,
        'POST',
        providerPath(resourceGroup, 'Microsoft.ServiceBus', `${topicPath}/authorizationRules/globalstack/listKeys`),
        {},
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'GlobalStackRouteNotImplemented');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create namespace topic subscription and queue', async () => {
      const deploymentName = `sb-deploy-${suffix}`;
      const templateTopic = `template-topic-${suffix}`;
      const templateQueue = `template-queue-${suffix}`;
      const templateSubscription = `template-sub-${suffix}`;
      const result = await httpJson(
        port,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(templateNamespace, templateTopic, templateQueue, templateSubscription),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/namespaces/${templateNamespace}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/topics/${templateTopic}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/subscriptions/${templateSubscription}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/queues/${templateQueue}`)));
      return { status: result.status, deploymentName };
    });

    for (const child of [
      { name: 'subscription', path: subscriptionPath },
      { name: 'topic', path: topicPath },
      { name: 'queue', path: queuePath },
    ]) {
      await record(`${child.name} delete succeeds`, async () => {
        const result = await httpJson(port, 'DELETE', providerPath(resourceGroup, 'Microsoft.ServiceBus', child.path));
        assert.equal(result.status, 200);
        return { status: result.status };
      });

      await record(`${child.name} get after delete is not found`, async () => {
        const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', child.path));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('namespace delete succeeds with async accepted status', async () => {
      const result = await httpJson(port, 'DELETE', providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase));
      assert.equal(result.status, 202);
      return { status: result.status };
    });

    await record('namespace get after delete is not found', async () => {
      const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.ServiceBus', namespaceBase));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('child create after namespace delete reports missing parent', async () => {
      const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.ServiceBus', `${namespaceBase}/topics/recreated`), {
        properties: {},
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group delete succeeds', async () => {
      const result = await httpJson(port, 'DELETE', resourceGroupPath(resourceGroup));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('resource group get after delete is not found', async () => {
      const result = await httpJson(port, 'GET', resourceGroupPath(resourceGroup));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    namespace,
    cases,
  };
}

async function runOfficialEmulatorMatrix() {
  if (skipEmulator) {
    return {
      ok: true,
      skipped: true,
      reason: '--skip-emulator was provided',
      resultsPath: null,
    };
  }
  const render = await run('npm', ['run', 'hybrid:render'], { timeoutMs: 120000 });
  if (render.code !== 0) return { ok: false, skipped: false, exitCode: render.code, stage: 'hybrid:render' };
  const result = await run('npm', ['run', 'e2e:service-bus'], { timeoutMs: 420000 });
  const resultsPath = join(root, 'dist', 'e2e', 'azure-service-bus', 'results.json');
  const summary = await readJson(resultsPath).catch(() => null);
  return {
    ok: result.code === 0 && summary?.ok === true,
    skipped: false,
    exitCode: result.code,
    resultsPath,
    steps: summary?.steps ?? [],
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
    '# Azure Service Bus Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Namespace under test: ${report.controlPlane.namespace}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Official Emulator');
  lines.push('');
  if (report.officialEmulator.skipped) {
    lines.push(`- Skipped: ${report.officialEmulator.reason}`);
  } else {
    lines.push(`- Status: ${report.officialEmulator.ok ? 'pass' : 'fail'}`);
    lines.push(`- Results: ${report.officialEmulator.resultsPath}`);
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
  lines.push('This run proves local GlobalStack handling for the listed Service Bus ARM request shapes, official emulator queue/topic messaging smoke, and platform runner lifecycle paths. It does not mark Service Bus as 99%-complete or cloudValidated for every live Azure API parameter, RBAC mode, retry behavior, topic filter behavior, or DLQ edge.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const officialEmulator = await runOfficialEmulatorMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && officialEmulator.ok && platformMatrix.ok,
  scope: 'Azure Service Bus ARM control-plane depth, official emulator queue/topic smoke, and all-platform GlobalStack deployment lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Service Bus cloudValidated claim.',
  controlPlane,
  officialEmulator,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Service Bus parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
