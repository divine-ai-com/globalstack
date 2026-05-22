import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { distPath, verifiedWorkspacePath, workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { spawn } from 'node:child_process';
import { azurePlatforms } from '../../platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const verifiedRoot = verifiedWorkspacePath(root);
const runtimeRoot = distPath(root, 'verified-bundle-runtime');
const model = process.env.OPENAI_MODEL ?? 'gpt-5.5';
const location = process.env.AZURE_LOCATION ?? 'eastus';
const authToken = process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-local-token';
const forbiddenModelFacingTerms = /\b(GlobalStack|LocalStack|emulator|emulation)\b|local endpoint|local deployment|locally supported|deploy smoke|coverage snapshot/i;
const requestedItems = process.argv
  .filter(arg => arg.startsWith('--bundle='))
  .flatMap(arg => arg.split('=')[1].split(',').map(item => item.trim()).filter(Boolean));

const platformById = new Map(azurePlatforms.map(platform => [platform.id, platform]));

function platformIdToImageTag(platformId) {
  const platform = platformById.get(platformId);
  if (!platform) throw new Error(`Unknown platform ${platformId}`);
  return platform.imageTag;
}

async function imageExists(docker, image) {
  const inspectCode = await run(docker.command, [...docker.prefix, 'image', 'inspect', image], { cwd: root, stdio: 'ignore' });
  return inspectCode === 0;
}

const starterBundles = [
  {
    platformId: 'azure-terraform-hcl',
    scenarioId: 'mlops-feature-intake-lake',
    poId: '8d5c61df-f75d-4ee3-a3d6-f4f0fcb4a101',
    prId: 'Pr91001',
  },
  {
    platformId: 'azure-pulumi-ts',
    scenarioId: 'robotics-fleet-telemetry-buffer',
    poId: '9f7a9d20-34cb-4d4a-bbd0-4aee0d6eb102',
    prId: 'Pr91002',
  },
  {
    platformId: 'azure-bicep',
    scenarioId: 'regulated-genai-knowledge-ingestion',
    poId: '0fb57f73-b5c4-4d8d-bf1e-e88f2164c103',
    prId: 'Pr91003',
  },
];

const scenarios = new Map([
  ['mlops-feature-intake-lake', {
    title: 'MLOps feature intake lake',
    narrative: [
      'Feature batches arrive from training and online inference systems throughout the day.',
      'The platform team needs a small Azure landing zone where raw feature packages can be uploaded, ingestion work can be queued, fan-out events can be published, and a compact operational ledger can be queried during investigations.',
      'The deployment should stay narrowly focused on the storage and messaging foundation for the feature intake path.',
    ].join(' '),
    containerName: 'feature-artifacts',
    queueName: 'feature-jobs',
    fileShareName: 'featurefiles',
    tableName: 'featureledger',
    serviceBusTopicName: 'feature-events',
    eventHubName: 'feature-stream',
    outputKeys: [
      'FeatureLakeStorageAccountName',
      'FeatureArtifactsContainerName',
      'FeatureJobsQueueName',
      'FeatureFilesShareName',
      'FeatureLedgerTableName',
      'FeatureEventsTopicName',
      'FeatureStreamHubName',
      'FeatureConfigStoreName',
    ],
  }],
  ['robotics-fleet-telemetry-buffer', {
    title: 'Robotics fleet telemetry buffer',
    narrative: [
      'A robotics operations team needs a resilient Azure control-plane slice for field telemetry intake.',
      'Robot agents upload diagnostics packages, queue processing jobs, publish fleet events, and stream live telemetry into a bounded hub before downstream digital-twin systems consume it.',
      'Keep the task limited to the Azure storage and messaging assets required for this intake layer.',
    ].join(' '),
    containerName: 'robot-artifacts',
    queueName: 'robot-jobs',
    fileShareName: 'robotfiles',
    tableName: 'robotledger',
    serviceBusTopicName: 'robot-events',
    eventHubName: 'robot-stream',
    outputKeys: [
      'RobotTelemetryStorageAccountName',
      'RobotArtifactsContainerName',
      'RobotJobsQueueName',
      'RobotFilesShareName',
      'RobotLedgerTableName',
      'RobotEventsTopicName',
      'RobotTelemetryHubName',
      'RobotFleetConfigStoreName',
    ],
  }],
  ['regulated-genai-knowledge-ingestion', {
    title: 'Regulated GenAI knowledge ingestion',
    narrative: [
      'A regulated document-ingestion team needs Azure infrastructure for a retrieval pipeline that stages source documents, records ingestion work, and emits review events.',
      'The task should provision only the storage and messaging surfaces required for document intake and operational control, with application logic and model-serving systems treated as external follow-on integrations.',
    ].join(' '),
    containerName: 'knowledge-documents',
    queueName: 'knowledge-jobs',
    fileShareName: 'knowledgefiles',
    tableName: 'knowledgeledger',
    serviceBusTopicName: 'knowledge-events',
    eventHubName: 'knowledge-stream',
    outputKeys: [
      'KnowledgeStorageAccountName',
      'KnowledgeDocumentsContainerName',
      'KnowledgeJobsQueueName',
      'KnowledgeFilesShareName',
      'KnowledgeLedgerTableName',
      'KnowledgeEventsTopicName',
      'KnowledgeStreamHubName',
      'KnowledgeConfigStoreName',
    ],
  }],
]);

const platformInstructions = new Map([
  ['azure-terraform-hcl', {
    files: ['lib/provider.tf', 'lib/variables.tf', 'lib/main.tf', 'lib/outputs.tf'],
    instruction: [
      'Use Terraform HCL with only the Azure AzAPI provider v2.x.',
      'Do not use the azurerm provider.',
      'Configure provider "azapi" with use_cli = true and a data "azapi_client_config" "current" block.',
      'Use azapi_resource for the resource group and every workload resource.',
      'Use native HCL object bodies, not jsonencode strings.',
      'Create explicit azapi_resource parents for blobServices/default, queueServices/default, fileServices/default, and tableServices/default, then attach the container, queue, share, and table by setting parent_id to those explicit service resources.',
      'Do not append /blobServices/default, /queueServices/default, /fileServices/default, or /tableServices/default onto the storage account id in a string expression.',
      'Keep each task-owned resource in lib/main.tf and only outputs in lib/outputs.tf.',
    ].join(' '),
    requiredMarkers: [
      'azapi_resource',
      'data "azapi_client_config" "current"',
      'use_cli = true',
      'Microsoft.Storage/storageAccounts',
      'Microsoft.Storage/storageAccounts/blobServices',
      'Microsoft.Storage/storageAccounts/queueServices',
      'Microsoft.Storage/storageAccounts/fileServices',
      'Microsoft.Storage/storageAccounts/tableServices',
      'Microsoft.ServiceBus/namespaces',
      'Microsoft.EventGrid/topics',
      'Microsoft.EventHub/namespaces',
      'Microsoft.AppConfiguration/configurationStores',
    ],
    unitTestCommand: 'python3 test/terraform.unit.test.py',
    integrationTestCommand: 'python3 test/terraform.int.test.py',
  }],
  ['azure-pulumi-ts', {
    files: ['Pulumi.yaml', 'package.json', 'bin/tap.ts', 'lib/tap-stack.ts'],
    instruction: [
      'Use Pulumi TypeScript with @pulumi/azure-native.',
      'Set Pulumi.yaml main to bin/tap.ts.',
      'Put the entry point in bin/tap.ts and the reusable stack construction in lib/tap-stack.ts.',
      'Name the stack factory function createTapStack and import that exact symbol from bin/tap.ts.',
      'Use a conservative package.json dependency set that is known to resolve in the runner: "@pulumi/azure-native": "^2.80.0", "@pulumi/pulumi": "^3.122.0", "@types/node": "^20.0.0", "ts-node": "^10.9.2", "typescript": "^5.0.0".',
      'Export exactly the requested output keys from the Pulumi program.',
      'Derive returned outputs from deployed resource outputs rather than hardcoded literal wrappers when the resource output is available.',
      'Do not use random suffix generators; use the exact resource names provided.',
    ].join(' '),
    requiredMarkers: ['@pulumi/azure-native', 'ResourceGroup', 'StorageAccount', 'servicebus', 'eventgrid', 'eventhub', 'appconfiguration'],
    unitTestCommand: 'node test/tap-stack.unit.test.mjs',
    integrationTestCommand: 'node test/tap-stack.int.test.mjs',
  }],
  ['azure-bicep', {
    files: ['lib/main.bicep', 'lib/workload.bicep', 'lib/parameters.json'],
    instruction: [
      'Use Azure Bicep with a subscription-scoped lib/main.bicep that creates the resource group and calls a resource-group-scoped lib/workload.bicep module.',
      'Keep parameters in lib/parameters.json.',
      'Expose exactly the requested output keys as Bicep outputs.',
      'Do not embed raw ARM JSON strings inside Bicep resources.',
    ].join(' '),
    requiredMarkers: ["targetScope = 'subscription'", "module workload './workload.bicep'", 'Microsoft.Storage/storageAccounts', 'Microsoft.ServiceBus/namespaces', 'Microsoft.EventGrid/topics', 'Microsoft.EventHub/namespaces', 'Microsoft.AppConfiguration/configurationStores'],
    unitTestCommand: 'python3 test/bicep.unit.test.py',
    integrationTestCommand: 'python3 test/bicep.int.test.py',
  }],
]);

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    child.on('close', code => resolve(code ?? 1));
  });
}

