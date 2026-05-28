import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createDigitalTwinsRouterServer } from '../../azure-data-plane/src/digital-twins-router.mjs';
import { createEdgeRouterServer } from '../../azure-data-plane/src/edge-router.mjs';
import { createIotHubRouterServer } from '../../azure-data-plane/src/iot-hub-router.mjs';
import { createKubernetesRouterServer } from '../../azure-data-plane/src/kubernetes-router.mjs';

const subscriptionPath = '/subscriptions/00000000-0000-0000-0000-000000000000';

function httpJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        authorization: 'Bearer globalstack-local-token',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
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
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withRuntimeServer(fn) {
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const server = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
    metricStore: runtime.metricStore,
    kubernetesRouter: runtime.kubernetesRouter,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ port, runtime });
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await runtime.dispose();
  }
}

async function kubeJson(port, path, { host, auth = null, method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(host ? { 'x-forwarded-host': host } : {}),
      ...(auth ? { authorization: auth } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return {
    status: response.status,
    body: parsed,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

function decodeKubeconfigValue(responseBody) {
  return Buffer.from(responseBody.kubeconfigs[0].value, 'base64').toString('utf8');
}

function kubeconfigToken(kubeconfigText) {
  return String(kubeconfigText)
    .split('\n')
    .find(line => line.trim().startsWith('token:'))
    ?.split(':')
    .slice(1)
    .join(':')
    .trim() ?? '';
}

function leafResourceName(name) {
  return String(name ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

async function waitFor(assertion, { timeoutMs = 180000, delayMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError ?? new Error(`condition did not become true within ${timeoutMs}ms`);
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
    body: parsed,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function digitalTwinsJson(port, method, path, body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'x-forwarded-host': 'adt-sync.api.eastus.digitaltwins.azure.net',
      authorization: 'Bearer globalstack-local-token',
      'content-type': 'application/json',
      ...headers,
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
    body: parsed,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function iotHubJson(port, method, path, body, headers = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      'x-forwarded-host': 'iot-sync.azure-devices.net',
      authorization: 'Bearer globalstack-local-token',
      'content-type': 'application/json',
      ...headers,
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
    body: parsed,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

test('dns registry follows private zone record and vnet link lifecycle', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-dns-sync?api-version=2021-04-01`, { location: 'eastus' });

    const vnet = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync?api-version=2023-09-01`,
      {
        location: 'eastus',
        properties: {
          addressSpace: { addressPrefixes: ['10.88.0.0/16'] },
          subnets: [{ name: 'default', properties: { addressPrefix: '10.88.1.0/24' } }],
        },
      },
    );
    assert.equal(vnet.status, 201);

    const zone = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/privateDnsZones/sync.internal.test?api-version=2020-06-01`,
      { location: 'global', properties: {} },
    );
    assert.equal(zone.status, 202);

    const record = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/privateDnsZones/sync.internal.test/A/api?api-version=2020-06-01`,
      { properties: { TTL: 60, ARecords: [{ ipv4Address: '10.88.1.4' }] } },
    );
    assert.equal(record.status, 201);

    const link = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/privateDnsZones/sync.internal.test/virtualNetworkLinks/default-link?api-version=2020-06-01`,
      {
        location: 'global',
        properties: {
          registrationEnabled: false,
          virtualNetwork: {
            id: `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync`,
          },
        },
      },
    );
    assert.equal(link.status, 201);

    const resolved = runtime.dnsRegistry.resolvePrivateDns({
      fqdn: 'api.sync.internal.test',
      vnetId: `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync`,
    });
    assert.equal(resolved.status, 'NOERROR');
    assert.deepEqual(resolved.values, ['10.88.1.4']);

    const deleteLink = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/privateDnsZones/sync.internal.test/virtualNetworkLinks/default-link?api-version=2020-06-01`,
    );
    assert.equal(deleteLink.status, 200);

    const unresolved = runtime.dnsRegistry.resolvePrivateDns({
      fqdn: 'api.sync.internal.test',
      vnetId: `${subscriptionPath}/resourceGroups/rg-dns-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync`,
    });
    assert.equal(unresolved.status, 'NXDOMAIN');
    assert.equal(unresolved.reason, 'ZONE_NOT_LINKED');
  });
});

test('iot hub data-plane follows ARM hub lifecycle', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    const server = createIotHubRouterServer(runtime.iotHubRouter);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const iotPort = server.address().port;
    try {
      await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-iot-sync?api-version=2021-04-01`, { location: 'eastus' });

      const beforeCreate = await iotHubJson(iotPort, 'GET', '/devices?api-version=2021-04-12');
      assert.equal(beforeCreate.status, 404);
      assert.equal(beforeCreate.body.ExceptionType, 'IotHubNotFound');

      const create = await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-iot-sync/providers/Microsoft.Devices/IotHubs/iot-sync?api-version=2023-06-30`,
        {
          location: 'eastus',
          sku: { name: 'S1', tier: 'Standard', capacity: 1 },
          properties: {},
        },
      );
      assert.equal(create.status, 201);
      assert.equal(create.body.properties.hostName, 'iot-sync.azure-devices.net');

      const device = await iotHubJson(iotPort, 'PUT', '/devices/sensor-01?api-version=2021-04-12', {
        status: 'enabled',
      });
      assert.equal(device.status, 200);
      assert.equal(device.body.deviceId, 'sensor-01');

      const telemetry = await iotHubJson(iotPort, 'POST', '/devices/sensor-01/messages/events?api-version=2021-04-12', {
        pressure: 31.2,
      });
      assert.equal(telemetry.status, 204);
      assert.equal(runtime.iotHubRouter.listTelemetry('iot-sync').length, 1);

      const deleted = await httpJson(
        port,
        'DELETE',
        `${subscriptionPath}/resourceGroups/rg-iot-sync/providers/Microsoft.Devices/IotHubs/iot-sync?api-version=2023-06-30`,
      );
      assert.equal(deleted.status, 200);

      const afterDelete = await iotHubJson(iotPort, 'GET', '/devices?api-version=2021-04-12');
      assert.equal(afterDelete.status, 404);
      assert.equal(afterDelete.body.ExceptionType, 'IotHubNotFound');
    } finally {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  });
});

test('digital twins data-plane follows ARM instance lifecycle', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    const server = createDigitalTwinsRouterServer(runtime.digitalTwinsRouter);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const twinsPort = server.address().port;
    try {
      await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-twins-sync?api-version=2021-04-01`, { location: 'eastus' });

      const beforeCreate = await digitalTwinsJson(twinsPort, 'GET', '/models?api-version=2023-10-31');
      assert.equal(beforeCreate.status, 404);
      assert.equal(beforeCreate.body.error.code, 'DigitalTwinsInstanceNotFound');

      const create = await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-twins-sync/providers/Microsoft.DigitalTwins/digitalTwinsInstances/adt-sync?api-version=2023-01-31`,
        {
          location: 'eastus',
          properties: { publicNetworkAccess: 'Enabled' },
        },
      );
      assert.equal(create.status, 201);
      assert.equal(create.body.properties.hostName, 'adt-sync.api.eastus.digitaltwins.azure.net');

      const modelId = 'dtmi:globalstack:SyncTwin;1';
      const model = await digitalTwinsJson(twinsPort, 'POST', '/models?api-version=2023-10-31', [{
        '@id': modelId,
        '@type': 'Interface',
        '@context': 'dtmi:dtdl:context;3',
        contents: [{ '@type': 'Property', name: 'state', schema: 'string' }],
      }]);
      assert.equal(model.status, 201);

      const twin = await digitalTwinsJson(twinsPort, 'PUT', '/digitaltwins/sync-01?api-version=2023-10-31', {
        $metadata: { $model: modelId },
        state: 'ready',
      });
      assert.equal(twin.status, 200);
      assert.equal(twin.body.state, 'ready');

      const deleted = await httpJson(
        port,
        'DELETE',
        `${subscriptionPath}/resourceGroups/rg-twins-sync/providers/Microsoft.DigitalTwins/digitalTwinsInstances/adt-sync?api-version=2023-01-31`,
      );
      assert.equal(deleted.status, 200);

      const afterDelete = await digitalTwinsJson(twinsPort, 'GET', '/models?api-version=2023-10-31');
      assert.equal(afterDelete.status, 404);
      assert.equal(afterDelete.body.error.code, 'DigitalTwinsInstanceNotFound');
    } finally {
      server.closeAllConnections?.();
      await new Promise(resolve => server.close(resolve));
    }
  });
});

