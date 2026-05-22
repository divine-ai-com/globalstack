import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-storage-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const token = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
const authHeader = `Bearer ${token}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
  return result.body?.error?.code ?? result.body?.code ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion = '2023-01-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function operationStatusPath(asyncOperationUrl) {
  const parsed = new URL(asyncOperationUrl);
  return `${parsed.pathname}${parsed.search}`;
}

function deploymentPath(resourceGroup, name, apiVersion = '2022-09-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${name}?api-version=${apiVersion}`;
}

function storageDeploymentBody(accountName, containerName, queueName, tableName) {
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        parameters: {
          storageAccountName: { type: 'string', defaultValue: accountName },
          containerName: { type: 'string', defaultValue: containerName },
          queueName: { type: 'string', defaultValue: queueName },
          tableName: { type: 'string', defaultValue: tableName },
        },
        resources: [
          {
            type: 'Microsoft.Storage/storageAccounts',
            apiVersion: '2023-01-01',
            name: "[parameters('storageAccountName')]",
            location: 'eastus',
            sku: { name: 'Standard_LRS' },
            kind: 'StorageV2',
            properties: { allowBlobPublicAccess: false },
          },
          {
            type: 'Microsoft.Storage/storageAccounts/blobServices/containers',
            apiVersion: '2023-01-01',
            name: "[concat(parameters('storageAccountName'), '/default/', parameters('containerName'))]",
            properties: { publicAccess: 'None' },
            dependsOn: ["[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"],
          },
          {
            type: 'Microsoft.Storage/storageAccounts/queueServices/queues',
            apiVersion: '2023-01-01',
            name: "[concat(parameters('storageAccountName'), '/default/', parameters('queueName'))]",
            properties: { metadata: { purpose: 'jobs' } },
            dependsOn: ["[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"],
          },
          {
            type: 'Microsoft.Storage/storageAccounts/tableServices/tables',
            apiVersion: '2023-01-01',
            name: "[concat(parameters('storageAccountName'), '/default/', parameters('tableName'))]",
            properties: {},
            dependsOn: ["[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"],
          },
        ],
        outputs: {
          storageAccountName: { type: 'string', value: "[parameters('storageAccountName')]" },
          containerName: { type: 'string', value: "[parameters('containerName')]" },
          queueName: { type: 'string', value: "[parameters('queueName')]" },
          tableName: { type: 'string', value: "[parameters('tableName')]" },
        },
      },
    },
  };
}

