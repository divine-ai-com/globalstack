import assert from 'node:assert/strict';
import { request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createContainerRegistryRouter, createContainerRegistryRouterServer } from '../../packages/azure-data-plane/src/container-registry-router.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-container-registry-parity');
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
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function withContainerRegistryRouter(fn) {
  const router = createContainerRegistryRouter();
  const server = createContainerRegistryRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port, router);
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

async function httpDataPlaneJson(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      host: '127.0.0.1',
      port,
      method,
      path,
      headers: {
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        let parsed = null;
        if (text) {
          try {
            parsed = JSON.parse(text);
          } catch {
            parsed = text;
          }
        }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function errorCode(result) {
  return result.body?.error?.code
    ?? result.body?.errors?.[0]?.code
    ?? result.body?.code
    ?? result.body?.Code
    ?? result.body?.title
    ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2023-07-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function registryBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Basic' },
    properties: {
      adminUserEnabled: false,
      publicNetworkAccess: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function registryDeploymentBody(registryName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        parameters: {
          registryName: { type: 'string', defaultValue: registryName },
        },
        resources: [
          {
            type: 'Microsoft.ContainerRegistry/registries',
            apiVersion: '2023-07-01',
            name: "[parameters('registryName')]",
            location: 'eastus',
            sku: { name: 'Basic' },
            properties: {
              adminUserEnabled: false,
              publicNetworkAccess: 'Enabled',
            },
          },
        ],
        outputs: {
          registryName: { type: 'string', value: "[parameters('registryName')]" },
        },
      },
    },
  };
}

function manifestBody() {
  return {
    schemaVersion: 2,
    mediaType: 'application/vnd.oci.image.manifest.v1+json',
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: 'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      size: 2,
    },
    layers: [],
  };
}

