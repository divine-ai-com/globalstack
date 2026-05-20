import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import { createServiceDiscoveryRegistry } from '../packages/azure-data-plane/src/service-discovery-registry.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-service-discovery-parity');
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
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124 });
    }, options.timeoutMs ?? 900000);
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

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code ?? result.body?.Code ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2023-05-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function privateDnsZonePath(resourceGroup, zoneName, apiVersion = '2020-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${zoneName}`, apiVersion);
}

function environmentPath(resourceGroup, environmentName, apiVersion = '2023-05-01') {
  return providerPath(resourceGroup, 'Microsoft.App', `managedEnvironments/${environmentName}`, apiVersion);
}

function containerAppPath(resourceGroup, appName, apiVersion = '2023-05-01') {
  return providerPath(resourceGroup, 'Microsoft.App', `containerApps/${appName}`, apiVersion);
}

function zoneBody(overrides = {}) {
  return {
    location: 'global',
    properties: { ...(overrides.properties ?? {}) },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function environmentBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: {
      zoneRedundant: false,
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function containerAppBody(environmentId, overrides = {}) {
  return {
    location: 'eastus',
    properties: {
      managedEnvironmentId: environmentId,
      configuration: {
        ingress: {
          external: false,
          targetPort: 8080,
        },
      },
      template: {
        containers: [
          {
            name: 'api',
            image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest',
            resources: { cpu: 0.25, memory: '0.5Gi' },
          },
        ],
        scale: { minReplicas: 0, maxReplicas: 2 },
      },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody({ zoneName, environmentName, appName, resourceGroup }) {
  const environmentId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.App/managedEnvironments/${environmentName}`;
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Network/privateDnsZones',
            apiVersion: '2020-06-01',
            name: zoneName,
            location: 'global',
            properties: {},
          },
          {
            type: 'Microsoft.App/managedEnvironments',
            apiVersion: '2023-05-01',
            name: environmentName,
            location: 'eastus',
            properties: { zoneRedundant: false },
          },
          {
            type: 'Microsoft.App/containerApps',
            apiVersion: '2023-05-01',
            name: appName,
            location: 'eastus',
            properties: containerAppBody(environmentId).properties,
          },
        ],
        outputs: {
          appName: { type: 'string', value: appName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-svcdisc-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-svcdisc-missing-${suffix}`;
  const zoneName = `svc-${suffix}.internal.test`;
  const environmentName = `env-${suffix}`;
  const missingEnvironmentName = `env-missing-${suffix}`;
  const appName = `app-${suffix}`;
  const environmentId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.App/managedEnvironments/${environmentName}`;
  const missingEnvironmentId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.App/managedEnvironments/${missingEnvironmentName}`;
  const discoveryRegistry = createServiceDiscoveryRegistry();

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      cases.push({ name, ok: true, durationMs: Date.now() - startedAt, ...detail });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({ name, ok: false, durationMs: Date.now() - startedAt, error: error?.stack ?? String(error) });
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  await withArmServer(async (armPort) => {
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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.App', `managedEnvironments/${environmentName}`), environmentBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('managed environment create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', environmentPath(missingResourceGroup, environmentName), environmentBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-service-discovery-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('private dns zone create is accepted asynchronously', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(resourceGroup, zoneName), zoneBody());
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      return { status: result.status, asyncOperation: result.headers['azure-asyncoperation'] };
    });

    await record('private dns zone operation status succeeds', async () => {
      const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/operationStatuses/dns-zone-ready?api-version=2022-09-01`);
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Succeeded');
      return { status: result.status, provisioningState: result.body.status };
    });

    await record('private dns zone get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', privateDnsZonePath(resourceGroup, zoneName));
      assert.equal(result.status, 200);
      assert.equal(result.body.type, 'Microsoft.Network/privateDnsZones');
      discoveryRegistry.registerPrivateDnsRecord({ fqdn: `api.${zoneName}`, values: ['10.0.0.4'] });
      return { status: result.status };
    });

    await record('local private dns registry resolves registered service', async () => {
      const result = discoveryRegistry.resolvePrivateDns(`api.${zoneName}`);
      assert.equal(result.status, 'NOERROR');
      assert.deepEqual(result.values, ['10.0.0.4']);
      return { status: result.status, values: result.values.join(',') };
    });

    await record('local private dns registry returns nxdomain for missing service', async () => {
      const result = discoveryRegistry.resolvePrivateDns(`missing.${zoneName}`);
      assert.equal(result.status, 'NXDOMAIN');
      assert.deepEqual(result.values, []);
      return { status: result.status };
    });

    await record('managed environment collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.App', 'managedEnvironments'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('container app create before managed environment is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', containerAppPath(resourceGroup, appName), containerAppBody(missingEnvironmentId));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ManagedEnvironmentNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, body, expectedCode] of [
      ['managed environment empty body is rejected', {}, 'LocationRequired'],
      ['managed environment invalid location is rejected', environmentBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', environmentPath(resourceGroup, environmentName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('managed environment create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', environmentPath(resourceGroup, environmentName), environmentBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.defaultDomain.endsWith('.globalstack.local'));
      return { status: result.status, defaultDomain: result.body.properties.defaultDomain };
    });

    await record('managed environment get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', environmentPath(resourceGroup, environmentName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, environmentName);
      return { status: result.status };
    });

    await record('managed environment list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.App', 'managedEnvironments'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === environmentName));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, body, expectedCode] of [
      ['container app empty body is rejected', {}, 'LocationRequired'],
      ['container app invalid location is rejected', containerAppBody(environmentId, { location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['container app missing containers is rejected', { location: 'eastus', properties: { managedEnvironmentId: environmentId, template: { containers: [] } } }, 'ContainerAppCreateMustContainContainer'],
      ['container app missing managed environment id is rejected', containerAppBody(environmentId, { properties: { managedEnvironmentId: undefined } }), 'ContainerAppManagedEnvironmentRequired'],
      ['container app invalid scale is rejected', containerAppBody(environmentId, { properties: { template: { containers: [{ name: 'api', image: 'nginx' }], scale: { minReplicas: 3, maxReplicas: 1 } } } }), 'InvalidParameterValue'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', containerAppPath(resourceGroup, appName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('container app collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.App', 'containerApps'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('container app create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', containerAppPath(resourceGroup, appName), containerAppBody(environmentId));
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.configuration.ingress.fqdn.endsWith('.globalstack.local'));
      discoveryRegistry.registerContainerApp({
        appName,
        environmentName,
        fqdn: result.body.properties.configuration.ingress.fqdn,
        targetPort: result.body.properties.configuration.ingress.targetPort,
        external: result.body.properties.configuration.ingress.external,
      });
      return { status: result.status, fqdn: result.body.properties.configuration.ingress.fqdn };
    });

    await record('local container app registry resolves fqdn', async () => {
      const created = await httpJson(armPort, 'GET', containerAppPath(resourceGroup, appName));
      const result = discoveryRegistry.resolveContainerApp(created.body.properties.configuration.ingress.fqdn);
      assert.equal(result.status, 200);
      assert.equal(result.body.appName, appName);
      assert.equal(result.body.environmentName, environmentName);
      assert.equal(result.body.targetPort, 8080);
      return { status: result.status, targetPort: result.body.targetPort };
    });

    await record('local container app registry missing fqdn is not found', async () => {
      const result = discoveryRegistry.resolveContainerApp(`missing.${environmentName}.globalstack.local`);
      assert.equal(result.status, 404);
      assert.equal(result.code, 'ServiceNotFound');
      return { status: result.status, errorCode: result.code };
    });

    await record('container app get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', containerAppPath(resourceGroup, appName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, appName);
      return { status: result.status };
    });

    await record('container app update can change scale', async () => {
      const result = await httpJson(armPort, 'PUT', containerAppPath(resourceGroup, appName), containerAppBody(environmentId, { properties: { template: { containers: [{ name: 'api', image: 'nginx' }], scale: { minReplicas: 1, maxReplicas: 3 } } } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.template.scale.maxReplicas, 3);
      return { status: result.status };
    });

    await record('container app list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.App', 'containerApps'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === appName));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, method, path] of [
      ['unsupported container app revisions route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.App', `containerApps/${appName}/revisions`)],
      ['unsupported container app auth config route fails closed', 'PUT', providerPath(resourceGroup, 'Microsoft.App', `containerApps/${appName}/authConfigs/current`)],
      ['unsupported managed environment certificate route fails closed', 'GET', providerPath(resourceGroup, 'Microsoft.App', `managedEnvironments/${environmentName}/certificates`)],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, method === 'GET' ? undefined : {});
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create service discovery resources', async () => {
      const deploymentName = `svcdisc-deploy-${suffix}`;
      const deploymentEnvironment = `env-deploy-${suffix}`;
      const deploymentApp = `app-deploy-${suffix}`;
      const deploymentZone = `deploy-${suffix}.internal.test`;
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({ zoneName: deploymentZone, environmentName: deploymentEnvironment, appName: deploymentApp, resourceGroup }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/managedEnvironments/${deploymentEnvironment}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/containerApps/${deploymentApp}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('container app delete succeeds', async () => {
      const existing = await httpJson(armPort, 'GET', containerAppPath(resourceGroup, appName));
      const result = await httpJson(armPort, 'DELETE', containerAppPath(resourceGroup, appName));
      assert.equal(result.status, 200);
      discoveryRegistry.unregisterContainerApp(existing.body.properties.configuration.ingress.fqdn);
      return { status: result.status };
    });

    await record('local container app registry removes deleted fqdn', async () => {
      const result = discoveryRegistry.resolveContainerApp(`${appName}.${environmentName}.globalstack.local`);
      assert.equal(result.status, 404);
      assert.equal(result.code, 'ServiceNotFound');
      return { status: result.status, errorCode: result.code };
    });

    await record('container app get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', containerAppPath(resourceGroup, appName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('managed environment delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', environmentPath(resourceGroup, environmentName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('private dns zone delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', privateDnsZonePath(resourceGroup, zoneName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return { ok: failed.length === 0, total: cases.length, failedCount: failed.length, resourceGroup, environmentName, appName, zoneName, cases };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return { ok: true, skipped: true, reason: '--skip-platforms was provided', expectedPlatforms: azurePlatforms.length, results: [] };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-service-discovery-parity-local-token',
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
    '# Azure Service Discovery Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Managed environment under test: ${report.controlPlane.environmentName}`,
    `- Container app under test: ${report.controlPlane.appName}`,
    `- Private DNS zone under test: ${report.controlPlane.zoneName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Platform Matrix');
  lines.push('');
  if (report.platformMatrix.skipped) {
    lines.push(`- Skipped: ${report.platformMatrix.reason}`);
  } else {
    lines.push(`- Passed: ${report.platformMatrix.passedCount}/${report.platformMatrix.expectedPlatforms}`);
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Private DNS zone, Container Apps managed environment, Container App ARM lifecycle, local DNS and Container App FQDN discovery checks, managed-environment reference checks, stricter container/scale rejection, unsupported child/action routes failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark service mesh behavior, revision traffic splitting, DNS propagation, health-aware discovery, private resolver behavior, Dapr, mTLS, or exact Container Apps runtime behavior as cloudValidated.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Service Discovery via Private DNS and Container Apps ARM lifecycle, local DNS and Container App FQDN discovery checks, validation, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure service discovery or Container Apps runtime cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Service Discovery parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