test('network model allocates and removes private endpoint addresses through ARM lifecycle', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-network-sync?api-version=2021-04-01`, { location: 'eastus' });
    await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync?api-version=2023-09-01`,
      {
        location: 'eastus',
        properties: {
          addressSpace: { addressPrefixes: ['10.77.0.0/16'] },
          subnets: [{ name: 'default', properties: { addressPrefix: '10.77.1.0/24' } }],
        },
      },
    );

    const created = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Network/privateEndpoints/pe-sync?api-version=2023-09-01`,
      {
        location: 'eastus',
        properties: {
          subnet: {
            id: `${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync/subnets/default`,
          },
          privateLinkServiceConnections: [
            {
              name: 'blob',
              properties: {
                privateLinkServiceId: `${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Storage/storageAccounts/stsync`,
                groupIds: ['blob'],
              },
            },
          ],
        },
      },
    );
    assert.equal(created.status, 201);

    const endpoint = runtime.networkModel.getPrivateEndpoint(`${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Network/privateEndpoints/pe-sync`);
    assert.ok(endpoint);
    assert.equal(endpoint.subnetId, `${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync/subnets/default`.toLowerCase());
    assert.match(endpoint.ipAddress, /^10\.77\.1\./);

    const deleted = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Network/privateEndpoints/pe-sync?api-version=2023-09-01`,
    );
    assert.equal(deleted.status, 200);
    assert.equal(runtime.networkModel.getPrivateEndpoint(`${subscriptionPath}/resourceGroups/rg-network-sync/providers/Microsoft.Network/privateEndpoints/pe-sync`), null);
  });
});

