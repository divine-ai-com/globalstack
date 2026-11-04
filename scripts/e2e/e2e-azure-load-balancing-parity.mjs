import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createEdgeRouterServer } from '../../packages/azure-data-plane/src/edge-router.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-load-balancing-parity');
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

async function withRuntimeServers(fn) {
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const armServer = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
  });
  const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
  await new Promise(resolve => armServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => edgeServer.listen(0, '127.0.0.1', resolve));
  const armPort = armServer.address().port;
  const edgePort = edgeServer.address().port;
  try {
    return await fn({ armPort, edgePort, runtime });
  } finally {
    await new Promise(resolve => edgeServer.close(resolve));
    await new Promise(resolve => armServer.close(resolve));
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
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
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

function applicationGatewayPath(resourceGroup, gatewayName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `applicationGateways/${gatewayName}`, apiVersion);
}

function loadBalancerPath(resourceGroup, loadBalancerName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `loadBalancers/${loadBalancerName}`, apiVersion);
}

function publicIpPath(resourceGroup, publicIpName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `publicIPAddresses/${publicIpName}`, apiVersion);
}

function vnetBody() {
  return {
    location: 'eastus',
    properties: {
      addressSpace: {
        addressPrefixes: ['10.86.0.0/16'],
      },
      subnets: [
        {
          name: 'appgw',
          properties: { addressPrefix: '10.86.1.0/24' },
        },
        {
          name: 'backend',
          properties: { addressPrefix: '10.86.2.0/24' },
        },
      ],
    },
  };
}