async function waitForStorageReady(port, resourceGroup, accountName) {
  const path = providerPath(resourceGroup, 'Microsoft.Storage', `storageAccounts/${accountName}`);
  let latest = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    latest = await httpJson(port, 'GET', path);
    if (latest.status === 200 && latest.body?.properties?.provisioningState === 'Succeeded') return latest;
    await sleep(25);
  }
  return latest;
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-storage-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-storage-missing-${suffix}`;
  const account = `gsparity${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
  const invalidAccount = `Bad_Name_${suffix}`;
  const container = `models-${suffix}`;
  const queue = `jobs${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 63);
  const share = `files-${suffix}`;
  const table = `model${suffix}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 63);
  const templateAccount = `gstpl${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
  const templateContainer = `tpl-${suffix}`;
  const templateQueue = `tpl${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 63);
  const templateTable = `Tpl${suffix.replace(/[^A-Za-z0-9]/g, '')}`.slice(0, 63);
  const base = `storageAccounts/${account}`;

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

  await withArmServer(async (port) => {
    await record('unauthenticated ARM request is rejected', async () => {
      const result = await httpJson(port, 'GET', `/subscriptions/${subscriptionId}`, undefined, { auth: false });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(
        port,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Storage/storageAccounts/${account}`,
        { location: 'eastus', sku: { name: 'Standard_LRS' }, kind: 'StorageV2' },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('storage account create requires an existing resource group', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(missingResourceGroup, 'Microsoft.Storage', `storageAccounts/${account}`),
        { location: 'eastus', sku: { name: 'Standard_LRS' }, kind: 'StorageV2' },
      );
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group create succeeds', async () => {
      const result = await httpJson(port, 'PUT', resourceGroupPath(resourceGroup), {
        location: 'eastus',
        tags: { purpose: 'globalstack-storage-parity', ttl: 'ephemeral' },
      });
      assert.equal(result.status, 201);
      assert.equal(result.body.name, resourceGroup);
      return { status: result.status, resourceId: result.body.id };
    });

    await record('invalid storage account name is rejected', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.Storage', `storageAccounts/${invalidAccount}`),
        { location: 'eastus', sku: { name: 'Standard_LRS' }, kind: 'StorageV2' },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'AccountNameInvalid');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('invalid storage account sku is rejected', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.Storage', `storageAccounts/${account}`),
        { location: 'eastus', sku: { name: 'GlobalStack_InvalidSku_For_Conformance' }, kind: 'StorageV2' },
      );
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidAccountType');
      return { status: result.status, errorCode: errorCode(result) };
    });

    let asyncOperation = null;
    await record('valid storage account create is async accepted', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.Storage', base),
        {
          location: 'eastus',
          sku: { name: 'Standard_LRS' },
          kind: 'StorageV2',
          properties: { allowBlobPublicAccess: false },
        },
      );
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      assert.ok(result.headers.location);
      assert.equal(result.headers['retry-after'], '0');
      asyncOperation = result.headers['azure-asyncoperation'];
      return { status: result.status, asyncOperation };
    });

    await record('child create before storage readiness is rejected', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.Storage', `${base}/blobServices/default/containers/${container}`),
        { properties: { publicAccess: 'None' } },
      );
      assert.equal(result.status, 409);
      assert.equal(errorCode(result), 'StorageAccountIsNotProvisioned');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('async operation status reaches Succeeded', async () => {
      const result = await httpJson(port, 'GET', operationStatusPath(asyncOperation));
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Succeeded');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('storage account get reaches Succeeded', async () => {
      const result = await waitForStorageReady(port, resourceGroup, account);
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.equal(result.body.globalstack.capabilityId, 'blob-storage');
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('storage account update preserves resource shape', async () => {
      const result = await httpJson(
        port,
        'PUT',
        providerPath(resourceGroup, 'Microsoft.Storage', base),
        {
          location: 'eastus',
          sku: { name: 'Standard_LRS' },
          kind: 'StorageV2',
          tags: { workload: 'mlops' },
          properties: { allowBlobPublicAccess: false, minimumTlsVersion: 'TLS1_2' },
        },
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.tags.workload, 'mlops');
      assert.equal(result.body.properties.minimumTlsVersion, 'TLS1_2');
      return { status: result.status, resourceId: result.body.id };
    });

    const invalidChildCases = [
      {
        name: 'invalid blob container name is rejected',
        typePath: `${base}/blobServices/default/containers/BadContainer`,
      },
      {
        name: 'invalid queue name is rejected',
        typePath: `${base}/queueServices/default/queues/bad--queue`,
      },
      {
        name: 'invalid file share name is rejected',
        typePath: `${base}/fileServices/default/shares/ab`,
      },
      {
        name: 'invalid table name is rejected',
        typePath: `${base}/tableServices/default/tables/1bad`,
      },
    ];

    for (const child of invalidChildCases) {
      await record(child.name, async () => {
        const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', child.typePath), { properties: {} });
        assert.equal(result.status, 400);
        assert.equal(errorCode(result), 'InvalidResourceName');
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    const childCases = [
      {
        name: 'blob container',
        typePath: `${base}/blobServices/default/containers/${container}`,
        collectionPath: `${base}/blobServices/default/containers`,
        body: { properties: { publicAccess: 'None' } },
        createdStatus: 201,
        deleteStatus: 200,
        notFoundCode: 'ContainerNotFound',
      },
      {
        name: 'queue',
        typePath: `${base}/queueServices/default/queues/${queue}`,
        collectionPath: `${base}/queueServices/default/queues`,
        body: { properties: { metadata: { purpose: 'jobs' } } },
        createdStatus: 200,
        deleteStatus: 204,
        notFoundCode: 'QueueNotFound',
      },
      {
        name: 'file share',
        typePath: `${base}/fileServices/default/shares/${share}`,
        collectionPath: `${base}/fileServices/default/shares`,
        body: { properties: { shareQuota: 32 } },
        createdStatus: 201,
        deleteStatus: 200,
        notFoundCode: 'ShareNotFound',
      },
      {
        name: 'table',
        typePath: `${base}/tableServices/default/tables/${table}`,
        collectionPath: `${base}/tableServices/default/tables`,
        body: { properties: {} },
        createdStatus: 200,
        deleteStatus: 204,
        notFoundCode: 'ResourceNotFound',
      },
    ];

    for (const child of childCases) {
      await record(`${child.name} create succeeds`, async () => {
        const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', child.typePath), child.body);
        assert.equal(result.status, child.createdStatus);
        assert.ok(result.body.id.includes(child.typePath));
        return { status: result.status, resourceId: result.body.id };
      });

      await record(`${child.name} idempotent update succeeds`, async () => {
        const result = await httpJson(port, 'PUT', providerPath(resourceGroup, 'Microsoft.Storage', child.typePath), child.body);
        assert.equal(result.status, 200);
        assert.ok(result.body.id.includes(child.typePath));
        return { status: result.status, resourceId: result.body.id };
      });

      await record(`${child.name} list includes created resource`, async () => {
        const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', child.collectionPath));
        assert.equal(result.status, 200);
        assert.ok(result.body.value.some(item => item.id.includes(child.typePath)));
        return { status: result.status, count: result.body.value.length };
      });

      await record(`${child.name} delete succeeds`, async () => {
        const result = await httpJson(port, 'DELETE', providerPath(resourceGroup, 'Microsoft.Storage', child.typePath));
        assert.equal(result.status, child.deleteStatus);
        return { status: result.status };
      });

      await record(`${child.name} get after delete is Azure-shaped 404`, async () => {
        const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', child.typePath));
        assert.equal(result.status, 404);
        assert.equal(errorCode(result), child.notFoundCode);
        return { status: result.status, errorCode: errorCode(result) };
      });
    }

    await record('ARM template deployment can create storage account and child resources', async () => {
      const result = await httpJson(
        port,
        'PUT',
        deploymentPath(resourceGroup, `storage-template-${suffix}`),
        storageDeploymentBody(templateAccount, templateContainer, templateQueue, templateTable),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      const steps = result.body.properties.globalstackDeploymentSteps;
      assert.ok(steps.some(step => step.id.endsWith(`/Microsoft.Storage/storageAccounts/${templateAccount}`) && [200, 201, 202].includes(step.status)));
      assert.ok(steps.some(step => step.id.endsWith(`/blobServices/default/containers/${templateContainer}`) && [200, 201].includes(step.status)));
      assert.ok(steps.some(step => step.id.endsWith(`/queueServices/default/queues/${templateQueue}`) && step.status === 200));
      assert.ok(steps.some(step => step.id.endsWith(`/tableServices/default/tables/${templateTable}`) && step.status === 200));
      return { status: result.status, steps: steps.length };
    });

    await record('storage account delete succeeds', async () => {
      const result = await httpJson(port, 'DELETE', providerPath(resourceGroup, 'Microsoft.Storage', base));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('storage account get after delete is not found', async () => {
      const result = await httpJson(port, 'GET', providerPath(resourceGroup, 'Microsoft.Storage', base));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('resource group delete succeeds', async () => {
      const result = await httpJson(port, 'DELETE', resourceGroupPath(resourceGroup));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('resource group get after delete is not found', async () => {
      const result = await httpJson(port, 'GET', resourceGroupPath(resourceGroup));
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
    account,
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
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-storage-parity-local-token',
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
    '# Azure Storage Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Storage account under test: ${report.controlPlane.account}`,
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
  lines.push('This run proves local GlobalStack handling for the listed ARM request shapes and platform runner lifecycle paths. It does not mark Azure Storage as 99%-complete or cloudValidated for every live Azure API parameter until the remaining service-specific live captures are complete.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure Storage ARM control-plane depth plus all-platform GlobalStack deployment lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure Storage cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure Storage parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
