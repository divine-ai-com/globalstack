import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import { createMigrationPlanRunner } from '../packages/azure-data-plane/src/migration-plan-runner.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-database-migration-service-parity');
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2022-03-30-preview') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function servicePath(resourceGroup, serviceName, apiVersion = '2022-03-30-preview') {
  return providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}`, apiVersion);
}

function projectPath(resourceGroup, serviceName, projectName, apiVersion = '2022-03-30-preview') {
  return providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects/${projectName}`, apiVersion);
}

function serviceBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Premium_4vCores', ...(overrides.sku ?? {}) },
    tags: { workload: 'database-migration' },
    properties: {
      publicNetworkAccess: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['sku', 'properties'].includes(key))),
  };
}

function projectBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: {
      sourcePlatform: 'SQL',
      targetPlatform: 'SQL',
      sourceConnectionInfo: { serverName: 'source.local', authentication: 'SqlAuthentication' },
      targetConnectionInfo: { serverName: 'target.local', authentication: 'SqlAuthentication' },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody(serviceName, projectName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.DataMigration/services',
            apiVersion: '2022-03-30-preview',
            name: serviceName,
            location: 'eastus',
            sku: { name: 'Premium_4vCores' },
            properties: { publicNetworkAccess: 'Enabled' },
          },
          {
            type: 'Microsoft.DataMigration/services/projects',
            apiVersion: '2022-03-30-preview',
            name: `${serviceName}/${projectName}`,
            location: 'eastus',
            properties: {
              sourcePlatform: 'SQL',
              targetPlatform: 'SQL',
              sourceConnectionInfo: { serverName: 'source.local' },
              targetConnectionInfo: { serverName: 'target.local' },
            },
          },
        ],
        outputs: {
          serviceName: { type: 'string', value: serviceName },
          projectName: { type: 'string', value: projectName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-dms-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-dms-missing-${suffix}`;
  const serviceName = `dms-${suffix}`;
  const missingServiceName = `dms-missing-${suffix}`;
  const projectName = `proj-${suffix}`;
  const missingProjectName = `proj-missing-${suffix}`;
  const migrationRunner = createMigrationPlanRunner();

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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}`), serviceBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('migration service create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', servicePath(missingResourceGroup, serviceName), serviceBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-dms-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('migration service collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DataMigration', 'services'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('migration service delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', servicePath(resourceGroup, missingServiceName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('migration project create before service reports missing parent', async () => {
      const result = await httpJson(armPort, 'PUT', projectPath(resourceGroup, missingServiceName, projectName), projectBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('migration project list before service reports missing parent', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${missingServiceName}/projects`));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['migration service empty body is rejected', serviceName, {}, 'LocationRequired'],
      ['migration service invalid location is rejected', serviceName, serviceBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['migration service invalid name is rejected', `bad-${suffix}-`, serviceBody(), 'InvalidResourceName'],
      ['migration service invalid sku is rejected', serviceName, serviceBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } }), 'InvalidSku'],
      ['migration service invalid public access is rejected', serviceName, serviceBody({ properties: { publicNetworkAccess: 'PrivateOnly' } }), 'InvalidParameterValue'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', servicePath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('migration service create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', servicePath(resourceGroup, serviceName), serviceBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('migration service get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', servicePath(resourceGroup, serviceName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, serviceName);
      return { status: result.status };
    });

    await record('migration service update can disable public access', async () => {
      const result = await httpJson(armPort, 'PUT', servicePath(resourceGroup, serviceName), serviceBody({ properties: { publicNetworkAccess: 'Disabled' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.publicNetworkAccess, 'Disabled');
      return { status: result.status };
    });

    await record('migration service list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DataMigration', 'services'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === serviceName));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['migration project invalid name is rejected', `bad-${suffix}-`, projectBody(), 'InvalidResourceName'],
      ['migration project missing source platform is rejected', projectName, projectBody({ properties: { sourcePlatform: undefined } }), 'InvalidProjectProperties'],
      ['migration project invalid source platform is rejected', projectName, projectBody({ properties: { sourcePlatform: 'Oracle' } }), 'InvalidProjectProperties'],
      ['migration project invalid target platform is rejected', projectName, projectBody({ properties: { targetPlatform: 'Oracle' } }), 'InvalidProjectProperties'],
      ['migration project invalid source connection shape is rejected', projectName, projectBody({ properties: { sourceConnectionInfo: 'source' } }), 'InvalidProjectProperties'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', projectPath(resourceGroup, serviceName, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('migration project collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects`));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('migration project delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', projectPath(resourceGroup, serviceName, missingProjectName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('migration project create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', projectPath(resourceGroup, serviceName, projectName), projectBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.migrationState, 'Ready');
      migrationRunner.registerProject({ serviceName, projectName, properties: result.body.properties });
      return { status: result.status, migrationState: result.body.properties.migrationState };
    });

    await record('local migration runner missing project is not found', async () => {
      const result = migrationRunner.start({
        serviceName,
        projectName: missingProjectName,
        sourceDatabase: 'sourceDb',
        targetDatabase: 'targetDb',
      });
      assert.equal(result.error.status, 404);
      assert.equal(result.error.code, 'ProjectNotFound');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local migration runner rejects incomplete task', async () => {
      const result = migrationRunner.start({
        serviceName,
        projectName,
        sourceDatabase: 'sourceDb',
      });
      assert.equal(result.error.status, 400);
      assert.equal(result.error.code, 'InvalidMigrationTask');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local migration runner starts assessment task', async () => {
      const result = migrationRunner.start({
        serviceName,
        projectName,
        taskType: 'Assessment',
        sourceDatabase: 'sourceDb',
        targetDatabase: 'targetDb',
      });
      assert.equal(result.status, 202);
      assert.equal(result.body.status, 'Running');
      const fetched = migrationRunner.get(result.body.id);
      assert.equal(fetched.status, 200);
      assert.equal(fetched.body.taskType, 'Assessment');
      return { status: result.status, runId: result.body.id, runStatus: result.body.status };
    });

    await record('local migration runner completes task and rejects duplicate completion', async () => {
      const started = migrationRunner.start({
        serviceName,
        projectName,
        taskType: 'Migration',
        sourceDatabase: 'sourceDb',
        targetDatabase: 'targetDb',
      });
      assert.equal(started.status, 202);
      const completed = migrationRunner.complete(started.body.id);
      assert.equal(completed.status, 200);
      assert.equal(completed.body.status, 'Succeeded');
      const duplicate = migrationRunner.complete(started.body.id);
      assert.equal(duplicate.error.status, 409);
      assert.equal(duplicate.error.code, 'InvalidMigrationRunState');
      return { status: completed.status, runId: started.body.id, runStatus: completed.body.status };
    });

    await record('migration project get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', projectPath(resourceGroup, serviceName, projectName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, `${serviceName}/${projectName}`);
      return { status: result.status };
    });

    await record('migration project update can change target platform', async () => {
      const result = await httpJson(armPort, 'PUT', projectPath(resourceGroup, serviceName, projectName), projectBody({ properties: { sourcePlatform: 'MySQL', targetPlatform: 'PostgreSQL' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.targetPlatform, 'PostgreSQL');
      return { status: result.status };
    });

    await record('migration project list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects`));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${serviceName}/${projectName}`));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, method, path] of [
      ['unsupported service add worker action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/addWorker`)],
      ['unsupported service check status action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/checkStatus`)],
      ['unsupported project task route fails closed', 'PUT', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects/${projectName}/tasks/task-${suffix}`)],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, {});
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create migration service and project', async () => {
      const deploymentName = `dms-deploy-${suffix}`;
      const deploymentService = `dms-deploy-${suffix}`;
      const deploymentProject = `proj-deploy-${suffix}`;
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentService, deploymentProject),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/services/${deploymentService}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/services/${deploymentService}/projects/${deploymentProject}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('migration project delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', projectPath(resourceGroup, serviceName, projectName));
      assert.equal(result.status, 200);
      migrationRunner.unregisterProject({ serviceName, projectName });
      return { status: result.status };
    });

    await record('migration project get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', projectPath(resourceGroup, serviceName, projectName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('migration service delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', servicePath(resourceGroup, serviceName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('migration service get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', servicePath(resourceGroup, serviceName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return { ok: failed.length === 0, total: cases.length, failedCount: failed.length, resourceGroup, serviceName, projectName, cases };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return { ok: true, skipped: true, reason: '--skip-platforms was provided', expectedPlatforms: azurePlatforms.length, results: [] };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-database-migration-service-parity-local-token',
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
    '# Azure Database Migration Service Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Service under test: ${report.controlPlane.serviceName}`,
    `- Project under test: ${report.controlPlane.projectName}`,
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
  lines.push('This run proves local GlobalStack handling for Database Migration Service and project ARM lifecycle, bounded local migration task state checks, stricter migration-plan metadata rejection, unsupported child/action routes failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark live migration execution, CDC, schema conversion, network tunnel behavior, source/target authentication, full task state machines, retry timing, or exact Azure DMS runtime behavior as cloudValidated.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Database Migration Service and project ARM lifecycle, bounded local migration task state checks, validation, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure DMS cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Database Migration Service parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
