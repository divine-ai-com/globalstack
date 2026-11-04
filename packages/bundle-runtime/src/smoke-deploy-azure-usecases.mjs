import { workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { smokeScenarios } from '../../platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'deploy-smoke');
const backendArg = process.argv.find(arg => arg.startsWith('--backend='));
const backend = backendArg?.split('=')[1] ?? process.env.GLOBALSTACK_DEPLOY_BACKEND ?? 'hybrid';
let baseUrl = process.env.AZURE_ENDPOINT_URL ?? (backend === 'globalstack-sidecar' ? 'http://127.0.0.1:4566' : 'http://127.0.0.1:4570');
const location = process.env.AZURE_LOCATION ?? 'eastus';
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const tenantId = process.env.ARM_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
const generateOnly = process.argv.includes('--generate-only');
const skipCleanup = process.argv.includes('--skip-cleanup');

const scenarioById = new Map(smokeScenarios.map(scenario => [scenario.id, scenario]));

function run(command, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: opts.cwd ?? root,
      env: opts.env ?? process.env,
      stdio: opts.stdio ?? 'inherit',
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

async function dockerCommand() {
  const direct = await run('docker', ['info'], { stdio: 'ignore' });
  if (direct === 0) return { command: 'docker', prefix: [] };
  const sudo = await run('sudo', ['-n', 'docker', 'info'], { stdio: 'ignore' });
  if (sudo === 0) return { command: 'sudo', prefix: ['-n', '-E', 'docker'] };
  return { command: 'docker', prefix: [] };
}

function suffix() {
  return `${Date.now().toString(36).slice(-5)}${process.pid.toString(36)}`.toLowerCase();
}

function resourceGroupPath(name) {
  return `/subscriptions/${subscriptionId}/resourcegroups/${name}?api-version=2021-04-01`;
}

function providerPath(resourceGroup, provider, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${provider}/${typePath}?api-version=${apiVersion}`;
}

function armId(resourceGroup, provider, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${provider}/${typePath}`;
}

function putResourceGroup(name) {
  return {
    label: `resource group ${name}`,
    method: 'PUT',
    path: resourceGroupPath(name),
    body: { location },
    expect: [200, 201],
  };
}

function caseDefinitions(runSuffix) {
  const mlopsRg = `rg-az-mlops-${runSuffix}`;
  const roboticsRg = `rg-az-robotics-${runSuffix}`;
  const genaiRg = `rg-az-genai-${runSuffix}`;
  const mlopsStorage = `azmlops${runSuffix}`.slice(0, 24);
  const roboticsServiceBus = `az-robotics-${runSuffix}`;
  const genaiStorage = `azgenai${runSuffix}`.slice(0, 24);
  const mlopsVault = `az-mlops-${runSuffix}`.slice(0, 24);
  const genaiVault = `az-genai-${runSuffix}`.slice(0, 24);
  const tier2Rg = `rg-az-tier2-${runSuffix}`;
  const tier2Mysql = `az-mysql-${runSuffix}`.slice(0, 24);
  const tier2Redis = `az-redis-${runSuffix}`.slice(0, 24);
  const tier2EventHubNs = `az-eh-${runSuffix}`.slice(0, 24);
  const tier2AppConfig = `azappcfg${runSuffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
  const wave1Rg = `rg-az-wave1-${runSuffix}`;
  const wave1Storage = `azwave1${runSuffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);
  const wave1ServiceBus = `az-wave1-sb-${runSuffix}`.slice(0, 24);
  const wave1EventHubNs = `az-wave1-eh-${runSuffix}`.slice(0, 24);
  const wave1EventGridTopic = `wave1-topic-${runSuffix}`.slice(0, 40);
  const wave1AppConfig = `azwave1cfg${runSuffix}`.replace(/[^a-z0-9]/g, '').slice(0, 24);

  return [
    {
      id: 'mlops-feature-intake-lake',
      scenarioId: 'mlops-feature-intake-lake',
      domain: 'AI/MLOps',
      resourceGroup: mlopsRg,
      steps: [
        putResourceGroup(mlopsRg),
        {
          label: `storage account ${mlopsStorage}`,
          method: 'PUT',
          path: providerPath(mlopsRg, 'Microsoft.Storage', `storageAccounts/${mlopsStorage}`, '2023-01-01'),
          body: {
            location,
            sku: { name: 'Standard_LRS' },
            kind: 'StorageV2',
            properties: { allowBlobPublicAccess: false },
          },
          expect: [200, 201, 202],
        },
        {
          label: 'raw feature blob container',
          method: 'PUT',
          path: providerPath(mlopsRg, 'Microsoft.Storage', `storageAccounts/${mlopsStorage}/blobServices/default/containers/raw-features`, '2023-01-01'),
          body: { properties: { publicAccess: 'None' } },
          expect: [200, 201, 202],
        },
        {
          label: 'feature validation queue',
          method: 'PUT',
          path: providerPath(mlopsRg, 'Microsoft.Storage', `storageAccounts/${mlopsStorage}/queueServices/default/queues/feature-validation`, '2023-01-01'),
          body: { properties: {} },
          expect: [200, 201, 202],
        },
        {
          label: `key vault ${mlopsVault}`,
          method: 'PUT',
          path: providerPath(mlopsRg, 'Microsoft.KeyVault', `vaults/${mlopsVault}`, '2023-07-01'),
          body: {
            location,
            properties: {
              tenantId,
              sku: { family: 'A', name: 'standard' },
              accessPolicies: [],
              enabledForDeployment: true,
            },
          },
          expect: [200, 201, 202],
        },
        {
          label: 'feature upload event topic',
          method: 'PUT',
          path: providerPath(mlopsRg, 'Microsoft.EventGrid', `topics/feature-upload-${runSuffix}`, '2022-06-15'),
          body: { location, properties: { inputSchema: 'EventGridSchema' } },
          expect: [200, 201, 202],
        },
      ],
    },
    {
      id: 'robotics-fleet-telemetry-buffer',
      scenarioId: 'robotics-fleet-telemetry-buffer',
      domain: 'Robotics',
      resourceGroup: roboticsRg,
      steps: [
        putResourceGroup(roboticsRg),
        {
          label: `service bus namespace ${roboticsServiceBus}`,
          method: 'PUT',
          path: providerPath(roboticsRg, 'Microsoft.ServiceBus', `namespaces/${roboticsServiceBus}`, '2021-11-01'),
          body: {
            location,
            sku: { name: 'Standard', tier: 'Standard' },
            properties: {},
          },
          expect: [200, 201, 202],
        },
        {
          label: 'robot telemetry queue',
          method: 'PUT',
          path: providerPath(roboticsRg, 'Microsoft.ServiceBus', `namespaces/${roboticsServiceBus}/queues/robot-telemetry`, '2021-11-01'),
          body: { properties: { maxSizeInMegabytes: 1024 } },
          expect: [200, 201, 202],
        },
        {
          label: 'robot command acknowledgement queue',
          method: 'PUT',
          path: providerPath(roboticsRg, 'Microsoft.ServiceBus', `namespaces/${roboticsServiceBus}/queues/command-acks`, '2021-11-01'),
          body: { properties: { maxSizeInMegabytes: 1024 } },
          expect: [200, 201, 202],
        },
      ],
    },
    {
      id: 'regulated-genai-knowledge-ingestion',
      scenarioId: 'regulated-genai-knowledge-ingestion',
      domain: 'GenAI',
      resourceGroup: genaiRg,
      steps: [
        putResourceGroup(genaiRg),
        {
          label: `storage account ${genaiStorage}`,
          method: 'PUT',
          path: providerPath(genaiRg, 'Microsoft.Storage', `storageAccounts/${genaiStorage}`, '2023-01-01'),
          body: {
            location,
            sku: { name: 'Standard_LRS' },
            kind: 'StorageV2',
            properties: { allowBlobPublicAccess: false },
          },
          expect: [200, 201, 202],
        },
        {
          label: 'private document blob container',
          method: 'PUT',
          path: providerPath(genaiRg, 'Microsoft.Storage', `storageAccounts/${genaiStorage}/blobServices/default/containers/source-documents`, '2023-01-01'),
          body: { properties: { publicAccess: 'None' } },
          expect: [200, 201, 202],
        },
        {
          label: 'chunking work queue',
          method: 'PUT',
          path: providerPath(genaiRg, 'Microsoft.Storage', `storageAccounts/${genaiStorage}/queueServices/default/queues/chunking-work`, '2023-01-01'),
          body: { properties: {} },
          expect: [200, 201, 202],
        },
        {
          label: `key vault ${genaiVault}`,
          method: 'PUT',
          path: providerPath(genaiRg, 'Microsoft.KeyVault', `vaults/${genaiVault}`, '2023-07-01'),
          body: {
            location,
            properties: {
              tenantId,
              sku: { family: 'A', name: 'standard' },
              accessPolicies: [],
              enabledForDeployment: true,
            },
          },
          expect: [200, 201, 202],
        },
      ],
    },
    {
      id: 'tier2-resilience-edge-foundation',
      scenarioId: 'tier2-resilience-edge-foundation',
      domain: 'Tier 2 cloud primitives',
      resourceGroup: tier2Rg,
      steps: [
        putResourceGroup(tier2Rg),
        {
          label: `mysql flexible server ${tier2Mysql} captured invalid admin password`,
          method: 'PUT',
          path: providerPath(tier2Rg, 'Microsoft.DBforMySQL', `flexibleServers/${tier2Mysql}`, '2023-12-30'),
          body: {
            location,
            sku: { name: 'Standard_B1ms', tier: 'Burstable' },
            properties: { administratorLogin: 'azureadmin', version: '8.0.21' },
          },
          expect: [400],
          expectErrorCodes: ['InvalidAdminLoginPassword'],
        },
        {
          label: `redis cache ${tier2Redis} captured invalid request`,
          method: 'PUT',
          path: providerPath(tier2Rg, 'Microsoft.Cache', `redis/${tier2Redis}`, '2023-08-01'),
          body: {
            location,
            properties: {
              sku: { name: 'Basic', family: 'C', capacity: 0 },
              enableNonSslPort: 'yes',
            },
          },
          expect: [400],
          expectErrorCodes: ['InvalidRequestBody'],
        },
        {
          label: 'private dns zone tier2.internal',
          method: 'PUT',
          path: providerPath(tier2Rg, 'Microsoft.Network', 'privateDnsZones/tier2.internal', '2020-06-01'),
          body: { location: 'global', properties: {} },
          expect: [200, 201, 202],
        },
        {
          label: `event hubs namespace ${tier2EventHubNs}`,
          method: 'PUT',
          path: providerPath(tier2Rg, 'Microsoft.EventHub', `namespaces/${tier2EventHubNs}`, '2024-01-01'),
          body: {
            location,
            sku: { name: 'Standard', tier: 'Standard', capacity: 1 },
            properties: {},
          },
          expect: [200, 201, 202],
        },
        {
          label: 'telemetry event hub',
          method: 'PUT',
          path: providerPath(tier2Rg, 'Microsoft.EventHub', `namespaces/${tier2EventHubNs}/eventhubs/telemetry`, '2024-01-01'),
          body: { properties: { partitionCount: 2, messageRetentionInDays: 1 } },
          expect: [200, 201, 202],
        },
        {
          label: `app configuration ${tier2AppConfig}`,
          method: 'PUT',
          path: providerPath(tier2Rg, 'Microsoft.AppConfiguration', `configurationStores/${tier2AppConfig}`, '2023-03-01'),
          body: {
            location,
            sku: { name: 'free' },
            properties: { disableLocalAuth: false },
          },
          expect: [200, 201, 202],
        },
        {
          label: 'waf policy tier2-edge captured invalid request',
          method: 'PUT',
          path: providerPath(tier2Rg, 'Microsoft.Network', 'ApplicationGatewayWebApplicationFirewallPolicies/tier2-edge', '2023-09-01'),
          body: {
            location,
            properties: {
              policySettings: { enabledState: 'Enabled', mode: 'Prevention' },
              managedRules: { managedRuleSets: [] },
            },
          },
          expect: [400],
          expectErrorCodes: ['InvalidRequestFormat'],
        },
      ],
    },
    {
      id: 'wave1-storage-messaging-foundation',
      scenarioId: 'wave1-storage-messaging-foundation',
      domain: 'Wave 1 Azure storage and messaging',
      resourceGroup: wave1Rg,
      steps: [
        putResourceGroup(wave1Rg),
        {
          label: `wave1 storage account ${wave1Storage}`,
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.Storage', `storageAccounts/${wave1Storage}`, '2023-01-01'),
          body: {
            location,
            sku: { name: 'Standard_LRS' },
            kind: 'StorageV2',
            properties: { allowBlobPublicAccess: false },
          },
          expect: [200, 201, 202],
        },
        {
          label: 'wave1 blob container',
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.Storage', `storageAccounts/${wave1Storage}/blobServices/default/containers/wave1-blobs`, '2023-01-01'),
          body: { properties: { publicAccess: 'None' } },
          expect: [200, 201, 202],
        },
        {
          label: 'wave1 queue',
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.Storage', `storageAccounts/${wave1Storage}/queueServices/default/queues/wave1-jobs`, '2023-01-01'),
          body: { properties: {} },
          expect: [200, 201, 202],
        },
        {
          label: 'wave1 file share',
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.Storage', `storageAccounts/${wave1Storage}/fileServices/default/shares/wave1files`, '2023-01-01'),
          body: { properties: { shareQuota: 32 } },
          expect: [200, 201, 202],
        },
        {
          label: 'wave1 table storage table',
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.Storage', `storageAccounts/${wave1Storage}/tableServices/default/tables/wave1table`, '2023-01-01'),
          body: { properties: {} },
          expect: [200, 201, 202],
        },
        {
          label: `wave1 service bus namespace ${wave1ServiceBus}`,
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.ServiceBus', `namespaces/${wave1ServiceBus}`, '2021-11-01'),
          body: {
            location,
            sku: { name: 'Standard', tier: 'Standard' },
            properties: {},
          },
          expect: [200, 201, 202],
        },
        {
          label: 'wave1 service bus topic',
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.ServiceBus', `namespaces/${wave1ServiceBus}/topics/wave1-events`, '2021-11-01'),
          body: { properties: { maxSizeInMegabytes: 1024 } },
          expect: [200, 201, 202],
        },
        {
          label: `wave1 event grid topic ${wave1EventGridTopic}`,
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.EventGrid', `topics/${wave1EventGridTopic}`, '2022-06-15'),
          body: { location, properties: { inputSchema: 'EventGridSchema' } },
          expect: [200, 201, 202],
        },
        {
          label: `wave1 event hubs namespace ${wave1EventHubNs}`,
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.EventHub', `namespaces/${wave1EventHubNs}`, '2024-01-01'),
          body: {
            location,
            sku: { name: 'Standard', tier: 'Standard', capacity: 1 },
            properties: {},
          },
          expect: [200, 201, 202],
        },
        {
          label: 'wave1 event hub',
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.EventHub', `namespaces/${wave1EventHubNs}/eventhubs/wave1-stream`, '2024-01-01'),
          body: { properties: { partitionCount: 2, messageRetentionInDays: 1 } },
          expect: [200, 201, 202],
        },
        {
          label: `wave1 app configuration ${wave1AppConfig}`,
          method: 'PUT',
          path: providerPath(wave1Rg, 'Microsoft.AppConfiguration', `configurationStores/${wave1AppConfig}`, '2023-03-01'),
          body: {
            location,
            sku: { name: 'free' },
            properties: { disableLocalAuth: false },
          },
          expect: [200, 201, 202],
        },
      ],
    },
  ];
}

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

async function request(step) {
  const response = await fetch(`${baseUrl}${step.path}`, {
    method: step.method,
    headers: {
      authorization: 'Bearer globalstack-local-token',
      'content-type': 'application/json',
    },
    body: step.body === undefined ? undefined : JSON.stringify(step.body),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 500);
  }
  return {
    label: step.label,
    method: step.method,
    path: step.path,
    status: response.status,
    errorCode: errorCode(body),
    ok: step.expect.includes(response.status)
      && (!step.expectErrorCodes || step.expectErrorCodes.includes(errorCode(body))),
    body,
  };
}

async function waitForStorageAccountReady(step) {
  if (step.method !== 'PUT' || !step.path.includes('/providers/Microsoft.Storage/storageAccounts/') || step.path.includes('/blobServices/') || step.path.includes('/queueServices/') || step.path.includes('/fileServices/') || step.path.includes('/tableServices/')) {
    return [];
  }
  const waitSteps = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const waitStep = await request({
      label: `${step.label} readiness ${attempt + 1}`,
      method: 'GET',
      path: step.path,
      expect: [200],
    });
    waitSteps.push(waitStep);
    if (waitStep.body?.properties?.provisioningState === 'Succeeded') break;
  }
  return waitSteps;
}

async function waitForHealth(timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/_globalstack/health`);
      if (response.ok) return await response.json().catch(() => ({}));
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`GlobalStack Azure did not become healthy at ${baseUrl}`);
}

async function startHybridArmFacade() {
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/_globalstack/health`);
  if (!response.ok) {
    throw new Error(`GlobalStack hybrid ARM facade health check failed with HTTP ${response.status}`);
  }

  return {
    kind: 'hybrid',
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function startGlobalStackSidecar() {
  if (!process.env.GLOBALSTACK_AUTH_TOKEN) {
    throw new Error('GLOBALSTACK_AUTH_TOKEN is required in the environment for GlobalStack Azure sidecar deploy smoke.');
  }

  const docker = await dockerCommand();
  const composePath = join(root, 'templates', 'docker-compose.globalstack-azure.yml');
  const code = await run(docker.command, [
    ...docker.prefix,
    'compose',
    '-f',
    composePath,
    'up',
    '-d',
    'globalstack-azure',
  ], { env: process.env });
  if (code !== 0) throw new Error(`docker compose up exited ${code}`);

  await waitForHealth();
  return {
    kind: 'globalstack-sidecar',
    close: async () => {
      await run(docker.command, [
        ...docker.prefix,
        'compose',
        '-f',
        composePath,
        'down',
        '--remove-orphans',
      ], { env: process.env, stdio: 'ignore' });
    },
  };
}

async function startBackend() {
  if (backend === 'hybrid') {
    return startHybridArmFacade();
  }
  if (backend === 'globalstack-sidecar') {
    return startGlobalStackSidecar();
  }
  throw new Error(`Unsupported deploy-smoke backend: ${backend}. Use "hybrid" or "globalstack-sidecar".`);
}

function deploymentInstruction(caseDef) {
  const scenario = scenarioById.get(caseDef.scenarioId);
  return [
    scenario.prompt,
    '',
    'Implement these task-owned Azure resources:',
    ...caseDef.steps
      .filter(step => step.method === 'PUT' && !step.label.startsWith('resource group'))
      .map(step => `- ${step.label}`),
    '',
    'Keep services that are outside this task scope as explicit future integration boundaries in outputs or comments, while deploying the Azure resources requested above.',
  ].join('\n');
}

async function writeGeneratedInputs(cases) {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(outRoot, { recursive: true });
  const manifest = [];
  for (const caseDef of cases) {
    const scenario = scenarioById.get(caseDef.scenarioId);
    const dir = join(outRoot, caseDef.id);
    await mkdir(dir, { recursive: true });
    const metadata = {
      id: caseDef.id,
      domain: caseDef.domain,
      scenarioId: caseDef.scenarioId,
      title: scenario.title,
      cloud: 'azure',
      localCloud: backend === 'hybrid' ? 'globalstack-in-process' : 'globalstack-sidecar',
      deployBackend: backend,
      services: scenario.services,
      globalstackCoverage: scenario.globalstackCoverage,
      resourceGroup: caseDef.resourceGroup,
      deployStepCount: caseDef.steps.length,
    };
    await writeFile(join(dir, 'instruction.md'), deploymentInstruction(caseDef));
    await writeFile(join(dir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    manifest.push(metadata);
  }
  await writeFile(join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function summarize(results) {
  const lines = [
    '# Azure Deploy Smoke Report',
    '',
    `Backend: ${backend}`,
    `Endpoint: ${baseUrl}`,
    `Location: ${location}`,
    '',
  ];

  if (results.length === 0) {
    lines.push('No deploy steps were executed.');
    lines.push('');
  }

  for (const result of results) {
    lines.push(`## ${result.title}`);
    lines.push('');
    lines.push(`Domain: ${result.domain}`);
    lines.push(`Status: ${result.ok ? 'pass' : 'fail'}`);
    lines.push('');
    for (const step of result.steps) {
      const error = step.errorCode ? ` ${step.errorCode}` : '';
      lines.push(`- ${step.ok ? 'PASS' : 'FAIL'} ${step.method} ${step.label}: HTTP ${step.status}${error}`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

const runSuffix = suffix();
const cases = caseDefinitions(runSuffix);
await writeGeneratedInputs(cases);

const results = [];
if (!generateOnly) {
  let backendHandle;
  try {
    backendHandle = await startBackend();
    for (const caseDef of cases) {
      const scenario = scenarioById.get(caseDef.scenarioId);
      const steps = [];
      for (const step of caseDef.steps) {
        const result = await request(step);
        steps.push(result);
        if (result.ok) {
          steps.push(...await waitForStorageAccountReady(step));
        }
      }

      if (!skipCleanup) {
        steps.push(await request({
          label: `cleanup ${caseDef.resourceGroup}`,
          method: 'DELETE',
          path: resourceGroupPath(caseDef.resourceGroup),
          expect: [200, 202, 204],
        }));
      }

      results.push({
        id: caseDef.id,
        title: scenario.title,
        domain: caseDef.domain,
        resourceGroup: caseDef.resourceGroup,
        ok: steps.every(step => step.ok || step.label.startsWith('cleanup ')),
        steps,
        generatedResourceIds: caseDef.steps
          .filter(step => step.path.includes('/providers/'))
          .map(step => armId(caseDef.resourceGroup, step.path.split('/providers/')[1].split('?')[0].split('/')[0], step.path.split('/providers/')[1].split('?')[0].split('/').slice(1).join('/'))),
      });
    }
  } catch (error) {
    results.push({
      id: `${backend}-startup`,
      title: `${backend} startup`,
      domain: 'Environment',
      resourceGroup: null,
      ok: false,
      steps: [
        {
          label: `start ${backend} and wait for health`,
          method: 'START',
          path: '/_globalstack/health',
          status: 0,
          ok: false,
          body: error instanceof Error ? error.message : String(error),
        },
      ],
    });
  } finally {
    if (backendHandle) await backendHandle.close();
  }
}

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  endpoint: baseUrl,
  backend,
  location,
  generateOnly,
  results,
}, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), summarize(results));

if (generateOnly) {
  console.log(`Generated ${cases.length} Azure deploy-smoke prompt bundles in ${outRoot}`);
} else {
  const failed = results.filter(result => !result.ok);
  console.log(`Azure deploy smoke completed: ${results.length - failed.length}/${results.length} cases passed.`);
  if (failed.length > 0) {
    console.error(`Report: ${join(outRoot, 'report.md')}`);
    process.exit(1);
  }
}
