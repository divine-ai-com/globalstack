import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';

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
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ port, runtime });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
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
