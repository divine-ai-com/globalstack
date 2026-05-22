import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

const root = workspaceRoot(import.meta.url);
const model = process.env.OPENAI_MODEL ?? 'gpt-5.5';
const location = process.env.AZURE_LOCATION ?? 'eastus';
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const outRoot = join(root, 'dist', 'live-model-trial');
let baseUrl = 'http://127.0.0.1:0';

const forbiddenModelFacingTerms = /\b(GlobalStack|LocalStack|emulator|emulation)\b|local endpoint|local deployment|locally supported|deploy smoke|coverage snapshot|GlobalStack_InvalidSku_For_Conformance/i;

const platforms = [
  {
    id: 'azure-terraform-hcl',
    label: 'Terraform HCL',
    files: ['lib/provider.tf', 'lib/variables.tf', 'lib/main.tf', 'lib/outputs.tf'],
    instruction:
      'Use Terraform HCL with only the Azure AzAPI provider v2.x. Do not use the azurerm provider. Configure provider "azapi" with use_cli = true. Use azapi_resource for the resource group and all workload resources. The resource group must use parent_id = "/subscriptions/${data.azapi_client_config.current.subscription_id}". Use native HCL object bodies, not jsonencode strings. Keep provider bodies schema-valid for the chosen API versions: do not add unsupported namespace properties such as minimumTlsVersion or publicNetworkAccess to Microsoft.ServiceBus/namespaces@2021-11-01 or Microsoft.EventHub/namespaces@2021-11-01. Do not disable schema validation. Return provider configuration, variables, main resources, and outputs.',
    markers: ['azapi_resource', 'Microsoft.Storage/storageAccounts', 'Microsoft.ServiceBus/namespaces', 'Microsoft.EventGrid/topics', 'Microsoft.EventHub/namespaces', 'Microsoft.AppConfiguration/configurationStores'],
    nativeGuards: ['no-azurerm', 'no-jsonencode', 'azapi-v2-use-cli'],
  },
  {
    id: 'azure-opentofu-hcl',
    label: 'OpenTofu HCL',
    files: ['lib/provider.tf', 'lib/variables.tf', 'lib/main.tf', 'lib/outputs.tf'],
    instruction:
      'Use OpenTofu-compatible HCL with only the Azure AzAPI provider v2.x. Do not use the azurerm provider. Configure provider "azapi" with use_cli = true. Use azapi_resource for the resource group and all workload resources. The resource group must use parent_id = "/subscriptions/${data.azapi_client_config.current.subscription_id}". Use native HCL object bodies, not jsonencode strings. Keep provider bodies schema-valid for the chosen API versions: do not add unsupported namespace properties such as minimumTlsVersion or publicNetworkAccess to Microsoft.ServiceBus/namespaces@2021-11-01 or Microsoft.EventHub/namespaces@2021-11-01. Do not disable schema validation. Return provider configuration, variables, main resources, and outputs.',
    markers: ['azapi_resource', 'Microsoft.Storage/storageAccounts', 'Microsoft.ServiceBus/namespaces', 'Microsoft.EventGrid/topics', 'Microsoft.EventHub/namespaces', 'Microsoft.AppConfiguration/configurationStores'],
    nativeGuards: ['no-azurerm', 'no-jsonencode', 'azapi-v2-use-cli'],
  },
  {
    id: 'azure-pulumi-ts',
    label: 'Pulumi TypeScript',
    files: ['Pulumi.yaml', 'package.json', 'bin/tap.ts', 'lib/tap-stack.ts'],
    instruction:
      'Use Pulumi TypeScript with @pulumi/azure-native. Return a Pulumi.yaml project file, package.json, bin/tap.ts entry point, and lib/tap-stack.ts stack module.',
    markers: ['@pulumi/azure-native', 'StorageAccount', 'BlobContainer', 'Queue', 'FileShare', 'Table', 'servicebus', 'eventgrid', 'eventhub', 'appconfiguration'],
  },
  {
    id: 'azure-ansible-yaml',
    label: 'Ansible YAML',
    files: ['ansible.cfg', 'inventory.yml', 'lib/playbook.yml'],
    instruction:
      'Use Ansible YAML with azure.azcollection.azure_rm_resource for Azure ARM resource creation. Return ansible.cfg, inventory.yml, and lib/playbook.yml.',
    markers: ['azure_rm_resource', 'Microsoft.Storage', 'Microsoft.ServiceBus', 'Microsoft.EventGrid', 'Microsoft.EventHub', 'Microsoft.AppConfiguration'],
  },
  {
    id: 'azure-bicep',
    label: 'Bicep',
    files: ['lib/main.bicep', 'lib/workload.bicep', 'lib/parameters.json'],
    instruction:
      'Use idiomatic Azure Bicep. Return a subscription-scoped lib/main.bicep that creates the resource group and calls a module, a resource-group-scoped lib/workload.bicep module that creates the workload resources, and lib/parameters.json. Do not embed raw ARM JSON strings inside Bicep resources.',
    markers: ['Microsoft.Storage/storageAccounts', 'Microsoft.ServiceBus/namespaces', 'Microsoft.EventGrid/topics', 'Microsoft.EventHub/namespaces', 'Microsoft.AppConfiguration/configurationStores'],
  },
];

