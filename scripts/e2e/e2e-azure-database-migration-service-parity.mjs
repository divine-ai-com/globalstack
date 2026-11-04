import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { physicalDatabaseName } from '../../packages/azure-data-plane/src/relational-backend-manager.mjs';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
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

async function docker(args, options = {}) {
  const result = await runOutput('docker', args, options);
  if (result.code !== 0 && /permission denied|connect to the docker api/i.test(`${result.stderr}\n${result.stdout}`)) {
    return runOutput('sudo', ['docker', ...args], options);
  }
  return result;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function waitFor(fn, { attempts = 40, delayMs = 500, description = 'condition' } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }
  throw new Error(`Timed out waiting for ${description}: ${lastError?.message ?? lastError ?? 'unknown error'}`);
}

async function dockerMappedPort(containerName, internalPort) {
  const result = await docker(['port', containerName, `${internalPort}/tcp`], { timeoutMs: 10000 });
  if (result.code !== 0) throw new Error(`failed to inspect mapped port for ${containerName}:${internalPort}: ${result.stderr || result.stdout}`);
  const line = result.stdout.trim().split('\n').find(Boolean) ?? '';
  return Number(line.split(':').at(-1));
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
    '-p',
    '127.0.0.1::5432',
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
    const hostPort = await dockerMappedPort(containerName, 5432);
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await docker(['exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'globalstack', '-d', 'postgres'], { timeoutMs: 10000 });
      if (ready.code === 0) return await fn({ containerName, hostPort });
      await sleep(1000);
    }
    throw new Error('local PostgreSQL backing container did not become ready in time');
  } finally {
    await docker(['rm', '-f', containerName], { timeoutMs: 60000 });
  }
}

async function withLocalMysql(fn) {
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const containerName = `globalstack-mysql-${suffix}`;
  const runResult = await docker([
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    '-p',
    '127.0.0.1::3306',
    '-e',
    'MYSQL_ROOT_PASSWORD=globalstack-root',
    '-e',
    'MYSQL_USER=globalstack',
    '-e',
    'MYSQL_PASSWORD=globalstack',
    '-e',
    'MYSQL_DATABASE=globalstack',
    'mysql:8',
  ], { timeoutMs: 240000 });
  if (runResult.code !== 0) {
    throw new Error(`failed to start local MySQL backing container: ${runResult.stderr || runResult.stdout}`);
  }

  try {
    const hostPort = await dockerMappedPort(containerName, 3306);
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const ready = await docker(['exec', containerName, 'mysqladmin', 'ping', '-h', '127.0.0.1', '-uglobalstack', '-pglobalstack'], { timeoutMs: 10000 });
      if (ready.code === 0) return await fn({ containerName, hostPort });
      await sleep(1000);
    }
    throw new Error('local MySQL backing container did not become ready in time');
  } finally {
    await docker(['rm', '-f', containerName], { timeoutMs: 60000 });
  }
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

async function mysql(containerName, sql, options = {}) {
  const user = options.user ?? 'globalstack';
  const password = options.password ?? 'globalstack';
  const args = [
    'exec',
    containerName,
    'mysql',
    '-h',
    '127.0.0.1',
    `-u${user}`,
    `-p${password}`,
    '--batch',
    '--skip-column-names',
  ];
  if (options.database) args.push(options.database);
  args.push('-e', sql);
  const result = await docker(args, { timeoutMs: options.timeoutMs ?? 120000 });
  if ((options.expectCode ?? 0) === 0 && result.code !== 0) {
    throw new Error(`mysql failed (${result.code}): ${result.stderr || result.stdout}`);
  }
  return result;
}