test('metric store follows alert lifecycle and evaluates bounded alert transitions', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-metrics-sync?api-version=2021-04-01`, { location: 'eastus' });
    const actionGroup = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-metrics-sync/providers/Microsoft.Insights/actionGroups/ag-sync?api-version=2023-01-01`,
      {
        location: 'global',
        properties: {
          groupShortName: 'gsmetric',
          enabled: true,
          emailReceivers: [{ name: 'ops', emailAddress: 'ops@example.com', useCommonAlertSchema: true }],
        },
      },
    );
    assert.equal(actionGroup.status, 201);

    const alert = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-metrics-sync/providers/Microsoft.Insights/metricAlerts/ma-sync?api-version=2018-03-01`,
      {
        location: 'global',
        properties: {
          description: 'sync alert',
          severity: 3,
          enabled: true,
          scopes: [`${subscriptionPath}/resourceGroups/rg-metrics-sync`],
          evaluationFrequency: 'PT1M',
          windowSize: 'PT5M',
          criteria: {
            'odata.type': 'Microsoft.Azure.Monitor.SingleResourceMultipleMetricCriteria',
            allOf: [{
              name: 'HighCpu',
              metricName: 'Percentage CPU',
              metricNamespace: 'Microsoft.Compute/virtualMachines',
              operator: 'GreaterThan',
              threshold: 80,
              timeAggregation: 'Average',
              criterionType: 'StaticThresholdCriterion',
            }],
          },
          actions: [{ actionGroupId: actionGroup.body.id }],
        },
      },
    );
    assert.equal(alert.status, 201);

    runtime.metricStore.ingestMetric({
      scope: `${subscriptionPath}/resourceGroups/rg-metrics-sync`,
      metricNamespace: 'Microsoft.Compute/virtualMachines',
      metricName: 'Percentage CPU',
      value: 91,
      timestamp: '2026-01-01T00:00:00.000Z',
    });
    const fired = runtime.metricStore.evaluateAlert(alert.body.id, { now: '2026-01-01T00:01:00.000Z' });
    assert.equal(fired.status, 'Fired');
    assert.equal(runtime.metricStore.listActionInvocations(alert.body.id).length, 1);

    runtime.metricStore.ingestMetric({
      scope: `${subscriptionPath}/resourceGroups/rg-metrics-sync`,
      metricNamespace: 'Microsoft.Compute/virtualMachines',
      metricName: 'Percentage CPU',
      value: 12,
      timestamp: '2026-01-01T00:20:00.000Z',
    });
    const resolved = runtime.metricStore.evaluateAlert(alert.body.id, { now: '2026-01-01T00:21:00.000Z' });
    assert.equal(resolved.status, 'Resolved');
    assert.equal(resolved.lastMetricValue, 12);
  });
});

test('kubernetes router follows managed cluster lifecycle and serves a real AKS-backed kube api slice', async () => {
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const armServer = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
    kubernetesRouter: runtime.kubernetesRouter,
  });
  const kubeServer = createKubernetesRouterServer(runtime.kubernetesRouter);
  const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
  await new Promise(resolve => armServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => kubeServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => edgeServer.listen(0, '127.0.0.1', resolve));
  const armPort = armServer.address().port;
  const kubePort = kubeServer.address().port;
  const edgePort = edgeServer.address().port;

  try {
    await httpJson(armPort, 'PUT', `${subscriptionPath}/resourceGroups/rg-aks-sync?api-version=2021-04-01`, { location: 'eastus' });
    const created = await httpJson(
      armPort,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync?api-version=2024-02-01`,
      {
        location: 'eastus',
        identity: { type: 'SystemAssigned' },
        properties: {
          dnsPrefix: 'aks-sync',
          kubernetesVersion: '1.29.2',
          servicePrincipalProfile: { clientId: 'msi' },
          agentPoolProfiles: [
            { name: 'systempool', count: 1, vmSize: 'Standard_DS2_v2', mode: 'System', osType: 'Linux' },
          ],
        },
      },
    );
    assert.equal(created.status, 202);

    const cluster = await httpJson(
      armPort,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync?api-version=2024-02-01`,
    );
    const host = cluster.body.properties.fqdn;
    const userCredentials = await httpJson(
      armPort,
      'POST',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/listClusterUserCredential?api-version=2024-02-01`,
      {},
    );
    const adminCredentials = await httpJson(
      armPort,
      'POST',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/listClusterAdminCredential?api-version=2024-02-01`,
      {},
    );
    assert.equal(userCredentials.status, 200);
    assert.equal(adminCredentials.status, 200);
    const userToken = kubeconfigToken(decodeKubeconfigValue(userCredentials.body));
    const adminToken = kubeconfigToken(decodeKubeconfigValue(adminCredentials.body));

    const unauthorized = await kubeJson(kubePort, '/version', { host });
    assert.equal(unauthorized.status, 401);

    const version = await waitFor(async () => {
      const result = await kubeJson(kubePort, '/version', { host, auth: `Bearer ${userToken}` });
      assert.equal(result.status, 200);
      return result;
    });
    assert.equal(version.body.gitVersion, 'v1.29.2');

    const userWrite = await kubeJson(kubePort, '/api/v1/namespaces', {
      host,
      auth: `Bearer ${userToken}`,
      method: 'POST',
      body: { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'user-denied' } },
    });
    assert.equal(userWrite.status, 403);

    const namespaceCreate = await kubeJson(kubePort, '/api/v1/namespaces', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'runtime-smoke' } },
    });
    assert.equal(namespaceCreate.status, 201);

    const configMapCreate = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/configmaps', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'v1',
        kind: 'ConfigMap',
        metadata: { name: 'runtime-smoke-config' },
        data: { mode: 'live' },
      },
    });
    assert.equal(configMapCreate.status, 201);

    const secretCreate = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/secrets', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { name: 'runtime-smoke-secret' },
        stringData: { mode: 'admin-only' },
      },
    });
    assert.equal(secretCreate.status, 201);

    const userSecrets = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/secrets', {
      host,
      auth: `Bearer ${userToken}`,
    });
    assert.equal(userSecrets.status, 403);
    assert.equal(userSecrets.body.reason, 'Forbidden');

    const deploymentCreate = await kubeJson(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'runtime-smoke-deploy' },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'runtime-smoke' } },
          template: {
            metadata: { labels: { app: 'runtime-smoke' } },
            spec: {
              containers: [
                {
                  name: 'http-echo',
                  image: 'hashicorp/http-echo:1.0.0',
                  args: ['-text=runtime-smoke', '-listen=:5678'],
                  ports: [{ containerPort: 5678 }],
                },
              ],
            },
          },
        },
      },
    });
    assert.equal(deploymentCreate.status, 201);

    const serviceCreate = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: { name: 'runtime-smoke-svc' },
        spec: {
          selector: { app: 'runtime-smoke' },
          ports: [{ port: 80, targetPort: 5678 }],
        },
      },
    });
    assert.equal(serviceCreate.status, 201);

    const namespaces = await kubeJson(kubePort, '/api/v1/namespaces', { host, auth: `Bearer ${userToken}` });
    assert.equal(namespaces.status, 200);
    assert.ok(namespaces.body.items.some(item => item.metadata.name === 'runtime-smoke'));

    const nodes = await waitFor(async () => {
      const ready = await kubeJson(kubePort, '/api/v1/nodes', { host, auth: `Bearer ${adminToken}` });
      assert.equal(ready.status, 200);
      assert.ok(ready.body.items.length >= 1);
      return ready;
    });
    assert.equal(nodes.status, 200);
    assert.equal(nodes.body.items[0].metadata.labels['kubernetes.azure.com/agentpool'], 'systempool');
    assert.equal(nodes.body.items[0].metadata.labels['kubernetes.azure.com/nodepool-type'], 'VirtualMachineScaleSets');

    const poolList = await httpJson(
      armPort,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/agentPools?api-version=2024-02-01`,
    );
    assert.equal(poolList.status, 200);
    assert.ok(poolList.body.value.some(item => leafResourceName(item.name) === 'systempool'));

    const runCommand = await httpJson(
      armPort,
      'POST',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/runCommand?api-version=2024-02-01`,
      { command: 'kubectl get namespaces -o name' },
    );
    assert.equal(runCommand.status, 202);
    const commandLocation = new URL(runCommand.headers.location);
    const commandResult = await waitFor(async () => {
      const resolved = await httpJson(armPort, 'GET', `${commandLocation.pathname}${commandLocation.search}`);
      assert.equal(resolved.status, 200);
      assert.equal(resolved.body.properties.provisioningState, 'succeeded');
      return resolved;
    });
    assert.equal(commandResult.body.properties.exitCode, 0);
    assert.match(commandResult.body.properties.logs, /namespace\/runtime-smoke/);

    const loadBalancerService = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'runtime-smoke-lb',
          annotations: {
            'service.beta.kubernetes.io/azure-dns-label-name': 'runtimesmokesync',
          },
        },
        spec: {
          type: 'LoadBalancer',
          selector: { app: 'runtime-smoke' },
          ports: [{ port: 80, targetPort: 5678 }],
        },
      },
    });
    assert.equal(loadBalancerService.status, 201);

    const exposedService = await waitFor(async () => {
      const current = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-lb', {
        host,
        auth: `Bearer ${adminToken}`,
      });
      assert.equal(current.status, 200);
      assert.match(String(current.body.status?.loadBalancer?.ingress?.[0]?.ip ?? ''), /^203\.0\.\d{1,3}\.\d{1,3}$/);
      return current;
    });
    const exposureHost = 'runtimesmokesync.eastus.cloudapp.azure.com';

    const exposedResponse = await waitFor(async () => {
      const current = await edgeJson(edgePort, 'GET', '/', {
        host: exposureHost,
        protocol: 'http',
      });
      assert.equal(current.status, 200);
      assert.match(String(current.body), /runtime-smoke/);
      return current;
    });
    assert.equal(exposedResponse.headers['x-globalstack-edge-route'], 'aks-service/runtime-smoke-runtime-smoke-lb');

    const internalService = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'runtime-smoke-ilb',
          annotations: {
            'service.beta.kubernetes.io/azure-load-balancer-internal': 'true',
            'service.beta.kubernetes.io/azure-load-balancer-ipv4': '10.224.10.25',
          },
        },
        spec: {
          type: 'LoadBalancer',
          selector: { app: 'runtime-smoke' },
          ports: [{ port: 80, targetPort: 5678 }],
        },
      },
    });
    assert.equal(internalService.status, 201);

    const internalResolved = await waitFor(async () => {
      const current = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-ilb', {
        host,
        auth: `Bearer ${adminToken}`,
      });
      assert.equal(current.status, 200);
      assert.equal(current.body.status?.loadBalancer?.ingress?.[0]?.ip, '10.224.10.25');
      return current;
    });
    assert.equal(internalResolved.body.status.loadBalancer.ingress[0].ip, '10.224.10.25');

    const internalEdge = await edgeJson(edgePort, 'GET', '/', {
      host: '10.224.10.25',
      protocol: 'http',
    });
    assert.equal(internalEdge.status, 404);

    const publicIp = await httpJson(
      armPort,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.Network/publicIPAddresses/pip-sync?api-version=2023-09-01`,
      {
        location: 'eastus',
        sku: { name: 'Standard' },
        properties: {
          publicIPAllocationMethod: 'Static',
          dnsSettings: { domainNameLabel: 'akspipsync' },
        },
      },
    );
    assert.equal(publicIp.status, 201);

    const pipService = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'runtime-smoke-pip',
          annotations: {
            'service.beta.kubernetes.io/azure-load-balancer-resource-group': 'rg-aks-sync',
            'service.beta.kubernetes.io/azure-pip-name': 'pip-sync',
          },
        },
        spec: {
          type: 'LoadBalancer',
          selector: { app: 'runtime-smoke' },
          ports: [{ port: 80, targetPort: 5678 }],
        },
      },
    });
    assert.equal(pipService.status, 201);

    const pipResolved = await waitFor(async () => {
      const current = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-pip', {
        host,
        auth: `Bearer ${adminToken}`,
      });
      assert.equal(current.status, 200);
      assert.equal(current.body.status?.loadBalancer?.ingress?.[0]?.ip, publicIp.body.properties.ipAddress);
      return current;
    });
    assert.equal(pipResolved.body.status.loadBalancer.ingress[0].ip, publicIp.body.properties.ipAddress);

    const pipEdge = await waitFor(async () => {
      const current = await edgeJson(edgePort, 'GET', '/', {
        host: publicIp.body.properties.dnsSettings.fqdn,
        protocol: 'http',
      });
      assert.equal(current.status, 200);
      assert.match(String(current.body), /runtime-smoke/);
      return current;
    });
    assert.equal(pipEdge.headers['x-globalstack-edge-route'], 'aks-service/runtime-smoke-runtime-smoke-pip');

    const autoscaledPool = await httpJson(
      armPort,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/agentPools/userpool?api-version=2024-02-01`,
      {
        properties: {
          count: 0,
          vmSize: 'Standard_DS3_v2',
          mode: 'User',
          osType: 'Linux',
          type: 'VirtualMachineScaleSets',
          enableAutoScaling: true,
          minCount: 0,
          maxCount: 1,
        },
      },
    );
    assert.ok([200, 201].includes(autoscaledPool.status));

    const autoscaleDeployment = await kubeJson(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'runtime-smoke-autoscale' },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'runtime-smoke-autoscale' } },
          template: {
            metadata: { labels: { app: 'runtime-smoke-autoscale' } },
            spec: {
              nodeSelector: {
                'kubernetes.azure.com/agentpool': 'userpool',
              },
              containers: [
                {
                  name: 'http-echo',
                  image: 'hashicorp/http-echo:1.0.0',
                  args: ['-text=runtime-smoke-autoscale', '-listen=:5678'],
                  ports: [{ containerPort: 5678 }],
                },
              ],
            },
          },
        },
      },
    });
    assert.equal(autoscaleDeployment.status, 201);

    await waitFor(async () => {
      const pool = await httpJson(
        armPort,
        'GET',
        `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/agentPools/userpool?api-version=2024-02-01`,
      );
      assert.equal(pool.status, 200);
      assert.equal(pool.body.properties.enableAutoScaling, true);
      assert.equal(pool.body.properties.count, 1);
      const nodesNow = await kubeJson(kubePort, '/api/v1/nodes', { host, auth: `Bearer ${adminToken}` });
      assert.equal(nodesNow.status, 200);
      assert.ok(nodesNow.body.items.some(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool'));
    }, { timeoutMs: 240000, delayMs: 2000 });

    const autoscaleDelete = await kubeJson(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments/runtime-smoke-autoscale', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'DELETE',
    });
    assert.equal(autoscaleDelete.status, 200);

    await waitFor(async () => {
      const pool = await httpJson(
        armPort,
        'GET',
        `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/agentPools/userpool?api-version=2024-02-01`,
      );
      assert.equal(pool.status, 200);
      assert.equal(pool.body.properties.count, 0);
      const nodesNow = await kubeJson(kubePort, '/api/v1/nodes', { host, auth: `Bearer ${adminToken}` });
      assert.equal(nodesNow.status, 200);
      assert.ok(!nodesNow.body.items.some(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool'));
    }, { timeoutMs: 300000, delayMs: 3000 });

    const localDeployment = await kubeJson(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'apps/v1',
        kind: 'Deployment',
        metadata: { name: 'runtime-smoke-local' },
        spec: {
          replicas: 1,
          selector: { matchLabels: { app: 'runtime-smoke-local' } },
          template: {
            metadata: { labels: { app: 'runtime-smoke-local' } },
            spec: {
              nodeSelector: {
                'kubernetes.azure.com/agentpool': 'userpool',
              },
              containers: [
                {
                  name: 'http-echo',
                  image: 'hashicorp/http-echo:1.0.0',
                  args: ['-text=runtime-smoke-local', '-listen=:5678'],
                  ports: [{ containerPort: 5678 }],
                },
              ],
            },
          },
        },
      },
    });
    assert.equal(localDeployment.status, 201);

    const localService = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'POST',
      body: {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: 'runtime-smoke-local',
          annotations: {
            'service.beta.kubernetes.io/azure-dns-label-name': 'localsync',
          },
        },
        spec: {
          type: 'LoadBalancer',
          externalTrafficPolicy: 'Local',
          selector: { app: 'runtime-smoke-local' },
          ports: [{ port: 80, targetPort: 5678 }],
        },
      },
    });
    assert.equal(localService.status, 201);

    const localResolved = await waitFor(async () => {
      const current = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-local', {
        host,
        auth: `Bearer ${adminToken}`,
      });
      assert.equal(current.status, 200);
      assert.ok(Number(current.body.spec?.healthCheckNodePort ?? 0) > 0);
      assert.ok(current.body.status?.loadBalancer?.ingress?.[0]?.ip);
      const pool = await httpJson(
        armPort,
        'GET',
        `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/agentPools/userpool?api-version=2024-02-01`,
      );
      assert.equal(pool.status, 200);
      assert.equal(pool.body.properties.count, 1);
      return current;
    }, { timeoutMs: 240000, delayMs: 2000 });

    const clusterEntry = runtime.kubernetesRouter.clusterManager.clustersByHost.get(String(host).toLowerCase());
    assert.ok(clusterEntry);
    const userpoolAssignment = Object.entries(clusterEntry.nodeAssignments)
      .find(([, assignment]) => assignment.name === 'userpool');
    assert.ok(userpoolAssignment);
    const userpoolOriginIp = await runtime.kubernetesRouter.clusterManager.inspectContainerIp(
      userpoolAssignment[1].containerName,
      clusterEntry.networkName,
    );

    const localEdge = await waitFor(async () => {
      const current = await edgeJson(edgePort, 'GET', '/', {
        host: 'localsync.eastus.cloudapp.azure.com',
        protocol: 'http',
      });
      assert.equal(current.status, 200);
      assert.match(String(current.body), /runtime-smoke-local/);
      assert.equal(current.headers['x-globalstack-origin-host'], userpoolOriginIp);
      return current;
    }, { timeoutMs: 120000, delayMs: 1000 });
    assert.equal(localEdge.headers['x-globalstack-edge-route'], 'aks-service/runtime-smoke-runtime-smoke-local');

    const localDelete = await kubeJson(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments/runtime-smoke-local', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'DELETE',
    });
    assert.equal(localDelete.status, 200);

    const localServiceDelete = await kubeJson(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-local', {
      host,
      auth: `Bearer ${adminToken}`,
      method: 'DELETE',
    });
    assert.equal(localServiceDelete.status, 200);

    await waitFor(async () => {
      const pool = await httpJson(
        armPort,
        'GET',
        `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync/agentPools/userpool?api-version=2024-02-01`,
      );
      assert.equal(pool.status, 200);
      assert.equal(pool.body.properties.count, 0);
      const edgeGone = await edgeJson(edgePort, 'GET', '/', {
        host: 'localsync.eastus.cloudapp.azure.com',
        protocol: 'http',
      });
      assert.equal(edgeGone.status, 404);
    }, { timeoutMs: 300000, delayMs: 3000 });

    const deleted = await httpJson(
      armPort,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync?api-version=2024-02-01`,
    );
    assert.equal(deleted.status, 200);

    const afterDelete = await kubeJson(kubePort, '/version', { host });
    assert.equal(afterDelete.status, 404);
  } finally {
    edgeServer.closeAllConnections?.();
    kubeServer.closeAllConnections?.();
    armServer.closeAllConnections?.();
    await new Promise(resolve => edgeServer.close(resolve));
    await new Promise(resolve => kubeServer.close(resolve));
    await new Promise(resolve => armServer.close(resolve));
    await runtime.dispose();
  }
});

