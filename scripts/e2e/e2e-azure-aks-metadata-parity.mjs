import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createEdgeRouterServer } from '../../packages/azure-data-plane/src/edge-router.mjs';
import { createKubernetesRouterServer } from '../../packages/azure-data-plane/src/kubernetes-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-aks-metadata-parity');
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
    metricStore: runtime.metricStore,
    kubernetesRouter: runtime.kubernetesRouter,
  });
  const kubeServer = createKubernetesRouterServer(runtime.kubernetesRouter);
  const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => kubeServer.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => edgeServer.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const kubePort = kubeServer.address().port;
  const edgePort = edgeServer.address().port;
  try {
    return await fn({ armPort: port, kubePort, edgePort, runtime, store });
  } finally {
    edgeServer.closeAllConnections?.();
    kubeServer.closeAllConnections?.();
    server.closeAllConnections?.();
    await new Promise(resolve => edgeServer.close(resolve));
    await new Promise(resolve => kubeServer.close(resolve));
    await new Promise(resolve => server.close(resolve));
    await runtime.dispose();
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
  return result.body?.error?.code
    ?? result.body?.errors?.[0]?.code
    ?? result.body?.code
    ?? result.body?.Code
    ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2024-02-01') {
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

function aksBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: {
      dnsPrefix: 'gs-aks-dns',
      kubernetesVersion: '1.29.2',
      servicePrincipalProfile: { clientId: 'msi' },
      enableRBAC: true,
      agentPoolProfiles: [
        {
          name: 'systempool',
          count: 1,
          vmSize: 'Standard_DS2_v2',
          mode: 'System',
          osType: 'Linux',
        },
      ],
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function aksDeploymentBody(clusterName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        parameters: {
          clusterName: { type: 'string', defaultValue: clusterName },
        },
        resources: [
          {
            type: 'Microsoft.ContainerService/managedClusters',
            apiVersion: '2024-02-01',
            name: "[parameters('clusterName')]",
            location: 'eastus',
            identity: { type: 'SystemAssigned' },
            properties: {
              dnsPrefix: "[parameters('clusterName')]",
              kubernetesVersion: '1.29.2',
              servicePrincipalProfile: { clientId: 'msi' },
              enableRBAC: true,
              agentPoolProfiles: [
                {
                  name: 'systempool',
                  count: 1,
                  vmSize: 'Standard_DS2_v2',
                  mode: 'System',
                  osType: 'Linux',
                },
              ],
            },
          },
        ],
        outputs: {
          clusterName: { type: 'string', value: "[parameters('clusterName')]" },
        },
      },
    },
  };
}

function decodeKubeconfig(result) {
  return Buffer.from(result.body.kubeconfigs[0].value, 'base64').toString('utf8');
}

function kubeconfigValue(kubeconfig, key) {
  const line = String(kubeconfig)
    .split('\n')
    .find(entry => entry.trim().startsWith(`${key}:`));
  return line ? line.split(':').slice(1).join(':').trim() : '';
}

function leafResourceName(name) {
  return String(name ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

async function httpKube(port, path, { host, token: kubeToken, auth = true, method = 'GET', body } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(host ? { 'x-forwarded-host': host } : {}),
      ...(auth ? { authorization: `Bearer ${kubeToken}` } : {}),
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
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

async function edgeText(port, method, path, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(options.host ? { 'x-forwarded-host': options.host } : {}),
      ...(options.protocol ? { 'x-forwarded-proto': options.protocol } : {}),
      ...(options.headers ?? {}),
    },
  });
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: await response.text(),
  };
}