async function runControlAndDataPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-acr-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-acr-missing-${suffix}`;
  const registryName = `acr${suffix}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  const missingRegistryName = `missing${suffix}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  const repository = 'robotics/controller';
  const tag = 'v1';
  let loginServer = null;
  let manifestDigest = null;

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

  await withContainerRegistryRouter(async (routerPort, router) => {
    await withArmServer(async (armPort) => {
      const registryPath = `registries/${registryName}`;

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
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
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
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
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
          `/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/${resourceGroup}/providers/Microsoft.ContainerRegistry/${registryPath}?api-version=2023-07-01`,
        );
        assert.equal(result.status, 403);
        assert.equal(errorCode(result), 'AuthorizationFailed');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('missing api-version is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPathWithoutApiVersion(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
          registryBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'MissingApiVersionParameter');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('registry create requires an existing resource group', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(missingResourceGroup, 'Microsoft.ContainerRegistry', registryPath),
          registryBody(),
        );
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceGroupNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('resource group create succeeds', async () => {
        const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
          location: 'eastus',
          tags: { purpose: 'globalstack-container-registry-parity', ttl: 'ephemeral' },
        });
        assert.equal(result.status, 201);
        assert.equal(result.body.name, resourceGroup);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('registry empty body is rejected', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath), {});
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'LocationRequired');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('registry invalid location is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
          registryBody({ location: 'globalstack-invalid-location' }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceLocation');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('registry minimal body without sku preserves captured validation', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
          { location: 'eastus', properties: {} },
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'One or more validation errors occurred.');
        assert.equal(result.body.errors.Sku[0], 'The Sku field is required.');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('registry invalid name is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', 'registries/bad-registry'),
          registryBody(),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceName');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('registry invalid sku is rejected', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
          registryBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'SkuNameInvalid');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('registry adminUserEnabled must be boolean', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
          registryBody({ properties: { adminUserEnabled: 'true' } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequestBody');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('registry publicNetworkAccess must be valid enum', async () => {
        const result = await httpJson(
          armPort,
          'PUT',
          providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath),
          registryBody({ properties: { publicNetworkAccess: 'Maybe' } }),
        );
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidRequestBody');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('valid registry create succeeds with loginServer metadata', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath), registryBody({
          tags: { workload: 'mlops-image-builds' },
        }));
        assert.equal(result.status, 201);
        assert.equal(result.body.type, 'Microsoft.ContainerRegistry/registries');
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.equal(result.body.properties.loginServer, `${registryName}.azurecr.io`);
        assert.equal(result.body.globalstack.capabilityId, 'container-registry');
        loginServer = result.body.properties.loginServer;
        router.registerRegistry({ registryName, loginServer });
        return { status: result.status, loginServer };
      });

      await record('registry get returns Succeeded and capability metadata', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath));
        assert.equal(result.status, 200);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.equal(result.body.globalstack.capabilityId, 'container-registry');
        return { status: result.status, resourceId: result.body.id };
      });

      await record('registry update preserves loginServer metadata', async () => {
        const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath), registryBody({
          tags: { workload: 'robotics-image-promotion' },
          properties: { adminUserEnabled: true },
        }));
        assert.equal(result.status, 200);
        assert.equal(result.body.tags.workload, 'robotics-image-promotion');
        assert.equal(result.body.properties.loginServer, `${registryName}.azurecr.io`);
        assert.equal(result.body.properties.adminUserEnabled, true);
        return { status: result.status, resourceId: result.body.id };
      });

      await record('registry list includes created registry', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerRegistry', 'registries'));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name === registryName));
        return { status: result.status, count: result.body.value.length };
      });

      await record('registry token endpoint issues local ACR token', async () => {
        const result = await httpDataPlaneJson(
          routerPort,
          'GET',
          `/oauth2/token?service=${loginServer}&scope=repository:${repository}:pull,push`,
          undefined,
          { host: loginServer },
        );
        assert.equal(result.status, 200);
        assert.ok(result.body.access_token.startsWith('globalstack-acr-token-'));
        return { status: result.status, scope: result.body.scope };
      });

      await record('data-plane /v2/ without token returns bearer challenge', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/v2/', undefined, { host: loginServer });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'UNAUTHORIZED');
        assert.match(String(result.headers['www-authenticate']), /^Bearer/);
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane /v2/ with bearer succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/v2/', undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.headers['docker-distribution-api-version'], 'registry/2.0');
        return { status: result.status };
      });

      await record('data-plane unknown registry is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/v2/', undefined, { host: `${missingRegistryName}.azurecr.io`, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'RegistryNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('catalog initially empty', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/acr/v1/_catalog', undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.repositories, []);
        return { status: result.status, count: result.body.repositories.length };
      });

      await record('tags for missing repository are rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/acr/v1/${repository}/_tags`, undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'RepositoryNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('manifest put without auth is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/v2/${repository}/manifests/${tag}`, manifestBody(), { host: loginServer });
        assert.equal(result.status, 401);
        assert.equal(errorCode(result), 'UNAUTHORIZED');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('manifest put invalid body is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/v2/${repository}/manifests/${tag}`, {}, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'MANIFEST_INVALID');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('manifest put succeeds for robotics controller image', async () => {
        const result = await httpDataPlaneJson(routerPort, 'PUT', `/v2/${repository}/manifests/${tag}`, manifestBody(), { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 201);
        assert.match(String(result.headers['docker-content-digest']), /^sha256:/);
        manifestDigest = result.headers['docker-content-digest'];
        return { status: result.status, digest: manifestDigest };
      });

      await record('manifest get by tag succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/v2/${repository}/manifests/${tag}`, undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.headers['docker-content-digest'], manifestDigest);
        assert.equal(result.body.schemaVersion, 2);
        return { status: result.status, digest: result.headers['docker-content-digest'] };
      });

      await record('manifest get by digest succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/v2/${repository}/manifests/${manifestDigest}`, undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.equal(result.headers['docker-content-digest'], manifestDigest);
        return { status: result.status, digest: result.headers['docker-content-digest'] };
      });

      await record('docker tags list includes pushed tag', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/v2/${repository}/tags/list`, undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.tags, [tag]);
        return { status: result.status, tags: result.body.tags };
      });

      await record('ACR catalog includes repository', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/acr/v1/_catalog', undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.repositories, [repository]);
        return { status: result.status, repositories: result.body.repositories };
      });

      await record('data-plane repeated catalog query remains stable across repeated reads', async () => {
        const first = await httpDataPlaneJson(routerPort, 'GET', '/acr/v1/_catalog', undefined, { host: loginServer, authorization: authHeader });
        const second = await httpDataPlaneJson(routerPort, 'GET', '/acr/v1/_catalog', undefined, { host: loginServer, authorization: authHeader });
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.deepEqual(second.body.repositories, first.body.repositories);
        return { status: second.status, repositories: second.body.repositories };
      });

      await record('ACR tags endpoint includes pushed tag', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/acr/v1/${repository}/_tags`, undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 200);
        assert.deepEqual(result.body.tags.map(item => item.name), [tag]);
        return { status: result.status, tags: result.body.tags.map(item => item.name) };
      });

      await record('inspection route exposes repositories', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/_globalstack/acr/registries/${registryName}/repositories`);
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.name === repository && item.tags.includes(tag)));
        return { status: result.status, count: result.body.value.length };
      });

      await record('manifest delete succeeds', async () => {
        const result = await httpDataPlaneJson(routerPort, 'DELETE', `/v2/${repository}/manifests/${tag}`, undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 202);
        return { status: result.status };
      });

      await record('manifest get after delete is not found', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', `/v2/${repository}/manifests/${tag}`, undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'RepositoryNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('ARM template deployment can create registry', async () => {
        const deploymentName = `acr-deploy-${suffix}`;
        const templateRegistry = `acrt${suffix}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
        const result = await httpJson(
          armPort,
          'PUT',
          `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
          registryDeploymentBody(templateRegistry),
        );
        assert.equal(result.status, 201);
        assert.equal(result.body.properties.provisioningState, 'Succeeded');
        assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/registries/${templateRegistry}`)));
        return { status: result.status, deploymentName };
      });

      await record('registry delete succeeds', async () => {
        const result = await httpJson(armPort, 'DELETE', providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath));
        assert.equal(result.status, 200);
        router.unregisterRegistry(registryName);
        return { status: result.status };
      });

      await record('registry get after delete is not found', async () => {
        const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ContainerRegistry', registryPath));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'ResourceNotFound');
        return { status: result.status, errorCode: errorCode(result) };
      });

      await record('data-plane request after registry delete is rejected', async () => {
        const result = await httpDataPlaneJson(routerPort, 'GET', '/v2/', undefined, { host: loginServer, authorization: authHeader });
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), 'RegistryNotFound');
        return { status: result.status, errorCode: errorCode(result) };
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
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    registryName,
    repository,
    tag,
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
    '# Azure Container Registry Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlAndDataPlane.total - report.controlAndDataPlane.failedCount}/${report.controlAndDataPlane.total}`,
    `- Registry under test: ${report.controlAndDataPlane.registryName}`,
    `- Repository under test: ${report.controlAndDataPlane.repository}`,
    `- Tag under test: ${report.controlAndDataPlane.tag}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlAndDataPlane.cases) {
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Container Registry ARM registry lifecycle, captured missing-SKU validation, local Docker Registry/ACR token, catalog, tag, manifest push/get/delete smoke paths, ARM-template deployment, and all-platform runner deployment paths. It does not mark Container Registry as 99%-complete or cloudValidated for ACR Tasks, webhooks, geo-replication, private endpoints, content trust, full Docker blob upload/download flows, repository attributes, RBAC scope maps, throttling, quarantine, signing, OCI referrers, or every live Azure validation edge.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlAndDataPlane = await runControlAndDataPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlAndDataPlane.ok && platformMatrix.ok,
  scope: 'Azure Container Registry ARM registry lifecycle, local Docker Registry/ACR manifest and catalog smoke, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Container Registry cloudValidated claim.',
  controlAndDataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Container Registry parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