function suffix() {
  return `${Date.now().toString(36).slice(-5)}${process.pid.toString(36)}`.toLowerCase();
}

function names(platformId, runSuffix) {
  const compactPlatform = platformId.replace(/[^a-z0-9]/g, '').slice(5, 13).toLowerCase();
  const compact = `${compactPlatform}${runSuffix}`.replace(/[^a-z0-9]/g, '').toLowerCase();
  return {
    resourceGroup: `rg-az-${compactPlatform}-${runSuffix}`.slice(0, 90),
    storage: `az${compact}`.slice(0, 24),
    serviceBus: `az-sb-${compact}`.slice(0, 50),
    eventGridTopic: `eg-${compact}`.slice(0, 40),
    eventHubNs: `az-eh-${compact}`.slice(0, 50),
    appConfig: `azcfg${compact}`.slice(0, 50),
    suffix: compact,
  };
}

function promptText(platform, n) {
  return `Our platform team needs an Azure storage and messaging foundation for model artifact intake workflows.

Create ${platform.label} infrastructure as code for an Azure deployment in ${location}. The deployment must create one resource group, one StorageV2 storage account, one private blob container named model-artifacts, one queue named model-jobs, one Azure Files share named modelfiles with a 32 GiB quota, one table named modeltable, one Service Bus Standard namespace with a topic named model-events, one Event Grid topic, one Event Hubs Standard namespace with one event hub named model-stream, and one App Configuration store using the free SKU.

Use these exact resource names:
- Resource group: ${n.resourceGroup}
- Storage account: ${n.storage}
- Service Bus namespace: ${n.serviceBus}
- Event Grid topic: ${n.eventGridTopic}
- Event Hubs namespace: ${n.eventHubNs}
- App Configuration store: ${n.appConfig}

${platform.instruction}

Return exactly these files as Markdown fenced code blocks with a path attribute:
${platform.files.map(file => `- ${file}`).join('\n')}

Every resource must use real Azure resource types, provider APIs, or Azure-native SDK resource classes. Do not include credentials or tenant-specific secrets. Export outputs for the storage account name, blob container name, queue name, file share name, table name, Service Bus topic name, Event Grid topic name, Event Hub name, and App Configuration store name.`;
}

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  const parts = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

async function callOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required to run live platform trials.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: 'medium' },
      text: { verbosity: 'low' },
    }),
  });
  const body = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) throw new Error(`OpenAI Responses API failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  return outputText(body);
}

function extractFiles(markdown) {
  const files = new Map();
  const fencePattern = /```[^\n]*path=["']([^"']+)["'][^\n]*\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fencePattern)) {
    files.set(match[1], match[2].trimEnd());
  }
  return files;
}

function validateModelFacing(label, text) {
  const match = text.match(forbiddenModelFacingTerms);
  if (match) throw new Error(`${label} contains runtime-only term "${match[0]}"`);
}

function validateFiles(platform, n, files) {
  const errors = [];
  for (const required of platform.files) {
    if (!files.has(required)) errors.push(`missing required file ${required}`);
  }
  const joined = [...files.values()].join('\n');
  for (const marker of platform.markers) {
    if (!joined.includes(marker)) errors.push(`missing expected Azure IaC marker ${marker}`);
  }
  for (const requiredName of [n.storage, n.serviceBus, n.eventGridTopic, n.eventHubNs, n.appConfig, 'model-artifacts', 'model-jobs', 'modelfiles', 'modeltable', 'model-events', 'model-stream']) {
    if (!joined.includes(requiredName)) errors.push(`missing requested resource name ${requiredName}`);
  }
  if (platform.nativeGuards?.includes('no-azurerm') && joined.match(/\bazurerm[_\s.]/i)) errors.push('native HCL must not use azurerm');
  if (platform.nativeGuards?.includes('no-jsonencode') && joined.includes('jsonencode(')) errors.push('native HCL must use AzAPI v2 object bodies, not jsonencode');
  if (platform.nativeGuards?.includes('azapi-v2-use-cli') && !joined.match(/use_cli\s*=\s*true/)) errors.push('native HCL must configure provider "azapi" with use_cli = true');
  if (platform.nativeGuards?.includes('azapi-v2-use-cli') && joined.includes('schema_validation_enabled = false')) errors.push('native HCL must keep AzAPI schema validation enabled');
  if (platform.nativeGuards?.includes('azapi-v2-use-cli') && !joined.match(/data\s+"azapi_client_config"\s+"current"/)) errors.push('native HCL must use azapi_client_config for subscription context');
  if (errors.length) throw new Error(errors.join('; '));
}