function runCapture(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
      if (options.mirrorStdout !== false) process.stdout.write(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (options.mirrorStderr !== false) process.stderr.write(chunk);
    });
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function fixOwnership(paths) {
  const targetPaths = paths.filter(Boolean);
  if (targetPaths.length === 0) return;
  const owner = `${process.getuid()}:${process.getgid()}`;
  const direct = await run('chown', ['-R', owner, ...targetPaths], { stdio: 'ignore' });
  if (direct === 0) return;
  await run('sudo', ['-n', 'chown', '-R', owner, ...targetPaths], { stdio: 'ignore' });
}

async function removeWithFallback(targetPath) {
  const direct = await run('rm', ['-rf', targetPath], { stdio: 'ignore' });
  if (direct === 0) return;
  await run('sudo', ['-n', 'rm', '-rf', targetPath], { stdio: 'ignore' });
}

async function dockerCommand() {
  const direct = await run('docker', ['info'], { stdio: 'ignore' });
  if (direct === 0) return { command: 'docker', prefix: [] };
  const sudo = await run('sudo', ['-n', 'docker', 'info'], { stdio: 'ignore' });
  if (sudo === 0) return { command: 'sudo', prefix: ['-n', '-E', 'docker'] };
  return { command: 'docker', prefix: [] };
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function visibleBundleDir(task) {
  return join(verifiedRoot, task.poId, task.prId);
}

function runtimeBundleDir(task) {
  return join(runtimeRoot, task.poId, task.prId);
}

function uniqueSuffix(platformId, scenarioId) {
  const compact = `${platformId}-${scenarioId}`.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(4, 12).toLowerCase();
  return `${compact.slice(0, 8)}${stamp}`.slice(0, 12);
}

function namesFor(platformId, scenarioId) {
  const suffix = uniqueSuffix(platformId, scenarioId);
  const platformShort = platformId.replace(/^azure-/, '').replace(/[^a-z0-9]/g, '').slice(0, 6);
  const scenarioShort = scenarioId.replace(/[^a-z0-9]/g, '').slice(0, 6);
  const compact = `${scenarioShort}${platformShort}${suffix}`.replace(/[^a-z0-9]/g, '').slice(0, 20);
  return {
    environmentSuffix: suffix,
    resourceGroup: `rg-az-${scenarioShort}-${platformShort}-${suffix}`.slice(0, 90),
    storageAccount: `az${compact}`.slice(0, 24),
    serviceBusNamespace: `sb-${scenarioShort}-${platformShort}-${suffix}`.slice(0, 50),
    eventGridTopic: `eg-${scenarioShort}-${platformShort}-${suffix}`.slice(0, 50),
    eventHubNamespace: `eh-${scenarioShort}-${platformShort}-${suffix}`.slice(0, 50),
    appConfigStore: `cfg${compact}`.slice(0, 50),
  };
}

function validateModelFacing(label, text) {
  const match = text.match(forbiddenModelFacingTerms);
  if (match) throw new Error(`${label} contains runtime-only term "${match[0]}"`);
}

function extractFiles(markdown) {
  const files = new Map();
  const fencePattern = /```[^\n]*path=["']([^"']+)["'][^\n]*\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fencePattern)) {
    files.set(match[1], match[2].trimEnd());
  }
  return files;
}

function scenarioResources(scenario, names) {
  return {
    blobContainerName: scenario.containerName,
    queueName: scenario.queueName,
    fileShareName: scenario.fileShareName,
    tableName: scenario.tableName,
    serviceBusTopicName: scenario.serviceBusTopicName,
    eventHubName: scenario.eventHubName,
    ...names,
  };
}

function promptText(platformId, scenarioId, scenario, platform, names) {
  const resources = scenarioResources(scenario, names);
  const resourceContract = platformId === 'azure-pulumi-ts'
    ? [
      'Use this exact Azure resource contract:',
      '- Use the package root imports: @pulumi/azure-native/resources, storage, servicebus, eventgrid, eventhub, and appconfiguration. Do not import a nonexistent versioned namespace path.',
      '- Storage account ARM contract is API version 2023-01-01 with kind StorageV2, sku Standard_LRS, and only these properties: allowBlobPublicAccess=false, minimumTlsVersion=TLS1_2, supportsHttpsTrafficOnly=true. In Pulumi Azure Native, map that ARM property by setting enableHttpsTrafficOnly=true on the StorageAccount resource.',
      '- For Pulumi storage child resources, create BlobContainer, Queue, FileShare, and Table directly with accountName + resourceGroupName + containerName/queueName/shareName/tableName. Do not introduce blobServices/default, queueServices/default, fileServices/default, or tableServices/default helper resources in this platform.',
      '- Blob container API version 2023-01-01 with publicAccess None.',
      '- Queue API version 2023-01-01 with no extra properties.',
      '- File share API version 2023-01-01 with shareQuota 32.',
      '- Table API version 2023-01-01 with no extra properties.',
      '- Service Bus namespace API version 2021-11-01 with sku name Standard and tier Standard.',
      '- Service Bus topic API version 2021-11-01 with maxSizeInMegabytes = 1024.',
      '- Event Grid topic API version 2022-06-15 with inputSchema = EventGridSchema.',
      '- Event Hubs namespace API version 2024-01-01 with sku name Standard, tier Standard, capacity 1.',
      '- Event Hub API version 2024-01-01 with partitionCount = 2 and messageRetentionInDays = 1.',
      '- App Configuration store API version 2023-03-01 with sku name free and disableLocalAuth = false.',
      '- Do not add extra properties such as publicNetworkAccess, defaultToOAuthAuthentication, enablePurgeProtection, softDeleteRetentionInDays, status, or unsupported preview-only fields unless they are explicitly required above.',
    ]
    : [
      'Use this exact Azure resource contract:',
      '- Storage account API version 2023-01-01 with kind StorageV2, sku Standard_LRS, and only these properties: allowBlobPublicAccess=false, minimumTlsVersion=TLS1_2, supportsHttpsTrafficOnly=true.',
      '- For Storage child resources, model blobServices/default, queueServices/default, fileServices/default, and tableServices/default as explicit parent resources. Then create the container, queue, share, and table as children whose name is only the target resource name. Do not encode default/ into the child resource name string.',
      '- Blob container API version 2023-01-01 with publicAccess None.',
      '- Queue API version 2023-01-01 with an empty properties object.',
      '- File share API version 2023-01-01 with shareQuota 32.',
      '- Table API version 2023-01-01 with an empty properties object.',
      '- Service Bus namespace API version 2021-11-01 with sku Standard and an empty properties object.',
      '- Service Bus topic API version 2021-11-01 with properties.maxSizeInMegabytes = 1024.',
      '- Event Grid topic API version 2022-06-15 with properties.inputSchema = EventGridSchema.',
      '- Event Hubs namespace API version 2024-01-01 with sku Standard capacity 1 and an empty properties object.',
      '- Event Hub API version 2024-01-01 with partitionCount = 2 and messageRetentionInDays = 1.',
      '- App Configuration store API version 2023-03-01 with sku name free and properties.disableLocalAuth = false.',
      '- Do not add extra properties such as publicNetworkAccess, defaultToOAuthAuthentication, enablePurgeProtection, softDeleteRetentionInDays, status, or unsupported preview-only fields unless they are explicitly required above.',
    ];
  return [
    scenario.narrative,
    '',
    `I want this written in ${platformById.get(platformId).label}.`,
    '',
    `Build an Azure deployment in ${location}. It must create one resource group, one StorageV2 storage account, one private blob container named ${resources.blobContainerName}, one queue named ${resources.queueName}, one Azure Files share named ${resources.fileShareName} with a 32 GiB quota, one table named ${resources.tableName}, one Service Bus Standard namespace with a topic named ${resources.serviceBusTopicName}, one Event Grid topic, one Event Hubs Standard namespace with one event hub named ${resources.eventHubName}, and one App Configuration store using the free SKU.`,
    '',
    'Use these exact resource names:',
    `- Resource group: ${resources.resourceGroup}`,
    `- Storage account: ${resources.storageAccount}`,
    `- Service Bus namespace: ${resources.serviceBusNamespace}`,
    `- Event Grid topic: ${resources.eventGridTopic}`,
    `- Event Hubs namespace: ${resources.eventHubNamespace}`,
    `- App Configuration store: ${resources.appConfigStore}`,
    '',
    ...resourceContract,
    '',
    `Every resource name that can vary by environment must include the deployment suffix ${resources.environmentSuffix}.`,
    '',
    platform.instruction,
    '',
    `Return exactly these files as Markdown fenced code blocks with a path attribute: ${platform.files.join(', ')}.`,
    'Return only those fenced code blocks and no prose before or after them.',
    '',
    `Export exactly these output keys: ${scenario.outputKeys.map(key => `\`${key}\``).join(', ')}.`,
  ].join('\n');
}

function openAiInput(prompt) {
  return [
    'You are generating Azure infrastructure as code.',
    'Return only Markdown fenced code blocks with a path attribute.',
    'Every requested file must be included exactly once.',
    'Do not include explanation text.',
    '',
    prompt,
  ].join('\n');
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
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: openAiInput(prompt),
      reasoning: { effort: 'medium' },
      text: { verbosity: 'low' },
    }),
  });
  const body = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) throw new Error(`OpenAI Responses API failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  return outputText(body);
}

function repairPrompt(originalPrompt, validationOrRunError, previousResponse) {
  return [
    originalPrompt,
    '',
    'The previous draft did not validate or did not pass the runner lifecycle.',
    `Repair these issues: ${validationOrRunError}`,
    'Return a complete replacement for every requested file.',
    'Do not add any prose outside the fenced code blocks.',
    '',
    'Previous draft:',
    previousResponse,
  ].join('\n');
}

function validateFiles(platformId, scenario, platform, names, files) {
  const errors = [];
  for (const required of platform.files) {
    if (!files.has(required)) errors.push(`missing required file ${required}`);
  }
  const joined = [...files.values()].join('\n');
  for (const marker of platform.requiredMarkers) {
    if (!joined.includes(marker)) errors.push(`missing expected IaC marker ${marker}`);
  }
  for (const requiredName of Object.values(scenarioResources(scenario, names))) {
    if (typeof requiredName === 'string' && !joined.includes(requiredName)) {
      errors.push(`missing requested resource name ${requiredName}`);
    }
  }
  for (const outputKey of scenario.outputKeys) {
    if (!joined.includes(outputKey)) errors.push(`missing expected output key ${outputKey}`);
  }
  for (const forbidden of ['publicNetworkAccess', 'defaultToOAuthAuthentication', 'enablePurgeProtection', 'softDeleteRetentionInDays']) {
    if (joined.includes(forbidden)) errors.push(`contains unsupported property ${forbidden}`);
  }
  if (platformId === 'azure-terraform-hcl') {
    if (joined.match(/\bazurerm[_\s.]/i)) errors.push('Terraform bundle must not use azurerm');
    if (joined.includes('jsonencode(')) errors.push('Terraform bundle must use native HCL object bodies');
    if (joined.includes('"default/${')) errors.push('Terraform bundle must model storage service default resources explicitly instead of embedding default/ in child names');
    if (joined.includes('/blobServices/default') || joined.includes('/queueServices/default') || joined.includes('/fileServices/default') || joined.includes('/tableServices/default')) {
      errors.push('Terraform bundle must create explicit storage service parent resources instead of concatenating default service paths onto the storage account id');
    }
  }
  if (platformId === 'azure-pulumi-ts') {
    const pulumiYaml = files.get('Pulumi.yaml') ?? '';
    const entry = files.get('bin/tap.ts') ?? '';
    const stack = files.get('lib/tap-stack.ts') ?? '';
    const packageJson = files.get('package.json') ?? '';
    if (!pulumiYaml.includes('main: bin/tap.ts')) errors.push('Pulumi bundle must set Pulumi.yaml main to bin/tap.ts');
    if (!entry.includes('createTapStack')) errors.push('Pulumi bundle entry point must import and call createTapStack');
    if (!stack.includes('export function createTapStack')) errors.push('Pulumi bundle must export createTapStack from lib/tap-stack.ts');
    if (!packageJson.includes('"@pulumi/azure-native": "^2.80.0"')) errors.push('Pulumi bundle must pin @pulumi/azure-native to ^2.80.0');
    if (!packageJson.includes('"@pulumi/pulumi": "^3.122.0"')) errors.push('Pulumi bundle must pin @pulumi/pulumi to ^3.122.0');
  }
  if (errors.length > 0) throw new Error(errors.join('; '));
}

function armContract(names, scenario) {
  const resources = scenarioResources(scenario, names);
  return {
    $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      location: { type: 'string' },
      resourceGroupName: { type: 'string' },
      storageAccountName: { type: 'string' },
      serviceBusNamespaceName: { type: 'string' },
      eventGridTopicName: { type: 'string' },
      eventHubNamespaceName: { type: 'string' },
      appConfigurationStoreName: { type: 'string' },
    },
    resources: [
      {
        type: 'Microsoft.Storage/storageAccounts',
        apiVersion: '2023-01-01',
        name: "[parameters('storageAccountName')]",
        location: "[parameters('location')]",
        kind: 'StorageV2',
        sku: { name: 'Standard_LRS' },
        properties: {
          minimumTlsVersion: 'TLS1_2',
          allowBlobPublicAccess: false,
          supportsHttpsTrafficOnly: true,
        },
      },
      {
        type: 'Microsoft.Storage/storageAccounts/blobServices/containers',
        apiVersion: '2023-01-01',
        name: "[concat(parameters('storageAccountName'), '/default/', '" + resources.blobContainerName + "')]",
        dependsOn: ["[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"],
        properties: { publicAccess: 'None' },
      },
      {
        type: 'Microsoft.Storage/storageAccounts/queueServices/queues',
        apiVersion: '2023-01-01',
        name: "[concat(parameters('storageAccountName'), '/default/', '" + resources.queueName + "')]",
        dependsOn: ["[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"],
        properties: {},
      },
      {
        type: 'Microsoft.Storage/storageAccounts/fileServices/shares',
        apiVersion: '2023-01-01',
        name: "[concat(parameters('storageAccountName'), '/default/', '" + resources.fileShareName + "')]",
        dependsOn: ["[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"],
        properties: { shareQuota: 32 },
      },
      {
        type: 'Microsoft.Storage/storageAccounts/tableServices/tables',
        apiVersion: '2023-01-01',
        name: "[concat(parameters('storageAccountName'), '/default/', '" + resources.tableName + "')]",
        dependsOn: ["[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"],
        properties: {},
      },
      {
        type: 'Microsoft.ServiceBus/namespaces',
        apiVersion: '2021-11-01',
        name: "[parameters('serviceBusNamespaceName')]",
        location: "[parameters('location')]",
        sku: { name: 'Standard', tier: 'Standard' },
        properties: {},
      },
      {
        type: 'Microsoft.ServiceBus/namespaces/topics',
        apiVersion: '2021-11-01',
        name: "[concat(parameters('serviceBusNamespaceName'), '/" + resources.serviceBusTopicName + "')]",
        dependsOn: ["[resourceId('Microsoft.ServiceBus/namespaces', parameters('serviceBusNamespaceName'))]"],
        properties: { maxSizeInMegabytes: 1024 },
      },
      {
        type: 'Microsoft.EventGrid/topics',
        apiVersion: '2022-06-15',
        name: "[parameters('eventGridTopicName')]",
        location: "[parameters('location')]",
        properties: { inputSchema: 'EventGridSchema' },
      },
      {
        type: 'Microsoft.EventHub/namespaces',
        apiVersion: '2024-01-01',
        name: "[parameters('eventHubNamespaceName')]",
        location: "[parameters('location')]",
        sku: { name: 'Standard', tier: 'Standard', capacity: 1 },
        properties: {},
      },
      {
        type: 'Microsoft.EventHub/namespaces/eventhubs',
        apiVersion: '2024-01-01',
        name: "[concat(parameters('eventHubNamespaceName'), '/" + resources.eventHubName + "')]",
        dependsOn: ["[resourceId('Microsoft.EventHub/namespaces', parameters('eventHubNamespaceName'))]"],
        properties: { partitionCount: 2, messageRetentionInDays: 1 },
      },
      {
        type: 'Microsoft.AppConfiguration/configurationStores',
        apiVersion: '2023-03-01',
        name: "[parameters('appConfigurationStoreName')]",
        location: "[parameters('location')]",
        sku: { name: 'free' },
        properties: { disableLocalAuth: false },
      },
    ],
    outputs: Object.fromEntries(scenario.outputKeys.map((key) => [key, { type: 'string', value: key }])),
  };
}