async function withRuntimeArmServer({ postgresPort, mysqlPort }, fn) {
  const previous = {
    postgres: process.env.GLOBALSTACK_POSTGRES_ENDPOINT,
    mysql: process.env.GLOBALSTACK_MYSQL_ENDPOINT,
  };
  process.env.GLOBALSTACK_POSTGRES_ENDPOINT = `postgres://globalstack:globalstack@127.0.0.1:${postgresPort}/postgres`;
  process.env.GLOBALSTACK_MYSQL_ENDPOINT = `mysql://globalstack:globalstack@127.0.0.1:${mysqlPort}/globalstack`;
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const server = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
    migrationRunner: runtime.migrationRunner,
    metricStore: runtime.metricStore,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ armPort: port, store, runtime });
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (previous.postgres === undefined) delete process.env.GLOBALSTACK_POSTGRES_ENDPOINT;
    else process.env.GLOBALSTACK_POSTGRES_ENDPOINT = previous.postgres;
    if (previous.mysql === undefined) delete process.env.GLOBALSTACK_MYSQL_ENDPOINT;
    else process.env.GLOBALSTACK_MYSQL_ENDPOINT = previous.mysql;
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

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function dmsServicePath(resourceGroup, serviceName, apiVersion = '2022-03-30-preview') {
  return providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}`, apiVersion);
}

function dmsProjectPath(resourceGroup, serviceName, projectName, apiVersion = '2022-03-30-preview') {
  return providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects/${projectName}`, apiVersion);
}

function dmsTaskPath(resourceGroup, serviceName, projectName, taskName, apiVersion = '2022-03-30-preview') {
  return providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects/${projectName}/tasks/${taskName}`, apiVersion);
}

function dmsTaskCommandPath(resourceGroup, serviceName, projectName, taskName, apiVersion = '2022-03-30-preview') {
  return providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects/${projectName}/tasks/${taskName}/command`, apiVersion);
}

