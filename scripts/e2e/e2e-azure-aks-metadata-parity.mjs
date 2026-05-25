import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
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
  });
  const kubeServer = createKubernetesRouterServer(runtime.kubernetesRouter);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => kubeServer.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const kubePort = kubeServer.address().port;
  try {
    return await fn({ armPort: port, kubePort, runtime, store });
  } finally {
    await new Promise(resolve => kubeServer.close(resolve));
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
    identity: { type: 'SystemAssigned' },
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

async function httpKube(port, path, { host, token: kubeToken, auth = true } = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'GET',
    headers: {
      ...(host ? { 'x-forwarded-host': host } : {}),
      ...(auth ? { authorization: `Bearer ${kubeToken}` } : {}),
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
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

async function runControlPlaneMatrix() {
  const controlCases = [];
  const dataPlaneCases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-aks-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-aks-missing-${suffix}`;
  const clusterName = `aks-${suffix}`.slice(0, 40);
  const missingClusterName = `aks-missing-${suffix}`.slice(0, 40);
  let asyncOperation = null;
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

  await withArmServer(async ({ armPort, kubePort }) => {
    const clusterPath = `managedClusters/${clusterName}`;
    const missingClusterPath = `managedClusters/${missingClusterName}`;

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

    await record('valid cluster create returns async Azure shape', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerService', clusterPath), aksBody({
        tags: { workload: 'robotics-fleet-control' },
        properties: { dnsPrefix: clusterName },
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
      return { status: result.status, fqdn: result.body.properties.fqdn };
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

    await recordDataPlane('local kubernetes api rejects missing bearer token', async () => {
      const result = await httpKube(kubePort, '/version', { host: clusterHost, token: userKubeToken, auth: false });
      assert.equal(result.status, 401);
      assert.equal(result.body.reason, 'Unauthorized');
      return { status: result.status, reason: result.body.reason };
    });

    await recordDataPlane('local kubernetes api version succeeds for kubeconfig host', async () => {
      const result = await httpKube(kubePort, '/version', { host: clusterHost, token: userKubeToken });
      assert.equal(result.status, 200);
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
      const result = await httpKube(kubePort, '/api/v1/nodes', { host: clusterHost, token: adminKubeToken });
      assert.equal(result.status, 200);
      assert.equal(result.body.items.length, 1);
      assert.equal(result.body.items[0].metadata.labels['kubernetes.azure.com/agentpool'], 'systempool');
      return { status: result.status, count: result.body.items.length };
    });

    await record('unsupported AKS action fails closed', async () => {
      const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.ContainerService', `${clusterPath}/runCommand`), {
        command: 'kubectl get pods',
      });
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'GlobalStackRouteNotImplemented');
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
    '# Azure Kubernetes Service Metadata Parity E2E Report',
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
  lines.push('This run proves local GlobalStack handling for the listed AKS ARM managed-cluster metadata lifecycle, captured servicePrincipalProfile validation, async provisioning-state smoke, local kubeconfig action metadata, a bounded Kubernetes API host behind the AKS FQDN, ARM-template deployment, post-delete errors, and all-platform runner deployment paths. It does not mark AKS as 99%-complete or cloudValidated for managed node provisioning, CNI, load balancer integration, addons, upgrades, private clusters, Azure AD/RBAC integration, admission control, workload scheduling, runCommand execution, or every live Azure validation edge.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const parity = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: parity.controlPlane.ok && parity.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Kubernetes Service ARM managed-cluster metadata lifecycle, bounded local Kubernetes API behavior behind the AKS FQDN, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Bounded local AKS metadata and Kubernetes API evidence for the enumerated cases only; not a full AKS or Kubernetes runtime cloudValidated claim.',
  controlPlane: parity.controlPlane,
  dataPlane: parity.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure AKS metadata parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
