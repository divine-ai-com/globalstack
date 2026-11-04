import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEventGridRouter, createEventGridRouterServer } from '../../packages/azure-data-plane/src/event-grid-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-event-grid-parity');
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

async function withEventGridRouter(fn) {
  const router = createEventGridRouter();
  const server = createEventGridRouterServer(router);
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

async function httpDataPlaneRaw(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : String(body);
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
  return result.body?.error?.code ?? result.body?.code ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2022-06-15') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function topicBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: { inputSchema: 'EventGridSchema' },
    ...overrides,
  };
}

function deploymentBody(topicName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.EventGrid/topics',
            apiVersion: '2022-06-15',
            name: topicName,
            location: 'eastus',
            properties: { inputSchema: 'EventGridSchema' },
          },
        ],
        outputs: {
          topicName: { type: 'string', value: topicName },
        },
      },
    },
  };
}

function eventGridEvent(topicId, suffix) {
  return {
    id: `evt-${suffix}`,
    subject: '/mlops/features/batch-001',
    eventType: 'Contoso.MLOps.FeatureBatchUploaded',
    eventTime: '2026-05-18T00:00:00.000Z',
    data: {
      dataset: 'features',
      runId: suffix,
    },
    dataVersion: '1.0',
    topic: topicId,
  };
}

