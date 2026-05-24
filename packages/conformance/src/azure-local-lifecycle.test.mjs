import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

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

test('storage account child lifecycle requires parent and supports create/get/list/delete', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-life?api-version=2021-04-01`, { location: 'eastus' });

    const childBeforeParent = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None' } },
    );
    assert.equal(childBeforeParent.status, 404);
    assert.equal(childBeforeParent.body.error.code, 'ParentResourceNotFound');

    const parent = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore?api-version=2023-01-01`,
      { location: 'eastus', sku: { name: 'Standard_LRS' }, kind: 'StorageV2', properties: { allowBlobPublicAccess: false } },
    );
    assert.equal(parent.status, 202);

    const childBeforeParentReady = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None' } },
    );
    assert.equal(childBeforeParentReady.status, 409);
    assert.equal(childBeforeParentReady.body.error.code, 'StorageAccountIsNotProvisioned');

    const parentReads = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      parentReads.push(await httpJson(
        port,
        'GET',
        `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore?api-version=2023-01-01`,
      ));
    }
    assert.equal(parentReads.at(-1).body.properties.provisioningState, 'Succeeded');

    const child = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None' } },
    );
    assert.equal(child.status, 201);
    assert.equal(child.body.type, 'Microsoft.Storage/storageAccounts/blobServices/containers');

    const idempotent = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
      { properties: { publicAccess: 'None', metadata: { owner: 'tests' } } },
    );
    assert.equal(idempotent.status, 200);
    assert.equal(idempotent.body.properties.metadata.owner, 'tests');

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.name, 'lifestore/default/raw');

    const list = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers?api-version=2023-01-01`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);
    assert.equal(list.body.value[0].name, 'lifestore/default/raw');

    const del = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
    );
    assert.equal(del.status, 200);

    const getAfterDelete = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-life/providers/Microsoft.Storage/storageAccounts/lifestore/blobServices/default/containers/raw?api-version=2023-01-01`,
    );
    assert.equal(getAfterDelete.status, 404);
    assert.equal(getAfterDelete.body.error.code, 'ContainerNotFound');
  });
});

test('event hubs namespace lifecycle supports child list and delete', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-events?api-version=2021-04-01`, { location: 'eastus' });
    const ns = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub?api-version=2024-01-01`,
      { location: 'eastus', sku: { name: 'Standard', tier: 'Standard', capacity: 1 }, properties: {} },
    );
    assert.equal(ns.status, 201);

    const hub = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs/telemetry?api-version=2024-01-01`,
      { properties: { partitionCount: 2, messageRetentionInDays: 1 } },
    );
    assert.equal(hub.status, 201);

    const list = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs?api-version=2024-01-01`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);

    const del = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs/telemetry?api-version=2024-01-01`,
    );
    assert.equal(del.status, 200);
    const listAfterDelete = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-events/providers/Microsoft.EventHub/namespaces/lifehub/eventhubs?api-version=2024-01-01`,
    );
    assert.equal(listAfterDelete.status, 200);
    assert.equal(listAfterDelete.body.value.length, 0);
  });
});

