import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'e2e', 'azure-redis-parity');
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

async function withLocalRedis(fn) {
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const containerName = `globalstack-redis-${suffix}`;
  const runResult = await docker([
    'run',
    '-d',
    '--rm',
    '--name',
    containerName,
    'redis:7-alpine',
    'redis-server',
    '--appendonly',
    'no',
  ], { timeoutMs: 180000 });
  if (runResult.code !== 0) {
    throw new Error(`failed to start local Redis backing container: ${runResult.stderr || runResult.stdout}`);
  }

  try {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const ready = await redis(containerName, ['PING'], { timeoutMs: 10000 });
      if (ready.stdout.trim() === 'PONG') return await fn({ containerName });
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('local Redis backing container did not become ready in time');
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

function redisPath(resourceGroup, redisName, apiVersion = '2023-08-01') {
  return providerPath(resourceGroup, 'Microsoft.Cache', `redis/${redisName}`, apiVersion);
}

function redisBody(overrides = {}) {
  return {
    location: 'eastus',
    tags: { workload: 'ai-mlops-cache' },
    sku: {
      name: 'Basic',
      family: 'C',
      capacity: 0,
      ...(overrides.sku ?? {}),
    },
    properties: {
      enableNonSslPort: true,
      minimumTlsVersion: '1.2',
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !['properties', 'sku'].includes(key))),
  };
}

function deploymentBody(redisName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Cache/redis',
            apiVersion: '2023-08-01',
            name: redisName,
            location: 'eastus',
            sku: redisBody().sku,
            properties: redisBody().properties,
          },
        ],
        outputs: {
          redisName: { type: 'string', value: redisName },
        },
      },
    },
  };
}

async function redis(containerName, args, options = {}) {
  const result = await docker(['exec', containerName, 'redis-cli', '--raw', ...args], { timeoutMs: options.timeoutMs ?? 120000 });
  if ((options.expectCode ?? 0) === 0 && result.code !== 0) {
    throw new Error(`redis-cli failed (${result.code}): ${result.stderr || result.stdout}`);
  }
  return result;
}

