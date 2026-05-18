import assert from 'node:assert/strict';
import { test } from 'node:test';
import { request } from 'node:http';
import { allCapabilities, capabilityForResourceType, tier1Capabilities, tier2Capabilities, officialEmulatorOptions } from '../../core/src/azure-tier1-capabilities.mjs';
import { buildAzureLiveApiCatalog } from '../../core/src/azure-live-api-catalog.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

function httpJson(port, method, path, body, options = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers = {
      'content-type': 'application/json',
      ...(options.auth === false ? {} : { authorization: options.authorization ?? 'Bearer globalstack-local-token' }),
      ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
    };
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers,
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        let parsed = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // keep text
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function httpForm(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams(body).toString();
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'content-length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        let parsed = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // keep text
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function withServer(fn) {
  const server = createArmServer({ persist: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('Tier 1 registry does not make unsupported full-parity claims', () => {
  assert.equal(tier1Capabilities.length, 15);
  assert.ok(officialEmulatorOptions.length >= 6);

  for (const capability of tier1Capabilities) {
    assert.equal(capability.tier, 1);
    assert.ok(capability.awsAnalogue);
    assert.ok(capability.azureEquivalent);
    assert.ok(capability.resourceTypes.length > 0);
    assert.ok(capability.primaryModes.length > 0);
    assert.ok(capability.implementedOperations.length > 0);
    assert.equal(capability.cloudValidated, false);
    assert.ok(capability.knownGaps.length > 0, `${capability.id} must expose known gaps`);
  }
});

test('Tier 2 registry maps AWS analogues to Azure equivalents with explicit gaps', () => {
  assert.equal(tier2Capabilities.length, 15);
  assert.equal(allCapabilities.length, 30);

  const expectedAwsAnalogues = [
    'RDS MySQL',
    'SQS',
    'ElastiCache Redis',
    'Step Functions',
    'Route 53',
    'ALB/NLB',
    'CloudFront',
    'WAF',
    'CloudTrail',
    'EFS',
    'Kinesis Data Streams',
    'Redshift',
    'SSM Parameter Store',
    'DMS',
    'Service Discovery / Cloud Map',
  ];

  for (const awsAnalogue of expectedAwsAnalogues) {
    assert.ok(tier2Capabilities.some(capability => capability.awsAnalogue === awsAnalogue), `${awsAnalogue} is missing`);
  }

  for (const capability of tier2Capabilities) {
    assert.equal(capability.tier, 2);
    assert.ok(capability.azureEquivalent);
    assert.ok(capability.resourceTypes.length > 0);
    assert.ok(capability.primaryModes.length > 0);
    assert.ok(capability.implementedOperations.length > 0);
    assert.equal(capability.cloudValidated, false);
    assert.ok(capability.knownGaps.length > 0, `${capability.id} must expose known gaps`);
  }
});

test('resource type matching prefers the most specific Tier 2 mapping', () => {
  assert.equal(
    capabilityForResourceType('Microsoft.Storage/storageAccounts/queueServices/queues').id,
    'queue-storage',
  );
  assert.equal(
    capabilityForResourceType('Microsoft.EventHub/namespaces/eventhubs').id,
    'event-hubs-streams',
  );
});

test('Azure live API catalog filters calls for every Tier 1 and Tier 2 capability', () => {
  const catalog = buildAzureLiveApiCatalog();
  assert.equal(catalog._meta.capabilityCount, 30);
  assert.equal(catalog._meta.tier1CapabilityCount, 15);
  assert.equal(catalog._meta.tier2CapabilityCount, 15);
  assert.ok(catalog._meta.callCount >= allCapabilities.length * 4);

  for (const capability of allCapabilities) {
    const calls = catalog.calls.filter(call => call.capabilityId === capability.id);
    assert.ok(calls.length >= capability.resourceTypes.length * 4, `${capability.id} has missing catalog calls`);
    assert.ok(calls.some(call => call.operation === 'CreateOrUpdate' && call.varianceCases.some(variance => variance.id === 'missing-api-version')));
    assert.ok(calls.every(call => call.validationState === 'candidate-until-live-azure-captured'));
  }
});

test('Azure live API catalog keeps parameter variance cases explicit', () => {
  const catalog = buildAzureLiveApiCatalog();
  const createCalls = catalog.calls.filter(call => call.operation === 'CreateOrUpdate');
  assert.ok(createCalls.length > 0);
  for (const call of createCalls) {
    const varianceIds = call.varianceCases.map(variance => variance.id);
    assert.ok(varianceIds.includes('valid-minimal'), `${call.id} missing valid-minimal`);
    assert.ok(varianceIds.includes('missing-api-version'), `${call.id} missing missing-api-version`);
    assert.ok(varianceIds.includes('invalid-location'), `${call.id} missing invalid-location`);
    assert.ok(varianceIds.includes('empty-body'), `${call.id} missing empty-body`);
  }
});

test('ARM facade exposes health, capabilities, and generated support state', async () => {
  await withServer(async (port) => {
    const health = await httpJson(port, 'GET', '/_globalstack/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.status, 'ok');

    const capabilities = await httpJson(port, 'GET', '/_globalstack/capabilities');
    assert.equal(capabilities.status, 200);
    assert.equal(capabilities.body.tier1.length, tier1Capabilities.length);
    assert.equal(capabilities.body.tier2.length, tier2Capabilities.length);
    assert.equal(capabilities.body.all.length, allCapabilities.length);
    assert.ok(capabilities.body.officialEmulators.some(item => item.id === 'azurite'));
  });
});

test('ARM facade requires deterministic local Azure auth for protected ARM calls', async () => {
  await withServer(async (port) => {
    const publicHealth = await httpJson(port, 'GET', '/_globalstack/health', undefined, { auth: false });
    assert.equal(publicHealth.status, 200);

    const missingAuth = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-auth?api-version=2021-04-01',
      { location: 'eastus' },
      { auth: false },
    );
    assert.equal(missingAuth.status, 401);
    assert.equal(missingAuth.body.error.code, 'InvalidAuthenticationToken');

    const wrongToken = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-auth?api-version=2021-04-01',
      { location: 'eastus' },
      { authorization: 'Bearer wrong-token' },
    );
    assert.equal(wrongToken.status, 401);
    assert.equal(wrongToken.body.error.code, 'InvalidAuthenticationToken');

    const wrongSubscription = await httpJson(
      port,
      'PUT',
      '/subscriptions/99999999-9999-9999-9999-999999999999/resourcegroups/rg-auth?api-version=2021-04-01',
      { location: 'eastus' },
    );
    assert.equal(wrongSubscription.status, 403);
    assert.equal(wrongSubscription.body.error.code, 'AuthorizationFailed');

    const discovery = await httpJson(
      port,
      'GET',
      '/00000000-0000-0000-0000-000000000000/v2.0/.well-known/openid-configuration',
      undefined,
      { auth: false },
    );
    assert.equal(discovery.status, 200);
    assert.match(discovery.body.token_endpoint, /\/00000000-0000-0000-0000-000000000000\/oauth2\/v2\.0\/token$/);

    const token = await httpForm(port, 'POST', '/00000000-0000-0000-0000-000000000000/oauth2/v2.0/token', {
      grant_type: 'client_credentials',
      client_id: '11111111-1111-1111-1111-111111111111',
      client_secret: 'globalstack',
      scope: 'https://management.azure.com/.default',
    });
    assert.equal(token.status, 200);
    assert.equal(token.body.access_token, 'globalstack-local-token');

    const put = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-auth?api-version=2021-04-01',
      { location: 'eastus' },
      { authorization: `Bearer ${token.body.access_token}` },
    );
    assert.equal(put.status, 201);
  });
});

test('ARM facade supports resource-group CRUD with Azure-shaped IDs', async () => {
  await withServer(async (port) => {
    const put = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-ai?api-version=2021-04-01',
      { location: 'eastus', tags: { ttl: 'test' } },
    );
    assert.equal(put.status, 201);
    assert.equal(put.body.id, '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-ai');
    assert.equal(put.body.name, 'rg-ai');
    assert.equal(put.body.location, 'eastus');

    const get = await httpJson(port, 'GET', '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-ai?api-version=2021-04-01');
    assert.equal(get.status, 200);
    assert.equal(get.body.tags.ttl, 'test');

    const list = await httpJson(port, 'GET', '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups?api-version=2021-04-01');
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);

    const del = await httpJson(port, 'DELETE', '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-ai?api-version=2021-04-01');
    assert.equal(del.status, 200);
  });
});

test('ARM facade stores generic Tier 2 resources with capability metadata', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-tier2?api-version=2021-04-01', { location: 'eastus' });
    await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-tier2/providers/Microsoft.EventHub/namespaces/gsehns?api-version=2024-01-01',
      {
        location: 'eastus',
        sku: { name: 'Standard', tier: 'Standard', capacity: 1 },
        properties: {},
      },
    );
    const put = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-tier2/providers/Microsoft.EventHub/namespaces/gsehns/eventhubs/transactions?api-version=2024-01-01',
      {
        location: 'eastus',
        properties: { partitionCount: 2, messageRetentionInDays: 1 },
      },
    );
    assert.equal(put.status, 201);
    assert.equal(put.body.type, 'Microsoft.EventHub/namespaces/eventhubs');
    assert.equal(put.body.globalstack.capabilityId, 'event-hubs-streams');
    assert.equal(put.body.globalstack.supportLevel, 'official-emulator+globalstack-facade');
    assert.equal(put.body.globalstack.emulationDepth, 'official-emulator-backed-local');
    assert.equal(put.body.globalstack.realAzureApiComplete, false);
    assert.deepEqual(put.body.globalstack.backingEngines, ['event-hubs-emulator']);
  });
});