function providerPath(resourceGroup, provider, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${provider}/${typePath}?api-version=${apiVersion}`;
}

function resourceGroupPath(name) {
  return `/subscriptions/${subscriptionId}/resourcegroups/${name}?api-version=2021-04-01`;
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
  const errorCode = body?.error?.code ?? body?.code ?? null;
  return {
    ...step,
    status: response.status,
    errorCode,
    ok: step.expect.includes(response.status),
    body,
  };
}

function deploySteps(n) {
  return [
    {
      label: `resource group ${n.resourceGroup}`,
      method: 'PUT',
      path: resourceGroupPath(n.resourceGroup),
      body: { location },
      expect: [200, 201],
    },
    {
      label: `storage account ${n.storage}`,
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.Storage', `storageAccounts/${n.storage}`, '2023-01-01'),
      body: { location, sku: { name: 'Standard_LRS' }, kind: 'StorageV2', properties: { allowBlobPublicAccess: false } },
      expect: [200, 201, 202],
    },
    {
      label: 'blob container',
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.Storage', `storageAccounts/${n.storage}/blobServices/default/containers/model-artifacts`, '2023-01-01'),
      body: { properties: { publicAccess: 'None' } },
      expect: [200, 201, 202],
    },
    {
      label: 'queue',
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.Storage', `storageAccounts/${n.storage}/queueServices/default/queues/model-jobs`, '2023-01-01'),
      body: { properties: {} },
      expect: [200, 201, 202],
    },
    {
      label: 'file share',
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.Storage', `storageAccounts/${n.storage}/fileServices/default/shares/modelfiles`, '2023-01-01'),
      body: { properties: { shareQuota: 32 } },
      expect: [200, 201, 202],
    },
    {
      label: 'table',
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.Storage', `storageAccounts/${n.storage}/tableServices/default/tables/modeltable`, '2023-01-01'),
      body: { properties: {} },
      expect: [200, 201, 202],
    },
    {
      label: `service bus namespace ${n.serviceBus}`,
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.ServiceBus', `namespaces/${n.serviceBus}`, '2021-11-01'),
      body: { location, sku: { name: 'Standard', tier: 'Standard' }, properties: {} },
      expect: [200, 201, 202],
    },
    {
      label: 'service bus topic',
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.ServiceBus', `namespaces/${n.serviceBus}/topics/model-events`, '2021-11-01'),
      body: { properties: { maxSizeInMegabytes: 1024 } },
      expect: [200, 201, 202],
    },
    {
      label: `event grid topic ${n.eventGridTopic}`,
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.EventGrid', `topics/${n.eventGridTopic}`, '2022-06-15'),
      body: { location, properties: { inputSchema: 'EventGridSchema' } },
      expect: [200, 201, 202],
    },
    {
      label: `event hubs namespace ${n.eventHubNs}`,
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.EventHub', `namespaces/${n.eventHubNs}`, '2024-01-01'),
      body: { location, sku: { name: 'Standard', tier: 'Standard', capacity: 1 }, properties: {} },
      expect: [200, 201, 202],
    },
    {
      label: 'event hub',
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.EventHub', `namespaces/${n.eventHubNs}/eventhubs/model-stream`, '2024-01-01'),
      body: { properties: { partitionCount: 2, messageRetentionInDays: 1 } },
      expect: [200, 201, 202],
    },
    {
      label: `app configuration ${n.appConfig}`,
      method: 'PUT',
      path: providerPath(n.resourceGroup, 'Microsoft.AppConfiguration', `configurationStores/${n.appConfig}`, '2023-03-01'),
      body: { location, sku: { name: 'free' }, properties: { disableLocalAuth: false } },
      expect: [200, 201, 202],
    },
  ];
}

async function waitForStorageAccountReady(step) {
  if (step.method !== 'PUT' || !step.path.includes('/providers/Microsoft.Storage/storageAccounts/') || step.path.includes('/blobServices/') || step.path.includes('/queueServices/') || step.path.includes('/fileServices/') || step.path.includes('/tableServices/')) return [];
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

async function deployToGlobalStack(n) {
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const steps = [];
  try {
    for (const step of deploySteps(n)) {
      const result = await request(step);
      steps.push(result);
      if (result.ok) steps.push(...await waitForStorageAccountReady(step));
      if (!result.ok) break;
    }
  } finally {
    steps.push(await request({
      label: `cleanup ${n.resourceGroup}`,
      method: 'DELETE',
      path: resourceGroupPath(n.resourceGroup),
      expect: [200, 202, 204],
    }));
    await new Promise(resolve => server.close(resolve));
  }
  const deployOnly = steps.filter(step => !step.label.startsWith('cleanup '));
  const failed = deployOnly.find(step => !step.ok);
  const cleanup = steps.find(step => step.label.startsWith('cleanup '));
  return {
    summary: {
      status: failed ? 'FAIL' : 'PASS',
      endpoint: baseUrl,
      resourceGroupName: n.resourceGroup,
      failedStep: failed ? {
        label: failed.label,
        status: failed.status,
        errorCode: failed.errorCode,
        body: failed.body,
      } : null,
      cleanupStatus: cleanup?.ok ? 'PASS' : 'FAIL',
      stepCount: deployOnly.length,
    },
    steps,
  };
}

async function runTrial(platform, sharedSuffix) {
  const n = names(platform.id, sharedSuffix);
  const dir = join(outRoot, platform.id, `trial${sharedSuffix}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'lib'), { recursive: true });

  const prompt = promptText(platform, n);
  validateModelFacing(`${platform.id} prompt`, prompt);
  await writeFile(join(dir, 'lib', 'PROMPT.md'), `${prompt}\n`);

  const modelResponse = await callOpenAI(prompt);
  validateModelFacing(`${platform.id} model response`, modelResponse);
  await writeFile(join(dir, 'lib', 'MODEL_RESPONSE.md'), `${modelResponse}\n`);

  const files = extractFiles(modelResponse);
  validateFiles(platform, n, files);
  for (const [relativePath, content] of files) {
    validateModelFacing(`${platform.id} ${relativePath}`, content);
    const target = join(dir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${content}\n`);
  }

  const deployment = await deployToGlobalStack(n);
  await writeFile(join(dir, 'deployment-report.json'), `${JSON.stringify(deployment, null, 2)}\n`);
  await writeFile(join(dir, 'metadata.json'), `${JSON.stringify({
    model,
    platform: platform.id,
    label: platform.label,
    outputRoot: dir,
    deploymentStatus: deployment.summary.status,
    cleanupStatus: deployment.summary.cleanupStatus,
    executionMode: 'openai-responses-api-to-platform-iac-to-validated-arm-operation-plan-to-globalstack-hybrid-arm-facade',
    providerCliExecution: false,
  }, null, 2)}\n`);

  return {
    platform: platform.id,
    label: platform.label,
    outputRoot: dir,
    deploymentStatus: deployment.summary.status,
    cleanupStatus: deployment.summary.cleanupStatus,
    failedStep: deployment.summary.failedStep,
  };
}

const requested = process.argv
  .filter(arg => arg.startsWith('--platform='))
  .flatMap(arg => arg.split('=')[1].split(','))
  .filter(Boolean);
const selected = requested.length
  ? platforms.filter(platform => requested.includes(platform.id))
  : platforms;
const runSuffix = suffix();
const results = [];

for (const platform of selected) {
  console.log(`Running live model trial for ${platform.id}...`);
  try {
    results.push(await runTrial(platform, runSuffix));
  } catch (error) {
    results.push({
      platform: platform.id,
      label: platform.label,
      deploymentStatus: 'FAIL',
      cleanupStatus: 'UNKNOWN',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

await mkdir(join(outRoot, 'platform-trials'), { recursive: true });
const summaryPath = join(outRoot, 'platform-trials', `trial${runSuffix}.json`);
await writeFile(summaryPath, `${JSON.stringify({
  model,
  runSuffix,
  results,
}, null, 2)}\n`);

console.log(JSON.stringify({
  model,
  summaryPath,
  results,
}, null, 2));

if (results.some(result => result.deploymentStatus !== 'PASS' || result.cleanupStatus !== 'PASS')) process.exit(1);