test('load balancer minimal lifecycle matches Azure empty-collection normalization', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-lb?api-version=2021-04-01`, { location: 'eastus' });

    const minimal = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-lb/providers/Microsoft.Network/loadBalancers/life-min-lb?api-version=2023-09-01`,
      { location: 'eastus', properties: {} },
    );
    assert.equal(minimal.status, 201);
    assert.equal(minimal.body.sku.name, 'Basic');
    assert.equal(minimal.body.sku.tier, 'Regional');
    assert.deepEqual(minimal.body.properties.frontendIPConfigurations, []);
    assert.deepEqual(minimal.body.properties.backendAddressPools, []);
    assert.deepEqual(minimal.body.properties.loadBalancingRules, []);
    assert.deepEqual(minimal.body.properties.probes, []);
    assert.equal(minimal.body.properties.provisioningState, 'Succeeded');

    const deleted = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-lb/providers/Microsoft.Network/loadBalancers/life-min-lb?api-version=2023-09-01`,
    );
    assert.equal(deleted.status, 200);
  });
});

test('load balancer accepts empty loadBalancingRules with populated frontend backend and probe collections', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-lb-rules?api-version=2021-04-01`, { location: 'eastus' });

    const publicIp = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-lb-rules/providers/Microsoft.Network/publicIPAddresses/lb-pip?api-version=2023-09-01`,
      { location: 'eastus', sku: { name: 'Standard' }, properties: { publicIPAllocationMethod: 'Static' } },
    );
    assert.equal(publicIp.status, 201);

    const lb = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-lb-rules/providers/Microsoft.Network/loadBalancers/life-rules-lb?api-version=2023-09-01`,
      {
        location: 'eastus',
        sku: { name: 'Standard' },
        properties: {
          frontendIPConfigurations: [
            { name: 'frontend', properties: { publicIPAddress: { id: publicIp.body.id } } },
          ],
          backendAddressPools: [{ name: 'backend', properties: {} }],
          probes: [{ name: 'tcpProbe', properties: { protocol: 'Tcp', port: 80, intervalInSeconds: 5, numberOfProbes: 2 } }],
          loadBalancingRules: [],
        },
      },
    );
    assert.equal(lb.status, 201);
    assert.equal(lb.body.sku.name, 'Standard');
    assert.equal(lb.body.sku.tier, 'Regional');
    assert.deepEqual(lb.body.properties.loadBalancingRules, []);
    assert.equal(lb.body.properties.frontendIPConfigurations.length, 1);
    assert.equal(lb.body.properties.backendAddressPools.length, 1);
    assert.equal(lb.body.properties.probes.length, 1);
  });
});

test('service bus namespace listKeys supports encoded authorization rule names', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-sb?api-version=2021-04-01`, { location: 'eastus' });

    const namespace = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-sb/providers/Microsoft.ServiceBus/namespaces/lifesb?api-version=2021-11-01`,
      { location: 'eastus', sku: { name: 'Standard', tier: 'Standard' }, properties: {} },
    );
    assert.equal(namespace.status, 201);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await httpJson(
        port,
        'GET',
        `${subscriptionPath}/resourceGroups/rg-sb/providers/Microsoft.ServiceBus/namespaces/lifesb?api-version=2021-11-01`,
      );
    }

    const authRule = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-sb/providers/Microsoft.ServiceBus/namespaces/lifesb/AuthorizationRules/RootManageSharedAccessKey?api-version=2021-11-01`,
      { properties: { rights: ['Listen', 'Send', 'Manage'] } },
    );
    assert.equal(authRule.status, 201);

    const keys = await httpJson(
      port,
      'POST',
      `${subscriptionPath}/resourceGroups/rg-sb/providers/Microsoft.ServiceBus/namespaces/lifesb/AuthorizationRules/lifesb%2FRootManageSharedAccessKey/listKeys?api-version=2021-11-01`,
    );
    assert.equal(keys.status, 200);
    assert.equal(keys.body.keyName, 'RootManageSharedAccessKey');
    assert.match(keys.body.primaryConnectionString, /^Endpoint=sb:\/\/lifesb\.servicebus\.windows\.net\/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=/);
    assert.ok(keys.body.primaryKey);
    assert.ok(keys.body.secondaryKey);
  });
});

test('operational insights workspace sharedKeys action returns deterministic keys', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-law?api-version=2021-04-01`, { location: 'eastus' });

    const workspace = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-law/providers/Microsoft.OperationalInsights/workspaces/law-ops?api-version=2022-10-01`,
      {
        location: 'eastus',
        properties: {
          sku: { name: 'PerGB2018' },
          retentionInDays: 30,
        },
      },
    );
    assert.equal(workspace.status, 201);
    assert.match(workspace.body.customerId, /^[0-9a-f-]{36}$/i);

    const keys = await httpJson(
      port,
      'POST',
      `${subscriptionPath}/resourceGroups/rg-law/providers/Microsoft.OperationalInsights/workspaces/law-ops/sharedKeys?api-version=2022-10-01`,
    );
    assert.equal(keys.status, 200);
    assert.ok(keys.body.primarySharedKey);
    assert.ok(keys.body.secondarySharedKey);
    assert.notEqual(keys.body.primarySharedKey, keys.body.secondarySharedKey);
  });
});

test('user-assigned identity reads include deterministic principal, client, and tenant ids', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-mi?api-version=2021-04-01`, { location: 'eastus' });

    const created = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-mi/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-life?api-version=2023-01-31`,
      { location: 'eastus' },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.type, 'Microsoft.ManagedIdentity/userAssignedIdentities');
    assert.ok(created.body.properties.principalId);
    assert.ok(created.body.properties.clientId);
    assert.equal(created.body.properties.tenantId, '00000000-0000-0000-0000-000000000000');

    const fetched = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-mi/providers/Microsoft.ManagedIdentity/userAssignedIdentities/id-life?api-version=2023-01-31`,
    );
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.properties.principalId, created.body.properties.principalId);
    assert.equal(fetched.body.properties.clientId, created.body.properties.clientId);
    assert.equal(fetched.body.properties.tenantId, created.body.properties.tenantId);
  });
});

