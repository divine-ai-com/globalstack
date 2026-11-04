import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-virtual-network-parity');
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
    return await fn({ armPort: port, runtime, store });
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

function virtualNetworkPath(resourceGroup, vnetName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}`, apiVersion);
}

function virtualNetworkPeeringPath(resourceGroup, vnetName, peeringName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}/virtualNetworkPeerings/${peeringName}`, apiVersion);
}

function subnetPath(resourceGroup, vnetName, subnetName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}/subnets/${subnetName}`, apiVersion);
}

function privateEndpointPath(resourceGroup, privateEndpointName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `privateEndpoints/${privateEndpointName}`, apiVersion);
}

function privateDnsZoneGroupPath(resourceGroup, privateEndpointName, groupName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `privateEndpoints/${privateEndpointName}/privateDnsZoneGroups/${groupName}`, apiVersion);
}

function privateDnsZonePath(resourceGroup, zoneName, apiVersion = '2020-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${zoneName}`, apiVersion);
}

function vnetBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'robotics-fleet-network' },
    properties: {
      addressSpace: {
        addressPrefixes: ['10.42.0.0/16'],
      },
      subnets: [
        {
          name: 'default',
          properties: {
            addressPrefix: '10.42.1.0/24',
          },
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function subnetBody(overrides = {}) {
  return {
    properties: {
      addressPrefix: '10.42.2.0/24',
      privateEndpointNetworkPolicies: 'Disabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function privateEndpointBody({ subnetId, overrides = {} }) {
  return {
    location: 'eastus',
    tags: { workload: 'ai-mlops-private-access' },
    properties: {
      subnet: {
        id: subnetId,
      },
      privateLinkServiceConnections: [
        {
          name: 'blob',
          properties: {
            privateLinkServiceId: `/subscriptions/${subscriptionId}/resourceGroups/rg-placeholder/providers/Microsoft.Storage/storageAccounts/stplaceholder`,
            groupIds: ['blob'],
          },
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function privateDnsZoneBody(overrides = {}) {
  return {
    location: 'global',
    tags: { workload: 'private-name-resolution' },
    properties: {
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function privateDnsZoneGroupBody({ privateDnsZoneId, overrides = {} }) {
  return {
    properties: {
      privateDnsZoneConfigs: [
        {
          name: 'blob',
          properties: {
            privateDnsZoneId,
          },
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody({ vnetName, subnetName, privateEndpointName, privateDnsZoneName, resourceGroup }) {
  const subnetId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/${subnetName}`;
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Network/virtualNetworks',
            apiVersion: '2023-09-01',
            name: vnetName,
            location: 'eastus',
            properties: vnetBody({
              properties: {
                addressSpace: { addressPrefixes: ['10.52.0.0/16'] },
                subnets: [{ name: subnetName, properties: { addressPrefix: '10.52.1.0/24' } }],
              },
            }).properties,
          },
          {
            type: 'Microsoft.Network/privateEndpoints',
            apiVersion: '2023-09-01',
            name: privateEndpointName,
            location: 'eastus',
            properties: privateEndpointBody({ subnetId }).properties,
          },
          {
            type: 'Microsoft.Network/privateDnsZones',
            apiVersion: '2020-06-01',
            name: privateDnsZoneName,
            location: 'global',
            properties: {},
          },
        ],
        outputs: {
          vnetName: { type: 'string', value: vnetName },
          privateEndpointName: { type: 'string', value: privateEndpointName },
          privateDnsZoneName: { type: 'string', value: privateDnsZoneName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-vnet-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-vnet-missing-${suffix}`;
  const vnetName = `vnet-${suffix}`.slice(0, 40);
  const peerVnetName = `vnet-peer-${suffix}`.slice(0, 40);
  const subnetName = `subnet-${suffix}`.slice(0, 40);
  const peeringName = `peer-${suffix}`.slice(0, 40);
  const privateEndpointName = `pe-${suffix}`.slice(0, 40);
  const privateDnsZoneName = `${suffix}.internal.test`;
  const privateEndpointDnsZoneName = 'privatelink.blob.core.windows.net';
  const privateDnsZoneGroupName = `zonegroup-${suffix}`.slice(0, 40);
  const missingName = `missing-${suffix}`.slice(0, 40);
  let vnetId = null;
  let subnetId = null;

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

  await withArmServer(async ({ armPort, runtime }) => {
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
      const result = await httpJson(armPort, 'GET', '/subscriptions/11111111-1111-1111-1111-111111111111');
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}`),
        vnetBody(),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(missingResourceGroup, vnetName), vnetBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint create requires an existing resource group', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        privateEndpointPath(missingResourceGroup, privateEndpointName),
        privateEndpointBody({ subnetId: 'local' }),
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(missingResourceGroup, privateDnsZoneName), privateDnsZoneBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
        location: 'eastus',
        tags: { purpose: 'globalstack-virtual-network-parity', ttl: 'ephemeral' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.name, resourceGroup);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('virtual network collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'virtualNetworks', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('private endpoint collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'privateEndpoints', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('private dns zone collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'privateDnsZones', '2020-06-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('virtual network delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', virtualNetworkPath(resourceGroup, missingName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('private endpoint delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', privateEndpointPath(resourceGroup, missingName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('private dns zone delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', privateDnsZonePath(resourceGroup, `${missingName}.internal.test`));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('virtual network empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateEndpointPath(resourceGroup, privateEndpointName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(resourceGroup, privateDnsZoneName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody({
        location: 'globalstack-invalid-location',
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateEndpointPath(resourceGroup, privateEndpointName), privateEndpointBody({
        subnetId: 'local',
        overrides: { location: 'globalstack-invalid-location' },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(resourceGroup, privateDnsZoneName), privateDnsZoneBody({
        location: 'globalstack-invalid-location',
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network missing address prefixes is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody({
        properties: { addressSpace: { addressPrefixes: [] } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'NoAddressPrefixOrPoolProvided');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network invalid address prefix is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody({
        properties: { addressSpace: { addressPrefixes: ['10.999.0.0/16'] } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidAddressPrefixFormat');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network subnet missing prefix is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody({
        properties: {
          subnets: [{ name: 'bad', properties: {} }],
        },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'SubnetAddressPrefixCannotBeEmpty');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint missing connection is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateEndpointPath(resourceGroup, privateEndpointName), privateEndpointBody({
        subnetId: 'local',
        overrides: { properties: { privateLinkServiceConnections: [] } },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingParameterOnPrivateEndpoint');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint missing subnet id is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateEndpointPath(resourceGroup, privateEndpointName), privateEndpointBody({
        subnetId: '',
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'PrivateEndpointSubnetIdRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint missing private link service id is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateEndpointPath(resourceGroup, privateEndpointName), privateEndpointBody({
        subnetId: 'local',
        overrides: {
          properties: {
            privateLinkServiceConnections: [{ name: 'bad', properties: { groupIds: ['blob'] } }],
          },
        },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'PrivateLinkServiceIdRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint missing group ids is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateEndpointPath(resourceGroup, privateEndpointName), privateEndpointBody({
        subnetId: 'local',
        overrides: {
          properties: {
            privateLinkServiceConnections: [{
              name: 'bad',
              properties: { privateLinkServiceId: '/subscriptions/local/resourceGroups/rg/providers/Microsoft.Storage/storageAccounts/st' },
            }],
          },
        },
      }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'PrivateEndpointGroupIdRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone invalid name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(resourceGroup, 'invalidzone'), privateDnsZoneBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidDomainName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Network/virtualNetworks');
      assert.equal(result.body.properties.addressSpace.addressPrefixes[0], '10.42.0.0/16');
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.globalstack.capabilityId, 'virtual-network');
      vnetId = result.body.id;
      return { status: result.status, resourceId: result.body.id };
    });

    await record('virtual network get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', virtualNetworkPath(resourceGroup, vnetName));
      assert.equal(result.status, 200);
      assert.equal(result.body.id, vnetId);
      assert.equal(result.body.tags.workload, 'robotics-fleet-network');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('virtual network update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody({
        tags: { workload: 'ai-mlops-vnet' },
        properties: {
          addressSpace: { addressPrefixes: ['10.43.0.0/16'] },
          subnets: [{ name: 'default', properties: { addressPrefix: '10.43.1.0/24' } }],
        },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'ai-mlops-vnet');
      assert.equal(result.body.properties.addressSpace.addressPrefixes[0], '10.43.0.0/16');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('subnet create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', subnetPath(resourceGroup, vnetName, subnetName), subnetBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Network/virtualNetworks/subnets');
      assert.equal(result.body.properties.addressPrefix, '10.42.2.0/24');
      subnetId = result.body.id;
      return { status: result.status, resourceId: result.body.id };
    });

    await record('subnet get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', subnetPath(resourceGroup, vnetName, subnetName));
      assert.equal(result.status, 200);
      assert.equal(result.body.id, subnetId);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('subnet list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}/subnets`, '2023-09-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${vnetName}/${subnetName}` || item.id.endsWith(`/subnets/${subnetName}`)));
      return { status: result.status, count: result.body.value.length };
    });

    await record('private dns zone create is accepted asynchronously', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(resourceGroup, privateDnsZoneName), privateDnsZoneBody());
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      return { status: result.status, asyncOperation: result.headers['azure-asyncoperation'] };
    });

    await record('private dns zone operation status succeeds', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/operationStatuses/network-${suffix}?api-version=2022-09-01`,
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Succeeded');
      return { status: result.status };
    });

    await record('private dns zone get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', privateDnsZonePath(resourceGroup, privateDnsZoneName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, privateDnsZoneName);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('peer virtual network create succeeds for peering lifecycle', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, peerVnetName), vnetBody({
        location: 'westus2',
        properties: { addressSpace: { addressPrefixes: ['10.43.0.0/16'] } },
      }));
      assert.equal(result.status, 201);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('virtual network peering create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPeeringPath(resourceGroup, vnetName, peeringName), {
        properties: {
          remoteVirtualNetwork: {
            id: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${peerVnetName}`,
          },
          allowVirtualNetworkAccess: true,
          allowForwardedTraffic: true,
        },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings');
      assert.equal(result.body.properties.peeringState, 'Connected');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('virtual network peering get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', virtualNetworkPeeringPath(resourceGroup, vnetName, peeringName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, `${vnetName}/${peeringName}`);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('private endpoint create succeeds', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        privateEndpointPath(resourceGroup, privateEndpointName),
        privateEndpointBody({ subnetId }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Network/privateEndpoints');
      assert.equal(result.body.properties.subnet.id, subnetId);
      assert.equal(result.body.globalstack.capabilityId, 'virtual-network');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('local network model allocates deterministic private endpoint address', async () => {
      const endpoint = runtime.networkModel.getPrivateEndpoint(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/privateEndpoints/${privateEndpointName}`);
      assert.ok(endpoint);
      assert.equal(endpoint.subnetId, subnetId.toLowerCase());
      assert.match(endpoint.ipAddress, /^10\.42\.2\./);
      return { status: 200, ipAddress: endpoint.ipAddress };
    });

    await record('private endpoint get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', privateEndpointPath(resourceGroup, privateEndpointName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, privateEndpointName);
      assert.equal(result.body.tags.workload, 'ai-mlops-private-access');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('local network model keeps private endpoint address stable across repeated reads', async () => {
      const first = runtime.networkModel.getPrivateEndpoint(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/privateEndpoints/${privateEndpointName}`);
      const second = runtime.networkModel.getPrivateEndpoint(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/privateEndpoints/${privateEndpointName}`);
      assert.ok(first);
      assert.deepEqual(first, second);
      return { status: 200, ipAddress: second.ipAddress };
    });

    await record('private endpoint update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', privateEndpointPath(resourceGroup, privateEndpointName), privateEndpointBody({
        subnetId,
        overrides: { tags: { workload: 'industrial-iot-private-access' } },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'industrial-iot-private-access');
      assert.equal(result.body.properties.privateLinkServiceConnections[0].properties.groupIds[0], 'blob');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('virtual network list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'virtualNetworks', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === vnetName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('private endpoint list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'privateEndpoints', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === privateEndpointName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('private dns zone list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'privateDnsZones', '2020-06-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === privateDnsZoneName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('private endpoint dns zone create succeeds for zone-group lifecycle', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        privateDnsZonePath(resourceGroup, privateEndpointDnsZoneName),
        privateDnsZoneBody({ properties: {} }),
      );
      assert.equal(result.status, 202);
      return { status: result.status };
    });

    await record('private endpoint dns zone get succeeds for zone-group lifecycle', async () => {
      const result = await httpJson(armPort, 'GET', privateDnsZonePath(resourceGroup, privateEndpointDnsZoneName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, privateEndpointDnsZoneName);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('private endpoint dns zone link create succeeds', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${privateEndpointDnsZoneName}/virtualNetworkLinks/${privateDnsZoneGroupName}`, '2020-06-01'),
        {
          location: 'global',
          properties: {
            registrationEnabled: false,
            virtualNetwork: {
              id: vnetId,
            },
          },
        },
      );
      assert.equal(result.status, 201);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('virtual network peering list includes created resource', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}/virtualNetworkPeerings`, '2023-09-01'),
      );
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${vnetName}/${peeringName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('private endpoint dns zone group create succeeds', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        privateDnsZoneGroupPath(resourceGroup, privateEndpointName, privateDnsZoneGroupName),
        privateDnsZoneGroupBody({
          privateDnsZoneId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/privateDnsZones/${privateEndpointDnsZoneName}`,
        }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('private endpoint dns zone group list includes created resource', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Network', `privateEndpoints/${privateEndpointName}/privateDnsZoneGroups`, '2023-09-01'),
      );
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${privateEndpointName}/${privateDnsZoneGroupName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('local private dns registry resolves private endpoint zone-group record', async () => {
      const result = runtime.dnsRegistry.resolvePrivateDns({
        fqdn: `stplaceholder.${privateEndpointDnsZoneName}`,
        vnetId,
      });
      assert.equal(result.status, 'NOERROR');
      assert.ok(result.values[0].startsWith('10.42.2.'));
      return { status: 200, ipAddress: result.values[0] };
    });

    await record('private dns zone missing record set is not found', async () => {
      const result = await httpJson(
        armPort,
        'GET',
        providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${privateDnsZoneName}/A/www`, '2020-06-01'),
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create network resources', async () => {
      const deploymentName = `network-deploy-${suffix}`;
      const deploymentVnet = `vnetd-${suffix}`.slice(0, 40);
      const deploymentSubnet = `subnetd-${suffix}`.slice(0, 40);
      const deploymentPrivateEndpoint = `ped-${suffix}`.slice(0, 40);
      const deploymentPrivateDnsZone = `${suffix}-deploy.internal.test`;
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({
          vnetName: deploymentVnet,
          subnetName: deploymentSubnet,
          privateEndpointName: deploymentPrivateEndpoint,
          privateDnsZoneName: deploymentPrivateDnsZone,
          resourceGroup,
        }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/virtualNetworks/${deploymentVnet}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/privateEndpoints/${deploymentPrivateEndpoint}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/privateDnsZones/${deploymentPrivateDnsZone}`)));
      return { status: result.status, deploymentName };
    });

    await record('private endpoint dns zone group delete succeeds', async () => {
      const result = await httpJson(
        armPort,
        'DELETE',
        privateDnsZoneGroupPath(resourceGroup, privateEndpointName, privateDnsZoneGroupName),
      );
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('local private dns registry removes private endpoint zone-group record after delete', async () => {
      const result = runtime.dnsRegistry.resolvePrivateDns({
        fqdn: `stplaceholder.${privateEndpointDnsZoneName}`,
        vnetId,
      });
      assert.equal(result.status, 'NXDOMAIN');
      assert.equal(result.reason, 'RECORD_NOT_FOUND');
      return { status: 404, reason: result.reason };
    });

    await record('private endpoint delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', privateEndpointPath(resourceGroup, privateEndpointName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('virtual network peering delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', virtualNetworkPeeringPath(resourceGroup, vnetName, peeringName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('virtual network peering get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', virtualNetworkPeeringPath(resourceGroup, vnetName, peeringName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private endpoint get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', privateEndpointPath(resourceGroup, privateEndpointName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('local network model removes deleted private endpoint', async () => {
      const endpoint = runtime.networkModel.getPrivateEndpoint(`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/privateEndpoints/${privateEndpointName}`);
      assert.equal(endpoint, null);
      return { status: 404 };
    });

    await record('subnet delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', subnetPath(resourceGroup, vnetName, subnetName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('subnet get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', subnetPath(resourceGroup, vnetName, subnetName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', privateDnsZonePath(resourceGroup, privateDnsZoneName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('private endpoint dns zone link delete succeeds', async () => {
      const result = await httpJson(
        armPort,
        'DELETE',
        providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${privateEndpointDnsZoneName}/virtualNetworkLinks/${privateDnsZoneGroupName}`, '2020-06-01'),
      );
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('private endpoint dns zone delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', privateDnsZonePath(resourceGroup, privateEndpointDnsZoneName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('private dns zone get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', privateDnsZonePath(resourceGroup, privateDnsZoneName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', virtualNetworkPath(resourceGroup, vnetName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('virtual network get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', virtualNetworkPath(resourceGroup, vnetName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('virtual network delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', virtualNetworkPath(resourceGroup, vnetName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
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

  const failed = cases.filter(item => !item.ok);
  const dataPlaneCaseNames = new Set([
    'local network model allocates deterministic private endpoint address',
    'local network model keeps private endpoint address stable across repeated reads',
    'local private dns registry resolves private endpoint zone-group record',
    'local private dns registry removes private endpoint zone-group record after delete',
    'local network model removes deleted private endpoint',
  ]);
  const dataPlaneCases = cases.filter(item => dataPlaneCaseNames.has(item.name));
  const dataPlaneFailed = dataPlaneCases.filter(item => !item.ok);
  return {
    controlPlane: {
      ok: failed.length === 0,
      total: cases.length,
      failedCount: failed.length,
      resourceGroup,
      vnetName,
      subnetName,
      privateEndpointName,
      privateDnsZoneName,
      cases,
    },
    dataPlane: {
      ok: dataPlaneFailed.length === 0,
      total: dataPlaneCases.length,
      failedCount: dataPlaneFailed.length,
      privateEndpointName,
      privateDnsZoneName: privateEndpointDnsZoneName,
      cases: dataPlaneCases,
    },
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
    '# Azure Virtual Network Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Virtual network under test: ${report.controlPlane.vnetName}`,
    `- Subnet under test: ${report.controlPlane.subnetName}`,
    `- Private endpoint under test: ${report.controlPlane.privateEndpointName}`,
    `- Private DNS zone under test: ${report.controlPlane.privateDnsZoneName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Data Plane');
  lines.push('');
  lines.push(`- Passed: ${report.dataPlane.total - report.dataPlane.failedCount}/${report.dataPlane.total}`);
  lines.push(`- Private endpoint under test: ${report.dataPlane.privateEndpointName}`);
  lines.push(`- Private endpoint DNS zone under test: ${report.dataPlane.privateDnsZoneName}`);
  lines.push('');
  lines.push('| Case | Status | HTTP | Error |');
  lines.push('|---|---|---:|---|');
  for (const item of report.dataPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.reason ?? item.error ?? ''} |`);
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Virtual Network, subnet, Private Endpoint, Private DNS zone, and private DNS zone-group ARM lifecycle, stricter parameter rejection, bounded local network-model private endpoint allocation behavior, private endpoint DNS registration into linked private zones, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Azure networking as 99%-complete or cloudValidated for packet routing, NSG evaluation, NAT, route table propagation, service endpoints, private endpoint approval workflows, full DNS resolution behavior, throttling, RBAC, or exact Azure Network data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const parity = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: parity.controlPlane.ok && parity.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Virtual Network, subnet, Private Endpoint, and Private DNS zone ARM lifecycle, parameter rejection, unsupported Network route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Network cloudValidated claim.',
  controlPlane: parity.controlPlane,
  dataPlane: parity.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Virtual Network parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