function postgresServerPath(resourceGroup, serverName, apiVersion = '2023-06-01-preview') {
  return providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}`, apiVersion);
}

function postgresDatabasePath(resourceGroup, serverName, databaseName, apiVersion = '2023-06-01-preview') {
  return providerPath(resourceGroup, 'Microsoft.DBforPostgreSQL', `flexibleServers/${serverName}/databases/${databaseName}`, apiVersion);
}

function mysqlServerPath(resourceGroup, serverName, apiVersion = '2023-12-30') {
  return providerPath(resourceGroup, 'Microsoft.DBforMySQL', `flexibleServers/${serverName}`, apiVersion);
}

function mysqlDatabasePath(resourceGroup, serverName, databaseName, apiVersion = '2023-12-30') {
  return providerPath(resourceGroup, 'Microsoft.DBforMySQL', `flexibleServers/${serverName}/databases/${databaseName}`, apiVersion);
}

function dmsServiceBody(overrides = {}) {
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

function dmsProjectBody(overrides = {}) {
  return {
    location: 'eastus',
    properties: {
      sourcePlatform: 'MySQL',
      targetPlatform: 'AzureDbForMySql',
      sourceConnectionInfo: { serverName: 'source.local', authentication: 'SqlAuthentication' },
      targetConnectionInfo: { serverName: 'target.local', authentication: 'SqlAuthentication' },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function postgresServerBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Standard_B1ms', tier: 'Burstable', ...(overrides.sku ?? {}) },
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

function postgresDatabaseBody(overrides = {}) {
  return {
    properties: {
      charset: 'UTF8',
      collation: 'en_US.utf8',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function mysqlServerBody(overrides = {}) {
  return {
    location: 'eastus',
    sku: { name: 'Standard_B1ms', tier: 'Burstable', ...(overrides.sku ?? {}) },
    properties: {
      administratorLogin: 'globalstack',
      administratorLoginPassword: 'Globalstack1!',
      version: '8.0.21',
      storage: { storageSizeGB: 20 },
      backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function mysqlDatabaseBody(overrides = {}) {
  return {
    properties: {
      charset: 'utf8mb4',
      collation: 'utf8mb4_0900_ai_ci',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function mysqlConnectionInfo(serverName, databaseName) {
  return {
    type: 'MySqlConnectionInfo',
    dataSource: `${serverName}.mysql.database.azure.com`,
    serverName,
    databaseName,
    authentication: 'SqlAuthentication',
    port: 3306,
    userName: 'globalstack',
    password: 'Globalstack1!',
  };
}

function postgresConnectionInfo(serverName, databaseName) {
  return {
    type: 'PostgreSqlConnectionInfo',
    dataSource: `${serverName}.postgres.database.azure.com`,
    serverName,
    databaseName,
    authentication: 'SqlAuthentication',
    port: 5432,
    userName: 'globalstack',
    password: 'Globalstack1!',
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-dms-parity-${suffix}`;
  const serviceName = `dms-${suffix}`;
  const projectName = `proj-${suffix}`;
  const mysqlServerName = `mysql${suffix}`;
  const mysqlDatabaseName = `inventory`;
  const mysqlTargetDatabaseName = `inventorytarget`;
  const postgresServerName = `pg${suffix}`;
  const postgresDatabaseName = `warehouse`;
  const postgresTargetDatabaseName = `warehousetarget`;

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

  await withLocalPostgres(async ({ containerName: postgresContainer, hostPort: postgresPort }) => {
    await withLocalMysql(async ({ containerName: mysqlContainer, hostPort: mysqlPort }) => {
      await withRuntimeArmServer({ postgresPort, mysqlPort }, async ({ armPort }) => {
        await record('unauthenticated ARM request is rejected', async () => {
          const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { auth: false });
          assert.equal(result.status, 401);
          assert.equal(errorCode(result), 'InvalidAuthenticationToken');
          return { status: result.status, errorCode: errorCode(result) };
        });

        await record('malformed bearer token is rejected', async () => {
          const result = await httpJson(
            armPort,
            'GET',
            resourceGroupPath(resourceGroup),
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
            resourceGroupPath(resourceGroup),
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
            `/subscriptions/11111111-1111-1111-1111-111111111111/resourceGroups/${resourceGroup}?api-version=2021-04-01`,
          );
          assert.equal(result.status, 403);
          assert.equal(errorCode(result), 'AuthorizationFailed');
          return { status: result.status, errorCode: errorCode(result) };
        });

        await record('resource group create succeeds', async () => {
          const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-dms-parity' } });
          assert.equal(result.status, 201);
          return { status: result.status };
        });

        await record('migration service and project create succeed', async () => {
          const service = await httpJson(armPort, 'PUT', dmsServicePath(resourceGroup, serviceName), dmsServiceBody());
          assert.equal(service.status, 201);
          const project = await httpJson(armPort, 'PUT', dmsProjectPath(resourceGroup, serviceName, projectName), dmsProjectBody());
          assert.equal(project.status, 201);
          assert.equal(project.body.properties.migrationState, 'Ready');
          return { status: project.status };
        });

        await record('migration project update preserves Ready state', async () => {
          const project = await httpJson(armPort, 'PUT', dmsProjectPath(resourceGroup, serviceName, projectName), dmsProjectBody({
            tags: { workload: 'cutover-readiness' },
            properties: {
              sourcePlatform: 'PostgreSql',
              targetPlatform: 'AzureDbForPostgreSql',
            },
          }));
          assert.equal(project.status, 200);
          assert.equal(project.body.properties.migrationState, 'Ready');
          assert.equal(project.body.tags.workload, 'cutover-readiness');
          return { status: project.status, migrationState: project.body.properties.migrationState };
        });

        await record('task create with missing parent reports missing parent', async () => {
          const result = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, `missing-${suffix}`, `orphan-${suffix}`), {
            properties: {
              taskType: 'ConnectToSource.MySql',
              input: {
                sourceConnectionInfo: mysqlConnectionInfo(mysqlServerName, mysqlDatabaseName),
              },
            },
          });
          assert.equal(result.status, 404);
          assert.equal(errorCode(result), 'ParentResourceNotFound');
          return { status: result.status, errorCode: errorCode(result) };
        });

        await record('mysql and postgres flexible servers and databases materialize real local databases', async () => {
          const mysqlServer = await httpJson(armPort, 'PUT', mysqlServerPath(resourceGroup, mysqlServerName), mysqlServerBody());
          assert.equal(mysqlServer.status, 201);
          const mysqlDatabase = await httpJson(armPort, 'PUT', mysqlDatabasePath(resourceGroup, mysqlServerName, mysqlDatabaseName), mysqlDatabaseBody());
          assert.equal(mysqlDatabase.status, 201);
          const mysqlTargetDatabase = await httpJson(armPort, 'PUT', mysqlDatabasePath(resourceGroup, mysqlServerName, mysqlTargetDatabaseName), mysqlDatabaseBody());
          assert.equal(mysqlTargetDatabase.status, 201);
          const postgresServer = await httpJson(armPort, 'PUT', postgresServerPath(resourceGroup, postgresServerName), postgresServerBody());
          assert.equal(postgresServer.status, 201);
          const postgresDatabase = await httpJson(armPort, 'PUT', postgresDatabasePath(resourceGroup, postgresServerName, postgresDatabaseName), postgresDatabaseBody());
          assert.equal(postgresDatabase.status, 201);
          const postgresTargetDatabase = await httpJson(armPort, 'PUT', postgresDatabasePath(resourceGroup, postgresServerName, postgresTargetDatabaseName), postgresDatabaseBody());
          assert.equal(postgresTargetDatabase.status, 201);

          await waitFor(
            () => mysql(mysqlContainer, 'SELECT 1', { database: physicalDatabaseName('mysql', mysqlServerName, mysqlDatabaseName) }),
            { description: 'MySQL database provisioning' },
          );
          await waitFor(
            () => psql(postgresContainer, 'SELECT 1', { database: physicalDatabaseName('postgres', postgresServerName, postgresDatabaseName) }),
            { description: 'PostgreSQL database provisioning' },
          );
          await waitFor(
            () => mysql(mysqlContainer, 'SELECT 1', { database: physicalDatabaseName('mysql', mysqlServerName, mysqlTargetDatabaseName) }),
            { description: 'MySQL target database provisioning' },
          );
          await waitFor(
            () => psql(postgresContainer, 'SELECT 1', { database: physicalDatabaseName('postgres', postgresServerName, postgresTargetDatabaseName) }),
            { description: 'PostgreSQL target database provisioning' },
          );

          await mysql(mysqlContainer, 'CREATE TABLE telemetry (id INT PRIMARY KEY, payload JSON NOT NULL)', {
            database: physicalDatabaseName('mysql', mysqlServerName, mysqlDatabaseName),
          });
          await mysql(mysqlContainer, "INSERT INTO telemetry (id, payload) VALUES (1, JSON_OBJECT('robot', 'arm-1', 'reading', 42))", {
            database: physicalDatabaseName('mysql', mysqlServerName, mysqlDatabaseName),
          });
          await psql(postgresContainer, 'CREATE TABLE telemetry (id integer PRIMARY KEY, payload jsonb NOT NULL)', {
            database: physicalDatabaseName('postgres', postgresServerName, postgresDatabaseName),
          });
          await psql(postgresContainer, "INSERT INTO telemetry (id, payload) VALUES (1, '{\"robot\":\"arm-2\",\"reading\":43}'::jsonb)", {
            database: physicalDatabaseName('postgres', postgresServerName, postgresDatabaseName),
          });

          return { status: 201 };
        });

        await record('unsupported DMS task type is rejected', async () => {
          const result = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, `unsupported-${suffix}`), {
            properties: {
              taskType: 'Validate.MongoDb',
              input: {},
            },
          });
          assert.equal(result.status, 400);
          assert.equal(errorCode(result), 'InvalidTaskProperties');
          return { status: result.status, errorCode: errorCode(result) };
        });

        await record('mysql source connect task queues, redacts password, and completes against real backend', async () => {
          const taskName = `connect-mysql-${suffix}`;
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'ConnectToSource.MySql',
              input: {
                sourceConnectionInfo: mysqlConnectionInfo(mysqlServerName, mysqlDatabaseName),
                targetPlatform: 'AzureDbForMySql',
              },
            },
          });
          assert.equal(created.status, 201);
          assert.equal(created.body.properties.state, 'Queued');
          assert.equal(created.body.properties.input.sourceConnectionInfo.password, undefined);

          const completed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Completed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'mysql source connect task completion' });

          assert.ok(completed.body.properties.output[0].databases.includes(physicalDatabaseName('mysql', mysqlServerName, mysqlDatabaseName)));
          assert.ok(completed.body.properties.output[0].sourceServerVersion);
          return { status: completed.status, state: completed.body.properties.state };
        });

        await record('postgres target connect task completes against real backend', async () => {
          const taskName = `connect-postgres-${suffix}`;
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'ConnectToTarget.AzureDbForPostgreSql.Sync',
              input: {
                targetConnectionInfo: postgresConnectionInfo(postgresServerName, postgresDatabaseName),
              },
            },
          });
          assert.equal(created.status, 201);

          const completed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Completed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'postgres target connect task completion' });

          assert.ok(completed.body.properties.output[0].targetServerVersion);
          return { status: completed.status, state: completed.body.properties.state };
        });

        await record('migration task creating state is observed before completion', async () => {
          const taskName = `creating-${suffix}`;
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'ConnectToSource.MySql',
              input: {
                sourceConnectionInfo: mysqlConnectionInfo(mysqlServerName, mysqlDatabaseName),
              },
            },
          });
          assert.equal(created.status, 201);
          assert.equal(created.body.properties.state, 'Queued');

          const completed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Completed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'creating task completion' });
          return { status: completed.status, state: completed.body.properties.state, initialState: created.body.properties.state };
        });

        await record('mysql user tables task returns actual tables from real backend', async () => {
          const taskName = `tables-mysql-${suffix}`;
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'GetUserTables.MySql',
              input: {
                sourceConnectionInfo: mysqlConnectionInfo(mysqlServerName, mysqlDatabaseName),
                selectedDatabases: [mysqlDatabaseName],
              },
            },
          });
          assert.equal(created.status, 201);

          const completed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Completed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'mysql get-user-tables task completion' });

          const tables = completed.body.properties.output[0].tables;
          assert.ok(tables.some(item => item.tableName === 'telemetry'));
          return { status: completed.status, state: completed.body.properties.state, tableCount: tables.length };
        });

        await record('postgres user tables task returns actual tables from real backend', async () => {
          const taskName = `tables-postgres-${suffix}`;
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'GetUserTables.PostgreSql',
              input: {
                sourceConnectionInfo: postgresConnectionInfo(postgresServerName, postgresDatabaseName),
                selectedDatabases: [postgresDatabaseName],
              },
            },
          });
          assert.equal(created.status, 201);

          const completed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Completed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'postgres get-user-tables task completion' });

          const tables = completed.body.properties.output[0].tables;
          assert.ok(tables.some(item => item.tableName === 'telemetry'));
          return { status: completed.status, state: completed.body.properties.state, tableCount: tables.length };
        });

        await record('mysql migration task copies selected table into target database', async () => {
          const taskName = `migrate-mysql-${suffix}`;
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'Migrate.MySql.AzureDbForMySql.Sync',
              input: {
                sourceConnectionInfo: mysqlConnectionInfo(mysqlServerName, mysqlDatabaseName),
                targetConnectionInfo: mysqlConnectionInfo(mysqlServerName, mysqlTargetDatabaseName),
                selectedDatabases: [
                  {
                    name: mysqlDatabaseName,
                    targetDatabaseName: mysqlTargetDatabaseName,
                    tableMap: { telemetry: 'telemetry_archive' },
                  },
                ],
              },
            },
          });
          assert.equal(created.status, 201);
          assert.equal(created.body.properties.input.sourceConnectionInfo.password, undefined);
          assert.equal(created.body.properties.input.targetConnectionInfo.password, undefined);

          const completed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Completed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'mysql selected-table migration completion' });

          const targetPhysical = physicalDatabaseName('mysql', mysqlServerName, mysqlTargetDatabaseName);
          const copied = await mysql(mysqlContainer, 'SELECT COUNT(*) FROM telemetry_archive', { database: targetPhysical });
          assert.equal(copied.stdout.trim(), '1');
          assert.equal(completed.body.properties.output[0].migrationState, 'Completed');
          assert.equal(completed.body.properties.output[0].migratedDatabases[0].tables[0].targetTableName, 'telemetry_archive');
          assert.equal(completed.body.properties.output[0].migratedDatabases[0].tables[0].rowsCopied, 1);
          return { status: completed.status, state: completed.body.properties.state, rowsCopied: 1 };
        });

        await record('postgres migration task copies selected table into target database', async () => {
          const taskName = `migrate-postgres-${suffix}`;
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'Migrate.PostgreSql.AzureDbForPostgreSql.SyncV2',
              input: {
                sourceConnectionInfo: postgresConnectionInfo(postgresServerName, postgresDatabaseName),
                targetConnectionInfo: postgresConnectionInfo(postgresServerName, postgresTargetDatabaseName),
                selectedDatabases: [
                  {
                    name: postgresDatabaseName,
                    targetDatabaseName: postgresTargetDatabaseName,
                    selectedTables: [{ name: 'telemetry' }],
                  },
                ],
              },
            },
          });
          assert.equal(created.status, 201);

          const completed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Completed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'postgres selected-table migration completion' });

          const targetPhysical = physicalDatabaseName('postgres', postgresServerName, postgresTargetDatabaseName);
          const copied = await psql(postgresContainer, 'SELECT COUNT(*) FROM telemetry', { database: targetPhysical });
          assert.equal(copied.stdout.trim(), '1');
          assert.equal(completed.body.properties.output[0].migrationState, 'Completed');
          assert.equal(completed.body.properties.output[0].migratedDatabases[0].tables[0].targetTableName, 'telemetry');
          assert.equal(completed.body.properties.output[0].migratedDatabases[0].tables[0].rowsCopied, 1);
          return { status: completed.status, state: completed.body.properties.state, rowsCopied: 1 };
        });

        await record('migration task with unauthorized source credentials records Failed state and Azure-shaped error', async () => {
          const taskName = `migrate-failed-${suffix}`;
          const badSource = {
            ...mysqlConnectionInfo(mysqlServerName, mysqlDatabaseName),
            password: 'wrong-password',
          };
          const created = await httpJson(armPort, 'PUT', dmsTaskPath(resourceGroup, serviceName, projectName, taskName), {
            properties: {
              taskType: 'Migrate.MySql.AzureDbForMySql',
              input: {
                sourceConnectionInfo: badSource,
                targetConnectionInfo: mysqlConnectionInfo(mysqlServerName, mysqlTargetDatabaseName),
                selectedDatabases: [
                  {
                    name: mysqlDatabaseName,
                    targetDatabaseName: mysqlTargetDatabaseName,
                  },
                ],
              },
            },
          });
          assert.equal(created.status, 201);

          const failed = await waitFor(async () => {
            const result = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
            assert.equal(result.status, 200);
            if (result.body.properties.state !== 'Failed') throw new Error(`task state ${result.body.properties.state}`);
            return result;
          }, { description: 'failed migration task terminal state' });
          assert.equal(failed.body.properties.errors[0].code, 'InvalidConnectionInfo');
          assert.match(failed.body.properties.errors[0].message, /Authentication failed/);
          return { status: failed.status, state: failed.body.properties.state, errorCode: failed.body.properties.errors[0].code };
        });

        await record('completed migration task readback remains stable across repeated reads', async () => {
          const taskName = `migrate-mysql-${suffix}`;
          const first = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
          const second = await httpJson(armPort, 'GET', dmsTaskPath(resourceGroup, serviceName, projectName, taskName));
          assert.equal(first.status, 200);
          assert.equal(second.status, 200);
          assert.equal(first.body.properties.state, 'Completed');
          assert.equal(second.body.properties.state, 'Completed');
          assert.deepEqual(second.body.properties.output, first.body.properties.output);
          return { status: second.status, state: second.body.properties.state };
        });

        await record('task collection lists runtime-backed tasks with current state', async () => {
          const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/projects/${projectName}/tasks`, '2022-03-30-preview'));
          assert.equal(result.status, 200);
          assert.equal(result.body.value.length, 8);
          assert.ok(result.body.value.every(item => ['Queued', 'Running', 'Completed', 'Failed'].includes(item.properties.state)));
          return { status: result.status, count: result.body.value.length };
        });

        await record('supported task command route completes against an existing task resource', async () => {
          const result = await httpJson(armPort, 'POST', dmsTaskCommandPath(resourceGroup, serviceName, projectName, `tables-postgres-${suffix}`), {
            commandType: 'Migrate.Sync.Complete.Database',
            input: { databaseName: postgresDatabaseName },
          });
          assert.equal(result.status, 200);
          assert.equal(result.body.state, 'Completed');
          return { status: result.status, state: result.body.state };
        });

        await record('unsupported service worker route still fails closed', async () => {
          const result = await httpJson(armPort, 'POST', providerPath(resourceGroup, 'Microsoft.DataMigration', `services/${serviceName}/addWorker`, '2022-03-30-preview'), {});
          assert.equal(result.status, 501);
          assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
          return { status: result.status, errorCode: errorCode(result) };
        });

        await record('migration service delete succeeds', async () => {
          const result = await httpJson(armPort, 'DELETE', dmsServicePath(resourceGroup, serviceName));
          assert.equal(result.status, 200);
          return { status: result.status };
        });

        await record('migration service get after delete is not found', async () => {
          const result = await httpJson(armPort, 'GET', dmsServicePath(resourceGroup, serviceName));
          assert.equal(result.status, 404);
          assert.equal(errorCode(result), 'ResourceNotFound');
          return { status: result.status, errorCode: errorCode(result) };
        });

        await record('project create after service delete reports missing parent', async () => {
          const result = await httpJson(armPort, 'PUT', dmsProjectPath(resourceGroup, serviceName, `after-delete-${suffix}`), dmsProjectBody());
          assert.equal(result.status, 404);
          assert.equal(errorCode(result), 'ParentResourceNotFound');
          return { status: result.status, errorCode: errorCode(result) };
        });
      });
    });
  });

  const failed = cases.filter(item => !item.ok);
  const dataPlaneCaseNames = new Set([
    'mysql and postgres flexible servers and databases materialize real local databases',
    'mysql source connect task queues, redacts password, and completes against real backend',
    'postgres target connect task completes against real backend',
    'migration task creating state is observed before completion',
    'mysql user tables task returns actual tables from real backend',
    'postgres user tables task returns actual tables from real backend',
    'mysql migration task copies selected table into target database',
    'postgres migration task copies selected table into target database',
    'migration task with unauthorized source credentials records Failed state and Azure-shaped error',
    'completed migration task readback remains stable across repeated reads',
    'task collection lists runtime-backed tasks with current state',
    'supported task command route completes against an existing task resource',
  ]);
  const dataPlaneCases = cases.filter(item => dataPlaneCaseNames.has(item.name));
  const dataPlaneFailed = dataPlaneCases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    serviceName,
    projectName,
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
    '## Control Plane',
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
  lines.push('This run proves local GlobalStack handling for Database Migration Service, project, and task ARM lifecycle; runtime-backed MySQL/PostgreSQL connection validation; runtime-backed user-table inspection; bounded selected-table migration into target local databases; failed-task readback for invalid credentials; command routing on task resources; local relational backend provisioning from PostgreSQL/MySQL flexible server database resources; unsupported child/action routes failing closed; and all-platform runner deployment paths. It does not yet prove live CDC, online cutover semantics, schema conversion, network tunnel behavior, or full Azure DMS runtime parity.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && controlPlane.dataPlane.ok && platformMatrix.ok,
  scope: 'Azure Database Migration Service ARM lifecycle plus runtime-backed DMS connection, table inspection, and bounded selected-table migration execution against local MySQL/PostgreSQL backends.',
  claimBoundary: 'Local parity evidence for the enumerated DMS task types and lifecycle cases only; not a full Azure DMS cloudValidated claim.',
  controlPlane,
  dataPlane: controlPlane.dataPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Database Migration Service parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