test('ARM facade fails closed for unsupported provider resources and incomplete ARM calls', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-strict?api-version=2021-04-01', { location: 'eastus' });

    const unsupported = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-strict/providers/Microsoft.MachineLearningServices/workspaces/ws1?api-version=2024-04-01',
      { location: 'eastus', properties: {} },
    );
    assert.equal(unsupported.status, 501);
    assert.equal(unsupported.body.error.code, 'GlobalStackResourceTypeNotEmulated');

    const missingApiVersion = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-strict/providers/Microsoft.Storage/storageAccounts/gsstrict',
      { location: 'eastus', sku: { name: 'Standard_LRS' }, kind: 'StorageV2' },
    );
    assert.equal(missingApiVersion.status, 400);
    assert.equal(missingApiVersion.body.error.code, 'MissingApiVersionParameter');
    assert.equal(missingApiVersion.body.error.message, 'The api-version query parameter (?api-version=) is required for all requests.');
  });
});

test('ARM facade uses Azure-shaped not-found responses for captured lifecycle gaps', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-notfound?api-version=2021-04-01', { location: 'eastus' });

    const rootGet = await httpJson(
      port,
      'GET',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-notfound/providers/Microsoft.Storage/storageAccounts/missingstore?api-version=2023-01-01',
    );
    assert.equal(rootGet.status, 404);
    assert.equal(rootGet.body.error.code, 'ResourceNotFound');

    const childGetMissingParent = await httpJson(
      port,
      'GET',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-notfound/providers/Microsoft.Storage/storageAccounts/missingstore/blobServices/default/containers/missingcontainer?api-version=2023-01-01',
    );
    assert.equal(childGetMissingParent.status, 404);
    assert.equal(childGetMissingParent.body.error.code, 'ParentResourceNotFound');

    const rootDelete = await httpJson(
      port,
      'DELETE',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-notfound/providers/Microsoft.Storage/storageAccounts/missingstore?api-version=2023-01-01',
    );
    assert.equal(rootDelete.status, 204);
  });
});