test('virtual network peering supports create, get, list, and delete', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-net?api-version=2021-04-01`, { location: 'eastus' });

    const eastVnet = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-east?api-version=2023-09-01`,
      { location: 'eastus', properties: { addressSpace: { addressPrefixes: ['10.50.0.0/16'] } } },
    );
    assert.equal(eastVnet.status, 201);

    const westVnet = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-west?api-version=2023-09-01`,
      { location: 'westus2', properties: { addressSpace: { addressPrefixes: ['10.51.0.0/16'] } } },
    );
    assert.equal(westVnet.status, 201);

    const peering = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-east/virtualNetworkPeerings/peer-east-to-west?api-version=2023-09-01`,
      {
        properties: {
          remoteVirtualNetwork: { id: westVnet.body.id },
          allowVirtualNetworkAccess: true,
          allowForwardedTraffic: true,
        },
      },
    );
    assert.equal(peering.status, 201);
    assert.equal(peering.body.type, 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings');
    assert.equal(peering.body.properties.remoteVirtualNetwork.id, westVnet.body.id);
    assert.equal(peering.body.properties.peeringState, 'Connected');
    assert.equal(peering.body.properties.provisioningState, 'Succeeded');

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-east/virtualNetworkPeerings/peer-east-to-west?api-version=2023-09-01`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.name, 'vnet-east/peer-east-to-west');

    const list = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-east/virtualNetworkPeerings?api-version=2023-09-01`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);
    assert.equal(list.body.value[0].name, 'vnet-east/peer-east-to-west');

    const del = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-east/virtualNetworkPeerings/peer-east-to-west?api-version=2023-09-01`,
    );
    assert.equal(del.status, 200);

    const getAfterDelete = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-net/providers/Microsoft.Network/virtualNetworks/vnet-east/virtualNetworkPeerings/peer-east-to-west?api-version=2023-09-01`,
    );
    assert.equal(getAfterDelete.status, 404);
  });
});

