import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createSynapseSqlRunner } from '../../packages/azure-data-plane/src/synapse-sql-runner.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-synapse-warehouse-parity');
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

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2021-06-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function workspacePath(resourceGroup, workspaceName, apiVersion = '2021-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}`, apiVersion);
}

function sqlPoolPath(resourceGroup, workspaceName, sqlPoolName, apiVersion = '2021-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}/sqlPools/${sqlPoolName}`, apiVersion);
}

function workspaceBody(workspaceName, overrides = {}) {
  return {
    location: 'eastus',
    identity: { type: 'SystemAssigned', ...(overrides.identity ?? {}) },
    tags: { workload: 'analytics-warehouse' },
    properties: {
      defaultDataLakeStorage: {
        accountUrl: `https://${workspaceName}lake.dfs.core.windows.net`,
        filesystem: 'lake',
      },
      publicNetworkAccess: 'Enabled',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['identity', 'properties'].includes(key))),
  };
}

function sqlPoolBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'DW100c', ...(overrides.sku ?? {}) },
    properties: {
      createMode: 'Default',
      collation: 'SQL_Latin1_General_CP1_CI_AS',
      maxSizeBytes: 268435456000,
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['sku', 'properties'].includes(key))),
  };
}

function deploymentBody(workspaceName, sqlPoolName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Synapse/workspaces',
            apiVersion: '2021-06-01',
            name: workspaceName,
            location: 'eastus',
            identity: { type: 'SystemAssigned' },
            properties: {
              defaultDataLakeStorage: {
                accountUrl: `https://${workspaceName}lake.dfs.core.windows.net`,
                filesystem: 'lake',
              },
              publicNetworkAccess: 'Enabled',
            },
          },
          {
            type: 'Microsoft.Synapse/workspaces/sqlPools',
            apiVersion: '2021-06-01',
            name: `${workspaceName}/${sqlPoolName}`,
            location: 'eastus',
            sku: { name: 'DW100c' },
            properties: {
              createMode: 'Default',
              collation: 'SQL_Latin1_General_CP1_CI_AS',
              maxSizeBytes: 268435456000,
            },
          },
        ],
        outputs: {
          workspaceName: { type: 'string', value: workspaceName },
          sqlPoolName: { type: 'string', value: sqlPoolName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const sqlRunner = createSynapseSqlRunner();
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-synapse-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-synapse-missing-${suffix}`;
  const workspaceName = `syn${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 32);
  const missingWorkspaceName = `synmissing${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 32);
  const sqlPoolName = `pool${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 32);
  const missingSqlPoolName = `poolmissing${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 32);

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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}`), workspaceBody(workspaceName));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workspace create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', workspacePath(missingResourceGroup, workspaceName), workspaceBody(workspaceName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-synapse-warehouse-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('workspace collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Synapse', 'workspaces'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('workspace delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', workspacePath(resourceGroup, missingWorkspaceName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('sql pool create before workspace reports missing parent', async () => {
      const result = await httpJson(armPort, 'PUT', sqlPoolPath(resourceGroup, missingWorkspaceName, sqlPoolName), sqlPoolBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('sql pool list before workspace reports missing parent', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${missingWorkspaceName}/sqlPools`));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['workspace empty body is rejected', workspaceName, {}, 'LocationRequired'],
      ['workspace invalid location is rejected', workspaceName, workspaceBody(workspaceName, { location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['workspace invalid name is rejected', `bad-${suffix}-`, workspaceBody(workspaceName), 'InvalidResourceName'],
      ['workspace captured minimal body is rejected with validation details', workspaceName, { location: 'eastus', properties: {} }, 'ValidationFailed'],
      ['workspace missing system identity is rejected', workspaceName, workspaceBody(workspaceName, { identity: { type: 'UserAssigned' } }), 'ValidationFailed'],
      ['workspace missing data lake storage is rejected', workspaceName, workspaceBody(workspaceName, { properties: { defaultDataLakeStorage: {} } }), 'ValidationFailed'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', workspacePath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('workspace create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', workspacePath(resourceGroup, workspaceName), workspaceBody(workspaceName));
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.properties.connectivityEndpoints.sql, `${workspaceName}.sql.azuresynapse.net`);
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('workspace get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', workspacePath(resourceGroup, workspaceName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, workspaceName);
      assert.equal(result.body.identity.type, 'SystemAssigned');
      return { status: result.status };
    });

    await record('workspace update can change tags', async () => {
      const result = await httpJson(armPort, 'PUT', workspacePath(resourceGroup, workspaceName), workspaceBody(workspaceName, { tags: { workload: 'analytics-warehouse', owner: 'mlops' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.owner, 'mlops');
      return { status: result.status };
    });

    await record('workspace list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Synapse', 'workspaces'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === workspaceName));
      return { status: result.status, count: result.body.value.length };
    });

    for (const [name, poolName, body, expectedCode] of [
      ['sql pool invalid name is rejected', `bad-${suffix}-`, sqlPoolBody(), 'InvalidResourceName'],
      ['sql pool missing sku is rejected', sqlPoolName, { location: 'eastus', properties: { createMode: 'Default' } }, 'InvalidSku'],
      ['sql pool invalid sku is rejected', sqlPoolName, sqlPoolBody({ sku: { name: 'DWInvalid' } }), 'InvalidSku'],
      ['sql pool invalid create mode is rejected', sqlPoolName, sqlPoolBody({ properties: { createMode: 'Copy' } }), 'InvalidParameterValue'],
      ['sql pool invalid max size is rejected', sqlPoolName, sqlPoolBody({ properties: { maxSizeBytes: -1 } }), 'InvalidParameterValue'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', sqlPoolPath(resourceGroup, workspaceName, poolName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('sql pool collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}/sqlPools`));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('sql pool delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', sqlPoolPath(resourceGroup, workspaceName, missingSqlPoolName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('sql pool create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', sqlPoolPath(resourceGroup, workspaceName, sqlPoolName), sqlPoolBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.status, 'Online');
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      sqlRunner.registerPool({ workspaceName, sqlPoolName, status: result.body.properties.status });
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('sql pool get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', sqlPoolPath(resourceGroup, workspaceName, sqlPoolName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, `${workspaceName}/${sqlPoolName}`);
      assert.equal(result.body.sku.name, 'DW100c');
      return { status: result.status };
    });

    await record('sql pool update can change sku', async () => {
      const result = await httpJson(armPort, 'PUT', sqlPoolPath(resourceGroup, workspaceName, sqlPoolName), sqlPoolBody({ sku: { name: 'DW200c' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.sku.name, 'DW200c');
      return { status: result.status };
    });

    await record('sql pool list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}/sqlPools`));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${workspaceName}/${sqlPoolName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('local synapse sql runner missing pool is not found', async () => {
      const result = sqlRunner.execute({
        workspaceName,
        sqlPoolName: missingSqlPoolName,
        sql: 'SELECT COUNT(*) AS row_count FROM dbo.Telemetry',
      });
      assert.equal(result.error.status, 404);
      assert.equal(result.error.code, 'SqlPoolNotFound');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local synapse sql runner creates table', async () => {
      const result = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'CREATE TABLE dbo.Telemetry (id INT, reading FLOAT, status NVARCHAR(32))',
      });
      assert.equal(result.status, 201);
      assert.deepEqual(result.body.columns.map(column => column.name), ['id', 'reading', 'status']);
      return { status: result.status, columnCount: result.body.columns.length };
    });

    await record('local synapse sql runner duplicate table is rejected', async () => {
      const result = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'CREATE TABLE dbo.Telemetry (id INT, reading FLOAT, status NVARCHAR(32))',
      });
      assert.equal(result.error.status, 409);
      assert.equal(result.error.code, 'TableAlreadyExists');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local synapse sql runner inserts and selects rows', async () => {
      const firstInsert = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: "INSERT INTO dbo.Telemetry (id, reading, status) VALUES (2, 43.5, 'warm')",
      });
      assert.equal(firstInsert.status, 201);
      const secondInsert = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: "INSERT INTO dbo.Telemetry (id, reading, status) VALUES (1, 41.5, 'ok')",
      });
      assert.equal(secondInsert.status, 201);
      const count = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'SELECT COUNT(*) AS row_count FROM dbo.Telemetry',
      });
      assert.equal(count.status, 200);
      assert.equal(count.body.rows[0].row_count, 2);
      const rows = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'SELECT * FROM dbo.Telemetry ORDER BY id',
      });
      assert.equal(rows.status, 200);
      assert.deepEqual(rows.body.rows.map(row => row.id), [1, 2]);
      return { status: rows.status, rowCount: rows.body.rows.length };
    });

    await record('local synapse sql runner repeated select remains stable across repeated reads', async () => {
      const first = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'SELECT * FROM dbo.Telemetry ORDER BY id',
      });
      assert.equal(first.status, 200);
      const second = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'SELECT * FROM dbo.Telemetry ORDER BY id',
      });
      assert.equal(second.status, 200);
      assert.deepEqual(second.body.rows, first.body.rows);
      return { status: second.status, rowCount: second.body.rows.length };
    });

    await record('local synapse sql runner unknown insert column is rejected', async () => {
      const result = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: "INSERT INTO dbo.Telemetry (id, missing_column) VALUES (3, 'bad')",
      });
      assert.equal(result.error.status, 400);
      assert.equal(result.error.code, 'InvalidColumnName');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local synapse sql runner unknown table is rejected', async () => {
      const result = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'SELECT COUNT(*) FROM dbo.MissingTelemetry',
      });
      assert.equal(result.error.status, 404);
      assert.equal(result.error.code, 'TableNotFound');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('local synapse sql runner unsupported sql is rejected', async () => {
      const result = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'MERGE dbo.Telemetry AS target USING dbo.Source AS source ON target.id = source.id WHEN MATCHED THEN UPDATE SET reading = source.reading',
      });
      assert.equal(result.error.status, 400);
      assert.equal(result.error.code, 'UnsupportedSqlStatement');
      return { status: result.error.status, errorCode: result.error.code };
    });

    for (const [name, method, path] of [
      ['unsupported workspace firewall rule route fails closed', 'PUT', providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}/firewallRules/allow-${suffix}`)],
      ['unsupported workspace administrator route fails closed', 'PUT', providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}/administrators/activeDirectory`)],
      ['unsupported sql pool pause action fails closed', 'POST', providerPath(resourceGroup, 'Microsoft.Synapse', `workspaces/${workspaceName}/sqlPools/${sqlPoolName}/pause`)],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, method, path, method === 'GET' ? undefined : {});
        assert.equal(result.status, 501);
        assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create workspace and sql pool', async () => {
      const deploymentName = `synapse-deploy-${suffix}`;
      const deploymentWorkspace = `syndeploy${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 32);
      const deploymentPool = `pooldeploy${suffix}`.replace(/[^a-z0-9-]/g, '').slice(0, 32);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentWorkspace, deploymentPool),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/workspaces/${deploymentWorkspace}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/workspaces/${deploymentWorkspace}/sqlPools/${deploymentPool}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('sql pool delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', sqlPoolPath(resourceGroup, workspaceName, sqlPoolName));
      assert.equal(result.status, 200);
      sqlRunner.unregisterPool({ workspaceName, sqlPoolName });
      return { status: result.status };
    });

    await record('local synapse sql runner removes deleted pool', async () => {
      const result = sqlRunner.execute({
        workspaceName,
        sqlPoolName,
        sql: 'SELECT COUNT(*) AS row_count FROM dbo.Telemetry',
      });
      assert.equal(result.error.status, 404);
      assert.equal(result.error.code, 'SqlPoolNotFound');
      return { status: result.error.status, errorCode: result.error.code };
    });

    await record('sql pool get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', sqlPoolPath(resourceGroup, workspaceName, sqlPoolName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('workspace delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', workspacePath(resourceGroup, workspaceName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('workspace get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', workspacePath(resourceGroup, workspaceName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  const dataPlaneCaseNames = new Set([
    'local synapse sql runner missing pool is not found',
    'local synapse sql runner creates table',
    'local synapse sql runner duplicate table is rejected',
    'local synapse sql runner inserts and selects rows',
    'local synapse sql runner repeated select remains stable across repeated reads',
    'local synapse sql runner unknown insert column is rejected',
    'local synapse sql runner unknown table is rejected',
    'local synapse sql runner unsupported sql is rejected',
    'local synapse sql runner removes deleted pool',
  ]);
  const dataPlaneCases = cases.filter(item => dataPlaneCaseNames.has(item.name));
  const dataPlaneFailed = dataPlaneCases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    workspaceName,
    sqlPoolName,
    cases,
    dataPlane: {
      ok: dataPlaneFailed.length === 0,
      total: dataPlaneCases.length,
      failedCount: dataPlaneFailed.length,
      cases: dataPlaneCases,
    },
  };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return { ok: true, skipped: true, reason: '--skip-platforms was provided', expectedPlatforms: azurePlatforms.length, results: [] };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-synapse-warehouse-parity-local-token',
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
    '# Azure Synapse Warehouse Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Workspace under test: ${report.controlPlane.workspaceName}`,
    `- SQL pool under test: ${report.controlPlane.sqlPoolName}`,
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
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Synapse workspace and dedicated SQL pool ARM lifecycle, stricter parameter rejection, captured minimal-workspace validation behavior, bounded local SQL runner table/insert/select/error behavior, unsupported child/action routes failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark distributed query execution, MPP optimizer behavior, workspace networking, data lake integration, pause/resume, RBAC, private link, firewall behavior, or exact Azure SQL data-plane behavior as cloudValidated.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && controlPlane.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Synapse workspace and dedicated SQL pool ARM lifecycle, validation, bounded local SQL runner checks, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Synapse Analytics cloudValidated or distributed SQL parity claim.',
  controlPlane,
  dataPlane: controlPlane.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Synapse Warehouse parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
