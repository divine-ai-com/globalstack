import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-identity-rbac-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const tenantId = process.env.GLOBALSTACK_AZURE_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
const clientId = process.env.GLOBALSTACK_AZURE_CLIENT_ID ?? '11111111-1111-1111-1111-111111111111';
const clientSecret = process.env.GLOBALSTACK_AZURE_CLIENT_SECRET ?? 'globalstack';
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

async function httpForm(port, path, fields) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
  const text = await response.text();
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: text ? JSON.parse(text) : null,
  };
}

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code ?? result.body?.Code ?? result.body?.error ?? null;
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

function identityPath(resourceGroup, identityName, apiVersion = '2023-01-31') {
  return providerPath(resourceGroup, 'Microsoft.ManagedIdentity', `userAssignedIdentities/${identityName}`, apiVersion);
}

function roleAssignmentPath(resourceGroup, roleAssignmentName, apiVersion = '2022-04-01') {
  return providerPath(resourceGroup, 'Microsoft.Authorization', `roleAssignments/${roleAssignmentName}`, apiVersion);
}

function roleDefinitionPath(resourceGroup, roleDefinitionName, apiVersion = '2022-04-01') {
  return providerPath(resourceGroup, 'Microsoft.Authorization', `roleDefinitions/${roleDefinitionName}`, apiVersion);
}

function identityBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: {},
    ...overrides,
  };
}

