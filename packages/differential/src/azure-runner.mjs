import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { getAzureDifferentialScenario, selectDifferentialCases } from '../../core/src/azure-differential-scenarios.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { workspaceRoot } from '../../workspace-utils/src/index.mjs';

const root = workspaceRoot(import.meta.url);

function parseArgs(argv) {
  const args = {
    scenarioId: 'aks-metadata',
    target: 'globalstack',
    caseId: null,
    includeAll: false,
    includeProvisioning: false,
    writeFixtures: true,
  };
  for (const arg of argv) {
    if (arg === '--all') args.includeAll = true;
    else if (arg === '--include-provisioning') args.includeProvisioning = true;
    else if (arg === '--no-fixtures') args.writeFixtures = false;
    else if (arg.startsWith('--scenario=')) args.scenarioId = arg.slice('--scenario='.length);
    else if (arg.startsWith('--target=')) args.target = arg.slice('--target='.length);
    else if (arg.startsWith('--case=')) args.caseId = arg.slice('--case='.length);
  }
  if (!['globalstack', 'azure', 'both'].includes(args.target)) {
    throw new Error(`Unsupported --target '${args.target}'. Use globalstack, azure, or both.`);
  }
  return args;
}

function run(command, args, { env = process.env, cwd = root } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({ code: 127, stdout, stderr: String(error?.message ?? error) }));
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function errorCode(result) {
  return result.body?.error?.code
    ?? result.body?.errors?.[0]?.code
    ?? result.body?.code
    ?? result.body?.Code
    ?? null;
}

function normalizeForCompare(result) {
  return {
    status: result.status,
    statusClass: Math.trunc(result.status / 100),
    errorCode: errorCode(result),
  };
}

function matchesExpected(result, expected) {
  const statuses = Array.isArray(expected.status) ? expected.status : [expected.status];
  const actualCode = errorCode(result);
  return statuses.includes(result.status) && (expected.errorCode === undefined || expected.errorCode === actualCode);
}

function compareTargetResults(globalstack, azure) {
  const local = normalizeForCompare(globalstack);
  const cloud = normalizeForCompare(azure);
  return {
    ok: local.status === cloud.status && local.errorCode === cloud.errorCode,
    globalstack: local,
    azure: cloud,
  };
}

function sanitize(value, { subscriptionId = '', tenantId = '' } = {}) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(item => sanitize(item, { subscriptionId, tenantId }));
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      const lower = key.toLowerCase();
      if (lower.includes('token') || lower.includes('secret') || lower.includes('password') || lower.includes('key')) {
        return [key, '<redacted>'];
      }
      return [key, sanitize(nested, { subscriptionId, tenantId })];
    }));
  }
  if (typeof value === 'string') {
    let sanitized = value;
    if (subscriptionId) sanitized = sanitized.replaceAll(subscriptionId, '<subscription-id>');
    if (tenantId) sanitized = sanitized.replaceAll(tenantId, '<tenant-id>');
    return sanitized.replace(/\/subscriptions\/[^/]+/gi, '/subscriptions/<subscription-id>');
  }
  return value;
}

function sanitizeHeaders(headers, ids) {
  const source = headers instanceof Headers ? headers.entries() : Object.entries(headers ?? {});
  const sanitized = {};
  for (const [key, value] of source) {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('token') || lower.includes('key')) continue;
    if (['content-type', 'location', 'azure-asyncoperation', 'retry-after', 'x-ms-request-id', 'x-ms-correlation-request-id', 'x-ms-routing-request-id'].includes(lower)) {
      sanitized[key] = sanitize(value, ids);
    }
  }
  return sanitized;
}

async function requestJson({ baseUrl, token, method, path, body, timeoutMs, ids }) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for non-JSON responses.
  }
  return {
    status: response.status,
    headers: sanitizeHeaders(response.headers, ids),
    body: parsed,
  };
}

