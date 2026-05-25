import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createEdgeRouterServer } from '../../azure-data-plane/src/edge-router.mjs';
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
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ port, runtime });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function kubeJson(port, path, { host, auth = 'Bearer globalstack-aks-user-token' } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers: {
      ...(host ? { 'x-forwarded-host': host } : {}),
      ...(auth ? { authorization: auth } : {}),
    },
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

test('kubernetes router follows managed cluster lifecycle and serves bounded kube api metadata', async () => {
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const armServer = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
  });
  const kubeServer = createKubernetesRouterServer(runtime.kubernetesRouter);
  await new Promise(resolve => armServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => kubeServer.listen(0, '127.0.0.1', resolve));
  const armPort = armServer.address().port;
  const kubePort = kubeServer.address().port;

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
    const unauthorized = await kubeJson(kubePort, '/version', { host, auth: null });
    assert.equal(unauthorized.status, 401);

    const version = await kubeJson(kubePort, '/version', { host });
    assert.equal(version.status, 200);
    assert.equal(version.body.gitVersion, 'v1.29.2');

    const nodes = await kubeJson(kubePort, '/api/v1/nodes', { host });
    assert.equal(nodes.status, 200);
    assert.equal(nodes.body.items.length, 1);
    assert.equal(nodes.body.items[0].metadata.labels['kubernetes.azure.com/agentpool'], 'systempool');

    const deleted = await httpJson(
      armPort,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-aks-sync/providers/Microsoft.ContainerService/managedClusters/aks-sync?api-version=2024-02-01`,
    );
    assert.equal(deleted.status, 200);

    const afterDelete = await kubeJson(kubePort, '/version', { host });
    assert.equal(afterDelete.status, 404);
  } finally {
    await new Promise(resolve => kubeServer.close(resolve));
    await new Promise(resolve => armServer.close(resolve));
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
        `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/waf-sync?api-version=2023-09-01`,
        {
          location: 'eastus',
          properties: {
            policySettings: { state: 'Enabled', mode: 'Prevention', requestBodyCheck: true },
            managedRules: { managedRuleSets: [{ ruleSetType: 'OWASP', ruleSetVersion: '3.2' }] },
            customRules: [{
              name: 'BlockBadBotHeader',
              priority: 100,
              ruleType: 'MatchRule',
              action: 'Block',
              matchConditions: [{
                matchVariables: [{ variableName: 'RequestHeaders', selector: 'User-Agent' }],
                operator: 'Contains',
                matchValues: ['bad-bot'],
              }],
            }],
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
                id: `${subscriptionPath}/resourceGroups/rg-edge-sync/providers/Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/waf-sync`,
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
