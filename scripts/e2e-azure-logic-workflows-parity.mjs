import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import { createWorkflowRunner } from '../packages/azure-data-plane/src/workflow-runner.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-logic-workflows-parity');
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

async function withLocalHttpEndpoint(fn) {
  const requests = [];
  const attempts = new Map();
  const server = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    requests.push({
      method: req.method,
      url: req.url,
      body,
    });
    attempts.set(req.url, (attempts.get(req.url) ?? 0) + 1);
    if (req.url === '/reject') {
      const payload = JSON.stringify({
        error: {
          code: 'UpstreamRejected',
          message: 'The upstream connector rejected the request.',
        },
      });
      res.writeHead(422, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      return res.end(payload);
    }
    if (req.url === '/flaky' && (attempts.get(req.url) ?? 0) < 3) {
      const payload = JSON.stringify({
        error: {
          code: 'TransientConnectorFailure',
          message: 'Retryable connector failure.',
        },
      });
      res.writeHead(502, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      });
      return res.end(payload);
    }
    const payload = JSON.stringify({
      accepted: true,
      body,
    });
    res.writeHead(200, {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(payload),
    });
    res.end(payload);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({
      baseUrl: `http://127.0.0.1:${port}`,
      requests,
      attempts,
    });
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

function workflowPath(resourceGroup, workflowName, apiVersion = '2019-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}`, apiVersion);
}

function workflowDefinition(overrides = {}) {
  return {
    $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
    contentVersion: '1.0.0.0',
    triggers: {
      manual: {
        type: 'Request',
        kind: 'Http',
        inputs: { schema: {} },
      },
    },
    actions: {
      composePayload: {
        type: 'Compose',
        inputs: '@triggerBody()',
      },
      respond: {
        type: 'Response',
        kind: 'Http',
        runAfter: {
          composePayload: ['Succeeded'],
        },
        inputs: {
          statusCode: 202,
          body: {
            accepted: true,
            payload: "@actions('composePayload').outputs",
          },
        },
      },
    },
    outputs: {},
    ...overrides,
  };
}

function workflowBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'robotics-orchestration' },
    properties: {
      state: 'Enabled',
      definition: workflowDefinition(),
      parameters: {},
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function advancedWorkflowDefinition() {
  return workflowDefinition({
    actions: {
      initializeState: {
        type: 'InitializeVariable',
        inputs: {
          variables: [
            { name: 'decision', type: 'string', value: "@triggerBody()?['decision']" },
            { name: 'result', type: 'string', value: 'pending' },
          ],
        },
      },
      parsePayload: {
        type: 'ParseJson',
        runAfter: {
          initializeState: ['Succeeded'],
        },
        inputs: {
          content: '@triggerBody()',
          schema: {
            type: 'object',
            required: ['decision'],
          },
        },
      },
      chooseResult: {
        type: 'If',
        runAfter: {
          parsePayload: ['Succeeded'],
        },
        expression: "@equals(@variables('decision'), 'approve')",
        actions: {
          markApproved: {
            type: 'SetVariable',
            inputs: {
              name: 'result',
              value: 'approved',
            },
          },
        },
        else: {
          actions: {
            markRejected: {
              type: 'SetVariable',
              inputs: {
                name: 'result',
                value: 'rejected',
              },
            },
          },
        },
      },
      respond: {
        type: 'Response',
        kind: 'Http',
        runAfter: {
          chooseResult: ['Succeeded'],
        },
        inputs: {
          statusCode: 200,
          body: {
            decision: "@variables('result')",
            payload: "@actions('parsePayload').outputs",
          },
        },
      },
    },
  });
}

function advancedWorkflowBody(overrides = {}) {
  return workflowBody({
    properties: {
      definition: advancedWorkflowDefinition(),
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  });
}

function terminatingWorkflowBody(overrides = {}) {
  return workflowBody({
    properties: {
      definition: workflowDefinition({
        actions: {
          stopNow: {
            type: 'Terminate',
            inputs: {
              runStatus: 'Failed',
              runError: {
                code: 'RejectedByPolicy',
                message: 'The workflow was rejected by policy.',
              },
            },
          },
          shouldNotRun: {
            type: 'Response',
            runAfter: {
              stopNow: ['Succeeded'],
            },
            inputs: {
              statusCode: 200,
              body: {
                shouldNotRun: true,
              },
            },
          },
        },
      }),
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  });
}

function connectorWorkflowDefinition(connectorUrl) {
  return workflowDefinition({
    actions: {
      parsePayload: {
        type: 'ParseJson',
        inputs: {
          content: '@triggerBody()',
          schema: {
            type: 'object',
            required: ['items'],
          },
        },
      },
      fanOutItems: {
        type: 'Foreach',
        runAfter: {
          parsePayload: ['Succeeded'],
        },
        foreach: "@triggerBody()?['items']",
        actions: {
          shapeItem: {
            type: 'Compose',
            inputs: {
              id: "@item()?['id']",
              kind: "@item()?['kind']",
            },
          },
        },
      },
      callConnector: {
        type: 'Http',
        runAfter: {
          fanOutItems: ['Succeeded'],
        },
        inputs: {
          method: 'POST',
          uri: connectorUrl,
          headers: {
            'content-type': 'application/json',
          },
          body: {
            workflow: 'connector-flow',
            payload: '@triggerBody()',
          },
        },
      },
      respond: {
        type: 'Response',
        kind: 'Http',
        runAfter: {
          callConnector: ['Succeeded'],
        },
        inputs: {
          statusCode: 200,
          body: {
            connector: "@actions('callConnector').outputs.body",
            iterations: "@actions('fanOutItems').outputs.iterations",
          },
        },
      },
    },
  });
}

function connectorWorkflowBody(connectorUrl, overrides = {}) {
  return workflowBody({
    properties: {
      definition: connectorWorkflowDefinition(connectorUrl),
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  });
}

function retryWorkflowBody(flakyUrl, overrides = {}) {
  return workflowBody({
    properties: {
      definition: workflowDefinition({
        actions: {
          fetchConnector: {
            type: 'Http',
            retryPolicy: {
              count: 2,
              intervalInMilliseconds: 5,
            },
            inputs: {
              method: 'POST',
              uri: flakyUrl,
              body: {
                job: 'robot-replay',
              },
            },
          },
          respond: {
            type: 'Response',
            kind: 'Http',
            runAfter: {
              fetchConnector: ['Succeeded'],
            },
            inputs: {
              statusCode: 200,
              body: {
                connector: "@actions('fetchConnector').outputs.body",
              },
            },
          },
        },
      }),
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  });
}

function longRunningWorkflowBody(overrides = {}) {
  return workflowBody({
    properties: {
      definition: workflowDefinition({
        actions: {
          initializeCounter: {
            type: 'InitializeVariable',
            inputs: {
              variables: [
                { name: 'count', type: 'integer', value: 0 },
              ],
            },
          },
          waitBriefly: {
            type: 'Delay',
            operationOptions: 'Asynchronous',
            runAfter: {
              initializeCounter: ['Succeeded'],
            },
            inputs: {
              milliseconds: 10,
            },
          },
          converge: {
            type: 'Until',
            runAfter: {
              waitBriefly: ['Succeeded'],
            },
            expression: "@equals(@variables('count'), 2)",
            limit: {
              count: 4,
            },
            actions: {
              increment: {
                type: 'SetVariable',
                inputs: {
                  name: 'count',
                  value: "@add(@variables('count'), 1)",
                },
              },
            },
          },
          respond: {
            type: 'Response',
            kind: 'Http',
            runAfter: {
              converge: ['Succeeded'],
            },
            inputs: {
              statusCode: 200,
              body: {
                count: "@variables('count')",
                converge: "@actions('converge').outputs",
              },
            },
          },
        },
      }),
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  });
}

function apiConnectionWorkflowBody(overrides = {}) {
  return workflowBody({
    properties: {
      definition: workflowDefinition({
        actions: {
          putBlob: {
            type: 'ApiConnection',
            inputs: {
              method: 'PUT',
              path: '/datasets/default/files/model-output.json',
              host: {
                connection: {
                  name: 'azureblob',
                },
              },
              body: {
                model: 'gpt',
                version: '5.5',
              },
            },
          },
          setConfig: {
            type: 'ApiConnection',
            runAfter: {
              putBlob: ['Succeeded'],
            },
            inputs: {
              method: 'PUT',
              path: '/kv/model-output',
              host: {
                connection: {
                  name: 'appconfiguration',
                },
              },
              body: {
                stored: true,
              },
            },
          },
          enqueueBusMessage: {
            type: 'ApiConnection',
            runAfter: {
              setConfig: ['Succeeded'],
            },
            inputs: {
              method: 'POST',
              path: '/queues/model-events/messages',
              host: {
                connection: {
                  name: 'servicebus',
                },
              },
              body: {
                id: 'msg-1',
              },
            },
          },
          publishGridEvent: {
            type: 'ApiConnection',
            runAfter: {
              enqueueBusMessage: ['Succeeded'],
            },
            inputs: {
              method: 'POST',
              path: '/topics/mlops-events/publish',
              host: {
                connection: {
                  name: 'eventgrid',
                },
              },
              body: {
                eventType: 'ModelPublished',
                subject: '/models/gpt-5.5',
              },
            },
          },
          storeSecret: {
            type: 'ApiConnection',
            runAfter: {
              publishGridEvent: ['Succeeded'],
            },
            inputs: {
              method: 'PUT',
              path: '/secrets/model-key',
              host: {
                connection: {
                  name: 'keyvault',
                },
              },
              body: {
                value: 'opaque',
              },
            },
          },
          upsertTableEntity: {
            type: 'ApiConnection',
            runAfter: {
              storeSecret: ['Succeeded'],
            },
            inputs: {
              method: 'POST',
              path: '/tables/ModelLedger/entities',
              host: {
                connection: {
                  name: 'azuretables',
                },
              },
              body: {
                PartitionKey: 'models',
                RowKey: 'gpt-5.5',
              },
            },
          },
          respond: {
            type: 'Response',
            kind: 'Http',
            runAfter: {
              upsertTableEntity: ['Succeeded'],
            },
            inputs: {
              statusCode: 200,
              body: {
                blob: "@actions('putBlob').outputs",
                config: "@actions('setConfig').outputs",
                serviceBus: "@actions('enqueueBusMessage').outputs",
                eventGrid: "@actions('publishGridEvent').outputs",
                keyVault: "@actions('storeSecret').outputs",
                table: "@actions('upsertTableEntity').outputs",
              },
            },
          },
        },
      }),
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  });
}

function deploymentBody(workflowName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Logic/workflows',
            apiVersion: '2019-05-01',
            name: workflowName,
            location: 'eastus',
            properties: workflowBody().properties,
          },
        ],
        outputs: {
          workflowName: { type: 'string', value: workflowName },
        },
      },
    },
  };
}

function runnerErrorCode(result) {
  return result.error?.code ?? null;
}

function syncWorkflowResource(workflowRunner, { resourceType, resource }) {
  if (resourceType !== 'Microsoft.Logic/workflows') return;
  workflowRunner.registerWorkflow({
    workflowName: resource.name,
    properties: resource.properties,
  });
}

function unsyncWorkflowResource(workflowRunner, { resourceType, resource, providerRoute }) {
  if (resourceType !== 'Microsoft.Logic/workflows') return;
  workflowRunner.unregisterWorkflow(resource?.name ?? providerRoute.typePath.split('/')[1]);
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-logic-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-logic-missing-${suffix}`;
  const workflowName = `workflow-${suffix}`.slice(0, 40);
  const missingWorkflowName = `workflow-missing-${suffix}`.slice(0, 40);
  const advancedWorkflowName = `workflow-adv-${suffix}`.slice(0, 40);
  const terminateWorkflowName = `workflow-term-${suffix}`.slice(0, 40);
  const connectorWorkflowName = `workflow-http-${suffix}`.slice(0, 40);
  const retryWorkflowName = `workflow-retry-${suffix}`.slice(0, 40);
  const longWorkflowName = `workflow-long-${suffix}`.slice(0, 40);
  const apiConnWorkflowName = `workflow-conn-${suffix}`.slice(0, 40);

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

  await withLocalHttpEndpoint(async ({ baseUrl, requests, attempts }) => {
    const workflowRunner = createWorkflowRunner({
      httpInvoker: async request => {
        const response = await fetch(request.uri, {
          method: request.method,
          headers: request.headers,
          body: request.body === null || request.body === undefined ? undefined : JSON.stringify(request.body),
        });
        const text = await response.text();
        let body = text || null;
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
        }
        return {
          statusCode: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        };
      },
    });

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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}`), workflowBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workflow create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', workflowPath(missingResourceGroup, workflowName), workflowBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-logic-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('workflow collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Logic', 'workflows', '2019-05-01'));
      assert.equal(result.status, 200);
      assert.equal(result.body.value.length, 0);
      return { status: result.status, count: result.body.value.length };
    });

    await record('workflow delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', workflowPath(resourceGroup, missingWorkflowName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['workflow empty body is rejected', workflowName, {}, 'LocationRequired'],
      ['workflow invalid location is rejected', workflowName, workflowBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['workflow invalid name is rejected', `-bad-${suffix}`, workflowBody(), 'InvalidWorkflowName'],
      ['workflow missing definition is rejected', workflowName, workflowBody({ properties: { definition: undefined } }), 'InvalidWorkflow'],
      ['workflow missing triggers is rejected', workflowName, workflowBody({ properties: { definition: workflowDefinition({ triggers: undefined }) } }), 'InvalidWorkflow'],
      ['workflow missing actions is rejected', workflowName, workflowBody({ properties: { definition: workflowDefinition({ actions: undefined }) } }), 'InvalidWorkflow'],
      ['workflow invalid state is rejected', workflowName, workflowBody({ properties: { state: 'Paused' } }), 'InvalidWorkflowState'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('workflow create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, workflowName), workflowBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.name, workflowName);
      assert.equal(result.body.properties.state, 'Enabled');
      assert.equal(result.body.properties.accessEndpoint, `https://logic.azure.com/workflows/${workflowName}`);
      return { status: result.status };
    });

    await record('local workflow runner missing workflow is not found', async () => {
      const result = await workflowRunner.invoke({
        workflowName: missingWorkflowName,
        triggerName: 'manual',
        body: { robotId: 'arm-1' },
      });
      assert.equal(result.error.status, 404);
      assert.equal(runnerErrorCode(result), 'WorkflowNotFound');
      return { status: result.error.status, errorCode: runnerErrorCode(result) };
    });

    await record('local workflow runner missing trigger is not found', async () => {
      const result = await workflowRunner.invoke({
        workflowName,
        triggerName: 'missing',
        body: { robotId: 'arm-1' },
      });
      assert.equal(result.error.status, 404);
      assert.equal(runnerErrorCode(result), 'TriggerNotFound');
      return { status: result.error.status, errorCode: runnerErrorCode(result) };
    });

    await record('local workflow runner request trigger succeeds', async () => {
      const result = await workflowRunner.invoke({
        workflowName,
        triggerName: 'manual',
        body: { robotId: 'arm-1', task: 'calibrate' },
      });
      assert.equal(result.status, 202);
      assert.equal(result.body.status, 'Succeeded');
      assert.deepEqual(result.body.input, { robotId: 'arm-1', task: 'calibrate' });
      assert.equal(result.body.response?.statusCode, 202);
      assert.equal(result.body.response?.body?.accepted, true);
      assert.equal(result.body.response?.body?.payload?.robotId, 'arm-1');
      const run = await workflowRunner.getRun({ workflowName, runId: result.body.id });
      assert.equal(run.status, 200);
      assert.equal(run.body.status, 'Succeeded');
      return { status: result.status, runId: result.body.id };
    });

    await record('local workflow runner honors runAfter and conditional flow', async () => {
      workflowRunner.registerWorkflow({
        workflowName: advancedWorkflowName,
        properties: advancedWorkflowBody().properties,
      });
      const result = await workflowRunner.invoke({
        workflowName: advancedWorkflowName,
        triggerName: 'manual',
        body: { decision: 'approve', documentId: 'robot-17' },
      });
      assert.equal(result.status, 202);
      assert.equal(result.body.status, 'Succeeded');
      assert.equal(result.body.response?.body?.decision, 'approved');
      assert.equal(result.body.outputs.parsePayload.documentId, 'robot-17');
      assert.equal(result.body.outputs.chooseResult.condition, true);
      return { status: result.status, runId: result.body.id };
    });

    await record('local workflow runner terminate action marks failed run', async () => {
      workflowRunner.registerWorkflow({
        workflowName: terminateWorkflowName,
        properties: terminatingWorkflowBody().properties,
      });
      const result = await workflowRunner.invoke({
        workflowName: terminateWorkflowName,
        triggerName: 'manual',
        body: { decision: 'reject' },
      });
      assert.equal(result.status, 202);
      assert.equal(result.body.status, 'Failed');
      assert.equal(result.body.error.code, 'RejectedByPolicy');
      assert.ok(!result.body.actions.some(item => item.name === 'shouldNotRun'));
      return { status: result.status, runId: result.body.id };
    });

    await record('advanced workflow create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, advancedWorkflowName), advancedWorkflowBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.name, advancedWorkflowName);
      return { status: result.status };
    });

    await record('workflow trigger route executes conditional branch semantics', async () => {
      const invoked = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${advancedWorkflowName}/triggers/manual/run`, '2019-05-01'),
        { decision: 'reject', documentId: 'robot-18' },
      );
      assert.equal(invoked.status, 202);
      const runId = invoked.headers.location?.split('/').filter(Boolean).at(-1);
      assert.ok(runId);
      const run = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${advancedWorkflowName}/runs/${runId}`, '2019-05-01'),
      );
      assert.equal(run.status, 200);
      assert.equal(run.body.status, 'Succeeded');
      assert.equal(run.body.response?.body?.decision, 'rejected');
      assert.equal(run.body.outputs.parsePayload.documentId, 'robot-18');
      return { status: run.status, runtimeStatus: run.body.status };
    });

    await record('terminating workflow route preserves failed run status', async () => {
      const create = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, terminateWorkflowName), terminatingWorkflowBody());
      assert.equal(create.status, 201);
      const invoked = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${terminateWorkflowName}/triggers/manual/run`, '2019-05-01'),
        { decision: 'reject' },
      );
      assert.equal(invoked.status, 202);
      const runId = invoked.headers.location?.split('/').filter(Boolean).at(-1);
      assert.ok(runId);
      const run = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${terminateWorkflowName}/runs/${runId}`, '2019-05-01'),
      );
      assert.equal(run.status, 200);
      assert.equal(run.body.status, 'Failed');
      assert.equal(run.body.error.code, 'RejectedByPolicy');
      assert.ok(!run.body.actions.some(item => item.name === 'shouldNotRun'));
      return { status: run.status, runtimeStatus: run.body.status };
    });

    await record('workflow trigger run route succeeds', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}/triggers/manual/run`, '2019-05-01'),
        { robotId: 'arm-2', task: 'inspect' },
      );
      assert.equal(result.status, 202);
      assert.ok(result.headers.location);
      assert.equal(result.body.status, 'Succeeded');
      assert.equal(result.body.response?.body?.payload?.task, 'inspect');
      return { status: result.status, runId: result.body.id };
    });

    await record('workflow runs list includes created runs', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}/runs`, '2019-05-01'),
      );
      assert.equal(result.status, 200);
      assert.ok(result.body.value.length >= 2);
      return { status: result.status, count: result.body.value.length };
    });

    await record('workflow run get route succeeds', async () => {
      const runs = await workflowRunner.listRuns({ workflowName });
      assert.equal(runs.status, 200);
      const runId = runs.body.value.at(-1)?.id;
      assert.ok(runId);
      const result = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}/runs/${runId}`, '2019-05-01'),
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.id, runId);
      assert.equal(result.body.response?.body?.accepted, true);
      return { status: result.status, runId };
    });

    await record('workflow get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', workflowPath(resourceGroup, workflowName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.properties.state, 'Enabled');
      return { status: result.status };
    });

    await record('workflow update can disable workflow', async () => {
      const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, workflowName), workflowBody({ properties: { state: 'Disabled' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.state, 'Disabled');
      return { status: result.status };
    });

    await record('local workflow runner disabled workflow is rejected', async () => {
      const result = await workflowRunner.invoke({
        workflowName,
        triggerName: 'manual',
        body: { robotId: 'arm-1' },
      });
      assert.equal(result.error.status, 409);
      assert.equal(runnerErrorCode(result), 'WorkflowDisabled');
      return { status: result.error.status, errorCode: runnerErrorCode(result) };
    });

    await record('workflow list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Logic', 'workflows', '2019-05-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === workflowName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('workflow trigger route rejects disabled workflow', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}/triggers/manual/run`, '2019-05-01'), {});
      assert.equal(result.status, 409);
      assert.equal(errorCode(result), 'WorkflowDisabled');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('unsupported workflow versions route fails closed', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${workflowName}/versions`, '2019-05-01'));
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create workflow resource', async () => {
      const deploymentName = `logic-deploy-${suffix}`;
      const deploymentWorkflow = `workflow-deploy-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentWorkflow),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/workflows/${deploymentWorkflow}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

      await record('workflow delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', workflowPath(resourceGroup, workflowName));
        assert.equal(result.status, 200);
        return { status: result.status };
      });

    await record('workflow get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', workflowPath(resourceGroup, workflowName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workflow delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', workflowPath(resourceGroup, workflowName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });
      await record('connector workflow create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, connectorWorkflowName), connectorWorkflowBody(`${baseUrl}/accept`));
        assert.equal(result.status, 201);
        assert.equal(result.body.name, connectorWorkflowName);
        return { status: result.status };
      });

      await record('local workflow runner foreach and http connector succeed', async () => {
        const result = await workflowRunner.invoke({
          workflowName: connectorWorkflowName,
          triggerName: 'manual',
          body: {
            items: [
              { id: 'doc-1', kind: 'model' },
              { id: 'doc-2', kind: 'embedding' },
            ],
          },
        });
        assert.equal(result.status, 202);
        assert.equal(result.body.status, 'Succeeded');
        assert.equal(result.body.response?.body?.connector?.accepted, true);
        assert.equal(result.body.response?.body?.connector?.body?.workflow, 'connector-flow');
        assert.equal(result.body.response?.body?.iterations.length, 2);
        assert.equal(result.body.response?.body?.iterations[0].outputs.shapeItem.id, 'doc-1');
        assert.equal(requests.at(-1)?.body?.workflow, 'connector-flow');
        return { status: result.status, runId: result.body.id };
      });

      await record('workflow trigger callback URL route succeeds', async () => {
        const result = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${connectorWorkflowName}/triggers/manual/listCallbackUrl`, '2019-05-01'),
          {},
        );
        assert.equal(result.status, 200);
        assert.match(result.body.value, new RegExp(`/workflows/${connectorWorkflowName}/triggers/manual/run\\?api-version=2019-05-01$`));
        assert.equal(result.body.method, 'POST');
        return { status: result.status };
      });

      await record('workflow trigger histories list includes connector runs', async () => {
        const result = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${connectorWorkflowName}/triggers/manual/histories`, '2019-05-01'),
        );
        assert.equal(result.status, 200);
        assert.ok(result.body.value.length >= 1);
        assert.equal(result.body.value.at(-1).properties.status, 'Succeeded');
        return { status: result.status, count: result.body.value.length };
      });

      await record('workflow trigger reset clears trigger histories', async () => {
        const reset = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${connectorWorkflowName}/triggers/manual/reset`, '2019-05-01'),
          {},
        );
        assert.equal(reset.status, 200);
        const histories = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${connectorWorkflowName}/triggers/manual/histories`, '2019-05-01'),
        );
        assert.equal(histories.status, 200);
        assert.equal(histories.body.value.length, 0);
        return { status: reset.status };
      });

      await record('retry workflow create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, retryWorkflowName), retryWorkflowBody(`${baseUrl}/flaky`));
        assert.equal(result.status, 201);
        return { status: result.status };
      });

      await record('local workflow runner retries transient HTTP connector failures', async () => {
        const before = attempts.get('/flaky') ?? 0;
        const result = await workflowRunner.invoke({
          workflowName: retryWorkflowName,
          triggerName: 'manual',
          body: { retry: true },
        });
        assert.equal(result.status, 202);
        assert.equal(result.body.status, 'Succeeded');
        assert.equal(result.body.response?.body?.connector?.accepted, true);
        assert.equal((attempts.get('/flaky') ?? 0) - before, 3);
        return { status: result.status };
      });

      await record('long running workflow create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, longWorkflowName), longRunningWorkflowBody());
        assert.equal(result.status, 201);
        return { status: result.status };
      });

      await record('local workflow runner delay and until semantics succeed', async () => {
        const result = await workflowRunner.invoke({
          workflowName: longWorkflowName,
          triggerName: 'manual',
          body: { op: 'loop' },
        });
        assert.equal(result.status, 202);
        assert.equal(result.body.status, 'Running');
        assert.equal(result.body.response, null);
        await new Promise(resolve => setTimeout(resolve, 25));
        const run = await workflowRunner.getRun({
          workflowName: longWorkflowName,
          runId: result.body.id,
        });
        assert.equal(run.status, 200);
        assert.equal(run.body.status, 'Succeeded');
        assert.equal(run.body.response?.body?.count, 2);
        assert.equal(run.body.response?.body?.converge?.completed, true);
        assert.equal(run.body.response?.body?.converge?.iterationCount, 2);
        return { status: run.status };
      });

      await record('workflow run get reconciles hosted long running execution', async () => {
        const invoked = await httpJson(
          armPort,
          'POST',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${longWorkflowName}/triggers/manual/run`, '2019-05-01'),
          { op: 'loop' },
        );
        assert.equal(invoked.status, 202);
        assert.equal(invoked.body.status, 'Running');
        const runId = invoked.headers.location?.split('/').filter(Boolean).at(-1);
        assert.ok(runId);
        const initial = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${longWorkflowName}/runs/${runId}`, '2019-05-01'),
        );
        assert.equal(initial.status, 200);
        assert.equal(initial.body.status, 'Running');
        await new Promise(resolve => setTimeout(resolve, 25));
        const completed = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${longWorkflowName}/runs/${runId}`, '2019-05-01'),
        );
        assert.equal(completed.status, 200);
        assert.equal(completed.body.status, 'Succeeded');
        assert.equal(completed.body.response?.body?.count, 2);
        const histories = await httpJson(
          armPort,
          'GET',
          providerPath(resourceGroup, 'Microsoft.Logic', `workflows/${longWorkflowName}/triggers/manual/histories`, '2019-05-01'),
        );
        assert.equal(histories.status, 200);
        assert.equal(histories.body.value.at(-1).properties.status, 'Succeeded');
        return { status: completed.status, runtimeStatus: completed.body.status };
      });

      await record('api connection workflow create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', workflowPath(resourceGroup, apiConnWorkflowName), apiConnectionWorkflowBody());
        assert.equal(result.status, 201);
        return { status: result.status };
      });

      await record('local workflow runner api connection actions succeed', async () => {
        const result = await workflowRunner.invoke({
          workflowName: apiConnWorkflowName,
          triggerName: 'manual',
          body: { dataset: 'default' },
        });
        assert.equal(result.status, 202);
        assert.equal(result.body.status, 'Succeeded');
        assert.equal(result.body.response?.body?.blob?.connector, 'azureblob');
        assert.equal(result.body.response?.body?.config?.connector, 'appconfiguration');
        assert.equal(result.body.response?.body?.serviceBus?.connector, 'servicebus');
        assert.equal(result.body.response?.body?.eventGrid?.connector, 'eventgrid');
        assert.equal(result.body.response?.body?.keyVault?.connector, 'keyvault');
        assert.equal(result.body.response?.body?.table?.connector, 'azuretables');
        return { status: result.status };
      });
    }, {
      workflowRunner,
      onResourcePut: context => syncWorkflowResource(workflowRunner, context),
      onResourceDelete: context => unsyncWorkflowResource(workflowRunner, context),
    });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    workflowName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-logic-parity-local-token',
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
    '# Azure Logic Workflows Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Workflow under test: ${report.controlPlane.workflowName}`,
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Logic Apps workflow ARM lifecycle, definition validation, bounded request-trigger runner success and failure behavior, supported runAfter/conditional/foreach/http/terminate semantics for the implemented action subset, supported trigger-run, callback, history, and reset routes, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Logic Apps as 99%-complete or cloudValidated for broad connector runtime behavior, Azure-hosted trigger execution, retries, full run history parity, long-running orchestration, RBAC, private link, throttling, or exact Azure workflow data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Logic Apps workflow ARM lifecycle, definition validation, bounded request-trigger runner checks, supported runAfter/conditional/foreach/http/terminate action semantics, supported trigger-run, callback, history, and reset routes, unsupported route fail-closed checks outside that subset, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Logic Apps cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Logic Workflows parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