async function redisReady(port, resourceGroup, redisName) {
  let last = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    last = await httpJson(port, 'GET', redisPath(resourceGroup, redisName));
    if (last.status === 200 && last.body.properties?.provisioningState === 'Succeeded') return last;
  }
  return last;
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-redis-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-redis-missing-${suffix}`;
  const redisName = `redis-${suffix}`.slice(0, 40);
  const missingRedisName = `redis-missing-${suffix}`.slice(0, 40);

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

  await withLocalRedis(async ({ containerName }) => {
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
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Cache', `redis/${redisName}`), redisBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('redis create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', redisPath(missingResourceGroup, redisName), redisBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus', tags: { purpose: 'globalstack-redis-parity' } });
      assert.equal(result.status, 201);
      return { status: result.status };
    });

    await record('redis collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cache', 'redis', '2023-08-01'));
      assert.equal(result.status, 200);
      assert.equal(result.body.value.length, 0);
      return { status: result.status, count: result.body.value.length };
    });

    await record('redis delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', redisPath(resourceGroup, missingRedisName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    for (const [name, pathName, body, expectedCode] of [
      ['redis empty body is rejected', redisName, {}, 'LocationRequired'],
      ['redis invalid location is rejected', redisName, redisBody({ location: 'globalstack-invalid-location' }), 'InvalidResourceLocation'],
      ['redis invalid name is rejected', `-bad-${suffix}`, redisBody(), 'InvalidResourceName'],
      ['redis invalid sku name is rejected', redisName, redisBody({ sku: { name: 'Ultra' } }), 'InvalidRequestBody'],
      ['redis invalid sku family is rejected', redisName, redisBody({ sku: { family: 'Z' } }), 'InvalidRequestBody'],
      ['redis invalid sku capacity is rejected', redisName, redisBody({ sku: { capacity: 99 } }), 'InvalidRequestBody'],
      ['redis invalid non-ssl flag is rejected', redisName, redisBody({ properties: { enableNonSslPort: 'yes' } }), 'InvalidRequestBody'],
    ]) {
      await record(name, async () => {
        const result = await httpJson(armPort, 'PUT', redisPath(resourceGroup, pathName), body);
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), expectedCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('redis create returns async Azure shape', async () => {
      const result = await httpJson(armPort, 'PUT', redisPath(resourceGroup, redisName), redisBody());
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      return { status: result.status };
    });

    await record('redis get reaches Succeeded with endpoint metadata', async () => {
      const result = await redisReady(armPort, resourceGroup, redisName);
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.properties.hostName, `${redisName}.redis.cache.windows.net`);
      assert.equal(result.body.properties.port, 6379);
      assert.equal(result.body.properties.sslPort, 6380);
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('local redis backing ping succeeds', async () => {
      const result = await redis(containerName, ['PING']);
      assert.equal(result.stdout.trim(), 'PONG');
      return { status: 0 };
    });

    await record('local redis backing string set and get succeeds', async () => {
      await redis(containerName, ['SET', 'robot:arm:1', 'ready']);
      const result = await redis(containerName, ['GET', 'robot:arm:1']);
      assert.equal(result.stdout.trim(), 'ready');
      return { status: 0, value: result.stdout.trim() };
    });

    await record('local redis backing integer increment succeeds', async () => {
      await redis(containerName, ['SET', 'robot:counter', '0']);
      const result = await redis(containerName, ['INCR', 'robot:counter']);
      assert.equal(result.stdout.trim(), '1');
      return { status: 0, value: Number(result.stdout.trim()) };
    });

    await record('local redis backing list order is preserved', async () => {
      await redis(containerName, ['RPUSH', 'telemetry:samples', 'a', 'b', 'c']);
      const result = await redis(containerName, ['LRANGE', 'telemetry:samples', '0', '-1']);
      assert.deepEqual(result.stdout.trim().split('\n'), ['a', 'b', 'c']);
      return { status: 0, count: result.stdout.trim().split('\n').length };
    });

    await record('local redis backing expiry removes key', async () => {
      await redis(containerName, ['SET', 'short-lived', 'value', 'EX', '1']);
      const ttl = await redis(containerName, ['TTL', 'short-lived']);
      assert.ok(Number(ttl.stdout.trim()) > 0);
      await new Promise(resolve => setTimeout(resolve, 1200));
      const exists = await redis(containerName, ['EXISTS', 'short-lived']);
      assert.equal(exists.stdout.trim(), '0');
      return { status: 0 };
    });

    await record('local redis backing wrong type is rejected', async () => {
      await redis(containerName, ['SET', 'wrong-type', 'scalar']);
      const result = await redis(containerName, ['LPUSH', 'wrong-type', 'value']);
      assert.match(`${result.stdout}\n${result.stderr}`, /WRONGTYPE/i);
      return { status: result.code, errorCode: 'RedisWrongType' };
    });

    await record('local redis backing unknown command is rejected', async () => {
      const result = await redis(containerName, ['GLOBALSTACK_UNKNOWN_COMMAND'], { expectCode: 1 });
      assert.match(`${result.stdout}\n${result.stderr}`, /unknown command/i);
      return { status: result.code, errorCode: 'RedisUnknownCommand' };
    });

    await record('redis update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', redisPath(resourceGroup, redisName), redisBody({ tags: { workload: 'robotics-cache' } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'robotics-cache');
      assert.equal(result.body.properties.hostName, `${redisName}.redis.cache.windows.net`);
      return { status: result.status };
    });

    await record('redis list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Cache', 'redis', '2023-08-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === redisName));
      return { status: result.status, count: result.body.value.length };
    });

    await record('unsupported redis firewall rule route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Cache', `redis/${redisName}/firewallRules/allow-dev`, '2023-08-01'), { properties: { startIP: '10.0.0.1', endIP: '10.0.0.1' } });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('unsupported redis linked server route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Cache', `redis/${redisName}/linkedServers/replica`, '2023-08-01'), { properties: {} });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create redis resource', async () => {
      const deploymentName = `redis-deploy-${suffix}`;
      const deploymentRedis = `redis-deploy-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody(deploymentRedis),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/redis/${deploymentRedis}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('redis delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', redisPath(resourceGroup, redisName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('local redis backing cleanup succeeds', async () => {
      const flush = await redis(containerName, ['FLUSHDB']);
      assert.equal(flush.stdout.trim(), 'OK');
      const exists = await redis(containerName, ['EXISTS', 'robot:arm:1']);
      assert.equal(exists.stdout.trim(), '0');
      return { status: 0 };
    });

    await record('redis get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', redisPath(resourceGroup, redisName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('redis delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', redisPath(resourceGroup, redisName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });
  });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    redisName,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-redis-parity-local-token',
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
    '# Azure Redis Cache Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control And Data Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Redis cache under test: ${report.controlPlane.redisName}`,
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
  lines.push('This run proves local GlobalStack handling for the listed Azure Cache for Redis ARM lifecycle, parameter rejection, local Redis backing-engine command success and failure behavior, unsupported child route fail-closed behavior, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Redis as 99%-complete or cloudValidated for Azure Cache for Redis runtime behavior, clustering, persistence, firewall rules, private link, TLS/auth edge cases, patching, throttling, RBAC, or exact Azure service behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Cache for Redis ARM lifecycle, parameter rejection, local Redis backing-engine command checks, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Redis cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Redis parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