async function runControlPlaneAndDataPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-eg-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-eg-missing-${suffix}`;
  const topic = `egtopic-${suffix}`.slice(0, 50);
  const templateTopic = `egtemplate-${suffix}`.slice(0, 50);
  const missingTopic = `egmissing-${suffix}`.slice(0, 50);
  const eventSubscription = `sub-${suffix}`.slice(0, 40);
  const topicPath = `topics/${topic}`;
  const missingTopicPath = `topics/${missingTopic}`;
  let topicId = null;
  let topicEndpoint = null;
  let topicHost = null;
  let topicKey = null;

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

  await withEventGridRouter(async (routerPort, router) => {
    await withArmServer(async (armPort) => {
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
          providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath),
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
          providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath),
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
          `/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/${resourceGroup}/providers/Microsoft.EventGrid/${topicPath}?api-version=2022-06-15`,
        );
        assert.equal(result.status, 403);
        assert.equal(errorCode(result), 'AuthorizationFailed');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('missing api-version is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPathWithoutApiVersion(resourceGroup, 'Microsoft.EventGrid', topicPath),
          topicBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'MissingApiVersionParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('topic create requires an existing resource group', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(missingResourceGroup, 'Microsoft.EventGrid', topicPath),
          topicBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceGroupNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('resource group create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
          location: 'eastus',
          tags: { purpose: 'globalstack-event-grid-parity', ttl: 'ephemeral' },
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.name, resourceGroup);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('topic delete not-found preserves Azure no-content shape', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath));
        assert.equal(result.status, 204);
        return { status: result.status };
      });

      await record('topic list is empty before create', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventGrid', 'topics'));
        assert.equal(result.status, 200);
        assert.equal(result.body.value.length, 0);
        return { status: result.status, count: result.body.value.length };
      });

      await record('topic empty body is rejected', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath), {});
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'LocationRequired');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('topic invalid location is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath),
          topicBody({ location: 'globalstack-invalid-location' }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceLocation');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('topic invalid name is rejected by Azure naming rules', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.EventGrid', 'topics/-bad'),
          topicBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'BadRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('valid topic create succeeds with endpoint metadata', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath), topicBody({
          tags: { workload: 'mlops' },
        }));
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.EventGrid/topics');
        assert.equal(result.body.globalstack.capabilityId, 'event-grid');
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.ok(result.body.properties.endpoint.endsWith('/api/events'));
        topicId = result.body.id;
        topicEndpoint = result.body.properties.endpoint;
        topicHost = new URL(topicEndpoint).host;
        return { status: result.status, endpoint: topicEndpoint };
      });

      await record('topic idempotent update succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath), topicBody({
          tags: { workload: 'robotics' },
        }));
        assert.equal(result.status, 200);
        assert.equal(result.body.tags.workload, 'robotics');
        assert.equal(result.body.properties.endpoint, topicEndpoint);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('topic get returns endpoint and succeeded state', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.endpoint, topicEndpoint);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        return { status: result.status, endpoint: result.body.properties.endpoint };
      });

      await record('topic list includes created resource', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventGrid', 'topics'));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.id === topicId));
        return { status: result.status, count: result.body.value.length };
      });

      await record('list keys for missing topic is not found', async () => {
        const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.EventGrid', `${missingTopicPath}/listKeys`), {});
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('unsupported topic action fails closed', async () => {
        const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.EventGrid', `${topicPath}/regenerateKey`), {});
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('topic listKeys returns shared access keys', async () => {
        const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.EventGrid', `${topicPath}/listKeys`), {});
        assert.equal(result.status, 200);
        assert.ok(result.body.key1);
        assert.ok(result.body.key2);
        topicKey = result.body.key1;
        router.registerTopic({ topicName: topic, host: topicHost, key1: result.body.key1, key2: result.body.key2 });
        return { status: result.status, keyCount: 2 };
      });

      await record('publish without api-version is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent', [eventGridEvent(topicId, suffix)], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'MissingApiVersionParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish with missing key is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: topicHost,
        });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish with invalid key is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: topicHost,
          'aeg-sas-key': 'not-a-valid-topic-key',
        });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'Unauthorized');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish with wrong method is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/api/events?overload=EventGridEvent&api-version=2018-01-01', undefined, {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 405);
        assert.equal(errorCode(result), 'MethodNotAllowed');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish with wrong path is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/wrong/path?overload=EventGridEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish with non Event Grid host is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: 'example.invalid',
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish to unknown topic is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: `${missingTopic}.eastus-1.eventgrid.azure.net`,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish malformed JSON is rejected', async () => {
        const result = await httpDataPlaneRaw(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', '{"id":', {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish malformed event batch is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', { id: 'not-an-array' }, {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish empty event batch is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish invalid EventGridEvent schema is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [{ id: 'missing-required-fields' }], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish invalid EventGridEvent time is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [{
          ...eventGridEvent(topicId, suffix),
          eventTime: 'not-a-date',
        }], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish invalid customEvent schema is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=customEvent&api-version=2018-01-01', [{
          sub: '/robotics/cell/17',
          type: 'Contoso.Robotics.CellStatusChanged',
        }], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish unsupported overload is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=CloudEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequest');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish EventGridEvent succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 200);
        return { status: result.status };
      });

      await record('publish customEvent succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=customEvent&api-version=2018-01-01', [{
          sub: '/robotics/cell/17',
          type: 'Contoso.Robotics.CellStatusChanged',
          ver: '1.0',
          data: { status: 'ready' },
        }], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
        assert.equal(result.status, 200);
        return { status: result.status };
      });

      await record('inspection route exposes published local events', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/event-grid/topics/${topic}/events`);
        assert.equal(result.status, 200);
        assert.equal(result.body.value.length, 2);
        assert.ok(result.body.value.some(item => item.eventType === 'Contoso.MLOps.FeatureBatchUploaded'));
        return { status: result.status, count: result.body.value.length };
      });

      await record('local event capture remains stable across repeated publish reads', async () => {
        const first = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/event-grid/topics/${topic}/events`);
        const second = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/event-grid/topics/${topic}/events`);
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.deepEqual(
          second.body.value.map(item => ({ id: item.id, eventType: item.eventType, subject: item.subject })),
          first.body.value.map(item => ({ id: item.id, eventType: item.eventType, subject: item.subject })),
        );
        return { status: second.status, count: second.body.value.length };
      });

      await record('top-level event subscription create succeeds at resource group scope', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.EventGrid', `eventSubscriptions/${eventSubscription}`), {
          properties: {
            destination: {
              endpointType: 'WebHook',
              properties: { endpointUrl: 'https://example.invalid/events' },
            },
          },
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.EventGrid/eventSubscriptions');
        assert.equal(result.body.name, eventSubscription);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('ARM template deployment can create Event Grid topic', async () => {
        const deploymentName = `eg-deploy-${suffix}`;
        const result = await httpJson(
          armPort,
          'PUT',
          `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
          deploymentBody(templateTopic),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/topics/${templateTopic}`)));
        assert.equal(result.body.properties.outputs.topicName.value, templateTopic);
        return { status: result.status, deploymentName };
      });

      await record('topic delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath));
        assert.equal(result.status, 200);
        router.unregisterTopic(topic);
        return { status: result.status };
      });

      await record('topic get after delete is not found', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.EventGrid', topicPath));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('topic listKeys after delete is not found', async () => {
        const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.EventGrid', `${topicPath}/listKeys`), {});
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('publish after topic delete is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'POST', '/api/events?overload=EventGridEvent&api-version=2018-01-01', [eventGridEvent(topicId, suffix)], {
          host: topicHost,
          'aeg-sas-key': topicKey,
        });
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
    topic,
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
    '# Azure Event Grid Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlAndDataPlane.total - report.controlAndDataPlane.failedCount}/${report.controlAndDataPlane.total}`,
    `- Topic under test: ${report.controlAndDataPlane.topic}`,
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
  lines.push('This run proves local GlobalStack handling for the listed Event Grid ARM topic lifecycle, shared-access-key retrieval, Event Grid publish URL shape, strict publish rejections, local publish capture, and all-platform deployment lifecycle paths. It does not mark Event Grid as 99%-complete or cloudValidated for webhook validation handshakes, delivery retry timing, advanced filters, partner events, CloudEvents pull delivery, RBAC, private networking, or dead-letter destinations.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlAndDataPlane = await runControlPlaneAndDataPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlAndDataPlane.ok && platformMatrix.ok,
  scope: 'Azure Event Grid ARM topic lifecycle, listKeys, publish URL surface, local event capture, and all-platform GlobalStack deployment lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Event Grid cloudValidated claim.',
  controlAndDataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Event Grid parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