function armParameters(names) {
  return {
    $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      location: { value: location },
      resourceGroupName: { value: names.resourceGroup },
      storageAccountName: { value: names.storageAccount },
      serviceBusNamespaceName: { value: names.serviceBusNamespace },
      eventGridTopicName: { value: names.eventGridTopic },
      eventHubNamespaceName: { value: names.eventHubNamespace },
      appConfigurationStoreName: { value: names.appConfigStore },
    },
  };
}

function fileContainsAssertions(platformId, scenario, names) {
  const resources = scenarioResources(scenario, names);
  if (platformId === 'azure-terraform-hcl') {
    return {
      'lib/provider.tf': ['azapi', 'use_cli = true', 'data "azapi_client_config" "current"'],
      'lib/main.tf': [
        'Microsoft.Resources/resourceGroups@2021-04-01',
        'Microsoft.Storage/storageAccounts@2023-01-01',
        'Microsoft.Storage/storageAccounts/blobServices@2023-01-01',
        'Microsoft.Storage/storageAccounts/queueServices@2023-01-01',
        'Microsoft.Storage/storageAccounts/fileServices@2023-01-01',
        'Microsoft.Storage/storageAccounts/tableServices@2023-01-01',
        'Microsoft.ServiceBus/namespaces@2021-11-01',
        'Microsoft.ServiceBus/namespaces/topics@2021-11-01',
        'Microsoft.EventGrid/topics@2022-06-15',
        'Microsoft.EventHub/namespaces@2024-01-01',
        'Microsoft.EventHub/namespaces/eventhubs@2024-01-01',
        'Microsoft.AppConfiguration/configurationStores@2023-03-01',
        'blob_service',
        'queue_service',
        'file_service',
        'table_service',
      ],
      'lib/outputs.tf': scenario.outputKeys,
    };
  }
  if (platformId === 'azure-pulumi-ts') {
    return {
      'Pulumi.yaml': ['runtime: nodejs'],
      'package.json': ['@pulumi/azure-native', '@pulumi/pulumi'],
      'bin/tap.ts': ['@pulumi/pulumi'],
      'lib/tap-stack.ts': [
        'resources.ResourceGroup',
        'storage.StorageAccount',
        'servicebus.Namespace',
        'servicebus.Topic',
        'eventgrid.Topic',
        'eventhub.Namespace',
        'eventhub.EventHub',
        'appconfiguration.ConfigurationStore',
      ],
    };
  }
  return {
    'lib/main.bicep': [...scenario.outputKeys, "targetScope = 'subscription'", "module workload './workload.bicep'"],
    'lib/workload.bicep': [
      'param storageAccountName string',
      'param documentsContainerName string',
      'param jobsQueueName string',
      'param filesShareName string',
      'param ledgerTableName string',
      'param serviceBusNamespaceName string',
      'param eventsTopicName string',
      'param eventGridTopicName string',
      'param eventHubsNamespaceName string',
      'param streamHubName string',
      'param appConfigurationStoreName string',
      'Microsoft.Storage/storageAccounts',
      'Microsoft.ServiceBus/namespaces',
      'Microsoft.EventGrid/topics',
      'Microsoft.EventHub/namespaces',
      'Microsoft.AppConfiguration/configurationStores',
    ],
    'lib/parameters.json': [resources.resourceGroup, resources.storageAccount, resources.serviceBusNamespace, resources.blobContainerName, resources.queueName, resources.fileShareName, resources.tableName, resources.serviceBusTopicName, resources.eventHubName],
  };
}