function publicIpBody(domainNameLabel, overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Standard', ...(overrides.sku ?? {}) },
    properties: {
      publicIPAllocationMethod: 'Static',
      publicIPAddressVersion: 'IPv4',
      dnsSettings: {
        domainNameLabel,
        ...(overrides.properties?.dnsSettings ?? {}),
      },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides = {} }) {
  const gatewayId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/applicationGateways/${gatewayName}`;
  const publicIpId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/pip-${gatewayName}`;
  return {
    location: 'eastus',
    tags: { workload: 'robotics-edge-ingress' },
    sku: { name: 'Standard_v2', tier: 'Standard_v2', capacity: 1, ...(overrides.sku ?? {}) },
    properties: {
      gatewayIPConfigurations: [
        {
          name: 'appGatewayIpConfig',
          properties: { subnet: { id: subnetId } },
        },
      ],
      frontendIPConfigurations: [
        {
          name: 'frontend',
          properties: { publicIPAddress: { id: publicIpId } },
        },
      ],
      frontendPorts: [
        { name: 'http', properties: { port: 80 } },
      ],
      backendAddressPools: [
        { name: 'backend', properties: { backendAddresses: [{ ipAddress: '10.86.2.10' }] } },
      ],
      backendHttpSettingsCollection: [
        { name: 'httpSettings', properties: { port: 80, protocol: 'Http', cookieBasedAffinity: 'Disabled' } },
      ],
      httpListeners: [
        {
          name: 'listener',
          properties: {
            frontendIPConfiguration: { id: `${gatewayId}/frontendIPConfigurations/frontend` },
            frontendPort: { id: `${gatewayId}/frontendPorts/http` },
            protocol: 'Http',
          },
        },
      ],
      requestRoutingRules: [
        {
          name: 'rule',
          properties: {
            ruleType: 'Basic',
            priority: 100,
            httpListener: { id: `${gatewayId}/httpListeners/listener` },
            backendAddressPool: { id: `${gatewayId}/backendAddressPools/backend` },
            backendHttpSettings: { id: `${gatewayId}/backendHttpSettingsCollection/httpSettings` },
          },
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function loadBalancerBody({ resourceGroup, loadBalancerName, overrides = {} }) {
  const lbId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/loadBalancers/${loadBalancerName}`;
  const publicIpId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/pip-${loadBalancerName}`;
  return {
    location: 'eastus',
    tags: { workload: 'ai-mlops-ingress' },
    sku: { name: 'Standard', ...(overrides.sku ?? {}) },
    properties: {
      frontendIPConfigurations: [
        {
          name: 'frontend',
          properties: { publicIPAddress: { id: publicIpId } },
        },
      ],
      backendAddressPools: [
        { name: 'backend', properties: {} },
      ],
      probes: [
        { name: 'tcpProbe', properties: { protocol: 'Tcp', port: 80, intervalInSeconds: 5, numberOfProbes: 2 } },
      ],
      loadBalancingRules: [
        {
          name: 'httpRule',
          properties: {
            protocol: 'Tcp',
            frontendPort: 80,
            backendPort: 80,
            frontendIPConfiguration: { id: `${lbId}/frontendIPConfigurations/frontend` },
            backendAddressPool: { id: `${lbId}/backendAddressPools/backend` },
            probe: { id: `${lbId}/probes/tcpProbe` },
          },
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function deploymentBody({ resourceGroup, vnetName, gatewayName, loadBalancerName }) {
  const subnetId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}/subnets/appgw`;
  const gatewayPublicIpName = `pip-${gatewayName}`;
  const loadBalancerPublicIpName = `pip-${loadBalancerName}`;
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
            properties: vnetBody().properties,
          },
          {
            type: 'Microsoft.Network/applicationGateways',
            apiVersion: '2023-09-01',
            name: gatewayName,
            location: 'eastus',
            dependsOn: [
              `Microsoft.Network/virtualNetworks/${vnetName}`,
              `Microsoft.Network/publicIPAddresses/${gatewayPublicIpName}`,
            ],
            sku: applicationGatewayBody({ resourceGroup, gatewayName, subnetId }).sku,
            properties: applicationGatewayBody({ resourceGroup, gatewayName, subnetId }).properties,
          },
          {
            type: 'Microsoft.Network/publicIPAddresses',
            apiVersion: '2023-09-01',
            name: gatewayPublicIpName,
            location: 'eastus',
            sku: publicIpBody(`agwdeploy${gatewayName.slice(-6)}`).sku,
            properties: publicIpBody(`agwdeploy${gatewayName.slice(-6)}`).properties,
          },
          {
            type: 'Microsoft.Network/loadBalancers',
            apiVersion: '2023-09-01',
            name: loadBalancerName,
            location: 'eastus',
            dependsOn: [
              `Microsoft.Network/publicIPAddresses/${loadBalancerPublicIpName}`,
            ],
            sku: loadBalancerBody({ resourceGroup, loadBalancerName }).sku,
            properties: loadBalancerBody({ resourceGroup, loadBalancerName }).properties,
          },
          {
            type: 'Microsoft.Network/publicIPAddresses',
            apiVersion: '2023-09-01',
            name: loadBalancerPublicIpName,
            location: 'eastus',
            sku: publicIpBody(`lbdeploy${loadBalancerName.slice(-6)}`).sku,
            properties: publicIpBody(`lbdeploy${loadBalancerName.slice(-6)}`).properties,
          },
        ],
        outputs: {
          applicationGatewayName: { type: 'string', value: gatewayName },
          loadBalancerName: { type: 'string', value: loadBalancerName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-lb-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-lb-missing-${suffix}`;
  const vnetName = `vnet-lb-${suffix}`.slice(0, 40);
  const gatewayName = `agw-${suffix}`.slice(0, 40);
  const loadBalancerName = `lb-${suffix}`.slice(0, 40);
  const gatewayPublicIpName = `pip-${gatewayName}`;
  const loadBalancerPublicIpName = `pip-${loadBalancerName}`;
  const gatewayHostLabel = `agw${suffix}`.slice(0, 24);
  const loadBalancerHostLabel = `lb${suffix}`.slice(0, 24);
  const gatewayHostName = `${gatewayHostLabel}.eastus.cloudapp.azure.com`;
  const loadBalancerHostName = `${loadBalancerHostLabel}.eastus.cloudapp.azure.com`;
  const minimalLoadBalancerName = `lb-min-${suffix}`.slice(0, 40);
  const emptyRulesLoadBalancerName = `lb-rules-${suffix}`.slice(0, 40);
  const missingGatewayName = `agw-missing-${suffix}`.slice(0, 40);
  const missingLoadBalancerName = `lb-missing-${suffix}`.slice(0, 40);
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
        error: error?.stack ?? String(error),
      });
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  await withRuntimeServers(async ({ armPort, edgePort }) => {
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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Network', `loadBalancers/${loadBalancerName}`), loadBalancerBody({ resourceGroup, loadBalancerName }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(missingResourceGroup, gatewayName), applicationGatewayBody({ resourceGroup: missingResourceGroup, gatewayName, subnetId: 'local' }));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(missingResourceGroup, loadBalancerName), loadBalancerBody({ resourceGroup: missingResourceGroup, loadBalancerName }));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-load-balancing-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('application gateway collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'applicationGateways', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('load balancer collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'loadBalancers', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('application gateway delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', applicationGatewayPath(resourceGroup, missingGatewayName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('load balancer delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', loadBalancerPath(resourceGroup, missingLoadBalancerName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('application gateway empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, loadBalancerName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId: 'local', overrides: { location: 'globalstack-invalid-location' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, loadBalancerName), loadBalancerBody({ resourceGroup, loadBalancerName, overrides: { location: 'globalstack-invalid-location' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway invalid sku is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId: 'local', overrides: { sku: { name: 'Basic', tier: 'Basic' } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ApplicationGatewaySkuNotSupported');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer invalid sku is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, loadBalancerName), loadBalancerBody({ resourceGroup, loadBalancerName, overrides: { sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LoadBalancerSkuNotSupported');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer minimal create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, minimalLoadBalancerName), { location: 'eastus', properties: {} });
      assert.equal(result.status, 201);
      assert.equal(result.body.sku.name, 'Basic');
      assert.equal(result.body.sku.tier, 'Regional');
      assert.deepEqual(result.body.properties.frontendIPConfigurations, []);
      assert.deepEqual(result.body.properties.backendAddressPools, []);
      assert.deepEqual(result.body.properties.loadBalancingRules, []);
      assert.deepEqual(result.body.properties.probes, []);
      return { status: result.status };
    });

    await record('load balancer minimal delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', loadBalancerPath(resourceGroup, minimalLoadBalancerName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('virtual network create succeeds for load balancing references', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody());
      assert.equal(result.status, 201);
      subnetId = `${result.body.id}/subnets/appgw`;
      return { status: result.status, subnetId };
    });

    await record('public ip create succeeds for application gateway ingress host', async () => {
      const result = await httpJson(armPort, 'PUT', publicIpPath(resourceGroup, gatewayPublicIpName), publicIpBody(gatewayHostLabel));
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.dnsSettings.fqdn, gatewayHostName);
      return { status: result.status, hostName: result.body.properties.dnsSettings.fqdn };
    });

    await record('public ip create succeeds for load balancer ingress host', async () => {
      const result = await httpJson(armPort, 'PUT', publicIpPath(resourceGroup, loadBalancerPublicIpName), publicIpBody(loadBalancerHostLabel));
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.dnsSettings.fqdn, loadBalancerHostName);
      return { status: result.status, hostName: result.body.properties.dnsSettings.fqdn };
    });

    await record('application gateway missing gateway subnet is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides: { properties: { gatewayIPConfigurations: [] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'SubnetIsRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway missing frontend ip is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides: { properties: { frontendIPConfigurations: [] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ApplicationGatewayFrontendIpConfigurationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway invalid frontend port is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides: { properties: { frontendPorts: [{ name: 'bad', properties: { port: 70000 } }] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ApplicationGatewayFrontendPortInvalid');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway missing backend settings is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides: { properties: { backendHttpSettingsCollection: [] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ApplicationGatewayBackendHttpSettingsRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway invalid listener is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides: { properties: { httpListeners: [{ name: 'bad', properties: { protocol: 'Ftp' } }] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ApplicationGatewayHttpListenerInvalid');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway invalid routing rule is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides: { properties: { requestRoutingRules: [{ name: 'bad', properties: { ruleType: 'Unsupported' } }] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'ApplicationGatewayRequestRoutingRuleInvalid');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer empty rule collection is accepted', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, emptyRulesLoadBalancerName), loadBalancerBody({ resourceGroup, loadBalancerName: emptyRulesLoadBalancerName, overrides: { properties: { loadBalancingRules: [] } } }));
      assert.equal(result.status, 201);
      assert.deepEqual(result.body.properties.loadBalancingRules, []);
      assert.equal(result.body.properties.frontendIPConfigurations.length, 1);
      assert.equal(result.body.properties.backendAddressPools.length, 1);
      assert.equal(result.body.properties.probes.length, 1);
      return { status: result.status };
    });

    await record('load balancer empty rule collection delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', loadBalancerPath(resourceGroup, emptyRulesLoadBalancerName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('load balancer invalid probe is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, loadBalancerName), loadBalancerBody({ resourceGroup, loadBalancerName, overrides: { properties: { probes: [{ name: 'bad', properties: { protocol: 'Icmp', port: 80 } }] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LoadBalancerProbeInvalid');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer invalid rule is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, loadBalancerName), loadBalancerBody({ resourceGroup, loadBalancerName, overrides: { properties: { loadBalancingRules: [{ name: 'bad', properties: { protocol: 'Tcp', frontendPort: 0, backendPort: 80 } }] } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LoadBalancerRuleInvalid');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId }));
      assert.equal(result.status, 201);
      assert.equal(result.body.name, gatewayName);
      assert.equal(result.body.properties.operationalState, 'Running');
      return { status: result.status, operationalState: result.body.properties.operationalState };
    });

    await record('application gateway get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', applicationGatewayPath(resourceGroup, gatewayName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.frontendPorts[0].properties.port, 80);
      return { status: result.status };
    });

    await record('application gateway update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', applicationGatewayPath(resourceGroup, gatewayName), applicationGatewayBody({ resourceGroup, gatewayName, subnetId, overrides: { tags: { workload: 'updated-robotics-ingress' } } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'updated-robotics-ingress');
      assert.equal(result.body.properties.operationalState, 'Running');
      return { status: result.status };
    });

    await record('bounded application gateway edge route succeeds using public ip fqdn', async () => {
      const result = await edgeJson(edgePort, 'GET', '/robotics/models/v1', {
        host: gatewayHostName,
        protocol: 'http',
      });
      assert.equal(result.status, 200);
      assert.equal(result.headers['x-globalstack-edge-route'], `application-gateway/${gatewayName}`);
      assert.equal(result.body.kind, 'application-gateway');
      assert.equal(result.body.originHost, '10.86.2.10');
      return { status: result.status, route: result.headers['x-globalstack-edge-route'] };
    });

    await record('bounded application gateway edge route remains stable across repeated requests', async () => {
      const first = await edgeJson(edgePort, 'GET', '/robotics/models/v1', { host: gatewayHostName, protocol: 'http' });
      const second = await edgeJson(edgePort, 'GET', '/robotics/models/v1', { host: gatewayHostName, protocol: 'http' });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(first.headers['x-globalstack-edge-route'], `application-gateway/${gatewayName}`);
      assert.equal(second.headers['x-globalstack-edge-route'], `application-gateway/${gatewayName}`);
      return { status: second.status, route: second.headers['x-globalstack-edge-route'] };
    });

    await record('load balancer create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, loadBalancerName), loadBalancerBody({ resourceGroup, loadBalancerName }));
      assert.equal(result.status, 201);
      assert.equal(result.body.name, loadBalancerName);
      assert.ok(result.body.properties.resourceGuid);
      return { status: result.status };
    });

    await record('load balancer get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', loadBalancerPath(resourceGroup, loadBalancerName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.probes[0].properties.port, 80);
      return { status: result.status };
    });

    await record('load balancer update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', loadBalancerPath(resourceGroup, loadBalancerName), loadBalancerBody({ resourceGroup, loadBalancerName, overrides: { tags: { workload: 'updated-ai-mlops-ingress' } } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'updated-ai-mlops-ingress');
      assert.ok(result.body.properties.resourceGuid);
      return { status: result.status };
    });

    await record('bounded load balancer edge route succeeds using public ip fqdn', async () => {
      const result = await edgeJson(edgePort, 'GET', '/mlops/ingress/health', {
        host: loadBalancerHostName,
        protocol: 'http',
      });
      assert.equal(result.status, 200);
      assert.equal(result.headers['x-globalstack-edge-route'], `load-balancer/${loadBalancerName}`);
      assert.equal(result.body.kind, 'load-balancer');
      assert.equal(result.body.originHost, `${loadBalancerName}.internal.globalstack`);
      return { status: result.status, route: result.headers['x-globalstack-edge-route'] };
    });

    await record('bounded load balancer edge route remains stable across repeated requests', async () => {
      const first = await edgeJson(edgePort, 'GET', '/mlops/ingress/health', { host: loadBalancerHostName, protocol: 'http' });
      const second = await edgeJson(edgePort, 'GET', '/mlops/ingress/health', { host: loadBalancerHostName, protocol: 'http' });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(first.headers['x-globalstack-edge-route'], `load-balancer/${loadBalancerName}`);
      assert.equal(second.headers['x-globalstack-edge-route'], `load-balancer/${loadBalancerName}`);
      return { status: second.status, route: second.headers['x-globalstack-edge-route'] };
    });

    await record('application gateway list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'applicationGateways', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === gatewayName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('load balancer list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'loadBalancers', '2023-09-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === loadBalancerName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('application gateway backend health route fails closed', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.Network', `applicationGateways/${gatewayName}/backendhealth`, '2023-09-01'), {});
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway private endpoint connection route fails closed', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', `applicationGateways/${gatewayName}/privateEndpointConnections/conn1`, '2023-09-01'));
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer backend pool child route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Network', `loadBalancers/${loadBalancerName}/backendAddressPools/pool2`, '2023-09-01'), { properties: {} });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer health action route fails closed', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.Network', `loadBalancers/${loadBalancerName}/health`, '2023-09-01'), {});
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create load balancing resources', async () => {
      const deploymentName = `lb-deploy-${suffix}`;
      const deploymentVnet = `deploy-vnet-${suffix}`.slice(0, 40);
      const deploymentGateway = `deploy-agw-${suffix}`.slice(0, 40);
      const deploymentLoadBalancer = `deploy-lb-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({ resourceGroup, vnetName: deploymentVnet, gatewayName: deploymentGateway, loadBalancerName: deploymentLoadBalancer }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/applicationGateways/${deploymentGateway}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/loadBalancers/${deploymentLoadBalancer}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('load balancer delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', loadBalancerPath(resourceGroup, loadBalancerName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('bounded load balancer edge route is removed after delete', async () => {
      const result = await edgeJson(edgePort, 'GET', '/mlops/ingress/health', { host: loadBalancerHostName, protocol: 'http' });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'EndpointNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', loadBalancerPath(resourceGroup, loadBalancerName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('load balancer delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', loadBalancerPath(resourceGroup, loadBalancerName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('application gateway delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', applicationGatewayPath(resourceGroup, gatewayName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('bounded application gateway edge route is removed after delete', async () => {
      const result = await edgeJson(edgePort, 'GET', '/robotics/models/v1', { host: gatewayHostName, protocol: 'http' });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'EndpointNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', applicationGatewayPath(resourceGroup, gatewayName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('application gateway delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', applicationGatewayPath(resourceGroup, gatewayName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });
  });

  const failed = cases.filter(item => !item.ok);
  const dataPlaneCaseNames = new Set([
    'bounded application gateway edge route succeeds using public ip fqdn',
    'bounded application gateway edge route remains stable across repeated requests',
    'bounded load balancer edge route succeeds using public ip fqdn',
    'bounded load balancer edge route remains stable across repeated requests',
    'bounded load balancer edge route is removed after delete',
    'bounded application gateway edge route is removed after delete',
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
      gatewayName,
      loadBalancerName,
      cases,
    },
    dataPlane: {
      ok: dataPlaneFailed.length === 0,
      total: dataPlaneCases.length,
      failedCount: dataPlaneFailed.length,
      gatewayName,
      gatewayHostName,
      loadBalancerName,
      loadBalancerHostName,
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
    '# Azure Load Balancing Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Application Gateway under test: ${report.controlPlane.gatewayName}`,
    `- Load Balancer under test: ${report.controlPlane.loadBalancerName}`,
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
  lines.push(`- Application Gateway ingress host: ${report.dataPlane.gatewayHostName}`);
  lines.push(`- Load Balancer ingress host: ${report.dataPlane.loadBalancerHostName}`);
  lines.push('');
  lines.push('| Case | Status | HTTP | Error Code |');
  lines.push('|---|---|---:|---|');
  for (const item of report.dataPlane.cases) {
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Application Gateway and Load Balancer ARM lifecycle, frontend/listener/backend/probe parameter rejection, bounded public-IP-host ingress routing through the local edge runtime, unsupported child/action route fail-closed behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Azure load balancing as 99%-complete or cloudValidated for packet-level balancing, TLS termination behavior, health probe state transitions, SNAT, zone behavior, autoscale, connection draining, WAF execution, throttling, RBAC, or exact Azure network data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const parity = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: parity.controlPlane.ok && parity.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Application Gateway and Load Balancer ARM lifecycle, bounded public-IP ingress routing, parameter rejection, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Load Balancing cloudValidated claim.',
  controlPlane: parity.controlPlane,
  dataPlane: parity.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Load Balancing parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