test('private dns zone groups register and remove derived private endpoint records', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-zonegroup-sync?api-version=2021-04-01`, { location: 'eastus' });
    await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync?api-version=2023-09-01`,
      {
        location: 'eastus',
        properties: {
          addressSpace: { addressPrefixes: ['10.91.0.0/16'] },
          subnets: [{ name: 'default', properties: { addressPrefix: '10.91.1.0/24' } }],
        },
      },
    );
    await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/privateDnsZones/privatelink.blob.core.windows.net?api-version=2020-06-01`,
      { location: 'global', properties: {} },
    );
    await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/privateDnsZones/privatelink.blob.core.windows.net/virtualNetworkLinks/default-link?api-version=2020-06-01`,
      {
        location: 'global',
        properties: {
          registrationEnabled: false,
          virtualNetwork: {
            id: `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync`,
          },
        },
      },
    );
    await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/privateEndpoints/pe-sync?api-version=2023-09-01`,
      {
        location: 'eastus',
        properties: {
          subnet: {
            id: `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync/subnets/default`,
          },
          privateLinkServiceConnections: [
            {
              name: 'blob',
              properties: {
                privateLinkServiceId: `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Storage/storageAccounts/stsync`,
                groupIds: ['blob'],
              },
            },
          ],
        },
      },
    );
    const zoneGroup = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/privateEndpoints/pe-sync/privateDnsZoneGroups/default?api-version=2023-09-01`,
      {
        properties: {
          privateDnsZoneConfigs: [
            {
              name: 'blob',
              properties: {
                privateDnsZoneId: `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/privateDnsZones/privatelink.blob.core.windows.net`,
              },
            },
          ],
        },
      },
    );
    assert.equal(zoneGroup.status, 201);

    const resolved = runtime.dnsRegistry.resolvePrivateDns({
      fqdn: 'stsync.privatelink.blob.core.windows.net',
      vnetId: `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync`,
    });
    assert.equal(resolved.status, 'NOERROR');
    assert.match(resolved.values[0], /^10\.91\.1\./);

    const deleted = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/privateEndpoints/pe-sync/privateDnsZoneGroups/default?api-version=2023-09-01`,
    );
    assert.equal(deleted.status, 200);

    const unresolved = runtime.dnsRegistry.resolvePrivateDns({
      fqdn: 'stsync.privatelink.blob.core.windows.net',
      vnetId: `${subscriptionPath}/resourceGroups/rg-zonegroup-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync`,
    });
    assert.equal(unresolved.status, 'NXDOMAIN');
    assert.equal(unresolved.reason, 'RECORD_NOT_FOUND');
  });
});

test('edge router applies synced front door routing and attached waf policy', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
    await new Promise(resolve => edgeServer.listen(0, '127.0.0.1', resolve));
    const edgePort = edgeServer.address().port;
    try {
      await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-edge-sync?api-version=2021-04-01`, { location: 'eastus' });

      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Network/FrontDoorWebApplicationFirewallPolicies/waf-sync?api-version=2023-09-01`,
        {
          location: 'global',
          sku: { name: 'Premium_AzureFrontDoor' },
          properties: {
            policySettings: {
              enabledState: 'Enabled',
              mode: 'Prevention',
              requestBodyCheck: 'Enabled',
              customBlockResponseStatusCode: 403,
            },
            managedRules: { managedRuleSets: [{ ruleSetType: 'DefaultRuleSet', ruleSetVersion: '1.0' }] },
            customRules: {
              rules: [{
                name: 'BlockBadBotHeader',
                priority: 100,
                ruleType: 'MatchRule',
                action: 'Block',
                enabledState: 'Enabled',
                matchConditions: [{
                  matchVariable: 'RequestHeaders',
                  selector: 'User-Agent',
                  operator: 'Contains',
                  negateCondition: false,
                  matchValue: ['bad-bot'],
                  transforms: ['Lowercase'],
                }],
              }],
            },
          },
        },
      );

      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync?api-version=2023-05-01`,
        {
          location: 'eastus',
          sku: { name: 'Standard_AzureFrontDoor' },
          properties: {},
        },
      );

      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync/afdEndpoints/edge-sync?api-version=2023-05-01`,
        {
          location: 'eastus',
          properties: { enabledState: 'Enabled' },
        },
      );

      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync/originGroups/og-sync?api-version=2024-02-01`,
        { properties: { sessionAffinityState: 'Disabled' } },
      );

      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync/originGroups/og-sync/origins/origin-sync?api-version=2024-02-01`,
        {
          properties: {
            hostName: 'origin.example.org',
            httpPort: 80,
            httpsPort: 443,
            originHostHeader: 'origin.example.org',
            enabledState: 'Enabled',
          },
        },
      );

      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync/afdEndpoints/edge-sync/routes/route-sync?api-version=2024-02-01`,
        {
          properties: {
            originGroup: {
              id: `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync/originGroups/og-sync`,
            },
            patternsToMatch: ['/mlops/*'],
            supportedProtocols: ['Http', 'Https'],
            forwardingProtocol: 'MatchRequest',
            enabledState: 'Enabled',
          },
        },
      );

      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync/securityPolicies/security-sync?api-version=2024-02-01`,
        {
          properties: {
            parameters: {
              type: 'WebApplicationFirewall',
              wafPolicy: {
                id: `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Network/FrontDoorWebApplicationFirewallPolicies/waf-sync`,
              },
              associations: [{
                domains: [{
                  id: `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Cdn/profiles/profile-sync/afdEndpoints/edge-sync`,
                }],
                patternsToMatch: ['/mlops/*'],
              }],
            },
          },
        },
      );

      const allowed = await edgeJson(edgePort, 'GET', '/mlops/health', {
        host: 'edge-sync.azurefd.net',
        protocol: 'https',
        headers: { 'User-Agent': 'trusted-client' },
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers['x-globalstack-origin-host'], 'origin.example.org');
      assert.equal(allowed.headers['x-globalstack-waf-policy'], 'waf-sync');

      const blocked = await edgeJson(edgePort, 'GET', '/mlops/health', {
        host: 'edge-sync.azurefd.net',
        protocol: 'https',
        headers: { 'User-Agent': 'bad-bot/1.0' },
      });
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.error.code, 'WebApplicationFirewallRequestBlocked');
    } finally {
      await new Promise(resolve => edgeServer.close(resolve));
    }
  });
});

test('activity log store records resource write and delete events through runtime hooks', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-audit-sync?api-version=2021-04-01`, { location: 'eastus' });

    const created = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-audit-sync/providers/Microsoft.EventGrid/systemTopics/audit-sync?api-version=2022-06-15`,
      {
        location: 'eastus',
        properties: {
          source: `${subscriptionPath}/resourceGroups/rg-audit-sync`,
          topicType: 'Microsoft.Resources.ResourceGroups',
        },
      },
    );
    assert.equal(created.status, 201);

    const writeEvents = runtime.activityLogStore.query({
      resourceGroup: 'rg-audit-sync',
      operationName: 'Microsoft.EventGrid/systemTopics/write',
    });
    assert.equal(writeEvents.length, 1);
    assert.equal(writeEvents[0].status, 'Succeeded');

    const deleted = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-audit-sync/providers/Microsoft.EventGrid/systemTopics/audit-sync?api-version=2022-06-15`,
    );
    assert.equal(deleted.status, 200);

    const deleteEvents = runtime.activityLogStore.query({
      resourceGroup: 'rg-audit-sync',
      operationName: 'Microsoft.EventGrid/systemTopics/delete',
    });
    assert.equal(deleteEvents.length, 1);
    assert.equal(deleteEvents[0].status, 'Succeeded');
  });
});