function integrationChecks(names, scenario) {
  const resources = scenarioResources(scenario, names);
  return [
    { label: 'storage-account', provider: 'Microsoft.Storage', typePath: `storageAccounts/${resources.storageAccount}`, apiVersion: '2023-01-01', expectedName: resources.storageAccount, expectedType: 'Microsoft.Storage/storageAccounts' },
    { label: 'blob-container', provider: 'Microsoft.Storage', typePath: `storageAccounts/${resources.storageAccount}/blobServices/default/containers/${resources.blobContainerName}`, apiVersion: '2023-01-01', expectedName: `${resources.storageAccount}/default/${resources.blobContainerName}`, expectedType: 'Microsoft.Storage/storageAccounts/blobServices/containers' },
    { label: 'queue', provider: 'Microsoft.Storage', typePath: `storageAccounts/${resources.storageAccount}/queueServices/default/queues/${resources.queueName}`, apiVersion: '2023-01-01', expectedName: `${resources.storageAccount}/default/${resources.queueName}`, expectedType: 'Microsoft.Storage/storageAccounts/queueServices/queues' },
    { label: 'file-share', provider: 'Microsoft.Storage', typePath: `storageAccounts/${resources.storageAccount}/fileServices/default/shares/${resources.fileShareName}`, apiVersion: '2023-01-01', expectedName: `${resources.storageAccount}/default/${resources.fileShareName}`, expectedType: 'Microsoft.Storage/storageAccounts/fileServices/shares' },
    { label: 'table', provider: 'Microsoft.Storage', typePath: `storageAccounts/${resources.storageAccount}/tableServices/default/tables/${resources.tableName}`, apiVersion: '2023-01-01', expectedName: `${resources.storageAccount}/default/${resources.tableName}`, expectedType: 'Microsoft.Storage/storageAccounts/tableServices/tables' },
    { label: 'service-bus-namespace', provider: 'Microsoft.ServiceBus', typePath: `namespaces/${resources.serviceBusNamespace}`, apiVersion: '2021-11-01', expectedName: resources.serviceBusNamespace, expectedType: 'Microsoft.ServiceBus/namespaces' },
    { label: 'service-bus-topic', provider: 'Microsoft.ServiceBus', typePath: `namespaces/${resources.serviceBusNamespace}/topics/${resources.serviceBusTopicName}`, apiVersion: '2021-11-01', expectedName: `${resources.serviceBusNamespace}/${resources.serviceBusTopicName}`, expectedType: 'Microsoft.ServiceBus/namespaces/topics' },
    { label: 'event-grid-topic', provider: 'Microsoft.EventGrid', typePath: `topics/${resources.eventGridTopic}`, apiVersion: '2022-06-15', expectedName: resources.eventGridTopic, expectedType: 'Microsoft.EventGrid/topics' },
    { label: 'event-hub-namespace', provider: 'Microsoft.EventHub', typePath: `namespaces/${resources.eventHubNamespace}`, apiVersion: '2024-01-01', expectedName: resources.eventHubNamespace, expectedType: 'Microsoft.EventHub/namespaces' },
    { label: 'event-hub', provider: 'Microsoft.EventHub', typePath: `namespaces/${resources.eventHubNamespace}/eventhubs/${resources.eventHubName}`, apiVersion: '2024-01-01', expectedName: `${resources.eventHubNamespace}/${resources.eventHubName}`, expectedType: 'Microsoft.EventHub/namespaces/eventhubs' },
    { label: 'app-config-store', provider: 'Microsoft.AppConfiguration', typePath: `configurationStores/${resources.appConfigStore}`, apiVersion: '2023-03-01', expectedName: resources.appConfigStore, expectedType: 'Microsoft.AppConfiguration/configurationStores' },
  ];
}