async function edgeJson(port, method, path, options = {}) {
  const result = await edgeText(port, method, path, options);
  return {
    ...result,
    body: result.body ? JSON.parse(result.body) : null,
  };
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

async function runControlPlaneMatrix() {
  const controlCases = [];
  const dataPlaneCases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-aks-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-aks-missing-${suffix}`;
  const clusterName = `aks-${suffix}`.slice(0, 40);
  const missingClusterName = `aks-missing-${suffix}`.slice(0, 40);
  const aadClusterName = `aks-aad-${suffix}`.slice(0, 40);
  let asyncOperation = null;
  let invalidNetworkPluginAsyncOperation = null;
  let clusterHost = null;
  let userKubeToken = null;
  let adminKubeToken = null;

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      controlCases.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
      console.log(`PASS ${name}`);
    } catch (error) {
      controlCases.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function recordDataPlane(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      dataPlaneCases.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
      console.log(`PASS ${name}`);
    } catch (error) {
      dataPlaneCases.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await withArmServer(async ({ armPort, kubePort, edgePort, runtime }) => {
    const clusterPath = `managedClusters/${clusterName}`;
    const missingClusterPath = `managedClusters/${missingClusterName}`;
    const aadClusterPath = `managedClusters/${aadClusterName}`;
    const invalidNetworkPluginClusterPath = `managedClusters/aks-badnp-${suffix}`.slice(0, 63 + 'managedClusters/'.length);

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
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
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
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
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
        `/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/${resourceGroup}/providers/Microsoft.ContainerService/${clusterPath}?api-version=2024-02-01`,
      );
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPathWithoutApiVersion(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody(),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster create requires an existing resource group', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(missingResourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody(),
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
        location: 'eastus',
        tags: { purpose: 'globalstack-aks-metadata-parity', ttl: 'ephemeral' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.name, resourceGroup);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('cluster empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid location is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ location: 'globalstack-invalid-location' }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster minimal body preserves captured servicePrincipalProfile validation', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        { location: 'eastus', properties: {} },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      assert.equal(result.body.target, 'servicePrincipalProfile');
      return { status: result.status, errorCode: errorCode(result), target: result.body.target };
    });

    await record('cluster invalid name is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', 'managedClusters/-bad'),
        aksBody(),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster missing dnsPrefix is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { dnsPrefix: undefined } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid dnsPrefix is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { dnsPrefix: '-bad-' } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidDnsPrefix');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster missing servicePrincipalProfile clientId is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { servicePrincipalProfile: {} } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster missing agentPoolProfiles is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { agentPoolProfiles: undefined } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster empty agentPoolProfiles is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { agentPoolProfiles: [] } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid agent pool name is rejected', async () => {
      const body = aksBody();
      body.properties.agentPoolProfiles[0].name = 'System_Pool';
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), body);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidAgentPoolName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid agent pool count is rejected', async () => {
      const body = aksBody();
      body.properties.agentPoolProfiles[0].count = 0;
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), body);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidAgentPoolCount');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster missing agent pool vmSize is rejected', async () => {
      const body = aksBody();
      delete body.properties.agentPoolProfiles[0].vmSize;
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), body);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid kubernetesVersion is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { kubernetesVersion: 'latest' } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidKubernetesVersion');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid network plugin is accepted into async failure', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', invalidNetworkPluginClusterPath),
        aksBody({
          properties: {
            dnsPrefix: `badnp-${suffix}`,
            networkProfile: { networkPlugin: 'invalid-plugin' },
          },
        }),
      );
      assert.equal(result.status, 201);
      assert.ok(result.headers['azure-asyncoperation']);
      assert.equal(result.body.properties.provisioningState, 'Creating');
      assert.equal(result.body.properties.networkProfile.networkPlugin, 'invalid-plugin');
      invalidNetworkPluginAsyncOperation = result.headers['azure-asyncoperation'];
      return {
        status: result.status,
        provisioningState: result.body.properties.provisioningState,
        asyncOperation: invalidNetworkPluginAsyncOperation,
      };
    });

    await record('cluster invalid network plugin async operation fails', async () => {
      const result = await httpJson(armPort, 'GET', operationStatusPath(invalidNetworkPluginAsyncOperation));
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Failed');
      assert.equal(result.body.error.code, 'InvalidParameter');
      assert.equal(result.body.error.target, 'networkProfile.networkPlugin');
      return { status: result.status, operationStatus: result.body.status, errorCode: result.body.error.code };
    });

    await record('cluster invalid network plugin readback is failed', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', invalidNetworkPluginClusterPath));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Failed');
      assert.equal(result.body.properties.error.code, 'InvalidParameter');
      assert.equal(result.body.properties.networkProfile.networkPlugin, 'invalid-plugin');
      return {
        status: result.status,
        provisioningState: result.body.properties.provisioningState,
        errorCode: result.body.properties.error.code,
      };
    });

    await record('cluster invalid network policy is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { networkProfile: { networkPolicy: 'invalid-policy' } } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'NetworkPolicyNotSupported');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster dnsServiceIP outside serviceCidr is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { networkProfile: { serviceCidr: '10.42.0.0/16', dnsServiceIP: '10.43.0.10' } } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid docker bridge cidr is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { networkProfile: { dockerBridgeCidr: 'not-a-cidr' } } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster private public fqdn flag requires private cluster', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ properties: { apiServerAccessProfile: { enablePrivateClusterPublicFQDN: true } } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private cluster dns zone None with disabled public FQDN is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({
          properties: {
            apiServerAccessProfile: {
              enablePrivateCluster: true,
              privateDNSZone: 'None',
              enablePrivateClusterPublicFQDN: false,
            },
          },
        }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster agent pool orchestratorVersion above control plane is rejected', async () => {
      const body = aksBody();
      body.properties.agentPoolProfiles[0].orchestratorVersion = '1.30.0';
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), body);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid identity type is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ identity: { type: 'Invalid' } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidIdentityType');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster user assigned identity without identities is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({ identity: { type: 'UserAssigned', userAssignedIdentities: {} }, properties: { servicePrincipalProfile: undefined } }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidIdentityValues');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid agent pool mode is rejected', async () => {
      const body = aksBody();
      body.properties.agentPoolProfiles[0].mode = 'Invalid';
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), body);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster invalid agent pool osType is rejected', async () => {
      const body = aksBody();
      body.properties.agentPoolProfiles[0].osType = 'Darwin';
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), body);
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster disableLocalAccounts requires Microsoft Entra managed profile', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        aksBody({
          properties: {
            disableLocalAccounts: true,
          },
        }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('valid cluster create returns async Azure shape', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), aksBody({
        tags: { workload: 'robotics-fleet-control' },
        properties: {
          dnsPrefix: clusterName,
          networkProfile: {
            networkPlugin: 'azure',
            networkPolicy: 'calico',
            serviceCidr: '10.42.0.0/16',
            dnsServiceIP: '10.42.0.10',
            dockerBridgeCidr: '172.18.0.1/16',
          },
        },
      }));
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      asyncOperation = result.headers['azure-asyncoperation'];
      return { status: result.status, asyncOperation };
    });

    await record('cluster first get is Creating', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Creating');
      assert.equal(result.body.globalstack.capabilityId, 'aks-metadata');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('cluster second get is Reconciling', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Reconciling');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('cluster async operation reaches Succeeded', async () => {
      const result = await httpJson(armPort, 'GET', operationStatusPath(asyncOperation));
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Succeeded');
      return { status: result.status, operationStatus: result.body.status };
    });

    await record('cluster get reaches Succeeded with AKS metadata', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.match(result.body.properties.fqdn, /\.azmk8s\.io$/);
      assert.ok(result.body.properties.nodeResourceGroup.startsWith('MC_'));
      assert.equal(result.body.properties.agentPoolProfiles[0].provisioningState, 'Succeeded');
      assert.equal(result.body.properties.networkProfile.networkPlugin, 'azure');
      assert.equal(result.body.properties.networkProfile.networkPolicy, 'calico');
      assert.equal(result.body.properties.networkProfile.serviceCidr, '10.42.0.0/16');
      assert.equal(result.body.properties.networkProfile.dnsServiceIP, '10.42.0.10');
      assert.equal(result.body.properties.networkProfile.dockerBridgeCidr, '172.18.0.1/16');
      assert.equal(result.body.properties.agentPoolProfiles[0].orchestratorVersion, '1.29.2');
      return {
        status: result.status,
        fqdn: result.body.properties.fqdn,
        networkPlugin: result.body.properties.networkProfile.networkPlugin,
      };
    });

    await record('cluster update preserves fqdn metadata', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), aksBody({
        tags: { workload: 'mlops-training-control-plane' },
        properties: { dnsPrefix: clusterName, enableRBAC: false },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'mlops-training-control-plane');
      assert.match(result.body.properties.fqdn, /\.azmk8s\.io$/);
      assert.equal(result.body.properties.enableRBAC, false);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('cluster list includes created cluster', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', 'managedClusters'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === clusterName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('credential action rejects wrong method', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterUserCredential`));
      assert.equal(result.status, 405);
      assert.equal(errorCode(result), 'MethodNotAllowed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('user credential for missing cluster is rejected', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${missingClusterPath}/listClusterUserCredential`));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('user credential action returns kubeconfig metadata', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterUserCredential`));
      assert.equal(result.status, 200);
      assert.equal(result.body.kubeconfigs[0].name, 'clusterUser');
      const kubeconfig = decodeKubeconfig(result);
      assert.match(kubeconfig, new RegExp(`name: ${clusterName}`));
      assert.match(kubeconfig, /server: https:\/\/.+\.azmk8s\.io/);
      assert.ok(kubeconfigValue(kubeconfig, 'certificate-authority-data').length > 16);
      clusterHost = new URL(kubeconfigValue(kubeconfig, 'server')).host;
      userKubeToken = kubeconfigValue(kubeconfig, 'token');
      return { status: result.status, kubeconfigName: result.body.kubeconfigs[0].name };
    });

    await record('admin credential action returns kubeconfig metadata', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterAdminCredential`));
      assert.equal(result.status, 200);
      assert.equal(result.body.kubeconfigs[0].name, 'clusterAdmin');
      const kubeconfig = decodeKubeconfig(result);
      assert.match(kubeconfig, /current-context: clusterAdmin/);
      adminKubeToken = kubeconfigValue(kubeconfig, 'token');
      return { status: result.status, kubeconfigName: result.body.kubeconfigs[0].name };
    });

    await record('user credential action returns deterministic kubeconfig across repeated reads', async () => {
      const first = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterUserCredential`));
      const second = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterUserCredential`));
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(first.body, second.body);
      return { status: second.status, kubeconfigName: second.body.kubeconfigs[0].name };
    });

    await record('cluster upgrade profile returns control-plane and agent-pool upgrade targets', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/upgradeProfiles/default`));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, 'default');
      assert.equal(result.body.properties.controlPlaneProfile.kubernetesVersion, '1.29.2');
      assert.ok(result.body.properties.controlPlaneProfile.upgrades.some(item => item.kubernetesVersion === '1.30.0'));
      assert.ok(result.body.properties.agentPoolProfiles.some(item => item.name === 'systempool'));
      return { status: result.status, upgrades: result.body.properties.controlPlaneProfile.upgrades.length };
    });

    await record('service principal reset updates cluster profile and returns async operation', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/resetServicePrincipalProfile`),
        { clientId: 'sp-reset-client', secret: 'sp-reset-secret' },
      );
      assert.equal(result.status, 202);
      assert.ok(result.headers.location);
      assert.equal(result.body.properties.servicePrincipalProfile.clientId, 'sp-reset-client');
      const readback = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(readback.status, 200);
      assert.equal(readback.body.properties.servicePrincipalProfile.clientId, 'sp-reset-client');
      return { status: result.status, clientId: readback.body.properties.servicePrincipalProfile.clientId };
    });

    await record('cluster certificate rotation invalidates old kubeconfig tokens and issues new ones', async () => {
      const oldUserToken = userKubeToken;
      const oldAdminToken = adminKubeToken;
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/rotateClusterCertificates`));
      assert.equal(result.status, 202);
      assert.equal(result.body.properties.credentialGeneration, 1);
      const oldUser = await httpKube(kubePort, '/version', {
        host: clusterHost,
        token: oldUserToken,
      });
      assert.equal(oldUser.status, 401);
      const oldAdmin = await httpKube(kubePort, '/version', {
        host: clusterHost,
        token: oldAdminToken,
      });
      assert.equal(oldAdmin.status, 401);
      const userResult = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterUserCredential`));
      const adminResult = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterAdminCredential`));
      assert.equal(userResult.status, 200);
      assert.equal(adminResult.status, 200);
      const userKubeconfig = decodeKubeconfig(userResult);
      const adminKubeconfig = decodeKubeconfig(adminResult);
      userKubeToken = kubeconfigValue(userKubeconfig, 'token');
      adminKubeToken = kubeconfigValue(adminKubeconfig, 'token');
      assert.notEqual(userKubeToken, oldUserToken);
      assert.notEqual(adminKubeToken, oldAdminToken);
      const freshUser = await httpKube(kubePort, '/version', {
        host: clusterHost,
        token: userKubeToken,
      });
      assert.equal(freshUser.status, 200);
      return { status: result.status, generation: result.body.properties.credentialGeneration };
    });

    await record('AAD cluster with disableLocalAccounts creates successfully', async () => {
      const created = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', aadClusterPath),
        aksBody({
          identity: { type: 'SystemAssigned' },
          properties: {
            servicePrincipalProfile: undefined,
            dnsPrefix: aadClusterName,
            disableLocalAccounts: true,
            aadProfile: {
              managed: true,
              tenantID: '11111111-1111-1111-1111-111111111111',
              adminGroupObjectIDs: ['22222222-2222-2222-2222-222222222222'],
            },
            agentPoolProfiles: [
              {
                name: 'systempool',
                count: 1,
                vmSize: 'Standard_DS2_v2',
                mode: 'System',
                osType: 'Linux',
                type: 'VirtualMachineScaleSets',
              },
            ],
          },
        }),
      );
      assert.equal(created.status, 202);
      const cluster = await waitFor(async () => {
        const current = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', aadClusterPath));
        assert.equal(current.status, 200);
        assert.equal(current.body.properties.provisioningState, 'Succeeded');
        return current;
      });
      assert.equal(cluster.body.properties.disableLocalAccounts, true);
      assert.equal(cluster.body.properties.aadProfile.managed, true);
      return { status: created.status, clusterName: cluster.body.name };
    });

    await record('AAD user credential action returns exec kubeconfig when local accounts are disabled', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${aadClusterPath}/listClusterUserCredential`) + '&format=exec',
      );
      assert.equal(result.status, 200);
      const kubeconfig = decodeKubeconfig(result);
      assert.match(kubeconfig, /command: kubelogin/);
      assert.match(kubeconfig, /- --login/);
      assert.ok(!/\n\s+token:\s+/.test(kubeconfig));
      return { status: result.status, kubeconfigName: result.body.kubeconfigs[0].name };
    });

    await record('AAD user credential action returns azure auth-provider kubeconfig when requested', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${aadClusterPath}/listClusterUserCredential`) + '&format=azure',
      );
      assert.equal(result.status, 200);
      const kubeconfig = decodeKubeconfig(result);
      assert.match(kubeconfig, /auth-provider:/);
      assert.match(kubeconfig, /name: azure/);
      assert.ok(!/\n\s+token:\s+/.test(kubeconfig));
      return { status: result.status, kubeconfigName: result.body.kubeconfigs[0].name };
    });

    await record('AAD admin credential action is rejected when local accounts are disabled', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${aadClusterPath}/listClusterAdminCredential`),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      assert.match(result.body.error.message, /Getting static credential isn't allowed/);
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('AAD cluster service principal reset is rejected for managed identity cluster', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${aadClusterPath}/resetServicePrincipalProfile`),
        { clientId: 'sp-reset-client', secret: 'sp-reset-secret' },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await recordDataPlane('local kubernetes api rejects missing bearer token', async () => {
      const result = await httpKube(kubePort, '/version', { host: clusterHost, token: userKubeToken, auth: false });
      assert.equal(result.status, 401);
      assert.equal(result.body.reason, 'Unauthorized');
      return { status: result.status, reason: result.body.reason };
    });

    await recordDataPlane('local kubernetes api version succeeds for kubeconfig host', async () => {
      const result = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/version', { host: clusterHost, token: userKubeToken });
        assert.equal(ready.status, 200);
        return ready;
      });
      assert.equal(result.body.gitVersion, 'v1.29.2');
      return { status: result.status, gitVersion: result.body.gitVersion };
    });

    await recordDataPlane('local kubernetes api namespaces list succeeds', async () => {
      const result = await httpKube(kubePort, '/api/v1/namespaces', { host: clusterHost, token: userKubeToken });
      assert.equal(result.status, 200);
      assert.ok(result.body.items.some(item => item.metadata.name === 'kube-system'));
      return { status: result.status, count: result.body.items.length };
    });

    await recordDataPlane('local kubernetes api nodes list reflects cluster agent pools', async () => {
      const result = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(ready.status, 200);
        assert.ok(ready.body.items.length >= 1);
        return ready;
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.items[0].metadata.labels['kubernetes.azure.com/agentpool'], 'systempool');
      assert.equal(result.body.items[0].metadata.labels['kubernetes.azure.com/nodepool-type'], 'VirtualMachineScaleSets');
      assert.match(result.body.items[0].metadata.name, /^aks-systempool-[a-f0-9]{8}-vmss\d{6}$/);
      return { status: result.status, count: result.body.items.length };
    });

    await record('agent pool child collection reflects cluster pool metadata', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools`));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => leafResourceName(item.name) === 'systempool'));
      return { status: result.status, count: result.body.value.length };
    });

    await recordDataPlane('cluster user credentials are read only on live kubernetes surface', async () => {
      const result = await httpKube(kubePort, '/api/v1/namespaces', {
        host: clusterHost,
        token: userKubeToken,
        method: 'POST',
        body: { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'user-denied' } },
      });
      assert.equal(result.status, 403);
      assert.equal(result.body.reason, 'Forbidden');
      return { status: result.status, reason: result.body.reason };
    });

    await recordDataPlane('cluster admin credentials can create namespace and configmap on live backend', async () => {
      const namespace = await httpKube(kubePort, '/api/v1/namespaces', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'runtime-smoke' } },
      });
      assert.equal(namespace.status, 201);
      const configMap = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/configmaps', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'v1',
          kind: 'ConfigMap',
          metadata: { name: 'runtime-smoke-config' },
          data: { mode: 'live' },
        },
      });
      assert.equal(configMap.status, 201);
      const secret = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/secrets', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'v1',
          kind: 'Secret',
          metadata: { name: 'runtime-smoke-secret' },
          stringData: { mode: 'admin-only' },
        },
      });
      assert.equal(secret.status, 201);
      return {
        status: secret.status,
        namespace: namespace.body.metadata.name,
        configMap: configMap.body.metadata.name,
        secret: secret.body.metadata.name,
      };
    });

    await recordDataPlane('cluster user credentials are restricted by backend RBAC on secrets', async () => {
      const result = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/secrets', {
        host: clusterHost,
        token: userKubeToken,
      });
      assert.equal(result.status, 403);
      assert.equal(result.body.reason, 'Forbidden');
      return { status: result.status, reason: result.body.reason };
    });

    await recordDataPlane('cluster admin credentials can create deployment and service on live backend', async () => {
      const deployment = await httpKube(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments', {
        host: clusterHost,
        token: adminKubeToken,
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
                containers: [{
                  name: 'http-echo',
                  image: 'hashicorp/http-echo:1.0.0',
                  args: ['-text=runtime-smoke', '-listen=:5678'],
                  ports: [{ containerPort: 5678 }],
                }],
              },
            },
          },
        },
      });
      assert.equal(deployment.status, 201);
      const service = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
        host: clusterHost,
        token: adminKubeToken,
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
      assert.equal(service.status, 201);
      return { status: service.status, deployment: deployment.body.metadata.name, service: service.body.metadata.name };
    });

    await record('cluster update can add a live user pool with a second node', async () => {
      const body = aksBody({
        tags: { workload: 'mlops-training-control-plane', topology: 'multi-pool' },
        properties: {
          dnsPrefix: clusterName,
          enableRBAC: false,
          agentPoolProfiles: [
            {
              name: 'systempool',
              count: 1,
              vmSize: 'Standard_DS2_v2',
              mode: 'System',
              osType: 'Linux',
            },
            {
              name: 'userpool',
              count: 1,
              vmSize: 'Standard_DS3_v2',
              mode: 'User',
              osType: 'Linux',
            },
          ],
        },
      });
      const updated = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), body);
      assert.equal(updated.status, 200);
      const nodes = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(ready.status, 200);
        assert.ok(ready.body.items.length >= 2);
        assert.ok(ready.body.items.some(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool'));
        return ready;
      }, { timeoutMs: 240000 });
      return {
        status: updated.status,
        nodeCount: nodes.body.items.length,
        pools: [...new Set(nodes.body.items.map(item => item.metadata.labels['kubernetes.azure.com/agentpool']))].sort(),
      };
    });

    await record('agent pool child item reflects updated user pool metadata', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.count, 1);
      assert.equal(result.body.properties.vmSize, 'Standard_DS3_v2');
      assert.equal(result.body.properties.mode, 'User');
      assert.equal(result.body.properties.type, 'VirtualMachineScaleSets');
      return { status: result.status, pool: leafResourceName(result.body.name) };
    });

    await record('agent pool node image upgrade updates ARM state and live node labels', async () => {
      const before = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      assert.equal(before.status, 200);
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool/upgradeNodeImageVersion`));
      assert.equal(result.status, 202);
      assert.ok(result.headers.location);
      const after = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      assert.equal(after.status, 200);
      assert.notEqual(after.body.properties.nodeImageVersion, before.body.properties.nodeImageVersion);
      const nodes = await httpKube(kubePort, '/api/v1/nodes', {
        host: clusterHost,
        token: adminKubeToken,
      });
      assert.equal(nodes.status, 200);
      const userNodes = nodes.body.items.filter(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool');
      assert.ok(userNodes.length >= 1);
      assert.ok(userNodes.every(item => item.metadata.labels['kubernetes.azure.com/node-image-version'] === after.body.properties.nodeImageVersion));
      return { status: result.status, nodeImageVersion: after.body.properties.nodeImageVersion };
    });

    await record('agent pool child put rejects invalid autoscaler bounds', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`),
        {
          properties: {
            count: 0,
            vmSize: 'Standard_DS3_v2',
            mode: 'User',
            osType: 'Linux',
            type: 'VirtualMachineScaleSets',
            enableAutoScaling: true,
            minCount: 2,
            maxCount: 1,
          },
        },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('agent pool child put rejects invalid orchestratorVersion', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`),
        {
          properties: {
            count: 1,
            vmSize: 'Standard_DS3_v2',
            mode: 'User',
            osType: 'Linux',
            type: 'VirtualMachineScaleSets',
            orchestratorVersion: 'latest',
          },
        },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('AKS runCommand returns commandResults location and completes successfully', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/runCommand`), {
        command: 'kubectl get namespaces -o name',
      });
      assert.equal(result.status, 202);
      assert.ok(result.headers.location);
      const commandResult = await waitFor(async () => {
        const location = new URL(result.headers.location);
        const resolved = await httpJson(armPort, 'GET', `${location.pathname}${location.search}`);
        assert.equal(resolved.status, 200);
        assert.equal(resolved.body.properties.provisioningState, 'succeeded');
        assert.equal(resolved.body.properties.exitCode, 0);
        assert.match(resolved.body.properties.logs, /namespace\/runtime-smoke/);
        return resolved;
      }, { timeoutMs: 120000, delayMs: 1000 });
      return {
        status: result.status,
        commandId: commandResult.body.id,
        provisioningState: commandResult.body.properties.provisioningState,
      };
    });

    await record('agent pool child put updates user pool VMSS metadata across repeated reads', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`),
        {
          properties: {
            count: 1,
            vmSize: 'Standard_DS3_v2',
            mode: 'User',
            osType: 'Linux',
            type: 'VirtualMachineScaleSets',
            availabilityZones: ['1'],
            orchestratorVersion: '1.29.2',
          },
        },
      );
      assert.ok([200, 201].includes(result.status));
      const nodes = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(ready.status, 200);
        const userPoolNodes = ready.body.items.filter(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool');
        assert.equal(userPoolNodes.length, 1);
        assert.ok(userPoolNodes.every(item => item.metadata.labels['topology.kubernetes.io/zone'] === '1'));
        return ready;
      }, { timeoutMs: 240000 });
      const first = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      const second = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(second.body.properties.count, 1);
      assert.equal(second.body.properties.type, 'VirtualMachineScaleSets');
      assert.equal(second.body.properties.orchestratorVersion, '1.29.2');
      assert.deepEqual(second.body.properties.availabilityZones, ['1']);
      return { status: result.status, nodeCount: nodes.body.items.length, userPoolCount: second.body.properties.count };
    });

    await record('agent pool child put scales user pool to zero and repeated drift reads stay stable', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`),
        {
          properties: {
            count: 0,
            vmSize: 'Standard_DS3_v2',
            mode: 'User',
            osType: 'Linux',
            type: 'VirtualMachineScaleSets',
          },
        },
      );
      assert.ok([200, 201].includes(result.status));
      const nodes = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(ready.status, 200);
        assert.equal(ready.body.items.length, 1);
        assert.ok(!ready.body.items.some(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool'));
        return ready;
      }, { timeoutMs: 240000 });
      const first = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      const second = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(second.body.properties.count, 0);
      const namespace = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke', {
        host: clusterHost,
        token: adminKubeToken,
      });
      assert.equal(namespace.status, 200);
      return { status: result.status, nodeCount: nodes.body.items.length, userPoolCount: second.body.properties.count };
    });

    await record('agent pool child put enables autoscaling bounds on user pool', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`),
        {
          properties: {
            count: 0,
            vmSize: 'Standard_DS3_v2',
            mode: 'User',
            osType: 'Linux',
            type: 'VirtualMachineScaleSets',
            enableAutoScaling: true,
            minCount: 0,
            maxCount: 2,
          },
        },
      );
      assert.ok([200, 201].includes(result.status));
      const first = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      const second = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.equal(second.body.properties.count, 0);
      assert.equal(second.body.properties.enableAutoScaling, true);
      assert.equal(second.body.properties.minCount, 0);
      assert.equal(second.body.properties.maxCount, 2);
      return { status: result.status, minCount: second.body.properties.minCount, maxCount: second.body.properties.maxCount };
    });

    await recordDataPlane('autoscaled user pool scales from zero for targeted workload and returns to minCount after deletion', async () => {
      const deploymentName = 'runtime-smoke-autoscale';
      const created = await httpKube(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: deploymentName },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 'runtime-smoke-autoscale' } },
            template: {
              metadata: { labels: { app: 'runtime-smoke-autoscale' } },
              spec: {
                nodeSelector: {
                  'kubernetes.azure.com/agentpool': 'userpool',
                },
                containers: [{
                  name: 'http-echo',
                  image: 'hashicorp/http-echo:1.0.0',
                  args: ['-text=runtime-smoke-autoscale', '-listen=:5678'],
                  ports: [{ containerPort: 5678 }],
                }],
              },
            },
          },
        },
      });
      assert.equal(created.status, 201);

      const scaledUp = await waitFor(async () => {
        const pool = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
        assert.equal(pool.status, 200);
        assert.equal(pool.body.properties.enableAutoScaling, true);
        assert.ok(pool.body.properties.count >= 1);
        const nodes = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(nodes.status, 200);
        const userNodes = nodes.body.items.filter(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool');
        assert.ok(userNodes.length >= 1);
        return { pool, nodes };
      }, { timeoutMs: 240000, delayMs: 2000 });

      const deleted = await httpKube(kubePort, `/apis/apps/v1/namespaces/runtime-smoke/deployments/${deploymentName}`, {
        host: clusterHost,
        token: adminKubeToken,
        method: 'DELETE',
      });
      assert.equal(deleted.status, 200);

      const scaledDown = await waitFor(async () => {
        const pool = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
        assert.equal(pool.status, 200);
        assert.equal(pool.body.properties.count, 0);
        const nodes = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(nodes.status, 200);
        assert.ok(!nodes.body.items.some(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'userpool'));
        return { pool, nodes };
      }, { timeoutMs: 300000, delayMs: 3000 });

      return {
        status: 200,
        scaledUpCount: scaledUp.pool.body.properties.count,
        scaledDownCount: scaledDown.pool.body.properties.count,
      };
    });

    await recordDataPlane('load balancer service exposes live backend through AKS edge integration', async () => {
      const created = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: 'runtime-smoke-lb',
            annotations: {
              'service.beta.kubernetes.io/azure-dns-label-name': `gsmoke${suffix.slice(-4)}`,
            },
          },
          spec: {
            type: 'LoadBalancer',
            selector: { app: 'runtime-smoke' },
            ports: [{ port: 80, targetPort: 5678 }],
          },
        },
      });
      assert.equal(created.status, 201);
      const service = await waitFor(async () => {
        const current = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-lb', {
          host: clusterHost,
          token: adminKubeToken,
        });
        assert.equal(current.status, 200);
        assert.ok(current.body.status?.loadBalancer?.ingress?.[0]?.ip);
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });
      const ingressIp = service.body.status.loadBalancer.ingress[0].ip;
      assert.match(ingressIp, /^203\.0\.\d{1,3}\.\d{1,3}$/);
      const hostname = `gsmoke${suffix.slice(-4)}.eastus.cloudapp.azure.com`;
      const response = await waitFor(async () => {
        const current = await edgeText(edgePort, 'GET', '/', {
          host: hostname,
          protocol: 'http',
        });
        assert.equal(current.status, 200);
        assert.match(current.body, /runtime-smoke/);
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });
      return {
        status: response.status,
        hostname,
        ingressIp,
        route: response.headers['x-globalstack-edge-route'] ?? null,
      };
    });

    await recordDataPlane('load balancer service can bind to an ARM public IP resource', async () => {
      const publicIpName = `akspip${suffix.slice(-5)}`;
      const publicIp = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/publicIPAddresses/${publicIpName}?api-version=2023-09-01`,
        {
          location: 'eastus',
          sku: { name: 'Standard' },
          properties: {
            publicIPAllocationMethod: 'Static',
            dnsSettings: {
              domainNameLabel: `akspip${suffix.slice(-5)}`,
            },
          },
        },
      );
      assert.equal(publicIp.status, 201);
      const publicIpAddress = publicIp.body.properties.ipAddress;
      const publicIpFqdn = publicIp.body.properties.dnsSettings.fqdn;

      const created = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: 'runtime-smoke-pip',
            annotations: {
              'service.beta.kubernetes.io/azure-load-balancer-resource-group': resourceGroup,
              'service.beta.kubernetes.io/azure-pip-name': publicIpName,
              'service.beta.kubernetes.io/azure-load-balancer-tcp-idle-timeout': '15',
            },
          },
          spec: {
            type: 'LoadBalancer',
            selector: { app: 'runtime-smoke' },
            ports: [{ port: 80, targetPort: 5678 }],
          },
        },
      });
      assert.equal(created.status, 201);

      const service = await waitFor(async () => {
        const current = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-pip', {
          host: clusterHost,
          token: adminKubeToken,
        });
        assert.equal(current.status, 200);
        assert.equal(current.body.status?.loadBalancer?.ingress?.[0]?.ip, publicIpAddress);
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });

      const response = await waitFor(async () => {
        const current = await edgeText(edgePort, 'GET', '/', {
          host: publicIpFqdn,
          protocol: 'http',
        });
        assert.equal(current.status, 200);
        assert.match(current.body, /runtime-smoke/);
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });
      const edgeEndpoints = await edgeJson(edgePort, 'GET', '/_globalstack/edge/endpoints');
      assert.equal(edgeEndpoints.status, 200);
      const endpoint = edgeEndpoints.body.value.find(item => item.hostName === publicIpFqdn);
      assert.equal(endpoint.metadata.resourceGroupName, resourceGroup);
      assert.equal(endpoint.metadata.publicIpName, publicIpName);
      assert.equal(endpoint.metadata.idleTimeoutInMinutes, 15);

      return {
        status: response.status,
        ingressIp: service.body.status.loadBalancer.ingress[0].ip,
        hostname: publicIpFqdn,
        route: response.headers['x-globalstack-edge-route'] ?? null,
      };
    });

    await recordDataPlane('ingress routes public host through managed AKS edge integration', async () => {
      const serviceName = 'runtime-smoke-ingress-svc';
      const hostName = `ing${suffix.slice(-6)}.aks.localtest.me`;
      const service = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: { name: serviceName },
          spec: {
            type: 'NodePort',
            selector: { app: 'runtime-smoke' },
            ports: [{ name: 'http', port: 80, targetPort: 5678 }],
          },
        },
      });
      assert.equal(service.status, 201);
      const ingress = await httpKube(kubePort, '/apis/networking.k8s.io/v1/namespaces/runtime-smoke/ingresses', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'networking.k8s.io/v1',
          kind: 'Ingress',
          metadata: {
            name: 'runtime-smoke-ingress',
            annotations: {
              'kubernetes.io/ingress.class': 'azure/application-gateway',
            },
          },
          spec: {
            rules: [{
              host: hostName,
              http: {
                paths: [{
                  path: '/app',
                  pathType: 'Prefix',
                  backend: {
                    service: {
                      name: serviceName,
                      port: { name: 'http' },
                    },
                  },
                }],
              },
            }],
          },
        },
      });
      assert.equal(ingress.status, 201);

      const currentIngress = await waitFor(async () => {
        const current = await httpKube(kubePort, '/apis/networking.k8s.io/v1/namespaces/runtime-smoke/ingresses/runtime-smoke-ingress', {
          host: clusterHost,
          token: adminKubeToken,
        });
        assert.equal(current.status, 200);
        assert.ok(current.body.status?.loadBalancer?.ingress?.[0]?.ip);
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });

      const response = await waitFor(async () => {
        const current = await edgeText(edgePort, 'GET', '/app', {
          host: hostName,
          protocol: 'http',
        });
        assert.equal(current.status, 200);
        assert.match(current.body, /runtime-smoke/);
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });

      const miss = await edgeText(edgePort, 'GET', '/other', {
        host: hostName,
        protocol: 'http',
      });
      assert.equal(miss.status, 404);
      return {
        status: response.status,
        hostName,
        ingressIp: currentIngress.body.status.loadBalancer.ingress[0].ip,
        route: response.headers['x-globalstack-edge-route'] ?? null,
      };
    });

    await recordDataPlane('local traffic load balancer routes only to nodes with matching local endpoints', async () => {
      const deploymentName = 'runtime-smoke-local';
      const created = await httpKube(kubePort, '/apis/apps/v1/namespaces/runtime-smoke/deployments', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          metadata: { name: deploymentName },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: 'runtime-smoke-local' } },
            template: {
              metadata: { labels: { app: 'runtime-smoke-local' } },
              spec: {
                nodeSelector: {
                  'kubernetes.azure.com/agentpool': 'userpool',
                },
                containers: [{
                  name: 'http-echo',
                  image: 'hashicorp/http-echo:1.0.0',
                  args: ['-text=runtime-smoke-local', '-listen=:5678'],
                  ports: [{ containerPort: 5678 }],
                }],
              },
            },
          },
        },
      });
      assert.equal(created.status, 201);

      const serviceName = 'runtime-smoke-local';
      const service = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
        host: clusterHost,
        token: adminKubeToken,
        method: 'POST',
        body: {
          apiVersion: 'v1',
          kind: 'Service',
          metadata: {
            name: serviceName,
            annotations: {
              'service.beta.kubernetes.io/azure-dns-label-name': `local${suffix.slice(-4)}`,
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
      assert.equal(service.status, 201);

      const currentService = await waitFor(async () => {
        const current = await httpKube(kubePort, `/api/v1/namespaces/runtime-smoke/services/${serviceName}`, {
          host: clusterHost,
          token: adminKubeToken,
        });
        assert.equal(current.status, 200);
        assert.ok(Number(current.body.spec?.healthCheckNodePort ?? 0) > 0);
        assert.ok(current.body.status?.loadBalancer?.ingress?.[0]?.ip);
        const pool = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
        assert.equal(pool.status, 200);
        assert.equal(pool.body.properties.count, 1);
        return current;
      }, { timeoutMs: 240000, delayMs: 2000 });

      const clusterEntry = runtime.kubernetesRouter.clusterManager.clustersByHost.get(String(clusterHost).toLowerCase());
      assert.ok(clusterEntry);
      const userpoolAssignment = Object.entries(clusterEntry.nodeAssignments)
        .find(([, assignment]) => assignment.name === 'userpool');
      assert.ok(userpoolAssignment);
      const userpoolOriginIp = await runtime.kubernetesRouter.clusterManager.inspectContainerIp(
        userpoolAssignment[1].containerName,
        clusterEntry.networkName,
      );

      const hostname = `local${suffix.slice(-4)}.eastus.cloudapp.azure.com`;
      const response = await waitFor(async () => {
        const current = await edgeText(edgePort, 'GET', '/', {
          host: hostname,
          protocol: 'http',
        });
        assert.equal(current.status, 200);
        assert.match(current.body, /runtime-smoke-local/);
        assert.equal(current.headers['x-globalstack-origin-host'], userpoolOriginIp);
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });

      const deleted = await httpKube(kubePort, `/apis/apps/v1/namespaces/runtime-smoke/deployments/${deploymentName}`, {
        host: clusterHost,
        token: adminKubeToken,
        method: 'DELETE',
      });
      assert.equal(deleted.status, 200);
      const deletedService = await httpKube(kubePort, `/api/v1/namespaces/runtime-smoke/services/${serviceName}`, {
        host: clusterHost,
        token: adminKubeToken,
        method: 'DELETE',
      });
      assert.equal(deletedService.status, 200);

      await waitFor(async () => {
        const pool = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/userpool`));
        assert.equal(pool.status, 200);
        assert.equal(pool.body.properties.count, 0);
        const edgeGone = await edgeText(edgePort, 'GET', '/', {
          host: hostname,
          protocol: 'http',
        });
        assert.equal(edgeGone.status, 404);
      }, { timeoutMs: 300000, delayMs: 3000 });

      return {
        status: response.status,
        hostname,
        ingressIp: currentService.body.status.loadBalancer.ingress[0].ip,
        originHost: response.headers['x-globalstack-origin-host'] ?? null,
      };
    });

    await recordDataPlane('internal load balancer service gets private ingress and no public edge route', async () => {
      const created = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services', {
        host: clusterHost,
        token: adminKubeToken,
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
      assert.equal(created.status, 201);
      const service = await waitFor(async () => {
        const current = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/services/runtime-smoke-ilb', {
          host: clusterHost,
          token: adminKubeToken,
        });
        assert.equal(current.status, 200);
        assert.equal(current.body.status?.loadBalancer?.ingress?.[0]?.ip, '10.224.10.25');
        return current;
      }, { timeoutMs: 120000, delayMs: 1000 });
      const response = await edgeText(edgePort, 'GET', '/', {
        host: '10.224.10.25',
        protocol: 'http',
      });
      assert.equal(response.status, 404);
      return { status: service.status, ingressIp: service.body.status.loadBalancer.ingress[0].ip };
    });

    await record('cluster update enables private FQDN and DNS profile', async () => {
      const before = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(before.status, 200);
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        {
          location: 'eastus',
          tags: before.body.tags,
          identity: before.body.identity,
          properties: {
            ...before.body.properties,
            dnsPrefix: clusterName,
            apiServerAccessProfile: {
              enablePrivateCluster: true,
              privateDNSZone: 'System',
              enablePrivateClusterPublicFQDN: false,
            },
          },
        },
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.apiServerAccessProfile.enablePrivateCluster, true);
      assert.equal(result.body.properties.apiServerAccessProfile.privateDNSZone, 'System');
      assert.equal(result.body.properties.apiServerAccessProfile.enablePrivateClusterPublicFQDN, false);
      assert.match(result.body.properties.privateFQDN, /\.privatelink\.eastus\.azmk8s\.io$/);
      return {
        status: result.status,
        privateFQDN: result.body.properties.privateFQDN,
      };
    });

    await recordDataPlane('private cluster kubeconfig uses private host and rejects public API host', async () => {
      const current = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(current.status, 200);
      const publicHost = current.body.properties.fqdn;
      const privateHost = current.body.properties.privateFQDN;
      const credentials = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterUserCredential`));
      assert.equal(credentials.status, 200);
      const kubeconfig = decodeKubeconfig(credentials);
      assert.equal(new URL(kubeconfigValue(kubeconfig, 'server')).host, privateHost);
      userKubeToken = kubeconfigValue(kubeconfig, 'token');
      const adminCredentials = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterAdminCredential`));
      assert.equal(adminCredentials.status, 200);
      adminKubeToken = kubeconfigValue(decodeKubeconfig(adminCredentials), 'token');
      const publicResult = await httpKube(kubePort, '/version', { host: publicHost, token: userKubeToken });
      assert.equal(publicResult.status, 404);
      const privateResult = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/version', { host: privateHost, token: userKubeToken });
        assert.equal(ready.status, 200);
        return ready;
      }, { timeoutMs: 240000, delayMs: 2000 });
      clusterHost = privateHost;
      return {
        status: privateResult.status,
        publicHostStatus: publicResult.status,
        privateHost,
      };
    });

    await recordDataPlane('private cluster public FQDN can be re-enabled and routes public host', async () => {
      const before = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(before.status, 200);
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        {
          location: 'eastus',
          tags: before.body.tags,
          identity: before.body.identity,
          properties: {
            ...before.body.properties,
            dnsPrefix: clusterName,
            apiServerAccessProfile: {
              ...before.body.properties.apiServerAccessProfile,
              enablePrivateCluster: true,
              enablePrivateClusterPublicFQDN: true,
            },
          },
        },
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.apiServerAccessProfile.enablePrivateClusterPublicFQDN, true);
      const publicHost = result.body.properties.fqdn;
      const privateHost = result.body.properties.privateFQDN;
      const publicResult = await httpKube(kubePort, '/version', { host: publicHost, token: userKubeToken });
      assert.equal(publicResult.status, 200);
      const privateResult = await httpKube(kubePort, '/version', { host: privateHost, token: userKubeToken });
      assert.equal(privateResult.status, 200);
      clusterHost = privateHost;
      return {
        status: publicResult.status,
        publicHost,
        privateHost,
      };
    });

    await recordDataPlane('control-plane version update preserves bounded workload state', async () => {
      const before = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(before.status, 200);
      const update = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath),
        {
          location: 'eastus',
          tags: before.body.tags,
          identity: before.body.identity,
          properties: {
            ...before.body.properties,
            dnsPrefix: clusterName,
            kubernetesVersion: '1.29.3',
          },
        },
      );
      assert.equal(update.status, 200);
      assert.equal(update.body.properties.kubernetesVersion, '1.29.3');

      const version = await waitFor(async () => {
        const current = await httpKube(kubePort, '/version', { host: clusterHost, token: adminKubeToken });
        assert.equal(current.status, 200);
        assert.equal(current.body.gitVersion, 'v1.29.3');
        return current;
      }, { timeoutMs: 300000, delayMs: 3000 });
      const preservedConfigMap = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke/configmaps/runtime-smoke-config', {
        host: clusterHost,
        token: adminKubeToken,
      });
      assert.equal(preservedConfigMap.status, 200);
      const upgradeProfile = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/upgradeProfiles/default`));
      assert.equal(upgradeProfile.status, 200);
      assert.equal(upgradeProfile.body.properties.controlPlaneProfile.kubernetesVersion, '1.29.3');
      return {
        status: version.status,
        gitVersion: version.body.gitVersion,
        preservedConfigMap: preservedConfigMap.body.metadata.name,
      };
    });

    await record('agent pool child put adds a live burst pool after scale-to-zero user pool', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/burstpool`),
        {
          properties: {
            count: 1,
            vmSize: 'Standard_DS4_v2',
            mode: 'User',
            osType: 'Linux',
          },
        },
      );
      assert.ok([200, 201].includes(result.status));
      const nodes = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(ready.status, 200);
        assert.equal(ready.body.items.length, 2);
        assert.ok(ready.body.items.some(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'burstpool'));
        return ready;
      }, { timeoutMs: 240000 });
      const namespace = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke', {
        host: clusterHost,
        token: adminKubeToken,
      });
      assert.equal(namespace.status, 200);
      return {
        status: result.status,
        nodeCount: nodes.body.items.length,
        pools: [...new Set(nodes.body.items.map(item => item.metadata.labels['kubernetes.azure.com/agentpool']))].sort(),
      };
    });

    await record('agent pool child delete removes burst pool and preserves workload state', async () => {
      const result = await httpJson(
        armPort,
        'DELETE',
        providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/burstpool`),
      );
      assert.equal(result.status, 200);
      const nodes = await waitFor(async () => {
        const ready = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
        assert.equal(ready.status, 200);
        assert.equal(ready.body.items.length, 1);
        assert.ok(!ready.body.items.some(item => item.metadata.labels['kubernetes.azure.com/agentpool'] === 'burstpool'));
        return ready;
      }, { timeoutMs: 240000 });
      const namespace = await httpKube(kubePort, '/api/v1/namespaces/runtime-smoke', {
        host: clusterHost,
        token: adminKubeToken,
      });
      assert.equal(namespace.status, 200);
      return {
        status: result.status,
        nodeCount: nodes.body.items.length,
        pools: [...new Set(nodes.body.items.map(item => item.metadata.labels['kubernetes.azure.com/agentpool']))].sort(),
      };
    });

    await record('agent pool child get after delete is rejected', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/agentPools/burstpool`));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create AKS metadata cluster', async () => {
      const deploymentName = `aks-deploy-${suffix}`;
      const templateCluster = `aks-t-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        aksDeploymentBody(templateCluster),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/managedClusters/${templateCluster}`)));
      return { status: result.status, deploymentName };
    });

    await record('cluster delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('cluster get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster get after delete remains not found across repeated reads', async () => {
      const first = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      const second = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(first.status, 404);
      assert.equal(second.status, 404);
      assert.equal(errorCode(second), 'ResourceNotFound');
      return { status: second.status, errorCode: errorCode(second) };
    });

    await record('credential action after delete is rejected', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/listClusterUserCredential`));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('cluster delete not found preserves captured no-content response', async () => {
      const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath));
      assert.equal(result.status, 204);
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

  const failed = controlCases.filter(item => !item.ok);
  const dataPlaneFailed = dataPlaneCases.filter(item => !item.ok);
  return {
    controlPlane: {
      ok: failed.length === 0,
      total: controlCases.length,
      failedCount: failed.length,
      resourceGroup,
      clusterName,
      cases: controlCases,
    },
    dataPlane: {
      ok: dataPlaneFailed.length === 0,
      total: dataPlaneCases.length,
      failedCount: dataPlaneFailed.length,
      clusterHost,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-aks-metadata-parity-local-token',
    PROVIDER: 'GlobalStack',
    CLOUD_PROVIDER: 'GlobalStack',
  };
  const result = await run('npm', ['run', 'smoke:platform-runners'], {
    env,
    timeoutMs: 1800000,
    stdio: 'ignore',
  });
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
    '# Azure Kubernetes Service Runtime Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Cluster under test: ${report.controlPlane.clusterName}`,
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
  lines.push(`- Kubernetes host under test: ${report.dataPlane.clusterHost ?? ''}`);
  lines.push('');
  lines.push('| Case | Status | HTTP | Error |');
  lines.push('|---|---|---:|---|');
  for (const item of report.dataPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.reason ?? item.error ?? ''} |`);
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
  lines.push('This run proves local GlobalStack handling for the listed AKS ARM managed-cluster lifecycle, service-principal reset, certificate rotation with kubeconfig token invalidation, upgrade-profile readback, private-cluster FQDN and kubeconfig host behavior, CNI/network profile validation and readback, agent-pool child resources, bounded node-image upgrade with live node-label readback, bounded Microsoft Entra-managed credential formats, backend-RBAC-backed user/admin Kubernetes access, bounded VMSS-like pool semantics, bounded autoscaler scale-up/down behavior on targeted workloads, bounded LoadBalancer service exposure through the edge router including externalTrafficPolicy=Local locality, ARM public-IP attachment, selected Azure service annotations, NodePort-backed Ingress routing, workload preservation across pool create/update/delete and control-plane patch-version update, bounded runCommand execution, ARM-template deployment, post-delete errors, and all-platform runner deployment paths. It does not mark AKS as 99%-complete or cloudValidated for full VMSS semantics, full CNI datapath behavior, Azure-managed load balancer controller parity beyond the bounded public/internal, externalTrafficPolicy=Local, ARM-public-IP, annotation, and ingress slices, addons, multi-step upgrade orchestration, Azure AD/RBAC integration, admission control, scheduler parity, or every live Azure validation edge.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const parity = await runControlPlaneMatrix();
const platformMatrix = parity.controlPlane.ok && parity.dataPlane.ok
  ? await runPlatformMatrix()
  : {
      ok: false,
      skipped: true,
      reason: 'AKS control/data-plane matrix failed before platform runner validation',
      expectedPlatforms: azurePlatforms.length,
      results: [],
    };
const report = {
  generatedAt: new Date().toISOString(),
  ok: parity.controlPlane.ok && parity.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Kubernetes Service ARM managed-cluster and agent-pool lifecycle, service-principal reset, certificate rotation with kubeconfig token invalidation, upgrade-profile readback, bounded node-image upgrade with live node-label readback, real local k3s-backed Kubernetes API behavior behind the AKS FQDN, backend-RBAC-backed user/admin credential behavior, bounded Microsoft Entra-managed credential formats, bounded AKS runCommand execution, bounded VMSS-like pool create/update/delete runtime reconciliation, bounded autoscaler scale-up/down behavior for targeted workloads, bounded LoadBalancer service exposure through the edge router including externalTrafficPolicy=Local locality and ARM public-IP attachment, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'AKS facade plus real local cluster runtime evidence for the enumerated cases only; not a full AKS or cloudValidated claim.',
  controlPlane: parity.controlPlane,
  dataPlane: parity.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure AKS parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