test('activity log alert lifecycle supports create/get/list/delete', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-alerts?api-version=2021-04-01`, { location: 'eastus' });

    const invalid = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-alerts/providers/Microsoft.Insights/activityLogAlerts/ops-alert?api-version=2020-10-01`,
      {
        location: 'global',
        properties: {
          enabled: true,
        },
      },
    );
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, 'BadRequest');

    const actionGroup = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-alerts/providers/Microsoft.Insights/actionGroups/ops-group?api-version=2023-01-01`,
      {
        location: 'global',
        properties: {
          groupShortName: 'opsgrp',
          enabled: true,
        },
      },
    );
    assert.equal(actionGroup.status, 201);

    const alert = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-alerts/providers/Microsoft.Insights/activityLogAlerts/ops-alert?api-version=2020-10-01`,
      {
        location: 'global',
        properties: {
          enabled: true,
          scopes: [`${subscriptionPath}/resourceGroups/rg-alerts`],
          condition: {
            allOf: [
              {
                field: 'category',
                equals: 'Administrative',
              },
            ],
          },
          actions: {
            actionGroups: [
              {
                actionGroupId: actionGroup.body.id,
              },
            ],
          },
        },
      },
    );
    assert.equal(alert.status, 201);
    assert.equal(alert.body.type, 'Microsoft.Insights/activityLogAlerts');

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-alerts/providers/Microsoft.Insights/activityLogAlerts/ops-alert?api-version=2020-10-01`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.name, 'ops-alert');
    assert.equal(get.body.properties.condition.allOf[0].field, 'category');

    const list = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-alerts/providers/Microsoft.Insights/activityLogAlerts?api-version=2020-10-01`,
    );
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);
    assert.equal(list.body.value[0].name, 'ops-alert');

    const del = await httpJson(
      port,
      'DELETE',
      `${subscriptionPath}/resourceGroups/rg-alerts/providers/Microsoft.Insights/activityLogAlerts/ops-alert?api-version=2020-10-01`,
    );
    assert.equal(del.status, 200);

    const getAfterDelete = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-alerts/providers/Microsoft.Insights/activityLogAlerts/ops-alert?api-version=2020-10-01`,
    );
    assert.equal(getAfterDelete.status, 404);
    assert.equal(getAfterDelete.body.error.code, 'ResourceNotFound');
  });
});

test('virtual network create with inline subnets materializes child subnet resources', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-vnet?api-version=2021-04-01`, { location: 'eastus' });

    const create = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-vnet/providers/Microsoft.Network/virtualNetworks/vnet-inline?api-version=2023-09-01`,
      {
        location: 'eastus',
        properties: {
          addressSpace: {
            addressPrefixes: ['10.44.0.0/16'],
          },
          subnets: [
            {
              name: 'snet-east',
              properties: {
                addressPrefix: '10.44.1.0/24',
              },
            },
            {
              name: 'snet-west',
              properties: {
                addressPrefix: '10.44.2.0/24',
              },
            },
          ],
        },
      },
    );
    assert.equal(create.status, 201);

    const subnetGet = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-vnet/providers/Microsoft.Network/virtualNetworks/vnet-inline/subnets/snet-east?api-version=2023-09-01`,
    );
    assert.equal(subnetGet.status, 200);
    assert.equal(subnetGet.body.type, 'Microsoft.Network/virtualNetworks/subnets');
    assert.equal(subnetGet.body.name, 'vnet-inline/snet-east');
    assert.equal(subnetGet.body.properties.addressPrefix, '10.44.1.0/24');

    const subnetList = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-vnet/providers/Microsoft.Network/virtualNetworks/vnet-inline/subnets?api-version=2023-09-01`,
    );
    assert.equal(subnetList.status, 200);
    assert.equal(subnetList.body.value.length, 2);
  });
});

test('application gateway accepts provider-style top-level v2 payloads', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-appgw?api-version=2021-04-01`, { location: 'eastus' });

    const gateway = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/applicationGateways/agw-life?api-version=2023-09-01`,
      {
        location: 'eastus',
        sku: { name: 'Standard_v2', tier: 'Standard_v2', capacity: 1 },
        gatewayIPConfigurations: [{
          name: 'appGatewayIpConfig',
          subnet: {
            id: `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/virtualNetworks/vnet-life/subnets/agw-snet`,
          },
        }],
        frontendIPConfigurations: [{
          name: 'internalFrontend',
          subnet: {
            id: `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/virtualNetworks/vnet-life/subnets/agw-snet`,
          },
          privateIPAddress: '10.10.1.10',
          privateIPAllocationMethod: 'Static',
        }],
        frontendPorts: [{ name: 'httpPort', port: 80 }],
        backendAddressPools: [{ name: 'backend' }],
        backendHttpSettingsCollection: [{
          name: 'httpSettings',
          port: 80,
          protocol: 'Http',
          cookieBasedAffinity: 'Disabled',
        }],
        httpListeners: [{
          name: 'httpListener',
          frontendIPConfiguration: {
            id: `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/applicationGateways/agw-life/frontendIPConfigurations/internalFrontend`,
          },
          frontendPort: {
            id: `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/applicationGateways/agw-life/frontendPorts/httpPort`,
          },
          protocol: 'Http',
        }],
        requestRoutingRules: [{
          name: 'defaultRule',
          ruleType: 'Basic',
          httpListener: {
            id: `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/applicationGateways/agw-life/httpListeners/httpListener`,
          },
          backendAddressPool: {
            id: `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/applicationGateways/agw-life/backendAddressPools/backend`,
          },
          backendHttpSettings: {
            id: `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/applicationGateways/agw-life/backendHttpSettingsCollection/httpSettings`,
          },
        }],
      },
    );
    assert.equal(gateway.status, 201);
    assert.equal(gateway.body.sku.name, 'Standard_v2');
    assert.equal(gateway.body.properties.frontendIPConfigurations.length, 1);

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-appgw/providers/Microsoft.Network/applicationGateways/agw-life?api-version=2023-09-01`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.properties.operationalState, 'Running');
    assert.equal(get.body.properties.requestRoutingRules.length, 1);
  });
});