function expectedOutputs(platformId, scenario, names) {
  const resources = scenarioResources(scenario, names);
  const [storageKey, containerKey, queueKey, shareKey, tableKey, topicKey, hubKey, appConfigKey] = scenario.outputKeys;
  if (platformId === 'azure-pulumi-ts') {
    return {
      [storageKey]: resources.storageAccount,
      [containerKey]: `${resources.storageAccount}/default/${resources.blobContainerName}`,
      [queueKey]: `${resources.storageAccount}/default/${resources.queueName}`,
      [shareKey]: `${resources.storageAccount}/default/${resources.fileShareName}`,
      [tableKey]: `${resources.storageAccount}/default/${resources.tableName}`,
      [topicKey]: `${resources.serviceBusNamespace}/${resources.serviceBusTopicName}`,
      [hubKey]: `${resources.eventHubNamespace}/${resources.eventHubName}`,
      [appConfigKey]: resources.appConfigStore,
    };
  }
  return {
    [storageKey]: resources.storageAccount,
    [containerKey]: resources.blobContainerName,
    [queueKey]: resources.queueName,
    [shareKey]: resources.fileShareName,
    [tableKey]: resources.tableName,
    [topicKey]: resources.serviceBusTopicName,
    [hubKey]: resources.eventHubName,
    [appConfigKey]: resources.appConfigStore,
  };
}

function pythonUnitTest() {
  return `import json
from pathlib import Path

root = Path.cwd()
metadata = json.loads((root / "metadata.json").read_text())

for relative_path in metadata["solutionFiles"]:
    target = root / relative_path
    assert target.exists(), f"missing {relative_path}"

resource_names = metadata["resourceNames"]

if metadata["platformId"] == "azure-bicep":
    main = (root / "lib/main.bicep").read_text()
    workload = (root / "lib/workload.bicep").read_text()
    parameters = json.loads((root / "lib/parameters.json").read_text())["parameters"]
    parameter_values = {name: details["value"] for name, details in parameters.items()}

    assert "targetScope = 'subscription'" in main
    assert "module workload './workload.bicep'" in main

    for param_name in parameters:
        assert f"param {param_name} string" in main, f"main.bicep is missing param {param_name}"
        if param_name not in {"resourceGroupName", "deploymentSuffix"}:
            assert f"param {param_name} string" in workload, f"workload.bicep is missing param {param_name}"
            assert f"{param_name}: {param_name}" in main, f"main.bicep is missing module param mapping {param_name}: {param_name}"

    for marker in [
        "Microsoft.Storage/storageAccounts@2023-01-01",
        "Microsoft.Storage/storageAccounts/blobServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01",
        "Microsoft.Storage/storageAccounts/queueServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01",
        "Microsoft.Storage/storageAccounts/fileServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01",
        "Microsoft.Storage/storageAccounts/tableServices@2023-01-01",
        "Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01",
        "Microsoft.ServiceBus/namespaces@2021-11-01",
        "Microsoft.ServiceBus/namespaces/topics@2021-11-01",
        "Microsoft.EventGrid/topics@2022-06-15",
        "Microsoft.EventHub/namespaces@2024-01-01",
        "Microsoft.EventHub/namespaces/eventhubs@2024-01-01",
        "Microsoft.AppConfiguration/configurationStores@2023-03-01",
    ]:
        assert marker in workload, f"workload.bicep is missing {marker}"

    for param_name, param_value in parameter_values.items():
        if param_value in {
            resource_names["storageAccount"],
            resource_names["blobContainerName"],
            resource_names["queueName"],
            resource_names["fileShareName"],
            resource_names["tableName"],
            resource_names["serviceBusNamespace"],
            resource_names["serviceBusTopicName"],
            resource_names["eventGridTopic"],
            resource_names["eventHubNamespace"],
            resource_names["eventHubName"],
            resource_names["appConfigStore"],
        }:
            assert f"name: {param_name}" in workload, f"workload.bicep is missing binding name: {param_name}"

    assert parameter_values["resourceGroupName"] == resource_names["resourceGroup"]
    for expected_value in [
        resource_names["storageAccount"],
        resource_names["blobContainerName"],
        resource_names["queueName"],
        resource_names["fileShareName"],
        resource_names["tableName"],
        resource_names["serviceBusNamespace"],
        resource_names["serviceBusTopicName"],
        resource_names["eventGridTopic"],
        resource_names["eventHubNamespace"],
        resource_names["eventHubName"],
        resource_names["appConfigStore"],
    ]:
        assert expected_value in parameter_values.values(), f"parameters.json is missing value {expected_value}"

    for output_key in metadata["expectedOutputKeys"]:
        expected_line = f"output {output_key} string = workload.outputs.{output_key}"
        assert expected_line in main, f"main.bicep is missing output {output_key}"
elif metadata["platformId"] == "azure-terraform-hcl":
    provider = (root / "lib/provider.tf").read_text()
    main = (root / "lib/main.tf").read_text()
    outputs = (root / "lib/outputs.tf").read_text()

    for marker in [
        'source  = "Azure/azapi"',
        'provider "azapi"',
        'use_cli = true',
        'data "azapi_client_config" "current" {}',
    ]:
        assert marker in provider, f"provider.tf is missing {marker}"

    for marker in [
        'Microsoft.Resources/resourceGroups@2021-04-01',
        'Microsoft.Storage/storageAccounts@2023-01-01',
        'type      = "Microsoft.Storage/storageAccounts/blobServices@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/queueServices@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/fileServices@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/tableServices@2023-01-01"',
        'type      = "Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01"',
        'Microsoft.ServiceBus/namespaces@2021-11-01',
        'Microsoft.ServiceBus/namespaces/topics@2021-11-01',
        'Microsoft.EventGrid/topics@2022-06-15',
        'Microsoft.EventHub/namespaces@2024-01-01',
        'Microsoft.EventHub/namespaces/eventhubs@2024-01-01',
        'Microsoft.AppConfiguration/configurationStores@2023-03-01',
        'parent_id = azapi_resource.blob_service.id',
        'parent_id = azapi_resource.queue_service.id',
        'parent_id = azapi_resource.file_service.id',
        'parent_id = azapi_resource.table_service.id',
    ]:
        assert marker in main, f"main.tf is missing {marker}"

    for forbidden in [
        '/blobServices/default',
        '/queueServices/default',
        '/fileServices/default',
        '/tableServices/default',
        'jsonencode(',
        'azurerm_',
    ]:
        assert forbidden not in provider + main + outputs, f"Terraform source contains forbidden marker {forbidden}"

    for value in [
        resource_names["resourceGroup"],
        resource_names["storageAccount"],
        resource_names["serviceBusNamespace"],
        resource_names["eventGridTopic"],
        resource_names["eventHubNamespace"],
        resource_names["appConfigStore"],
        resource_names["blobContainerName"],
        resource_names["queueName"],
        resource_names["fileShareName"],
        resource_names["tableName"],
        resource_names["serviceBusTopicName"],
        resource_names["eventHubName"],
    ]:
        assert value in main, f"main.tf is missing concrete contract value {value}"

    for output_key in metadata["expectedOutputKeys"]:
        assert f'output "{output_key}"' in outputs, f"outputs.tf is missing {output_key}"
else:
    raise AssertionError(f"unsupported Python unit-test platform {metadata['platformId']}")

print("unit assertions passed")
`;
}