test('ARM facade stores generic Tier 1 resources with capability metadata', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/rg-ai?api-version=2021-04-01', { location: 'eastus' });
    const put = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-ai/providers/Microsoft.Storage/storageAccounts/gsaitest?api-version=2023-01-01',
      {
        location: 'eastus',
        sku: { name: 'Standard_LRS' },
        kind: 'StorageV2',
        properties: { allowBlobPublicAccess: false },
      },
    );
    assert.equal(put.status, 202);
    assert.equal(put.body, null);

    await httpJson(
      port,
      'GET',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-ai/providers/Microsoft.Storage/storageAccounts/gsaitest?api-version=2023-01-01',
    );
    await httpJson(
      port,
      'GET',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-ai/providers/Microsoft.Storage/storageAccounts/gsaitest?api-version=2023-01-01',
    );
    const get = await httpJson(
      port,
      'GET',
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-ai/providers/Microsoft.Storage/storageAccounts/gsaitest?api-version=2023-01-01',
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.type, 'Microsoft.Storage/storageAccounts');
    assert.equal(get.body.globalstack.capabilityId, 'blob-storage');
    assert.equal(get.body.globalstack.emulationDepth, 'official-emulator-backed-local');
    assert.equal(get.body.globalstack.realAzureApiComplete, false);
    assert.equal(get.body.properties.provisioningState, 'Succeeded');
    assert.equal(get.body.globalstack.supportLevel, 'official-emulator+globalstack-facade');
  });
});