test('public IP lifecycle supports dns label metadata and application gateway references', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-pip?api-version=2021-04-01`, { location: 'eastus' });

    const publicIp = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/publicIPAddresses/pip-life?api-version=2023-09-01`,
      {
        location: 'eastus',
        sku: { name: 'Standard' },
        properties: {
          publicIPAllocationMethod: 'Static',
          publicIPAddressVersion: 'IPv4',
          dnsSettings: {
            domainNameLabel: 'pip-life',
          },
        },
      },
    );
    assert.equal(publicIp.status, 201);
    assert.equal(publicIp.body.type, 'Microsoft.Network/publicIPAddresses');
    assert.equal(publicIp.body.name, 'pip-life');
    assert.match(publicIp.body.properties.ipAddress, /^20\./);
    assert.equal(publicIp.body.properties.dnsSettings.fqdn, 'pip-life.eastus.cloudapp.azure.com');

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/publicIPAddresses/pip-life?api-version=2023-09-01`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.properties.publicIPAllocationMethod, 'Static');

    const gateway = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/applicationGateways/agw-public-life?api-version=2023-09-01`,
      {
        location: 'eastus',
        sku: { name: 'Standard_v2', tier: 'Standard_v2', capacity: 1 },
        gatewayIPConfigurations: [{
          name: 'appGatewayIpConfig',
          subnet: {
            id: `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/virtualNetworks/vnet-life/subnets/agw-snet`,
          },
        }],
        frontendIPConfigurations: [{
          name: 'publicFrontend',
          publicIPAddress: {
            id: `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/publicIPAddresses/pip-life`,
          },
        }],
        frontendPorts: [{ name: 'httpPort', port: 80 }],
        backendAddressPools: [{ name: 'backend' }],
        backendHttpSettingsCollection: [{
          name: 'httpSettings',
          port: 80,
          protocol: 'Http',
          cookieBasedAffinity: 'Disabled',
        }],
        httpListeners: [{
          name: 'httpListener',
          frontendIPConfiguration: {
            id: `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/applicationGateways/agw-public-life/frontendIPConfigurations/publicFrontend`,
          },
          frontendPort: {
            id: `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/applicationGateways/agw-public-life/frontendPorts/httpPort`,
          },
          protocol: 'Http',
        }],
        requestRoutingRules: [{
          name: 'defaultRule',
          ruleType: 'Basic',
          httpListener: {
            id: `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/applicationGateways/agw-public-life/httpListeners/httpListener`,
          },
          backendAddressPool: {
            id: `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/applicationGateways/agw-public-life/backendAddressPools/backend`,
          },
          backendHttpSettings: {
            id: `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/applicationGateways/agw-public-life/backendHttpSettingsCollection/httpSettings`,
          },
        }],
      },
    );
    assert.equal(gateway.status, 201);
    assert.equal(gateway.body.properties.frontendIPConfigurations[0].publicIPAddress.id, `${subscriptionPath}/resourceGroups/rg-pip/providers/Microsoft.Network/publicIPAddresses/pip-life`);
  });
});

test('scoped diagnostic settings PUT persists scope without server error', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-diag?api-version=2021-04-01`, { location: 'eastus' });

    const topic = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-diag/providers/Microsoft.EventGrid/topics/lifetopic?api-version=2022-06-15`,
      { location: 'eastus', properties: { inputSchema: 'EventGridSchema' } },
    );
    assert.equal(topic.status, 201);

    const put = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-diag/providers/Microsoft.EventGrid/topics/lifetopic/providers/Microsoft.Insights/diagnosticSettings/default?api-version=2021-05-01-preview`,
      {
        properties: {
          workspaceId: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-diag/providers/Microsoft.OperationalInsights/workspaces/law-diag',
          logs: [{ category: 'AllLogs', enabled: true }],
          metrics: [{ category: 'AllMetrics', enabled: true }],
        },
      },
    );
    assert.equal(put.status, 201);
    assert.equal(
      put.body.properties.scope,
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-diag/providers/Microsoft.EventGrid/topics/lifetopic',
    );

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-diag/providers/Microsoft.EventGrid/topics/lifetopic/providers/Microsoft.Insights/diagnosticSettings/default?api-version=2021-05-01-preview`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.properties.logs[0].category, 'AllLogs');
  });
});