function pythonIntegrationTest() {
  return `import json
import os
import ssl
from pathlib import Path
from urllib.request import Request, urlopen

root = Path.cwd()
metadata = json.loads((root / "metadata.json").read_text())
endpoint = os.environ.get("AZURE_RESOURCE_MANAGER_ENDPOINT", os.environ.get("ARM_ENDPOINT", "")).rstrip("/")
if not endpoint:
    raise RuntimeError("AZURE_RESOURCE_MANAGER_ENDPOINT or ARM_ENDPOINT must be set")
subscription_id = os.environ["ARM_SUBSCRIPTION_ID"]
resource_group = metadata["resourceNames"]["resourceGroup"]
token = json.loads(Path(os.environ["AZURE_ACCESS_TOKEN_PATH"]).read_text())["access_token"]
raw_outputs = json.loads(Path(os.environ["AZURE_DEPLOYMENT_OUTPUTS_PATH"]).read_text())

def normalize_output_value(value):
    if isinstance(value, dict):
        if "value" in value:
            return normalize_output_value(value["value"])
        if "secret" in value and isinstance(value["secret"], dict) and "value" in value["secret"]:
            return normalize_output_value(value["secret"]["value"])
    return value

outputs = {key: normalize_output_value(value) for key, value in raw_outputs.items()}

for output_key, expected_value in metadata["expectedOutputs"].items():
    assert output_key in outputs, f"missing output {output_key}"
    assert outputs[output_key] == expected_value, f"unexpected output value for {output_key}: {outputs[output_key]}"

def get_json(url: str):
    request = Request(url, headers={"Authorization": f"Bearer {token}", "content-type": "application/json"})
    context = None
    if url.startswith("https://"):
        context = ssl.create_default_context(cafile=os.environ.get("REQUESTS_CA_BUNDLE"))
    with urlopen(request, context=context) as response:
        return json.loads(response.read().decode("utf-8"))

rg_url = f"{endpoint}/subscriptions/{subscription_id}/resourcegroups/{resource_group}?api-version=2021-04-01"
resource_group_payload = get_json(rg_url)
assert resource_group_payload["name"] == resource_group

for check in metadata["integrationChecks"]:
    url = f"{endpoint}/subscriptions/{subscription_id}/resourceGroups/{resource_group}/providers/{check['provider']}/{check['typePath']}?api-version={check['apiVersion']}"
    payload = get_json(url)
    assert payload["name"] == check["expectedName"], f"unexpected resource name for {check['label']}"
    assert payload["type"] == check["expectedType"], f"unexpected resource type for {check['label']}: {payload['type']}"

print("integration assertions passed")
`;
}

function nodeUnitTest() {
  return `import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));

for (const relativePath of metadata.solutionFiles) {
  await readFile(join(root, relativePath), "utf8");
}

if (metadata.platformId !== "azure-pulumi-ts") {
  throw new Error(\`unsupported Node unit-test platform \${metadata.platformId}\`);
}

const pulumiYaml = await readFile(join(root, "Pulumi.yaml"), "utf8");
const packageJson = await readFile(join(root, "package.json"), "utf8");
const entry = await readFile(join(root, "bin/tap.ts"), "utf8");
const stack = await readFile(join(root, "lib/tap-stack.ts"), "utf8");

for (const marker of ["main: bin/tap.ts"]) {
  if (!pulumiYaml.includes(marker)) {
    throw new Error(\`Pulumi.yaml is missing \${marker}\`);
  }
}

if (!pulumiYaml.includes("runtime: nodejs") && !(pulumiYaml.includes("runtime:") && pulumiYaml.includes("name: nodejs"))) {
  throw new Error("Pulumi.yaml must declare the nodejs runtime");
}

for (const marker of ["@pulumi/pulumi", "@pulumi/azure-native"]) {
  if (!packageJson.includes(marker)) {
    throw new Error(\`package.json is missing \${marker}\`);
  }
}

for (const marker of ["createTapStack", "tap-stack"]) {
  if (!entry.includes(marker)) {
    throw new Error(\`bin/tap.ts is missing \${marker}\`);
  }
}

for (const marker of [
  "new resources.ResourceGroup(",
  "new storage.StorageAccount(",
  "new storage.BlobContainer(",
  "new storage.Queue(",
  "new storage.FileShare(",
  "new storage.Table(",
  "new servicebus.Namespace(",
  "new servicebus.Topic(",
  "new eventgrid.Topic(",
  "new eventhub.Namespace(",
  "new eventhub.EventHub(",
  "new appconfiguration.ConfigurationStore(",
]) {
  if (!stack.includes(marker)) {
    throw new Error(\`lib/tap-stack.ts is missing \${marker}\`);
  }
}

for (const value of [
  metadata.resourceNames.resourceGroup,
  metadata.resourceNames.storageAccount,
  metadata.resourceNames.serviceBusNamespace,
  metadata.resourceNames.eventGridTopic,
  metadata.resourceNames.eventHubNamespace,
  metadata.resourceNames.appConfigStore,
  metadata.resourceNames.blobContainerName,
  metadata.resourceNames.queueName,
  metadata.resourceNames.fileShareName,
  metadata.resourceNames.tableName,
  metadata.resourceNames.serviceBusTopicName,
  metadata.resourceNames.eventHubName,
]) {
  if (!stack.includes(value)) {
    throw new Error(\`lib/tap-stack.ts is missing concrete contract value \${value}\`);
  }
}

for (const outputKey of metadata.expectedOutputKeys) {
  if (!entry.includes(\`export const \${outputKey}\`)) {
    throw new Error(\`bin/tap.ts is missing export \${outputKey}\`);
  }
}

console.log("unit assertions passed");
`;
}

function nodeIntegrationTest() {
  return `import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const metadata = JSON.parse(await readFile(join(root, "metadata.json"), "utf8"));
const endpoint = (process.env.AZURE_RESOURCE_MANAGER_ENDPOINT ?? process.env.ARM_ENDPOINT ?? "").replace(/\\/$/, "");
if (!endpoint) {
  throw new Error("AZURE_RESOURCE_MANAGER_ENDPOINT or ARM_ENDPOINT must be set");
}
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID;
const resourceGroup = metadata.resourceNames.resourceGroup;
const token = JSON.parse(await readFile(process.env.AZURE_ACCESS_TOKEN_PATH, "utf8")).access_token;
const rawOutputs = JSON.parse(await readFile(process.env.AZURE_DEPLOYMENT_OUTPUTS_PATH, "utf8"));

function normalizeOutputValue(value) {
  if (value && typeof value === "object") {
    if ("value" in value) {
      return normalizeOutputValue(value.value);
    }
    if ("secret" in value && value.secret && typeof value.secret === "object" && "value" in value.secret) {
      return normalizeOutputValue(value.secret.value);
    }
  }
  return value;
}

const outputs = Object.fromEntries(
  Object.entries(rawOutputs).map(([key, value]) => [key, normalizeOutputValue(value)]),
);

for (const [outputKey, expectedValue] of Object.entries(metadata.expectedOutputs)) {
  if (!(outputKey in outputs)) {
    throw new Error(\`missing output \${outputKey}\`);
  }
  if (outputs[outputKey] !== expectedValue) {
    throw new Error(\`unexpected output value for \${outputKey}: \${outputs[outputKey]}\`);
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Authorization: \`Bearer \${token}\`,
      "content-type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(\`GET \${url} failed with \${response.status}\`);
  }
  return response.json();
}

const rgPayload = await getJson(\`\${endpoint}/subscriptions/\${subscriptionId}/resourcegroups/\${resourceGroup}?api-version=2021-04-01\`);
if (rgPayload.name !== resourceGroup) {
  throw new Error("resource group readback mismatch");
}

for (const check of metadata.integrationChecks) {
  const url = \`\${endpoint}/subscriptions/\${subscriptionId}/resourceGroups/\${resourceGroup}/providers/\${check.provider}/\${check.typePath}?api-version=\${check.apiVersion}\`;
  const payload = await getJson(url);
  if (payload.name !== check.expectedName) {
    throw new Error(\`unexpected resource name for \${check.label}: \${payload.name}\`);
  }
  if (payload.type !== check.expectedType) {
    throw new Error(\`unexpected resource type for \${check.label}: \${payload.type}\`);
  }
}

console.log("integration assertions passed");
`;
}