async function azureToken() {
  const explicitToken = process.env.GLOBALSTACK_REAL_AZURE_ACCESS_TOKEN
    ?? process.env.AZURE_ACCESS_TOKEN
    ?? process.env.ARM_ACCESS_TOKEN;
  if (explicitToken) return explicitToken;

  const tenantId = process.env.AZURE_TENANT_ID ?? process.env.ARM_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID ?? process.env.ARM_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET ?? process.env.ARM_CLIENT_SECRET;
  if (tenantId && clientId && clientSecret) {
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      signal: AbortSignal.timeout(Number(process.env.GLOBALSTACK_AZURE_REQUEST_TIMEOUT_MS ?? 300000)),
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
        scope: 'https://management.azure.com/.default',
      }),
    });
    const parsed = await response.json().catch(() => null);
    if (!response.ok || !parsed?.access_token) {
      throw new Error(`Azure service-principal token request failed: HTTP ${response.status} ${JSON.stringify(sanitize(parsed))}`);
    }
    return parsed.access_token;
  }

  const result = await run('az', [
    'account',
    'get-access-token',
    '--resource',
    'https://management.azure.com/',
    '--output',
    'json',
  ]);
  if (result.code !== 0) {
    throw new Error(`az account get-access-token failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  if (!parsed.accessToken) throw new Error('az account get-access-token did not return accessToken.');
  return parsed.accessToken;
}

async function azureAccount() {
  const result = await run('az', ['account', 'show', '--output', 'json']);
  if (result.code !== 0) {
    throw new Error(`az account show failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function nextMinorVersion(version) {
  const match = String(version).match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return '99.99.0';
  return `${match[1]}.${Number(match[2]) + 1}.0`;
}

function selectAksVersionFromCli(payload) {
  const versions = payload.orchestrators ?? payload.values ?? [];
  const stable = versions.filter(item => !item.isPreview);
  const preferred = stable.find(item => item.isDefault) ?? stable[0] ?? versions[0];
  return preferred?.orchestratorVersion ?? preferred?.version ?? null;
}

async function resolveKubernetesVersion({ target, location, fallback }) {
  const explicit = process.env.GLOBALSTACK_AKS_CAPTURE_VERSION;
  if (explicit) return explicit;
  if (target !== 'azure' && target !== 'both') return fallback;

  const result = await run('az', ['aks', 'get-versions', '--location', location, '--output', 'json']);
  if (result.code !== 0) {
    throw new Error(`az aks get-versions failed for ${location}: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  const resolved = selectAksVersionFromCli(parsed);
  if (!resolved) throw new Error(`az aks get-versions returned no usable Kubernetes version for ${location}.`);
  return resolved;
}

function selectVmSizeFromCli(payload) {
  const available = payload
    .filter(item => !item.restrictions?.length)
    .map(item => item.name);
  const preferred = [
    'Standard_D2s_v3',
    'Standard_DS2_v2',
    'Standard_DC2s_v3',
    'Standard_DC2ads_v5',
    'Standard_EC2as_v5',
  ];
  return preferred.find(item => available.includes(item)) ?? available.find(item => /2/i.test(item)) ?? available[0] ?? null;
}

async function resolveVmSize({ target, location, fallback }) {
  const explicit = process.env.GLOBALSTACK_AKS_CAPTURE_VM_SIZE;
  if (explicit) return explicit;
  if (target !== 'azure' && target !== 'both') return fallback;

  const result = await run('az', [
    'vm',
    'list-skus',
    '--location',
    location,
    '--resource-type',
    'virtualMachines',
    '--all',
    '--output',
    'json',
  ]);
  if (result.code !== 0) {
    throw new Error(`az vm list-skus failed for ${location}: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  const resolved = selectVmSizeFromCli(parsed);
  if (!resolved) throw new Error(`az vm list-skus returned no unrestricted VM size for ${location}.`);
  return resolved;
}

async function withLocalArmServer(fn, { subscriptionId, token }) {
  const previousSubscription = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID;
  const previousToken = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN;
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = subscriptionId;
  process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN = token;
  const store = new ResourceStore({ subscriptionId });
  const runtime = createEmulatorRuntime({ store });
  const server = createArmServer({
    store,
    onResourcePut: runtime.syncResource,
    onResourceDelete: runtime.unsyncResource,
    workflowRunner: runtime.workflowRunner,
    metricStore: runtime.metricStore,
    kubernetesRouter: runtime.kubernetesRouter,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn({ baseUrl: `http://127.0.0.1:${server.address().port}` });
  } finally {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await runtime.dispose();
    if (previousSubscription === undefined) delete process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID;
    else process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = previousSubscription;
    if (previousToken === undefined) delete process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN;
    else process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN = previousToken;
  }
}

function resourceGroupName({ scenarioId, salt }) {
  return `rg-gs-${scenarioId.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-diff-${salt}`.toLowerCase().slice(0, 64);
}

function resourceGroupPath({ subscriptionId, resourceGroup }) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=2021-04-01`;
}

function resourcePath({ subscriptionId, resourceGroup, provider, typePath, apiVersion }) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${provider}/${typePath}?api-version=${apiVersion}`;
}

function caseContext({ scenario, selectedCase, subscriptionId, resourceGroup, salt, location, kubernetesVersion, vmSize }) {
  const name = scenario.resourceName({ caseId: selectedCase.id, salt });
  return {
    name,
    location,
    kubernetesVersion,
    aboveKubernetesVersion: nextMinorVersion(kubernetesVersion),
    vmSize,
    subscriptionId,
    resourceGroup,
  };
}

async function runTarget({ target, scenario, selectedCases, options, baseUrl, token }) {
  const ids = { subscriptionId: options.subscriptionId, tenantId: options.tenantId };
  const resourceGroup = resourceGroupName({ scenarioId: scenario.id, salt: options.salt });
  const rgPath = resourceGroupPath({ subscriptionId: options.subscriptionId, resourceGroup });
  const cleanup = {
    target,
    resourceGroupName: resourceGroup,
    attempted: false,
    status: null,
    verificationStatus: null,
    verifiedDeleted: false,
  };
  const results = [];

  try {
    const rgCreate = await requestJson({
      baseUrl,
      token,
      method: 'PUT',
      path: rgPath,
      body: {
        location: options.location,
        tags: {
          purpose: 'globalstack-azure-differential',
          capability: scenario.id,
          ttl: 'ephemeral',
        },
      },
      timeoutMs: options.timeoutMs,
      ids,
    });
    if (rgCreate.status < 200 || rgCreate.status >= 300) {
      throw new Error(`${target} resource group create failed: HTTP ${rgCreate.status} ${JSON.stringify(rgCreate.body)}`);
    }

    for (const selectedCase of selectedCases) {
      const context = caseContext({
        scenario,
        selectedCase,
        subscriptionId: options.subscriptionId,
        resourceGroup,
        salt: options.salt,
        location: options.location,
        kubernetesVersion: options.kubernetesVersion,
        vmSize: options.vmSize,
      });
      const body = selectedCase.body(context);
      const path = resourcePath({
        subscriptionId: options.subscriptionId,
        resourceGroup,
        provider: 'Microsoft.ContainerService',
        typePath: `managedClusters/${context.name}`,
        apiVersion: scenario.apiVersion,
      });
      const response = await requestJson({
        baseUrl,
        token,
        method: 'PUT',
        path,
        body,
        timeoutMs: options.timeoutMs,
        ids,
      });
      results.push({
        target,
        id: selectedCase.id,
        description: selectedCase.description,
        expectedLocalCase: selectedCase.expectedLocalCase,
        provisioning: selectedCase.provisioning,
        expected: selectedCase.expected,
        request: {
          method: 'PUT',
          path: sanitize(path, ids),
          body: sanitize(body, ids),
        },
        response: {
          status: response.status,
          headers: response.headers,
          body: sanitize(response.body, ids),
        },
        normalized: normalizeForCompare(response),
        expectedMatched: matchesExpected(response, selectedCase.expected),
      });
      console.log(`${target}: ${selectedCase.id} HTTP ${response.status} ${errorCode(response) ?? ''}`.trim());
    }
  } finally {
    const deleteResponse = await requestJson({
      baseUrl,
      token,
      method: 'DELETE',
      path: rgPath,
      body: null,
      timeoutMs: options.timeoutMs,
      ids,
    }).catch(error => ({
      status: 0,
      body: { error: String(error?.message ?? error) },
      headers: {},
    }));
    cleanup.attempted = true;
    cleanup.status = deleteResponse.status;

    for (let attempt = 0; attempt < options.cleanupVerifyAttempts; attempt += 1) {
      const verify = await requestJson({
        baseUrl,
        token,
        method: 'GET',
        path: rgPath,
        body: null,
        timeoutMs: options.timeoutMs,
        ids,
      });
      cleanup.verificationStatus = verify.status;
      if (verify.status === 404) {
        cleanup.verifiedDeleted = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, options.cleanupVerifyDelayMs));
    }
  }

  return { target, cleanup, results };
}

async function writeAzureFixtures({ scenario, azureRun, outRoot, ids }) {
  const fixtureRoot = join(root, 'fixtures', 'azure-captures');
  await mkdir(fixtureRoot, { recursive: true });
  const written = [];
  for (const result of azureRun.results) {
    const fixtureId = `${scenario.id}.differential.${result.id}`;
    const fixture = {
      id: fixtureId,
      capturedAt: new Date().toISOString(),
      target: 'azure',
      subscriptionId: '<subscription-id>',
      capabilityId: scenario.capabilityId,
      resourceType: scenario.resourceType,
      operation: scenario.operation,
      varianceId: result.id,
      request: result.request,
      response: result.response,
      cleanup: {
        resourceGroupName: azureRun.cleanup.resourceGroupName,
        deleteStatus: azureRun.cleanup.status,
        verificationStatus: azureRun.cleanup.verificationStatus,
        verifiedDeleted: azureRun.cleanup.verifiedDeleted,
      },
      globalstack: {
        normalizedIntoLocalConformance: false,
        expectedLocalCase: result.expectedLocalCase,
        validationDepth: result.provisioning ? 'real-azure-differential-provisioning' : 'provider-validation',
        cloudValidated: false,
        captureMode: result.provisioning ? 'opt-in-provisioning' : 'validation-only',
        caveat: 'Review this fixture against the local parity case before marking cloudValidated.',
      },
    };
    await writeFile(join(fixtureRoot, `${fixtureId}.json`), `${JSON.stringify(sanitize(fixture, ids), null, 2)}\n`);
    written.push(fixtureId);
  }
  await writeFile(join(outRoot, 'azure-fixtures.json'), `${JSON.stringify({ fixtureIds: written }, null, 2)}\n`);
  return written;
}

function renderReport(summary) {
  const lines = [
    `# Azure Differential Report: ${summary.scenarioId}`,
    '',
    `Status: ${summary.ok ? 'pass' : 'fail'}`,
    `Generated: ${summary.generatedAt}`,
    `Target: ${summary.target}`,
    '',
    '## Cases',
    '',
    '| Case | GlobalStack | Azure | Match | Expected Local Case |',
    '|---|---:|---:|---|---|',
  ];
  for (const result of summary.caseResults) {
    const local = result.globalstack ? `${result.globalstack.status} ${result.globalstack.errorCode ?? ''}`.trim() : '';
    const azure = result.azure ? `${result.azure.status} ${result.azure.errorCode ?? ''}`.trim() : '';
    lines.push(`| ${result.id} | ${local} | ${azure} | ${result.match === null ? 'n/a' : result.match ? 'yes' : 'no'} | ${result.expectedLocalCase} |`);
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This report is differential evidence only. A passing GlobalStack-only run proves local scenario coverage. A passing Azure or both-target run proves captured behavior for the selected cases only and must still be reviewed before any cloudValidated claim.');
  return `${lines.join('\n')}\n`;
}

export async function runAzureDifferential(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const scenario = getAzureDifferentialScenario(args.scenarioId);
  const selectedCases = selectDifferentialCases(scenario, {
    caseId: args.caseId,
    includeAll: args.includeAll,
    includeProvisioning: args.includeProvisioning,
  });
  const envSubscriptionId = process.env.AZURE_SUBSCRIPTION_ID
    ?? process.env.ARM_SUBSCRIPTION_ID
    ?? process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID;
  const envTenantId = process.env.AZURE_TENANT_ID ?? process.env.ARM_TENANT_ID ?? '';
  const account = (args.target === 'azure' || args.target === 'both') && !envSubscriptionId
    ? await azureAccount()
    : null;
  const subscriptionId = envSubscriptionId ?? account?.id ?? '00000000-0000-0000-0000-000000000000';
  const tenantId = envTenantId || account?.tenantId || '';
  const location = process.env.GLOBALSTACK_AZURE_CAPTURE_LOCATION ?? scenario.defaultLocation;
  const options = {
    subscriptionId,
    tenantId,
    salt: (process.env.GLOBALSTACK_AZURE_CAPTURE_SALT ?? Date.now().toString(36).slice(-8).toLowerCase()).toLowerCase(),
    location,
    kubernetesVersion: await resolveKubernetesVersion({
      target: args.target,
      location,
      fallback: scenario.defaultKubernetesVersion,
    }),
    vmSize: await resolveVmSize({
      target: args.target,
      location,
      fallback: scenario.defaultVmSize,
    }),
    timeoutMs: Number(process.env.GLOBALSTACK_AZURE_REQUEST_TIMEOUT_MS ?? 300000),
    cleanupVerifyAttempts: Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_ATTEMPTS ?? (args.target === 'globalstack' ? 3 : 60)),
    cleanupVerifyDelayMs: Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_DELAY_MS ?? (args.target === 'globalstack' ? 10 : 5000)),
  };
  const outRoot = join(root, 'dist', 'differential', 'azure', scenario.id);
  await mkdir(outRoot, { recursive: true });

  if ((args.target === 'azure' || args.target === 'both') && process.env.GLOBALSTACK_REAL_AZURE_CONFORMANCE !== '1') {
    throw new Error('Real Azure differential capture is disabled. Set GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 to execute Azure calls.');
  }
  if ((args.target === 'azure' || args.target === 'both') && !subscriptionId) {
    throw new Error('Set AZURE_SUBSCRIPTION_ID or ARM_SUBSCRIPTION_ID before running Azure differential capture.');
  }

  const runs = {};
  if (args.target === 'globalstack' || args.target === 'both') {
    const localToken = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
    runs.globalstack = await withLocalArmServer(
      ({ baseUrl }) => runTarget({
        target: 'globalstack',
        scenario,
        selectedCases,
        options,
        baseUrl,
        token: localToken,
      }),
      { subscriptionId, token: localToken },
    );
  }

  if (args.target === 'azure' || args.target === 'both') {
    const token = await azureToken();
    runs.azure = await runTarget({
      target: 'azure',
      scenario,
      selectedCases,
      options,
      baseUrl: 'https://management.azure.com',
      token,
    });
  }

  const caseResults = selectedCases.map((selectedCase) => {
    const globalstackResult = runs.globalstack?.results.find(item => item.id === selectedCase.id) ?? null;
    const azureResult = runs.azure?.results.find(item => item.id === selectedCase.id) ?? null;
    const comparison = globalstackResult && azureResult
      ? compareTargetResults(globalstackResult.response, azureResult.response)
      : null;
    return {
      id: selectedCase.id,
      expectedLocalCase: selectedCase.expectedLocalCase,
      provisioning: selectedCase.provisioning,
      globalstack: globalstackResult?.normalized ?? null,
      azure: azureResult?.normalized ?? null,
      match: comparison?.ok ?? null,
      expectedMatched: {
        globalstack: globalstackResult?.expectedMatched ?? null,
        azure: azureResult?.expectedMatched ?? null,
      },
    };
  });

  let fixtureIds = [];
  if (args.writeFixtures && runs.azure?.cleanup.verifiedDeleted) {
    fixtureIds = await writeAzureFixtures({
      scenario,
      azureRun: runs.azure,
      outRoot,
      ids: { subscriptionId, tenantId },
    });
  }

  const ok = Object.values(runs).every(runResult => runResult.cleanup.verifiedDeleted)
    && caseResults.every(result => {
      if (args.target === 'both') return result.match === true;
      if (args.target === 'globalstack') return result.expectedMatched.globalstack === true;
      return result.expectedMatched.azure === true;
    });

  const summary = {
    ok,
    generatedAt: new Date().toISOString(),
    scenarioId: scenario.id,
    target: args.target,
    selectedCases: selectedCases.map(item => item.id),
    fixtureIds,
    cleanup: Object.fromEntries(Object.entries(runs).map(([key, value]) => [key, value.cleanup])),
    caseResults,
    runs,
  };

  await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(outRoot, 'report.md'), renderReport(summary));
  console.log(`Azure differential ${scenario.id} completed: ${summary.ok ? 'PASS' : 'FAIL'} (${args.target})`);
  console.log(`Report: ${join(outRoot, 'report.md')}`);
  return summary;
}