function roleAssignmentBody(resourceGroup, identityName, roleDefinitionName, overrides = {}) {
  return {
    properties: {
      principalId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${identityName}`,
      principalType: 'ServicePrincipal',
      roleDefinitionId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Authorization/roleDefinitions/${roleDefinitionName}`,
      ...overrides.properties,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function roleDefinitionBody(resourceGroup, roleDefinitionName, overrides = {}) {
  return {
    properties: {
      roleName: `globalstack-${roleDefinitionName}`,
      description: 'Local GlobalStack RBAC validation role.',
      type: 'CustomRole',
      permissions: [
        {
          actions: ['Microsoft.ManagedIdentity/userAssignedIdentities/read'],
          notActions: [],
        },
      ],
      assignableScopes: [`/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}`],
      ...overrides.properties,
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody(identityName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.ManagedIdentity/userAssignedIdentities',
            apiVersion: '2023-01-31',
            name: identityName,
            location: 'eastus',
            properties: {},
          },
        ],
        outputs: {
          identityName: { type: 'string', value: identityName },
        },
      },
    },
  };
}

async function runControlAndTokenMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-id-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-id-missing-${suffix}`;
  const identityName = `id-${suffix}`.slice(0, 40);
  const missingIdentityName = `missing-${suffix}`.slice(0, 40);
  const roleAssignmentName = '11111111-1111-4111-8111-111111111111';
  const roleDefinitionName = '22222222-2222-4222-8222-222222222222';

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

  await withArmServer(async (armPort) => {
    await record('openid configuration exposes local token endpoint', async () => {
      const result = await httpJson(armPort, 'GET', `/${tenantId}/v2.0/.well-known/openid-configuration`, undefined, { auth: false });
      assert.equal(result.status, 200);
      assert.ok(result.body.token_endpoint.endsWith(`/${tenantId}/oauth2/v2.0/token`));
      assert.equal(result.body.rbac_url, `http://127.0.0.1:${armPort}`);
      return { status: result.status, tokenEndpoint: result.body.token_endpoint };
    });

    await record('jwks route exposes deterministic empty key set', async () => {
      const result = await httpJson(armPort, 'GET', `/${tenantId}/discovery/v2.0/keys`, undefined, { auth: false });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.keys, []);
      return { status: result.status, count: result.body.keys.length };
    });

    await record('token request missing credentials is rejected', async () => {
      const result = await httpForm(armPort, `/${tenantId}/oauth2/v2.0/token`, { grant_type: 'client_credentials' });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'invalid_client');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('token request with wrong secret is rejected', async () => {
      const result = await httpForm(armPort, `/${tenantId}/oauth2/v2.0/token`, {
        client_id: clientId,
        client_secret: 'wrong-secret',
        grant_type: 'client_credentials',
      });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'invalid_client');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('token request with unsupported grant is rejected', async () => {
      const result = await httpForm(armPort, `/${tenantId}/oauth2/v2.0/token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'password',
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'unsupported_grant_type');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('token request for unknown tenant is rejected', async () => {
      const result = await httpForm(armPort, '/99999999-9999-9999-9999-999999999999/oauth2/v2.0/token', {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'invalid_tenant');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('token request issues local access token', async () => {
      const result = await httpForm(armPort, `/${tenantId}/oauth2/v2.0/token`, {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      });
      assert.equal(result.status, 200);
      assert.equal(result.body.token_type, 'Bearer');
      assert.equal(result.body.access_token, token);
      assert.ok(Number(result.body.expires_on) > Math.floor(Date.now() / 1000));
      return { status: result.status, tokenType: result.body.token_type };
    });

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
        providerPathWithoutApiVersion(resourceGroup, 'Microsoft.ManagedIdentity', `userAssignedIdentities/${identityName}`),
        identityBody(),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('managed identity create requires an existing resource group', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        identityPath(missingResourceGroup, identityName),
        identityBody(),
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), {
        location: 'eastus',
        tags: { purpose: 'globalstack-identity-rbac-parity', ttl: 'ephemeral' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.name, resourceGroup);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('managed identity collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ManagedIdentity', 'userAssignedIdentities', '2023-01-31'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('managed identity delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', identityPath(resourceGroup, missingIdentityName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('managed identity empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', identityPath(resourceGroup, identityName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('managed identity invalid location is rejected', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        identityPath(resourceGroup, identityName),
        identityBody({ location: 'globalstack-invalid-location' }),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('managed identity create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', identityPath(resourceGroup, identityName), identityBody({
        tags: { workload: 'mlops-managed-identity' },
      }));
      assert.equal(result.status, 201);
      assert.equal(result.body.type, 'Microsoft.ManagedIdentity/userAssignedIdentities');
      assert.equal(result.body.location, 'eastus');
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.globalstack.capabilityId, 'identity-rbac');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('managed identity get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', identityPath(resourceGroup, identityName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, identityName);
      assert.equal(result.body.tags.workload, 'mlops-managed-identity');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('managed identity update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', identityPath(resourceGroup, identityName), identityBody({
        tags: { workload: 'robotics-control-plane' },
      }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'robotics-control-plane');
      assert.equal(result.body.globalstack.capabilityId, 'identity-rbac');
      return { status: result.status, resourceId: result.body.id };
    });

    await record('managed identity list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ManagedIdentity', 'userAssignedIdentities', '2023-01-31'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === identityName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('managed identity unsupported associated resources action fails closed', async () => {
      const result = await httpJson(
        armPort,
        'POST',
        providerPath(resourceGroup, 'Microsoft.ManagedIdentity', `userAssignedIdentities/${identityName}/listAssociatedResources`, '2023-01-31'),
        {},
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'GlobalStackRouteNotImplemented');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role assignment collection list preserves captured not found', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Authorization', 'roleAssignments', '2022-04-01'));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'RoleAssignmentNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role assignment get preserves captured not found', async () => {
      const result = await httpJson(armPort, 'GET', roleAssignmentPath(resourceGroup, roleAssignmentName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'RoleAssignmentNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role assignment empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', roleAssignmentPath(resourceGroup, roleAssignmentName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MalformedRoleAssignmentRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role assignment missing principalId preserves captured rejection', async () => {
      const result = await httpJson(armPort, 'PUT', roleAssignmentPath(resourceGroup, roleAssignmentName), {
        properties: { roleDefinitionId: `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Authorization/roleDefinitions/${roleDefinitionName}` },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRequestContent');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role assignment missing roleDefinitionId preserves captured rejection', async () => {
      const result = await httpJson(armPort, 'PUT', roleAssignmentPath(resourceGroup, roleAssignmentName), {
        properties: { principalId: identityName },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRequestContent');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role assignment populated body remains capture-required rejection', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        roleAssignmentPath(resourceGroup, roleAssignmentName),
        roleAssignmentBody(resourceGroup, identityName, roleDefinitionName),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRequestContent');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role assignment delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', roleAssignmentPath(resourceGroup, roleAssignmentName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('role definition collection list preserves captured not found', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Authorization', 'roleDefinitions', '2022-04-01'));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'RoleDefinitionDoesNotExist');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role definition get preserves captured not found', async () => {
      const result = await httpJson(armPort, 'GET', roleDefinitionPath(resourceGroup, roleDefinitionName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'RoleDefinitionDoesNotExist');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role definition empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', roleDefinitionPath(resourceGroup, roleDefinitionName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidCreateRoleDefinitionRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role definition missing permissions preserves captured rejection', async () => {
      const result = await httpJson(armPort, 'PUT', roleDefinitionPath(resourceGroup, roleDefinitionName), {
        properties: { roleName: 'missing-permissions' },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRequestContent');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role definition missing assignableScopes preserves captured rejection', async () => {
      const result = await httpJson(armPort, 'PUT', roleDefinitionPath(resourceGroup, roleDefinitionName), {
        properties: {
          roleName: 'missing-assignable-scopes',
          permissions: [{ actions: ['Microsoft.ManagedIdentity/userAssignedIdentities/read'], notActions: [] }],
        },
      });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRequestContent');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role definition populated body remains capture-required rejection', async () => {
      const result = await httpJson(
        armPort,
        'PUT',
        roleDefinitionPath(resourceGroup, roleDefinitionName),
        roleDefinitionBody(resourceGroup, roleDefinitionName),
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRequestContent');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('role definition delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', roleDefinitionPath(resourceGroup, roleDefinitionName));
      assert.equal(result.status, 204);
      assert.equal(result.body, null);
      return { status: result.status };
    });

    await record('ARM template deployment can create managed identity', async () => {
      const deploymentName = `id-deploy-${suffix}`;
      const deploymentIdentity = `idd${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentIdentity),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/userAssignedIdentities/${deploymentIdentity}`)));
      return { status: result.status, deploymentName };
    });

    await record('managed identity delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', identityPath(resourceGroup, identityName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('managed identity get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', identityPath(resourceGroup, identityName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('managed identity list after delete excludes resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.ManagedIdentity', 'userAssignedIdentities', '2023-01-31'));
      assert.equal(result.status, 200);
      assert.ok(!result.body.value.some(item => item.name === identityName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('managed identity delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', identityPath(resourceGroup, identityName));
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
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    identityName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-identity-rbac-parity-local-token',
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
    '# Azure Identity And RBAC Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Token Plane',
    '',
    `- Passed: ${report.controlAndTokenPlane.total - report.controlAndTokenPlane.failedCount}/${report.controlAndTokenPlane.total}`,
    `- Managed identity under test: ${report.controlAndTokenPlane.identityName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlAndTokenPlane.cases) {
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
  lines.push('This run proves local GlobalStack handling for the listed local token issuance, OpenID discovery, Managed Identity ARM lifecycle, captured RBAC create-rejection cases, RBAC list/get/delete-not-found paths, ARM-template deployment path, and all-platform runner deployment paths. It does not mark identity/RBAC as 99%-complete or cloudValidated for full Microsoft Entra ID, OAuth flows, custom role creation, role assignment success, deny assignments, conditional access, graph APIs, token claims, managed identity endpoint behavior, propagation delays, or exact authorization decisions.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlAndTokenPlane = await runControlAndTokenMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlAndTokenPlane.ok && platformMatrix.ok,
  scope: 'Azure identity/RBAC local token service, Managed Identity ARM lifecycle, captured RBAC validation, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Microsoft Entra ID or Azure RBAC cloudValidated claim.',
  controlAndTokenPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure identity/RBAC parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