async function writeBundleSupportFiles(bundleDir, platformId, scenarioId, scenario, names) {
  const resources = scenarioResources(scenario, names);
  await mkdir(join(bundleDir, 'test'), { recursive: true });
  if (platformId === 'azure-pulumi-ts') {
    await writeFile(join(bundleDir, 'test', 'tap-stack.unit.test.mjs'), nodeUnitTest());
    await writeFile(join(bundleDir, 'test', 'tap-stack.int.test.mjs'), nodeIntegrationTest());
  } else if (platformId === 'azure-terraform-hcl') {
    await writeFile(join(bundleDir, 'test', 'terraform.unit.test.py'), pythonUnitTest());
    await writeFile(join(bundleDir, 'test', 'terraform.int.test.py'), pythonIntegrationTest());
  } else {
    await writeFile(join(bundleDir, 'test', 'bicep.unit.test.py'), pythonUnitTest());
    await writeFile(join(bundleDir, 'test', 'bicep.int.test.py'), pythonIntegrationTest());
  }

  const platform = platformInstructions.get(platformId);
  const metadata = {
    provider: 'GlobalStack',
    cloud: 'azure',
    model,
    platformId,
    scenarioId,
    promptPath: 'lib/PROMPT.md',
    modelResponsePath: 'lib/MODEL_RESPONSE.md',
    solutionFiles: platform.files,
    expectedOutputKeys: scenario.outputKeys,
    expectedOutputs: expectedOutputs(platformId, scenario, names),
    resourceNames: resources,
    unitAssertions: {
      fileContains: fileContainsAssertions(platformId, scenario, names),
      anyFileContains: platformId === 'azure-pulumi-ts' ? scenario.outputKeys : [],
    },
    integrationChecks: integrationChecks(names, scenario),
    stageCommands: {
      'unit-tests': platform.unitTestCommand,
      'integration-tests': platform.integrationTestCommand,
    },
  };
  await writeFile(join(bundleDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

async function writeRuntimeSupportFiles(runtimeDir, platformId, scenario, names) {
  if (platformId === 'azure-bicep') return;
  await mkdir(join(runtimeDir, 'globalstack'), { recursive: true });
  await writeFile(join(runtimeDir, 'globalstack', 'azuredeploy.json'), `${JSON.stringify(armContract(names, scenario), null, 2)}\n`);
  await writeFile(join(runtimeDir, 'globalstack', 'azuredeploy.parameters.json'), `${JSON.stringify(armParameters(names), null, 2)}\n`);
}

async function writeModelFiles(bundleDir, files) {
  for (const [relativePath, content] of files) {
    validateModelFacing(relativePath, content);
    const target = join(bundleDir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${content}\n`);
  }
}

async function listReportFiles(reportDir) {
  const entries = await readdir(reportDir, { withFileTypes: true }).catch(() => []);
  return entries.filter(entry => entry.isFile()).map(entry => entry.name).sort();
}

function toStageStatus(result) {
  return result?.status ?? 'NOT_RUN';
}

function overallStatus(summary) {
  if (!summary?.ok) return 'FAIL';
  return 'PASS';
}

function executionReport(platformId, summary) {
  return {
    platform: platformId,
    build_status: toStageStatus(summary.stageResults.build),
    lint_status: toStageStatus(summary.stageResults.lint),
    unit_tests_status: toStageStatus(summary.stageResults['unit-tests']),
    deploy_status: toStageStatus(summary.stageResults.deploy),
    provider_lifecycle_status: toStageStatus(summary.stageResults['provider-lifecycle']),
    integration_status: toStageStatus(summary.stageResults['integration-tests']),
    destroy_status: toStageStatus(summary.stageResults.destroy),
    final_stage: summary.finalStage ?? null,
    final_status: summary.finalStatus ?? null,
    provisioning_state: summary.provisioningState ?? null,
    provider_lifecycle_ok: Boolean(summary.providerLifecycleOk),
    overall_status: overallStatus(summary),
  };
}

async function normalizeBundle(docker, platformId, bundleDir) {
  if (platformId !== 'azure-terraform-hcl') return;
  const uid = String(process.getuid());
  const gid = String(process.getgid());
  const libDir = join(bundleDir, 'lib');
  const code = await run(docker.command, [
    ...docker.prefix,
    'run',
    '--rm',
    '--user',
    `${uid}:${gid}`,
    '--entrypoint',
    'bash',
    '-v',
    `${libDir}:/workspace`,
    '-w',
    '/workspace',
    'globalstack/azure-terraform-hcl:local',
    '-lc',
    'terraform fmt -recursive >/dev/null',
  ], { cwd: root, stdio: 'ignore' });
  if (code !== 0) {
    throw new Error(`terraform fmt normalization failed for ${bundleDir}`);
  }
}

async function runBundleLifecycle(docker, platformId, runtimeDir, visibleBundleDirPath) {
  const platformDir = join(root, 'dist', 'platform-images', platformId);
  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: authToken,
    PIPELINE_STAGE_SCOPE: 'full',
    LOCAL_TASK_PATH: runtimeDir,
  };
  const reportDir = join(platformDir, 'reports');
  const workDir = join(platformDir, 'work');

  await fixOwnership([reportDir, workDir]);
  await rm(reportDir, { recursive: true, force: true });
  await rm(workDir, { recursive: true, force: true });
  await mkdir(reportDir, { recursive: true });
  await mkdir(workDir, { recursive: true });

  const imageBuildStrategy = process.env.GLOBALSTACK_IMAGE_BUILD_STRATEGY ?? 'auto';
  if (imageBuildStrategy !== 'reuse') {
    const requiredImages = ['globalstack/azure-emulator:local', platformIdToImageTag(platformId)];
    let missing = false;
    for (const image of requiredImages) {
      if (!(await imageExists(docker, image))) {
        missing = true;
        break;
      }
    }
    if (imageBuildStrategy === 'build' || missing) {
      const buildCode = await run('node', ['scripts/runtime/build-platform-images.mjs', `--platform=${platformId}`], { cwd: root, stdio: 'inherit' });
      if (buildCode !== 0) {
        throw new Error(`prewarm image build failed for ${platformId}`);
      }
    }
  }

  const composeUp = await runCapture(docker.command, [
    ...docker.prefix,
    'compose',
    'up',
    '--abort-on-container-exit',
    '--exit-code-from',
    'runner',
    'runner',
  ], { cwd: platformDir, env });
  const exitCode = composeUp.code;

  await run('timeout', [
    '30s',
    docker.command,
    ...docker.prefix,
    'compose',
    'down',
    '--remove-orphans',
  ], { cwd: platformDir, env, stdio: 'ignore' });
  await fixOwnership([reportDir, workDir]);

  const stageOrder = ['build', 'lint', 'unit-tests', 'deploy', 'provider-lifecycle', 'integration-tests', 'destroy'];
  const stageResults = {};
  for (const stage of stageOrder) {
    const stagePath = join(reportDir, `stage-${stage}.json`);
    try {
      stageResults[stage] = await readJson(stagePath);
    } catch {
      stageResults[stage] = null;
    }
  }

  const deployment = await readJson(join(reportDir, 'deployment-response.json')).catch(() => null);
  const providerLifecycle = await readJson(join(reportDir, 'provider-lifecycle-response.json')).catch(() => null);
  const lifecycle = await readJson(join(reportDir, 'lifecycle-report.json')).catch(() => null);
  const nativeStderr = await readFile(join(reportDir, 'native-stderr.log'), 'utf8').catch(() => '');
  const unitStderr = await readFile(join(reportDir, 'unit-tests-task-stderr.log'), 'utf8').catch(() => '');
  const integrationStderr = await readFile(join(reportDir, 'integration-tests-task-stderr.log'), 'utf8').catch(() => '');

  const providerLifecycleOk = providerLifecycle?.status === 'PASS'
    && Array.isArray(providerLifecycle.operations)
    && providerLifecycle.operations.length > 0
    && providerLifecycle.operations.every(operation => operation.status === 'PASS');

  const ok = exitCode === 0
    && lifecycle?.status === 'PASS'
    && lifecycle?.stage === 'destroy'
    && deployment?.properties?.provisioningState === 'Succeeded'
    && providerLifecycleOk;

  const summary = {
    platformId,
    ok,
    exitCode,
    finalStage: lifecycle?.stage ?? null,
    finalStatus: lifecycle?.status ?? null,
    provisioningState: deployment?.properties?.provisioningState ?? null,
    providerLifecycleOk,
    stageResults,
    stageSemantics: {
      build: 'native syntax/build stage',
      lint: 'structural contract validation',
      'unit-tests': 'task-authored unit tests plus deterministic hygiene checks',
      deploy: 'native provider deployment against Azure-shaped control plane',
      'provider-lifecycle': platformId === 'azure-terraform-hcl' ? 'Terraform plan, refresh, drift, import, and reconcile evidence' : platformId === 'azure-pulumi-ts' ? 'Pulumi preview, refresh, drift, and reconcile evidence' : 'Bicep redeploy and read-after-deploy evidence',
      'integration-tests': 'task-authored deployed-resource assertions',
      destroy: 'resource teardown',
    },
    nativeStderrTail: nativeStderr.trim().split('\n').slice(-40),
    unitTestStderrTail: unitStderr.trim().split('\n').slice(-40),
    integrationTestStderrTail: integrationStderr.trim().split('\n').slice(-40),
  };
  const fullExecutionLog = [
    composeUp.stdout.trimEnd(),
    composeUp.stderr.trimEnd(),
  ].filter(Boolean).join('\n');
  await writeFile(join(visibleBundleDirPath, 'execution.log'), `${fullExecutionLog}${fullExecutionLog.endsWith('\n') ? '' : '\n'}`);
  await writeFile(join(visibleBundleDirPath, 'execution-report.json'), `${JSON.stringify(executionReport(platformId, summary), null, 2)}\n`);
  return summary;
}

async function generateBundle(task, docker) {
  const scenario = scenarios.get(task.scenarioId);
  const platform = platformInstructions.get(task.platformId);
  if (!scenario) throw new Error(`Unknown scenario ${task.scenarioId}`);
  if (!platform) throw new Error(`Unsupported platform ${task.platformId}`);

  const names = namesFor(task.platformId, task.scenarioId);
  const bundleDir = visibleBundleDir(task);
  const runtimeDir = runtimeBundleDir(task);
  await fixOwnership([bundleDir, runtimeDir]);
  await rm(bundleDir, { recursive: true, force: true });
  await rm(runtimeDir, { recursive: true, force: true });
  await mkdir(join(bundleDir, 'lib'), { recursive: true });

  const basePrompt = promptText(task.platformId, task.scenarioId, scenario, platform, names);
  validateModelFacing(`${task.platformId}/${task.scenarioId} prompt`, basePrompt);
  await writeFile(join(bundleDir, 'lib', 'PROMPT.md'), `${basePrompt}\n`);

  let currentPrompt = basePrompt;
  let lastError = null;
  let lastResponse = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const responseText = await callOpenAI(currentPrompt);
    lastResponse = responseText;
    validateModelFacing(`${task.platformId}/${task.scenarioId} model response`, responseText);
    await writeFile(join(bundleDir, 'lib', 'MODEL_RESPONSE.md'), `${responseText}\n`);

    try {
      const files = extractFiles(responseText);
      validateFiles(task.platformId, scenario, platform, names, files);
      await writeModelFiles(bundleDir, files);
      await writeBundleSupportFiles(bundleDir, task.platformId, task.scenarioId, scenario, names);
      await normalizeBundle(docker, task.platformId, bundleDir);
      await mkdir(dirname(runtimeDir), { recursive: true });
      await cp(bundleDir, runtimeDir, { recursive: true });
      await writeRuntimeSupportFiles(runtimeDir, task.platformId, scenario, names);
      const summary = await runBundleLifecycle(docker, task.platformId, runtimeDir, bundleDir);
      if (summary.ok) {
        return {
          platformId: task.platformId,
          scenarioId: task.scenarioId,
          poId: task.poId,
          prId: task.prId,
          bundleDir,
          promptPath: join(bundleDir, 'lib', 'PROMPT.md'),
          modelResponsePath: join(bundleDir, 'lib', 'MODEL_RESPONSE.md'),
          summary,
        };
      }
      lastError = `runner lifecycle failed at ${summary.finalStage ?? 'unknown'}; final status=${summary.finalStatus ?? 'unknown'}; native stderr=${summary.nativeStderrTail.join(' | ')}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < 3) {
      currentPrompt = repairPrompt(basePrompt, lastError, lastResponse);
    }
  }

  throw new Error(lastError ?? `bundle generation failed for ${task.platformId}/${task.scenarioId}`);
}

async function main() {
  const selected = requestedItems.length === 0
    ? starterBundles
    : starterBundles.filter(item => requestedItems.includes(`${item.platformId}/${item.scenarioId}`));
  if (selected.length === 0) {
    throw new Error(`No matching bundles selected. Available: ${starterBundles.map(item => `${item.platformId}/${item.scenarioId}`).join(', ')}`);
  }

  await fixOwnership([join(root, 'dist', 'platform-images'), verifiedRoot, runtimeRoot]);
  await removeWithFallback(join(root, 'dist', 'platform-images'));
  await mkdir(verifiedRoot, { recursive: true });
  await mkdir(runtimeRoot, { recursive: true });
  const renderCode = await run('node', ['scripts/render/render-platform-templates.mjs'], { cwd: root });
  if (renderCode !== 0) throw new Error('render-platform-templates failed');
  const docker = await dockerCommand();

  const results = [];
  for (const task of selected) {
    console.log(`Generating ${task.platformId}/${task.scenarioId} with ${model}...`);
    try {
      results.push(await generateBundle(task, docker));
    } catch (error) {
      results.push({
        platformId: task.platformId,
        scenarioId: task.scenarioId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model,
    location,
    bundles: results.map(result => ({
      platformId: result.platformId,
      scenarioId: result.scenarioId,
      poId: result.poId ?? null,
      prId: result.prId ?? null,
      bundleDir: result.bundleDir ? resolve(result.bundleDir) : null,
      promptPath: result.promptPath ? resolve(result.promptPath) : null,
      modelResponsePath: result.modelResponsePath ? resolve(result.modelResponsePath) : null,
      ok: result.summary?.ok ?? false,
      finalStage: result.summary?.finalStage ?? null,
      finalStatus: result.summary?.finalStatus ?? null,
      error: result.error ?? null,
    })),
  };
  console.log(JSON.stringify(report, null, 2));

  if (report.bundles.some(bundle => !bundle.ok)) process.exit(1);
}

await main();