test('load balancing runtime registers and removes bounded public ingress hosts', async () => {
  await withRuntimeServer(async ({ port, runtime }) => {
    const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
    await new Promise(resolve => edgeServer.listen(0, '127.0.0.1', resolve));
    const edgePort = edgeServer.address().port;
    try {
      await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-lb-sync?api-version=2021-04-01`, { location: 'eastus' });
      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync?api-version=2023-09-01`,
        {
          location: 'eastus',
          properties: {
            addressSpace: { addressPrefixes: ['10.90.0.0/16'] },
            subnets: [{ name: 'appgw', properties: { addressPrefix: '10.90.1.0/24' } }],
          },
        },
      );
      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/publicIPAddresses/pip-agw-sync?api-version=2023-09-01`,
        {
          location: 'eastus',
          sku: { name: 'Standard' },
          properties: {
            publicIPAllocationMethod: 'Static',
            publicIPAddressVersion: 'IPv4',
            dnsSettings: { domainNameLabel: 'agwsync' },
          },
        },
      );
      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/publicIPAddresses/pip-lb-sync?api-version=2023-09-01`,
        {
          location: 'eastus',
          sku: { name: 'Standard' },
          properties: {
            publicIPAllocationMethod: 'Static',
            publicIPAddressVersion: 'IPv4',
            dnsSettings: { domainNameLabel: 'lbsync' },
          },
        },
      );
      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/applicationGateways/agw-sync?api-version=2023-09-01`,
        {
          location: 'eastus',
          sku: { name: 'Standard_v2', tier: 'Standard_v2', capacity: 1 },
          properties: {
            gatewayIPConfigurations: [{
              name: 'gw',
              properties: {
                subnet: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/virtualNetworks/vnet-sync/subnets/appgw` },
              },
            }],
            frontendIPConfigurations: [{
              name: 'frontend',
              properties: {
                publicIPAddress: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/publicIPAddresses/pip-agw-sync` },
              },
            }],
            frontendPorts: [{ name: 'http', properties: { port: 80 } }],
            backendAddressPools: [{ name: 'backend', properties: { backendAddresses: [{ ipAddress: '10.90.2.10' }] } }],
            backendHttpSettingsCollection: [{ name: 'http', properties: { port: 80, protocol: 'Http', cookieBasedAffinity: 'Disabled' } }],
            httpListeners: [{
              name: 'listener',
              properties: {
                frontendIPConfiguration: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/applicationGateways/agw-sync/frontendIPConfigurations/frontend` },
                frontendPort: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/applicationGateways/agw-sync/frontendPorts/http` },
                protocol: 'Http',
              },
            }],
            requestRoutingRules: [{
              name: 'rule',
              properties: {
                ruleType: 'Basic',
                priority: 100,
                httpListener: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/applicationGateways/agw-sync/httpListeners/listener` },
                backendAddressPool: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/applicationGateways/agw-sync/backendAddressPools/backend` },
                backendHttpSettings: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/applicationGateways/agw-sync/backendHttpSettingsCollection/http` },
              },
            }],
          },
        },
      );
      await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/loadBalancers/lb-sync?api-version=2023-09-01`,
        {
          location: 'eastus',
          sku: { name: 'Standard' },
          properties: {
            frontendIPConfigurations: [{
              name: 'frontend',
              properties: {
                publicIPAddress: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/publicIPAddresses/pip-lb-sync` },
              },
            }],
            backendAddressPools: [{ name: 'backend', properties: {} }],
            probes: [{ name: 'probe', properties: { protocol: 'Tcp', port: 80, intervalInSeconds: 5, numberOfProbes: 2 } }],
            loadBalancingRules: [{
              name: 'rule',
              properties: {
                protocol: 'Tcp',
                frontendPort: 80,
                backendPort: 80,
                frontendIPConfiguration: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/loadBalancers/lb-sync/frontendIPConfigurations/frontend` },
                backendAddressPool: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/loadBalancers/lb-sync/backendAddressPools/backend` },
                probe: { id: `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/loadBalancers/lb-sync/probes/probe` },
              },
            }],
          },
        },
      );

      const gatewayRoute = await edgeJson(edgePort, 'GET', '/robotics/models/v1', {
        host: 'agwsync.eastus.cloudapp.azure.com',
        protocol: 'http',
      });
      assert.equal(gatewayRoute.status, 200);
      assert.equal(gatewayRoute.headers['x-globalstack-edge-route'], 'application-gateway/agw-sync');

      const loadBalancerRoute = await edgeJson(edgePort, 'GET', '/mlops/health', {
        host: 'lbsync.eastus.cloudapp.azure.com',
        protocol: 'http',
      });
      assert.equal(loadBalancerRoute.status, 200);
      assert.equal(loadBalancerRoute.headers['x-globalstack-edge-route'], 'load-balancer/lb-sync');

      await httpJson(
        port,
        'DELETE',
        `${subscriptionPath}/resourceGroups/rg-lb-sync/providers/Microsoft.Network/loadBalancers/lb-sync?api-version=2023-09-01`,
      );
      const removed = await edgeJson(edgePort, 'GET', '/mlops/health', {
        host: 'lbsync.eastus.cloudapp.azure.com',
        protocol: 'http',
      });
      assert.equal(removed.status, 404);
      assert.equal(removed.body.error.code, 'EndpointNotFound');
    } finally {
      await new Promise(resolve => edgeServer.close(resolve));
    }
  });
});