test('ARM facade evaluates compiled Bicep variables and nested deployment outputs', async () => {
  await withServer(async (port) => {
    const put = await httpJson(
      port,
      'PUT',
      '/subscriptions/00000000-0000-0000-0000-000000000000/providers/Microsoft.Resources/deployments/native-bicep-fixture?api-version=2022-09-01',
      {
        location: 'eastus',
        properties: {
          mode: 'Incremental',
          parameters: {
            resourceGroupName: { value: 'rg-bicep-fixture' },
            storageAccountName: { value: 'gsbicepfixture' },
          },
          template: {
            parameters: {
              resourceGroupName: { type: 'string' },
              storageAccountName: { type: 'string' },
            },
            resources: [
              {
                type: 'Microsoft.Resources/resourceGroups',
                apiVersion: '2022-09-01',
                name: "[parameters('resourceGroupName')]",
                location: 'eastus',
              },
              {
                type: 'Microsoft.Resources/deployments',
                apiVersion: '2025-04-01',
                name: 'inner-workload',
                resourceGroup: "[parameters('resourceGroupName')]",
                properties: {
                  mode: 'Incremental',
                  parameters: {
                    storageAccountName: { value: "[parameters('storageAccountName')]" },
                  },
                  template: {
                    parameters: {
                      storageAccountName: { type: 'string' },
                    },
                    variables: {
                      queueName: 'model-jobs',
                    },
                    resources: [
                      {
                        type: 'Microsoft.Storage/storageAccounts',
                        apiVersion: '2023-05-01',
                        name: "[parameters('storageAccountName')]",
                        location: 'eastus',
                        kind: 'StorageV2',
                        sku: { name: 'Standard_LRS' },
                        properties: { allowBlobPublicAccess: false },
                      },
                      {
                        type: 'Microsoft.Storage/storageAccounts/queueServices',
                        apiVersion: '2023-05-01',
                        name: "[format('{0}/{1}', parameters('storageAccountName'), 'default')]",
                        properties: {},
                      },
                      {
                        type: 'Microsoft.Storage/storageAccounts/queueServices/queues',
                        apiVersion: '2023-05-01',
                        name: "[format('{0}/{1}/{2}', parameters('storageAccountName'), 'default', variables('queueName'))]",
                        properties: {},
                      },
                    ],
                    outputs: {
                      queueName: {
                        type: 'string',
                        value: "[variables('queueName')]",
                      },
                    },
                  },
                },
              },
            ],
            outputs: {
              queueName: {
                type: 'string',
                value: "[reference(extensionResourceId(format('/subscriptions/{0}/resourceGroups/{1}', subscription().subscriptionId, parameters('resourceGroupName')), 'Microsoft.Resources/deployments', 'inner-workload'), '2025-04-01').outputs.queueName.value]",
              },
            },
          },
        },
      },
    );

    assert.equal(put.status, 201);
    assert.equal(put.body.properties.outputs.queueName.value, 'model-jobs');
    assert.ok(put.body.properties.globalstackDeploymentSteps.some(step =>
      step.id.endsWith('/Microsoft.Storage/storageAccounts/gsbicepfixture/queueServices/default/queues/model-jobs')));
    assert.ok(put.body.properties.globalstackDeploymentSteps.every(step => !step.id.includes("variables(") && !step.id.includes("'default'")));
  });
});
