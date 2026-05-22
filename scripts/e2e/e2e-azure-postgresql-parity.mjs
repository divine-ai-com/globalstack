import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-postgresql-parity');
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

function runOutput(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124, stdout, stderr });
    }, options.timeoutMs ?? 120000);
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function docker(args, options = {}) {
  const result = await runOutput('docker', args, options);
  if (result.code !== 0 && /permission denied|connect to the docker api/i.test(`${result.stderr}\n${result.stdout}`)) {
    return runOutput('sudo', ['docker', ...args], options);
  }
  return result;
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

async function withLocalPostgres(fn) {
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const containerName = `globalstack-postgresql-${suffix}`;
  const runResult = await docker([
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-e',
    'POSTGRES_USER=globalstack',
    '-e',
    'POSTGRES_PASSWORD=globalstack',
    '-e',
    'POSTGRES_DB=postgres',
    'postgres:16-alpine',
  ], { timeoutMs: 180000 });
  if (runResult.code !== 0) {
    throw new Error(`failed to start local PostgreSQL backing container: ${runResult.stderr || runResult.stdout}`);
  }

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await docker(['exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'globalstack', '-d', 'postgres'], { timeoutMs: 10000 });
      if (ready.code === 0) return await fn({ containerName });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('local PostgreSQL backing container did not become ready in time');
  } finally {
    await docker(['rm', '-f', containerName], { timeoutMs: 60000 });
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

function serverPath(resourceGroup, serverName, apiVersion = '2023-06-01-preview') {
  return providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}`, apiVersion);
}

function databasePath(resourceGroup, serverName, databaseName, apiVersion = '2023-06-01-preview') {
  return providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}/databases/${databaseName}`, apiVersion);
}

function serverBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'ai-mlops-postgres' },
    sku: {
      name: 'Standard_B1ms',
      tier: 'Burstable',
      ...(overrides.sku ?? {}),
    },
    properties: {
      administratorLogin: 'globalstack',
      administratorLoginPassword: 'Globalstack1!',
      version: '16',
      storage: { storageSizeGB: 32 },
      backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function databaseBody(overrides = {}) {
  return {
    properties: {
      charset: 'UTF8',
      collation: 'en_US.utf8',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function quoteIdentifier(name) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return `"${name}"`;
  return `"${String(name).replaceAll('"', '""')}"`;
}

async function psql(containerName, sql, options = {}) {
  const result = await docker([
    'exec',
    '-e',
    `PGPASSWORD=${options.password ?? 'globalstack'}`,
    containerName,
    'psql',
    '-h',
    '127.0.0.1',
    '-U',
    options.user ?? 'globalstack',
    '-d',
    options.database ?? 'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-tAc',
    sql,
  ], { timeoutMs: options.timeoutMs ?? 120000 });
  if ((options.expectCode ?? 0) === 0 && result.code !== 0) {
    throw new Error(`psql failed (${result.code}): ${result.stderr || result.stdout}`);
  }
  return result;
}

function deploymentBody({ serverName, databaseName }) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.DBforPostgreSQL/flexibleServers',
            apiVersion: '2023-06-01-preview',
            name: serverName,
            location: 'eastus',
            sku: serverBody().sku,
            properties: serverBody().properties,
          },
          {
            type: 'Microsoft.DBforPostgreSQL/flexibleServers/databases',
            apiVersion: '2023-06-01-preview',
            name: `${serverName}/${databaseName}`,
            properties: databaseBody().properties,
          },
        ],
        outputs: {
          serverName: { type: 'string', value: serverName },
          databaseName: { type: 'string', value: databaseName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-pg-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-pg-missing-${suffix}`;
  const serverName = `pg-${suffix}`.slice(0, 40);
  const missingServerName = `pg-missing-${suffix}`.slice(0, 40);
  const databaseName = `appdb${suffix.replace(/[^a-z0-9]/g, '')}`.slice(0, 32);
  const missingDatabaseName = `missingdb${suffix.replace(/[^a-z0-9]/g, '')}`.slice(0, 40);

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

  await withLocalPostgres(async ({ containerName }) => {
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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}`), serverBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(missingResourceGroup, serverName), serverBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-postgresql-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('database create with missing server reports resource not found', async () => {
      const result = await httpJson(armPort, 'PUT', databasePath(resourceGroup, missingServerName, databaseName), databaseBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', 'flexibleServers', '2023-06-01-preview'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('server delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', serverPath(resourceGroup, missingServerName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('server empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody({ location: 'globalstack-invalid-location' }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server invalid name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, 'Bad_Server'), serverBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameterValue');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server invalid sku is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody({ sku: { name: 'GlobalStack_InvalidSku_For_Conformance' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingRequiredParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server missing administrator login is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody({ properties: { administratorLogin: '' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingRequiredParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server missing administrator password is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody({ properties: { administratorLoginPassword: '' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingRequiredParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server weak administrator password is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody({ properties: { administratorLoginPassword: 'short' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameterValue');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server invalid version is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody({ properties: { version: '9.6' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameterValue');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.name, serverName);
      assert.equal(result.body.properties.fullyQualifiedDomainName, `${serverName}.postgres.database.azure.com`);
      return { status: result.status, fqdn: result.body.properties.fullyQualifiedDomainName };
    });

    await record('server get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', serverPath(resourceGroup, serverName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.version, '16');
      return { status: result.status };
    });

    await record('server update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', serverPath(resourceGroup, serverName), serverBody({ tags: { workload: 'updated-postgresql' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'updated-postgresql');
      assert.equal(result.body.properties.fullyQualifiedDomainName, `${serverName}.postgres.database.azure.com`);
      return { status: result.status };
    });

    await record('database missing charset is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', databasePath(resourceGroup, serverName, databaseName), databaseBody({ properties: { charset: '' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingRequiredParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('database missing collation is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', databasePath(resourceGroup, serverName, databaseName), databaseBody({ properties: { collation: '' } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingRequiredParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('database invalid name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', databasePath(resourceGroup, serverName, '1bad'), databaseBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidParameterValue');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('database create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', databasePath(resourceGroup, serverName, databaseName), databaseBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.name, `${serverName}/${databaseName}`);
      return { status: result.status };
    });

    await record('local postgres backing database can be created', async () => {
      const result = await psql(containerName, `CREATE DATABASE ${quoteIdentifier(databaseName)}`);
      assert.equal(result.code, 0);
      return { status: 0, database: databaseName };
    });

    await record('local postgres backing accepts table insert and select', async () => {
      await psql(containerName, 'CREATE TABLE telemetry (id integer PRIMARY KEY, payload jsonb NOT NULL)', { database: databaseName });
      await psql(containerName, "INSERT INTO telemetry (id, payload) VALUES (1, '{\"robot\":\"arm-1\",\"reading\":42}'::jsonb)", { database: databaseName });
      const result = await psql(containerName, "SELECT payload->>'robot' FROM telemetry WHERE id = 1", { database: databaseName });
      assert.equal(result.stdout.trim(), 'arm-1');
      return { status: 0, selected: result.stdout.trim() };
    });

    await record('local postgres backing enforces primary key uniqueness', async () => {
      const result = await psql(containerName, "INSERT INTO telemetry (id, payload) VALUES (1, '{\"robot\":\"duplicate\"}'::jsonb)", {
        database: databaseName,
        expectCode: 1,
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /duplicate key value violates unique constraint/i);
      return { status: result.code, errorCode: 'PostgreSQLUniqueViolation' };
    });

    await record('local postgres backing rolls back failed transaction', async () => {
      await psql(containerName, "BEGIN; INSERT INTO telemetry (id, payload) VALUES (2, '{\"robot\":\"rolled-back\"}'::jsonb); ROLLBACK;", { database: databaseName });
      const result = await psql(containerName, 'SELECT count(*) FROM telemetry WHERE id = 2', { database: databaseName });
      assert.equal(result.stdout.trim(), '0');
      return { status: 0, count: Number(result.stdout.trim()) };
    });

    await record('local postgres backing rejects invalid sql', async () => {
      const result = await psql(containerName, 'SELECT * FROM missing_table', {
        database: databaseName,
        expectCode: 1,
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /relation "missing_table" does not exist/i);
      return { status: result.code, errorCode: 'PostgreSQLUndefinedTable' };
    });

    await record('local postgres backing rejects unknown role', async () => {
      const result = await psql(containerName, 'SELECT 1', {
        database: databaseName,
        user: 'missing_globalstack_role',
        expectCode: 1,
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /role "missing_globalstack_role" does not exist/i);
      return { status: result.code, errorCode: 'PostgreSQLRoleNotFound' };
    });

    await record('database get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', databasePath(resourceGroup, serverName, databaseName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.charset, 'UTF8');
      return { status: result.status };
    });

    await record('database list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}/databases`, '2023-06-01-preview'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${serverName}/${databaseName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('server list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', 'flexibleServers', '2023-06-01-preview'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === serverName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('unsupported firewall rule route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}/firewallRules/allow-dev`, '2023-06-01-preview'), { properties: { startIpAddress: '10.0.0.1', endIpAddress: '10.0.0.1' } });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('unsupported server configuration route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}/configurations/max_connections`, '2023-06-01-preview'), { properties: { value: '100' } });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create postgresql resources', async () => {
      const deploymentName = `pg-deploy-${suffix}`;
      const deploymentServer = `pg-deploy-${suffix}`.slice(0, 40);
      const deploymentDatabase = `deploydb${suffix.replace(/[^a-z0-9]/g, '')}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({ serverName: deploymentServer, databaseName: deploymentDatabase }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/flexibleServers/${deploymentServer}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/flexibleServers/${deploymentServer}/databases/${deploymentDatabase}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('database delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', databasePath(resourceGroup, serverName, databaseName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('local postgres backing database cleanup succeeds', async () => {
      await psql(containerName, `DROP DATABASE ${quoteIdentifier(databaseName)}`);
      const result = await psql(containerName, 'SELECT 1', {
        database: databaseName,
        expectCode: 1,
      });
      assert.notEqual(result.code, 0);
      assert.match(result.stderr, /database .* does not exist/i);
      return { status: result.code, errorCode: 'PostgreSQLDatabaseNotFound' };
    });

    await record('database get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', databasePath(resourceGroup, serverName, databaseName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('database delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', databasePath(resourceGroup, serverName, databaseName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('server delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', serverPath(resourceGroup, serverName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('server get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', serverPath(resourceGroup, serverName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('server delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', serverPath(resourceGroup, serverName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('database create after server delete reports resource not found', async () => {
      const result = await httpJson(armPort, 'PUT', databasePath(resourceGroup, serverName, missingDatabaseName), databaseBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
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
    serverName,
    databaseName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-postgresql-parity-local-token',
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
    '# Azure PostgreSQL Flexible Server Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Server under test: ${report.controlPlane.serverName}`,
    `- Database under test: ${report.controlPlane.databaseName}`,
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Database for PostgreSQL Flexible Server and database ARM lifecycle, parameter rejection, local PostgreSQL backing-engine SQL success and failure behavior, unsupported child route fail-closed behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark PostgreSQL as 99%-complete or cloudValidated for Azure Flexible Server runtime behavior, firewall rules, server parameters, backup/restore, HA, maintenance windows, private link, throttling, RBAC, or exact Azure service behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Database for PostgreSQL Flexible Server and database ARM lifecycle, parameter rejection, local PostgreSQL backing-engine SQL checks, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure PostgreSQL cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure PostgreSQL parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