test('scoped diagnostic settings allow the same name on different resource scopes', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-diag-names?api-version=2021-04-01`, { location: 'eastus' });

    for (const topicName of ['topic-a', 'topic-b']) {
      const topic = await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-diag-names/providers/Microsoft.EventGrid/topics/${topicName}?api-version=2022-06-15`,
        { location: 'eastus', properties: { inputSchema: 'EventGridSchema' } },
      );
      assert.equal(topic.status, 201);
    }

    for (const topicName of ['topic-a', 'topic-b']) {
      const put = await httpJson(
        port,
        'PUT',
        `${subscriptionPath}/resourceGroups/rg-diag-names/providers/Microsoft.EventGrid/topics/${topicName}/providers/Microsoft.Insights/diagnosticSettings/toLogAnalytics?api-version=2021-05-01-preview`,
        {
          properties: {
            workspaceId: '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-diag-names/providers/Microsoft.OperationalInsights/workspaces/law-diag',
            logs: [{ category: 'AllLogs', enabled: true }],
          },
        },
      );
      assert.equal(put.status, 201);
      assert.equal(
        put.body.properties.scope,
        `/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-diag-names/providers/Microsoft.EventGrid/topics/${topicName}`,
      );
    }

    const getTopicB = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-diag-names/providers/Microsoft.EventGrid/topics/topic-b/providers/Microsoft.Insights/diagnosticSettings/toLogAnalytics?api-version=2021-05-01-preview`,
    );
    assert.equal(getTopicB.status, 200);
    assert.equal(
      getTopicB.body.id,
      '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-diag-names/providers/Microsoft.EventGrid/topics/topic-b/providers/Microsoft.Insights/diagnosticSettings/toLogAnalytics',
    );
  });
});

test('storage account ListServiceSas returns an Azure-shaped token', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-sas?api-version=2021-04-01`, { location: 'eastus' });
    const storage = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-sas/providers/Microsoft.Storage/storageAccounts/lifesas?api-version=2023-01-01`,
      { location: 'eastus', sku: { name: 'Standard_LRS' }, kind: 'StorageV2' },
    );
    assert.equal(storage.status, 202);
    const sas = await httpJson(
      port,
      'POST',
      `${subscriptionPath}/resourceGroups/rg-sas/providers/Microsoft.Storage/storageAccounts/lifesas/ListServiceSas?api-version=2023-01-01`,
      {
        protocols: 'Https',
        sharedAccessStartTime: '2024-01-01T00:00:00Z',
        sharedAccessExpiryTime: '2099-01-01T00:00:00Z',
        resource: 'b',
        permissions: 'r',
        canonicalizedResource: '/blob/lifesas/deployments/functionapp.zip',
        contentType: 'application/zip',
      },
    );
    assert.equal(sas.status, 200);
    assert.match(sas.body.serviceSasToken, /(?:^|&)sig=/);
    assert.match(sas.body.serviceSasToken, /(?:^|&)sp=r(?:&|$)/);
    assert.match(sas.body.serviceSasToken, /(?:^|&)sr=b(?:&|$)/);
  });
});

test('system-assigned identities materialize principalId and tenantId on resource reads', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-identity?api-version=2021-04-01`, { location: 'eastus' });
    const apim = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-identity/providers/Microsoft.ApiManagement/service/apim-identity?api-version=2022-08-01`,
      {
        location: 'eastus',
        sku: { name: 'Developer', capacity: 1 },
        identity: { type: 'SystemAssigned' },
        properties: {
          publisherEmail: 'admin@example.com',
          publisherName: 'Identity Test',
        },
      },
    );
    assert.equal(apim.status, 201);
    assert.equal(apim.body.identity.type, 'SystemAssigned');
    assert.match(apim.body.identity.principalId, /^[0-9a-f-]{36}$/);
    assert.equal(apim.body.identity.tenantId, '00000000-0000-0000-0000-000000000000');
  });
});

test('api management product api route returns association type with linked api details', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-apim-contract?api-version=2021-04-01`, { location: 'eastus' });

    const service = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract?api-version=2022-08-01`,
      {
        location: 'eastus',
        sku: { name: 'Developer', capacity: 1 },
        properties: {
          publisherEmail: 'admin@example.com',
          publisherName: 'Contract Test',
        },
      },
    );
    assert.equal(service.status, 201);

    const api = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/apis/partner-api?api-version=2022-08-01`,
      {
        properties: {
          displayName: 'Partner API',
          path: 'partner',
          protocols: ['https'],
          serviceUrl: 'https://example.internal/api',
          subscriptionRequired: false,
        },
      },
    );
    assert.equal(api.status, 201);

    const product = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/products/partner-product?api-version=2022-08-01`,
      {
        properties: {
          displayName: 'Partner Product',
          subscriptionRequired: false,
          state: 'published',
        },
      },
    );
    assert.equal(product.status, 201);

    const productApi = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/products/partner-product/apis/partner-api?api-version=2022-08-01`,
      {},
    );
    assert.equal(productApi.status, 201);
    assert.equal(
      productApi.body.id,
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/apis/partner-api`,
    );
    assert.equal(productApi.body.type, 'Microsoft.ApiManagement/service/apis');
    assert.equal(productApi.body.name, 'partner-api');
    assert.equal(productApi.body.apiRevision, '1');
    assert.equal(productApi.body.displayName, 'Partner API');
    assert.equal(productApi.body.path, 'partner');
    assert.equal(productApi.body.isCurrent, true);
    assert.equal(productApi.body.properties.displayName, 'Partner API');
    assert.equal(productApi.body.properties.path, 'partner');

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/products/partner-product/apis/partner-api?api-version=2022-08-01`,
    );
    assert.equal(get.status, 200);
    assert.equal(
      get.body.id,
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/apis/partner-api`,
    );
    assert.equal(get.body.type, 'Microsoft.ApiManagement/service/apis');
    assert.equal(get.body.name, 'partner-api');
    assert.equal(get.body.apiRevision, '1');
    assert.equal(get.body.displayName, 'Partner API');
    assert.equal(get.body.path, 'partner');
    assert.equal(get.body.isCurrent, true);
    assert.equal(get.body.properties.displayName, 'Partner API');
    assert.equal(get.body.properties.path, 'partner');

    const head = await httpJson(
      port,
      'HEAD',
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/products/partner-product/apis/partner-api?api-version=2022-08-01`,
    );
    assert.equal(head.status, 204);
    assert.equal(head.headers['content-length'], '0');

    const missingHead = await httpJson(
      port,
      'HEAD',
      `${subscriptionPath}/resourceGroups/rg-apim-contract/providers/Microsoft.ApiManagement/service/apim-contract/products/partner-product/apis/missing-api?api-version=2022-08-01`,
    );
    assert.equal(missingHead.status, 404);
    assert.equal(missingHead.headers['content-length'], '0');
    assert.equal(missingHead.body, null);
  });
});

test('scoped Event Grid event subscriptions can be created under a topic resource', async () => {
  await withServer(async (port) => {
    await httpJson(port, 'PUT', `${subscriptionPath}/resourceGroups/rg-egsub?api-version=2021-04-01`, { location: 'eastus' });
    const topic = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-egsub/providers/Microsoft.EventGrid/topics/lifetopic?api-version=2022-06-15`,
      { location: 'eastus', properties: { inputSchema: 'EventGridSchema' } },
    );
    assert.equal(topic.status, 201);

    const put = await httpJson(
      port,
      'PUT',
      `${subscriptionPath}/resourceGroups/rg-egsub/providers/Microsoft.EventGrid/topics/lifetopic/providers/Microsoft.EventGrid/eventSubscriptions/sub-audit?api-version=2022-06-15`,
      {
        properties: {
          destination: {
            endpointType: 'WebHook',
            properties: {
              endpointUrl: 'http://localhost:4566/example-webhook',
            },
          },
          eventDeliverySchema: 'EventGridSchema',
        },
      },
    );
    assert.equal(put.status, 201);
    assert.equal(put.body.properties.scope, '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-egsub/providers/Microsoft.EventGrid/topics/lifetopic');

    const get = await httpJson(
      port,
      'GET',
      `${subscriptionPath}/resourceGroups/rg-egsub/providers/Microsoft.EventGrid/topics/lifetopic/providers/Microsoft.EventGrid/eventSubscriptions/sub-audit?api-version=2022-06-15`,
    );
    assert.equal(get.status, 200);
    assert.equal(get.body.type, 'Microsoft.EventGrid/eventSubscriptions');
    assert.equal(get.body.name, 'sub-audit');
  });
});
