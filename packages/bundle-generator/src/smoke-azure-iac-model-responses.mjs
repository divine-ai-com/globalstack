import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../../platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'iac-model-response-smoke');
const location = process.env.AZURE_LOCATION ?? 'eastus';
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const invalidStorageSku = 'Ultra_ZRS';
let baseUrl = 'http://127.0.0.1:0';

const coreSolutionFiles = new Map([
  ['azure-terraform-hcl', ['lib/main.tf', 'lib/outputs.tf', 'lib/variables.tf', 'lib/provider.tf']],
  ['azure-opentofu-hcl', ['lib/main.tf', 'lib/outputs.tf', 'lib/variables.tf', 'lib/provider.tf']],
  ['azure-pulumi-ts', ['Pulumi.yaml', 'bin/tap.ts', 'lib/tap-stack.ts']],
  ['azure-pulumi-py', ['Pulumi.yaml', 'tap.py', 'lib/tap_stack.py']],
  ['azure-pulumi-yaml', ['Pulumi.yaml']],
  ['azure-ansible-yaml', ['lib/playbook.yml', 'inventory.yml', 'ansible.cfg']],
  ['azure-cli-rest', ['lib/deploy.sh']],
  ['azure-bicep', ['lib/main.bicep', 'lib/parameters.json']],
  ['azure-arm-json', ['lib/azuredeploy.json', 'lib/azuredeploy.parameters.json']],
]);

function suffix() {
  return `${Date.now().toString(36).slice(-5)}${process.pid.toString(36)}`.toLowerCase();
}

function resourceGroupPath(name) {
  return `/subscriptions/${subscriptionId}/resourcegroups/${name}?api-version=2021-04-01`;
}

function providerPath(resourceGroup, provider, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${provider}/${typePath}?api-version=${apiVersion}`;
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

async function startHybridArmFacade() {
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/_globalstack/health`);
  if (!response.ok) throw new Error(`GlobalStack hybrid ARM facade health check failed with HTTP ${response.status}`);

  return {
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

function platformLanguage(platform) {
  return platform.language === 'hcl' ? 'hcl'
    : platform.language === 'json' ? 'json'
      : platform.language === 'bicep' ? 'bicep'
        : platform.language === 'py' ? 'python'
          : platform.language === 'ts' ? 'typescript'
            : 'yaml';
}

function fenced(path, language, content) {
  return `\`\`\`${language} path="${path}"\n${content.trim()}\n\`\`\``;
}

function modelResponse(platform, variant, names) {
  const invalidSku = variant === 'incorrect-invalid-storage-sku';
  const files = renderSolutionFiles(platform.id, invalidSku, names);
  return [
    `# ${platform.label} model response`,
    '',
    'This implementation provisions the requested Azure resources.',
    '',
    ...Object.entries(files).map(([path, content]) => fenced(path, platformLanguage(platform), content)),
    '',
  ].join('\n');
}

function commonNames(runSuffix, platformId, variant) {
  const compact = `${platformId.replace(/[^a-z0-9]/g, '').slice(0, 8)}${runSuffix}`.toLowerCase();
  return {
    resourceGroup: `rg-az-iac-${platformId.replace(/[^a-z0-9]/g, '').slice(0, 10)}-${variant === 'correct' ? 'ok' : 'bad'}-${runSuffix}`.slice(0, 90),
    storage: `az${compact}`.slice(0, 24),
    serviceBus: `az-sb-${compact}`.slice(0, 24),
    eventGridTopic: `eg-${compact}`.slice(0, 40),
    eventHubNs: `az-eh-${compact}`.slice(0, 24),
    appConfig: `azcfg${compact}`.replace(/[^a-z0-9]/g, '').slice(0, 24),
  };
}

function deploySteps(names, variant) {
  const invalidSku = variant === 'incorrect-invalid-storage-sku';
  const storageBody = invalidSku
    ? {
        location,
        sku: { name: invalidStorageSku },
        kind: 'StorageV2',
        properties: { allowBlobPublicAccess: false },
      }
    : {
        location,
        sku: { name: 'Standard_LRS' },
        kind: 'StorageV2',
        properties: { allowBlobPublicAccess: false },
      };

  const steps = [
    {
      label: `resource group ${names.resourceGroup}`,
      method: 'PUT',
      path: resourceGroupPath(names.resourceGroup),
      body: { location },
      expect: [200, 201],
    },
    {
      label: `storage account ${names.storage}${invalidSku ? ' invalid sku' : ''}`,
      method: 'PUT',
      path: providerPath(names.resourceGroup, 'Microsoft.Storage', `storageAccounts/${names.storage}`, '2023-01-01'),
      body: storageBody,
      expect: invalidSku ? [400] : [200, 201, 202],
      expectErrorCodes: invalidSku ? ['InvalidAccountType'] : undefined,
      stopOnExpectedFailure: invalidSku,
    },
  ];

  if (!invalidSku) {
    steps.push(
      {
        label: 'blob container',
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.Storage', `storageAccounts/${names.storage}/blobServices/default/containers/model-artifacts`, '2023-01-01'),
        body: { properties: { publicAccess: 'None' } },
        expect: [200, 201, 202],
      },
      {
        label: 'queue',
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.Storage', `storageAccounts/${names.storage}/queueServices/default/queues/model-jobs`, '2023-01-01'),
        body: { properties: {} },
        expect: [200, 201, 202],
      },
      {
        label: 'file share',
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.Storage', `storageAccounts/${names.storage}/fileServices/default/shares/modelfiles`, '2023-01-01'),
        body: { properties: { shareQuota: 32 } },
        expect: [200, 201, 202],
      },
      {
        label: 'table storage table',
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.Storage', `storageAccounts/${names.storage}/tableServices/default/tables/modeltable`, '2023-01-01'),
        body: { properties: {} },
        expect: [200, 201, 202],
      },
      {
        label: `service bus namespace ${names.serviceBus}`,
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.ServiceBus', `namespaces/${names.serviceBus}`, '2021-11-01'),
        body: { location, sku: { name: 'Standard', tier: 'Standard' }, properties: {} },
        expect: [200, 201, 202],
      },
      {
        label: 'service bus topic',
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.ServiceBus', `namespaces/${names.serviceBus}/topics/model-events`, '2021-11-01'),
        body: { properties: { maxSizeInMegabytes: 1024 } },
        expect: [200, 201, 202],
      },
      {
        label: `event grid topic ${names.eventGridTopic}`,
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.EventGrid', `topics/${names.eventGridTopic}`, '2022-06-15'),
        body: { location, properties: { inputSchema: 'EventGridSchema' } },
        expect: [200, 201, 202],
      },
      {
        label: `event hubs namespace ${names.eventHubNs}`,
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.EventHub', `namespaces/${names.eventHubNs}`, '2024-01-01'),
        body: { location, sku: { name: 'Standard', tier: 'Standard', capacity: 1 }, properties: {} },
        expect: [200, 201, 202],
      },
      {
        label: 'event hub',
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.EventHub', `namespaces/${names.eventHubNs}/eventhubs/model-stream`, '2024-01-01'),
        body: { properties: { partitionCount: 2, messageRetentionInDays: 1 } },
        expect: [200, 201, 202],
      },
      {
        label: `app configuration ${names.appConfig}`,
        method: 'PUT',
        path: providerPath(names.resourceGroup, 'Microsoft.AppConfiguration', `configurationStores/${names.appConfig}`, '2023-03-01'),
        body: { location, sku: { name: 'free' }, properties: { disableLocalAuth: false } },
        expect: [200, 201, 202],
      },
    );
  }

  return steps;
}

function resourceGroupHcl(names) {
  return `resource "azurerm_resource_group" "main" {
  name     = "${names.resourceGroup}"
  location = var.location
}`;
}

function renderSolutionFiles(platformId, invalidSku, names) {
  const storageSku = invalidSku ? invalidStorageSku : 'Standard_LRS';
  if (platformId === 'azure-terraform-hcl' || platformId === 'azure-opentofu-hcl') {
    return {
      'lib/provider.tf': `terraform {
  required_providers {
    azapi = {
      source  = "Azure/azapi"
      version = "~> 2.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azapi" {}

provider "azurerm" {
  features {}
}
`,
      'lib/variables.tf': `variable "location" {
  type    = string
  default = "${location}"
}
`,
      'lib/main.tf': `${resourceGroupHcl(names)}

resource "azapi_resource" "storage" {
  type      = "Microsoft.Storage/storageAccounts@2023-01-01"
  name      = "${names.storage}"
  parent_id = azurerm_resource_group.main.id
  location  = var.location
  body = {
    sku        = { name = "${storageSku}" }
    kind       = "StorageV2"
    properties = { allowBlobPublicAccess = false }
  }
}

resource "azapi_resource" "blob_container" {
  type      = "Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01"
  name      = "default/model-artifacts"
  parent_id = azapi_resource.storage.id
  body      = { properties = { publicAccess = "None" } }
}

resource "azapi_resource" "queue" {
  type      = "Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01"
  name      = "default/model-jobs"
  parent_id = azapi_resource.storage.id
  body      = { properties = {} }
}

resource "azapi_resource" "file_share" {
  type      = "Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01"
  name      = "default/modelfiles"
  parent_id = azapi_resource.storage.id
  body      = { properties = { shareQuota = 32 } }
}

resource "azapi_resource" "table" {
  type      = "Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01"
  name      = "default/modeltable"
  parent_id = azapi_resource.storage.id
  body      = { properties = {} }
}

resource "azapi_resource" "service_bus_namespace" {
  type      = "Microsoft.ServiceBus/namespaces@2021-11-01"
  name      = "${names.serviceBus}"
  parent_id = azurerm_resource_group.main.id
  location  = var.location
  body      = { sku = { name = "Standard", tier = "Standard" }, properties = {} }
}

resource "azapi_resource" "service_bus_topic" {
  type      = "Microsoft.ServiceBus/namespaces/topics@2021-11-01"
  name      = "model-events"
  parent_id = azapi_resource.service_bus_namespace.id
  body      = { properties = { maxSizeInMegabytes = 1024 } }
}

resource "azapi_resource" "event_grid_topic" {
  type      = "Microsoft.EventGrid/topics@2022-06-15"
  name      = "${names.eventGridTopic}"
  parent_id = azurerm_resource_group.main.id
  location  = var.location
  body      = { properties = { inputSchema = "EventGridSchema" } }
}

resource "azapi_resource" "event_hubs_namespace" {
  type      = "Microsoft.EventHub/namespaces@2024-01-01"
  name      = "${names.eventHubNs}"
  parent_id = azurerm_resource_group.main.id
  location  = var.location
  body      = { sku = { name = "Standard", tier = "Standard", capacity = 1 }, properties = {} }
}

resource "azapi_resource" "event_hub" {
  type      = "Microsoft.EventHub/namespaces/eventhubs@2024-01-01"
  name      = "model-stream"
  parent_id = azapi_resource.event_hubs_namespace.id
  body      = { properties = { partitionCount = 2, messageRetentionInDays = 1 } }
}

resource "azapi_resource" "app_config" {
  type      = "Microsoft.AppConfiguration/configurationStores@2023-03-01"
  name      = "${names.appConfig}"
  parent_id = azurerm_resource_group.main.id
  location  = var.location
  body      = { sku = { name = "free" }, properties = { disableLocalAuth = false } }
}
`,
      'lib/outputs.tf': `output "storage_account_id" {
  value = azapi_resource.storage.id
}

output "service_bus_topic_id" {
  value = azapi_resource.service_bus_topic.id
}

output "event_grid_topic_id" {
  value = azapi_resource.event_grid_topic.id
}

output "event_hub_id" {
  value = azapi_resource.event_hub.id
}

output "app_configuration_id" {
  value = azapi_resource.app_config.id
}
`,
    };
  }

  if (platformId === 'azure-bicep') {
    return {
      'lib/main.bicep': `param location string = resourceGroup().location

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: '${names.storage}'
  location: location
  sku: {
    name: '${storageSku}'
  }
  kind: 'StorageV2'
  properties: {
    allowBlobPublicAccess: false
  }
}

resource blob 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${names.storage}/default/model-artifacts'
  properties: {
    publicAccess: 'None'
  }
}

resource queue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  name: '${names.storage}/default/model-jobs'
  properties: {}
}

resource fileShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  name: '${names.storage}/default/modelfiles'
  properties: {
    shareQuota: 32
  }
}

resource table 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  name: '${names.storage}/default/modeltable'
  properties: {}
}

resource sbNamespace 'Microsoft.ServiceBus/namespaces@2021-11-01' = {
  name: '${names.serviceBus}'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {}
}

resource sbTopic 'Microsoft.ServiceBus/namespaces/topics@2021-11-01' = {
  name: '${names.serviceBus}/model-events'
  properties: {
    maxSizeInMegabytes: 1024
  }
  dependsOn: [
    sbNamespace
  ]
}

resource eventGridTopic 'Microsoft.EventGrid/topics@2022-06-15' = {
  name: '${names.eventGridTopic}'
  location: location
  properties: {
    inputSchema: 'EventGridSchema'
  }
}

resource eventHubNamespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: '${names.eventHubNs}'
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  properties: {}
}

resource eventHub 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = {
  name: '${names.eventHubNs}/model-stream'
  properties: {
    partitionCount: 2
    messageRetentionInDays: 1
  }
  dependsOn: [
    eventHubNamespace
  ]
}

resource appConfig 'Microsoft.AppConfiguration/configurationStores@2023-03-01' = {
  name: '${names.appConfig}'
  location: location
  sku: {
    name: 'free'
  }
  properties: {
    disableLocalAuth: false
  }
}

output storageAccountId string = storage.id
output serviceBusTopicId string = sbTopic.id
output eventGridTopicId string = eventGridTopic.id
output eventHubId string = eventHub.id
output appConfigurationId string = appConfig.id
`,
      'lib/parameters.json': `{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": {
      "value": "${location}"
    }
  }
}
`,
    };
  }

  if (platformId === 'azure-arm-json') {
    return {
      'lib/azuredeploy.json': JSON.stringify({
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Storage/storageAccounts',
            apiVersion: '2023-01-01',
            name: names.storage,
            location,
            sku: { name: storageSku },
            kind: 'StorageV2',
            properties: { allowBlobPublicAccess: false },
          },
          {
            type: 'Microsoft.Storage/storageAccounts/blobServices/containers',
            apiVersion: '2023-01-01',
            name: `${names.storage}/default/model-artifacts`,
            properties: { publicAccess: 'None' },
            dependsOn: [`Microsoft.Storage/storageAccounts/${names.storage}`],
          },
          {
            type: 'Microsoft.Storage/storageAccounts/queueServices/queues',
            apiVersion: '2023-01-01',
            name: `${names.storage}/default/model-jobs`,
            properties: {},
            dependsOn: [`Microsoft.Storage/storageAccounts/${names.storage}`],
          },
          {
            type: 'Microsoft.Storage/storageAccounts/fileServices/shares',
            apiVersion: '2023-01-01',
            name: `${names.storage}/default/modelfiles`,
            properties: { shareQuota: 32 },
            dependsOn: [`Microsoft.Storage/storageAccounts/${names.storage}`],
          },
          {
            type: 'Microsoft.Storage/storageAccounts/tableServices/tables',
            apiVersion: '2023-01-01',
            name: `${names.storage}/default/modeltable`,
            properties: {},
            dependsOn: [`Microsoft.Storage/storageAccounts/${names.storage}`],
          },
          {
            type: 'Microsoft.ServiceBus/namespaces',
            apiVersion: '2021-11-01',
            name: names.serviceBus,
            location,
            sku: { name: 'Standard', tier: 'Standard' },
            properties: {},
          },
          {
            type: 'Microsoft.ServiceBus/namespaces/topics',
            apiVersion: '2021-11-01',
            name: `${names.serviceBus}/model-events`,
            properties: { maxSizeInMegabytes: 1024 },
            dependsOn: [`Microsoft.ServiceBus/namespaces/${names.serviceBus}`],
          },
          {
            type: 'Microsoft.EventGrid/topics',
            apiVersion: '2022-06-15',
            name: names.eventGridTopic,
            location,
            properties: { inputSchema: 'EventGridSchema' },
          },
          {
            type: 'Microsoft.EventHub/namespaces',
            apiVersion: '2024-01-01',
            name: names.eventHubNs,
            location,
            sku: { name: 'Standard', tier: 'Standard', capacity: 1 },
            properties: {},
          },
          {
            type: 'Microsoft.EventHub/namespaces/eventhubs',
            apiVersion: '2024-01-01',
            name: `${names.eventHubNs}/model-stream`,
            properties: { partitionCount: 2, messageRetentionInDays: 1 },
            dependsOn: [`Microsoft.EventHub/namespaces/${names.eventHubNs}`],
          },
          {
            type: 'Microsoft.AppConfiguration/configurationStores',
            apiVersion: '2023-03-01',
            name: names.appConfig,
            location,
            sku: { name: 'free' },
            properties: { disableLocalAuth: false },
          },
        ],
        outputs: {
          storageAccountName: { type: 'string', value: names.storage },
          serviceBusTopicName: { type: 'string', value: 'model-events' },
          eventGridTopicName: { type: 'string', value: names.eventGridTopic },
          eventHubName: { type: 'string', value: 'model-stream' },
          appConfigurationName: { type: 'string', value: names.appConfig },
        },
      }, null, 2),
      'lib/azuredeploy.parameters.json': JSON.stringify({
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
        contentVersion: '1.0.0.0',
        parameters: {},
      }, null, 2),
    };
  }

  if (platformId === 'azure-pulumi-ts') {
    return {
      'Pulumi.yaml': 'name: azure-model-response\nruntime: nodejs\n',
      'bin/tap.ts': `import { buildStack } from "../lib/tap-stack";
buildStack();
`,
      'lib/tap-stack.ts': `import * as resources from "@pulumi/azure-native/resources";
import * as storage from "@pulumi/azure-native/storage";
import * as servicebus from "@pulumi/azure-native/servicebus";
import * as eventgrid from "@pulumi/azure-native/eventgrid";
import * as eventhub from "@pulumi/azure-native/eventhub";
import * as appconfiguration from "@pulumi/azure-native/appconfiguration";

export function buildStack() {
  const rg = new resources.ResourceGroup("rg", { resourceGroupName: "${names.resourceGroup}", location: "${location}" });
  const account = new storage.StorageAccount("storage", {
    resourceGroupName: rg.name,
    accountName: "${names.storage}",
    location: rg.location,
    sku: { name: "${storageSku}" },
    kind: "StorageV2",
    allowBlobPublicAccess: false,
  });
  new storage.BlobContainer("model-artifacts", {
    accountName: account.name,
    resourceGroupName: rg.name,
    containerName: "model-artifacts",
    publicAccess: "None",
  });
  new storage.Queue("model-jobs", {
    accountName: account.name,
    resourceGroupName: rg.name,
    queueName: "model-jobs",
  });
  new storage.FileShare("modelfiles", {
    accountName: account.name,
    resourceGroupName: rg.name,
    shareName: "modelfiles",
    shareQuota: 32,
  });
  new storage.Table("modeltable", {
    accountName: account.name,
    resourceGroupName: rg.name,
    tableName: "modeltable",
  });
  const sb = new servicebus.Namespace("service-bus", {
    namespaceName: "${names.serviceBus}",
    resourceGroupName: rg.name,
    location: rg.location,
    sku: { name: "Standard", tier: "Standard" },
  });
  new servicebus.Topic("model-events", {
    namespaceName: sb.name,
    resourceGroupName: rg.name,
    topicName: "model-events",
    maxSizeInMegabytes: 1024,
  });
  const grid = new eventgrid.Topic("model-grid", {
    topicName: "${names.eventGridTopic}",
    resourceGroupName: rg.name,
    location: rg.location,
    inputSchema: "EventGridSchema",
  });
  const ehNamespace = new eventhub.Namespace("event-hubs", {
    namespaceName: "${names.eventHubNs}",
    resourceGroupName: rg.name,
    location: rg.location,
    sku: { name: "Standard", tier: "Standard", capacity: 1 },
  });
  const stream = new eventhub.EventHub("model-stream", {
    namespaceName: ehNamespace.name,
    resourceGroupName: rg.name,
    eventHubName: "model-stream",
    partitionCount: 2,
    messageRetentionInDays: 1,
  });
  const config = new appconfiguration.ConfigurationStore("model-config", {
    configStoreName: "${names.appConfig}",
    resourceGroupName: rg.name,
    location: rg.location,
    sku: { name: "free" },
    disableLocalAuth: false,
  });
  return { storageAccountName: account.name, eventGridTopicName: grid.name, eventHubName: stream.name, appConfigurationName: config.name };
}
`,
    };
  }

  if (platformId === 'azure-pulumi-py') {
    return {
      'Pulumi.yaml': 'name: azure-model-response\nruntime: python\n',
      'tap.py': `from lib.tap_stack import build_stack
build_stack()
`,
      'lib/tap_stack.py': `from pulumi_azure_native import appconfiguration, eventgrid, eventhub, resources, servicebus, storage

def build_stack():
    rg = resources.ResourceGroup("rg", resource_group_name="${names.resourceGroup}", location="${location}")
    account = storage.StorageAccount("storage",
        resource_group_name=rg.name,
        account_name="${names.storage}",
        location=rg.location,
        sku={"name": "${storageSku}"},
        kind="StorageV2",
        allow_blob_public_access=False)
    storage.BlobContainer("model-artifacts",
        account_name=account.name,
        resource_group_name=rg.name,
        container_name="model-artifacts",
        public_access="None")
    storage.Queue("model-jobs",
        account_name=account.name,
        resource_group_name=rg.name,
        queue_name="model-jobs")
    storage.FileShare("modelfiles",
        account_name=account.name,
        resource_group_name=rg.name,
        share_name="modelfiles",
        share_quota=32)
    storage.Table("modeltable",
        account_name=account.name,
        resource_group_name=rg.name,
        table_name="modeltable")
    sb = servicebus.Namespace("service-bus",
        namespace_name="${names.serviceBus}",
        resource_group_name=rg.name,
        location=rg.location,
        sku={"name": "Standard", "tier": "Standard"})
    servicebus.Topic("model-events",
        namespace_name=sb.name,
        resource_group_name=rg.name,
        topic_name="model-events",
        max_size_in_megabytes=1024)
    grid = eventgrid.Topic("model-grid",
        topic_name="${names.eventGridTopic}",
        resource_group_name=rg.name,
        location=rg.location,
        input_schema="EventGridSchema")
    eh_namespace = eventhub.Namespace("event-hubs",
        namespace_name="${names.eventHubNs}",
        resource_group_name=rg.name,
        location=rg.location,
        sku={"name": "Standard", "tier": "Standard", "capacity": 1})
    stream = eventhub.EventHub("model-stream",
        namespace_name=eh_namespace.name,
        resource_group_name=rg.name,
        event_hub_name="model-stream",
        partition_count=2,
        message_retention_in_days=1)
    config = appconfiguration.ConfigurationStore("model-config",
        config_store_name="${names.appConfig}",
        resource_group_name=rg.name,
        location=rg.location,
        sku={"name": "free"},
        disable_local_auth=False)
    return {"storage_account_name": account.name, "event_grid_topic_name": grid.name, "event_hub_name": stream.name, "app_configuration_name": config.name}
`,
    };
  }

  if (platformId === 'azure-pulumi-yaml') {
    return {
      'Pulumi.yaml': `name: azure-model-response
runtime: yaml
resources:
  rg:
    type: azure-native:resources:ResourceGroup
    properties:
      resourceGroupName: ${names.resourceGroup}
      location: ${location}
  storage:
    type: azure-native:storage:StorageAccount
    properties:
      resourceGroupName: \${rg.name}
      accountName: ${names.storage}
      location: ${location}
      sku:
        name: ${storageSku}
      kind: StorageV2
      allowBlobPublicAccess: false
  blob:
    type: azure-native:storage:BlobContainer
    properties:
      resourceGroupName: \${rg.name}
      accountName: \${storage.name}
      containerName: model-artifacts
      publicAccess: None
  queue:
    type: azure-native:storage:Queue
    properties:
      resourceGroupName: \${rg.name}
      accountName: \${storage.name}
      queueName: model-jobs
  fileShare:
    type: azure-native:storage:FileShare
    properties:
      resourceGroupName: \${rg.name}
      accountName: \${storage.name}
      shareName: modelfiles
      shareQuota: 32
  table:
    type: azure-native:storage:Table
    properties:
      resourceGroupName: \${rg.name}
      accountName: \${storage.name}
      tableName: modeltable
  sbNamespace:
    type: azure-native:servicebus:Namespace
    properties:
      resourceGroupName: \${rg.name}
      namespaceName: ${names.serviceBus}
      location: ${location}
      sku:
        name: Standard
        tier: Standard
  topic:
    type: azure-native:servicebus:Topic
    properties:
      resourceGroupName: \${rg.name}
      namespaceName: \${sbNamespace.name}
      topicName: model-events
      maxSizeInMegabytes: 1024
  grid:
    type: azure-native:eventgrid:Topic
    properties:
      resourceGroupName: \${rg.name}
      topicName: ${names.eventGridTopic}
      location: ${location}
      inputSchema: EventGridSchema
  ehNamespace:
    type: azure-native:eventhub:Namespace
    properties:
      resourceGroupName: \${rg.name}
      namespaceName: ${names.eventHubNs}
      location: ${location}
      sku:
        name: Standard
        tier: Standard
        capacity: 1
  stream:
    type: azure-native:eventhub:EventHub
    properties:
      resourceGroupName: \${rg.name}
      namespaceName: \${ehNamespace.name}
      eventHubName: model-stream
      partitionCount: 2
      messageRetentionInDays: 1
  config:
    type: azure-native:appconfiguration:ConfigurationStore
    properties:
      resourceGroupName: \${rg.name}
      configStoreName: ${names.appConfig}
      location: ${location}
      sku:
        name: free
      disableLocalAuth: false
outputs:
  storageAccountName: \${storage.name}
  serviceBusTopicName: \${topic.name}
  eventGridTopicName: \${grid.name}
  eventHubName: \${stream.name}
  appConfigurationName: \${config.name}
`,
    };
  }

  if (platformId === 'azure-cli-rest') {
    return {
      'lib/deploy.sh': `#!/usr/bin/env bash
set -euo pipefail

endpoint="\${ARM_ENDPOINT:-https://management.azure.com}"
subscription_id="\${ARM_SUBSCRIPTION_ID:?ARM_SUBSCRIPTION_ID is required}"
location="\${AZURE_LOCATION:-${location}}"
resource_group="${names.resourceGroup}"
storage_account="${names.storage}"
service_bus_namespace="${names.serviceBus}"
event_grid_topic="${names.eventGridTopic}"
event_hub_namespace="${names.eventHubNs}"
app_config_store="${names.appConfig}"
token="\${AZURE_ACCESS_TOKEN:-}"
if [ -z "\${token}" ]; then
  token="$(az account get-access-token --resource https://management.azure.com/ --query accessToken -o tsv)"
fi

body_dir="\${TMPDIR:-/tmp}/azure-cli-iac-smoke"
mkdir -p "\${body_dir}"

az_rest_put() {
  local url="$1"
  local body_file="$2"
  az rest --method put --url "\${url}" --body "@\${body_file}" --headers "Authorization=Bearer \${token}" "content-type=application/json" --skip-authorization-header -o json >/dev/null
}

cat > "\${body_dir}/resource-group.json" <<JSON
{"location":"\${location}"}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourcegroups/\${resource_group}?api-version=2021-04-01" "\${body_dir}/resource-group.json"

cat > "\${body_dir}/storage.json" <<JSON
{"location":"\${location}","sku":{"name":"${storageSku}"},"kind":"StorageV2","properties":{"allowBlobPublicAccess":false}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.Storage/storageAccounts/\${storage_account}?api-version=2023-01-01" "\${body_dir}/storage.json"

cat > "\${body_dir}/blob.json" <<JSON
{"properties":{"publicAccess":"None"}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.Storage/storageAccounts/\${storage_account}/blobServices/default/containers/model-artifacts?api-version=2023-01-01" "\${body_dir}/blob.json"

cat > "\${body_dir}/queue.json" <<JSON
{"properties":{}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.Storage/storageAccounts/\${storage_account}/queueServices/default/queues/model-jobs?api-version=2023-01-01" "\${body_dir}/queue.json"

cat > "\${body_dir}/file.json" <<JSON
{"properties":{"shareQuota":32}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.Storage/storageAccounts/\${storage_account}/fileServices/default/shares/modelfiles?api-version=2023-01-01" "\${body_dir}/file.json"

cat > "\${body_dir}/table.json" <<JSON
{"properties":{}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.Storage/storageAccounts/\${storage_account}/tableServices/default/tables/modeltable?api-version=2023-01-01" "\${body_dir}/table.json"

cat > "\${body_dir}/service-bus.json" <<JSON
{"location":"\${location}","sku":{"name":"Standard","tier":"Standard"},"properties":{}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.ServiceBus/namespaces/\${service_bus_namespace}?api-version=2021-11-01" "\${body_dir}/service-bus.json"

cat > "\${body_dir}/service-bus-topic.json" <<JSON
{"properties":{"maxSizeInMegabytes":1024}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.ServiceBus/namespaces/\${service_bus_namespace}/topics/model-events?api-version=2021-11-01" "\${body_dir}/service-bus-topic.json"

cat > "\${body_dir}/event-grid.json" <<JSON
{"location":"\${location}","properties":{"inputSchema":"EventGridSchema"}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.EventGrid/topics/\${event_grid_topic}?api-version=2022-06-15" "\${body_dir}/event-grid.json"

cat > "\${body_dir}/event-hub-namespace.json" <<JSON
{"location":"\${location}","sku":{"name":"Standard","tier":"Standard","capacity":1},"properties":{}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.EventHub/namespaces/\${event_hub_namespace}?api-version=2024-01-01" "\${body_dir}/event-hub-namespace.json"

cat > "\${body_dir}/event-hub.json" <<JSON
{"properties":{"partitionCount":2,"messageRetentionInDays":1}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.EventHub/namespaces/\${event_hub_namespace}/eventhubs/model-stream?api-version=2024-01-01" "\${body_dir}/event-hub.json"

cat > "\${body_dir}/app-config.json" <<JSON
{"location":"\${location}","sku":{"name":"free"},"properties":{"disableLocalAuth":false}}
JSON
az_rest_put "\${endpoint%/}/subscriptions/\${subscription_id}/resourceGroups/\${resource_group}/providers/Microsoft.AppConfiguration/configurationStores/\${app_config_store}?api-version=2023-03-01" "\${body_dir}/app-config.json"
`,
    };
  }

  if (platformId === 'azure-ansible-yaml') {
    return {
      'ansible.cfg': '[defaults]\ninventory = inventory.yml\nhost_key_checking = false\n',
      'inventory.yml': 'all:\n  hosts:\n    localhost:\n      ansible_connection: local\n',
      'lib/playbook.yml': `- hosts: localhost
  gather_facts: false
  tasks:
    - name: storage account
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: Storage
        resource_type: storageAccounts
        resource_name: ${names.storage}
        api_version: "2023-01-01"
        body:
          location: ${location}
          sku:
            name: ${storageSku}
          kind: StorageV2
          properties:
            allowBlobPublicAccess: false
    - name: blob container
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: Storage
        resource_type: storageAccounts/blobServices/containers
        resource_name: ${names.storage}/default/model-artifacts
        api_version: "2023-01-01"
        body:
          properties:
            publicAccess: None
    - name: queue
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: Storage
        resource_type: storageAccounts/queueServices/queues
        resource_name: ${names.storage}/default/model-jobs
        api_version: "2023-01-01"
        body:
          properties: {}
    - name: file share
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: Storage
        resource_type: storageAccounts/fileServices/shares
        resource_name: ${names.storage}/default/modelfiles
        api_version: "2023-01-01"
        body:
          properties:
            shareQuota: 32
    - name: table
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: Storage
        resource_type: storageAccounts/tableServices/tables
        resource_name: ${names.storage}/default/modeltable
        api_version: "2023-01-01"
        body:
          properties: {}
    - name: service bus namespace
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: ServiceBus
        resource_type: namespaces
        resource_name: ${names.serviceBus}
        api_version: "2021-11-01"
        body:
          location: ${location}
          sku:
            name: Standard
            tier: Standard
          properties: {}
    - name: service bus topic
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: ServiceBus
        resource_type: namespaces/topics
        resource_name: ${names.serviceBus}/model-events
        api_version: "2021-11-01"
        body:
          properties:
            maxSizeInMegabytes: 1024
    - name: event grid topic
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: EventGrid
        resource_type: topics
        resource_name: ${names.eventGridTopic}
        api_version: "2022-06-15"
        body:
          location: ${location}
          properties:
            inputSchema: EventGridSchema
    - name: event hubs namespace
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: EventHub
        resource_type: namespaces
        resource_name: ${names.eventHubNs}
        api_version: "2024-01-01"
        body:
          location: ${location}
          sku:
            name: Standard
            tier: Standard
            capacity: 1
          properties: {}
    - name: event hub
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: EventHub
        resource_type: namespaces/eventhubs
        resource_name: ${names.eventHubNs}/model-stream
        api_version: "2024-01-01"
        body:
          properties:
            partitionCount: 2
            messageRetentionInDays: 1
    - name: app configuration
      azure.azcollection.azure_rm_resource:
        resource_group: ${names.resourceGroup}
        provider: AppConfiguration
        resource_type: configurationStores
        resource_name: ${names.appConfig}
        api_version: "2023-03-01"
        body:
          location: ${location}
          sku:
            name: free
          properties:
            disableLocalAuth: false
`,
    };
  }

  throw new Error(`Unsupported platform ${platformId}`);
}

function extractFiles(modelResponseText) {
  const files = new Map();
  const fencePattern = /```[^\n]*path="([^"]+)"[^\n]*\n([\s\S]*?)```/g;
  for (const match of modelResponseText.matchAll(fencePattern)) {
    files.set(match[1], match[2].trimEnd());
  }
  return files;
}

function lintExtractedFiles(platform, files, variant) {
  const errors = [];
  const required = coreSolutionFiles.get(platform.id) ?? platform.solutionFiles;
  for (const file of required) {
    if (!files.has(file)) errors.push(`missing solution file ${file}`);
  }
  const joined = [...files.values()].join('\n');
  const requiredMarkers = [
    'model-artifacts',
    'model-jobs',
    'modelfiles',
    'modeltable',
    'model-events',
    'model-stream',
    platform.id.startsWith('azure-pulumi') ? 'StorageAccount' : platform.id === 'azure-ansible-yaml' ? 'provider: Storage' : platform.id === 'azure-cli-rest' ? 'az rest' : 'Microsoft.Storage',
    platform.id.startsWith('azure-pulumi') ? 'eventgrid' : platform.id === 'azure-ansible-yaml' ? 'azure_rm_resource' : platform.id === 'azure-cli-rest' ? 'Microsoft.EventGrid' : 'EventGrid',
  ];
  for (const requiredText of requiredMarkers) {
    if (!joined.includes(requiredText)) errors.push(`missing expected IaC marker ${requiredText}`);
  }
  if (variant === 'incorrect-invalid-storage-sku' && !joined.includes(invalidStorageSku)) {
    errors.push('incorrect fixture did not include the invalid Azure SKU marker');
  }
  return errors;
}

async function writeBundle(platform, variant, names) {
  const dir = join(outRoot, platform.id, variant);
  await mkdir(dir, { recursive: true });
  const prompt = [
    'Our platform team needs an Azure storage and messaging foundation for model artifact intake workflows.',
    'Create the infrastructure as code for a deployment that includes a storage account, blob container, queue, file share, table, Service Bus namespace with a topic, Event Grid topic, Event Hubs namespace with one event hub, and an App Configuration store.',
    'Every resource name must include the provided environment suffix. Any production behavior outside this task scope, such as Cosmos DB persistence, Event Grid delivery subscriptions, or Event Hubs consumer processing, should be represented as an explicit future integration boundary.',
    '',
    `Environment suffix: ${names.storage.slice(2)}`,
  ].join('\n');
  const response = modelResponse(platform, variant, names);
  await writeFile(join(dir, 'prompt.txt'), `${prompt}\n`);
  await writeFile(join(dir, 'MODEL_RESPONSE.md'), response);

  const files = extractFiles(response);
  for (const [relativePath, content] of files) {
    const target = join(dir, 'solution', relativePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${content}\n`);
  }
  return { dir, files };
}

async function deployCase(names, variant) {
  const steps = [];
  for (const step of deploySteps(names, variant)) {
    const result = await request(step);
    steps.push(result);
    if (step.stopOnExpectedFailure && result.ok) break;
    if (result.ok) steps.push(...await waitForStorageAccountReady(step));
    if (!result.ok) break;
  }
  steps.push(await request({
    label: `cleanup ${names.resourceGroup}`,
    method: 'DELETE',
    path: resourceGroupPath(names.resourceGroup),
    expect: [200, 202, 204],
  }));
  return steps;
}

function summarize(results) {
  const lines = [
    '# Azure IaC Model Response Smoke Report',
    '',
    `Execution mode: ${results.executionMode}`,
    `Endpoint: ${results.endpoint}`,
    '',
  ];
  for (const result of results.results) {
    lines.push(`## ${result.platformId} / ${result.variant}`);
    lines.push('');
    lines.push(`Expected deploy status: ${result.expectedDeployStatus}`);
    lines.push(`Actual deploy status: ${result.deployStatus}`);
    lines.push(`Status: ${result.ok ? 'pass' : 'fail'}`);
    if (result.lintErrors.length > 0) {
      lines.push('');
      lines.push('Lint errors:');
      for (const error of result.lintErrors) lines.push(`- ${error}`);
    }
    lines.push('');
    for (const step of result.steps) {
      const code = step.errorCode ? ` ${step.errorCode}` : '';
      lines.push(`- ${step.ok ? 'PASS' : 'FAIL'} ${step.method} ${step.label}: HTTP ${step.status}${code}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });

const backend = await startHybridArmFacade();
const runSuffix = suffix();
const results = [];

try {
  for (const platform of azurePlatforms) {
    for (const variant of ['correct', 'incorrect-invalid-storage-sku']) {
      const names = commonNames(runSuffix, platform.id, variant);
      const expectedDeployStatus = variant === 'correct' ? 'PASS' : 'FAIL';
      const { dir, files } = await writeBundle(platform, variant, names);
      const lintErrors = lintExtractedFiles(platform, files, variant);
      const steps = lintErrors.length === 0 ? await deployCase(names, variant) : [];
      const deploymentRejected = steps.some(step => step.status >= 400 && !step.label.startsWith('cleanup '));
      const unexpectedStepFailure = steps.some(step => !step.ok && !step.label.startsWith('cleanup '));
      const deployStatus = deploymentRejected ? 'FAIL' : 'PASS';
      const expectedFailureObserved = expectedDeployStatus === 'FAIL'
        ? steps.some(step => step.status === 400 && step.errorCode === 'InvalidAccountType')
        : !unexpectedStepFailure;
      const ok = lintErrors.length === 0
        && expectedFailureObserved
        && steps.every(step => step.ok || step.label.startsWith('cleanup '));

      const report = {
        status: ok ? 'completed' : 'failed',
        platform: platform.id,
        language: platform.language,
        validation_kind: 'globalstack-azure-iac-model-response-smoke',
        execution_mode: 'adapter-extracted-arm-plan; native-provider-execution-covered-by-platform-lifecycle-smoke',
        deploy_status: deployStatus,
        expected_deploy_status: expectedDeployStatus,
        integration_status: 'SKIP',
        failed_both_deploy_and_integration: false,
        lint_errors: lintErrors.length,
        lint_error_messages: lintErrors,
        verification: {
          passed: ok,
          failedStages: ok ? [] : ['deploy'],
          report: {
            platform: platform.id,
            language: platform.language,
            lint_status: lintErrors.length === 0 ? 'PASS' : 'FAIL',
            deploy_status: deployStatus,
            integration_status: 'SKIP',
            destroy_status: steps.some(step => step.label.startsWith('cleanup ') && step.ok) ? 'PASS' : 'FAIL',
            overall_status: ok ? 'PASS' : 'FAIL',
          },
        },
      };
      await writeFile(join(dir, 'model-response-validation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
      results.push({
        platformId: platform.id,
        language: platform.language,
        variant,
        bundleDir: dir,
        expectedDeployStatus,
        deployStatus,
        ok,
        lintErrors,
        steps,
      });
    }
  }
} finally {
  await backend.close();
}

const reportDoc = {
  generatedAt: new Date().toISOString(),
  endpoint: baseUrl,
  executionMode: 'adapter-extracted-arm-plan; native-provider-execution-covered-by-platform-lifecycle-smoke',
  caveat: 'This validates delivery-bundle-shaped model responses and Azure emulator accept/reject behavior by replaying the extracted ARM plan. Native Terraform, OpenTofu, Pulumi, Ansible, Azure CLI REST, Bicep, and ARM JSON execution is covered by npm run smoke:platform-runners.',
  results,
};
await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(reportDoc, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), summarize(reportDoc));

const failed = results.filter(result => !result.ok);
console.log(`Azure IaC model-response smoke completed: ${results.length - failed.length}/${results.length} cases passed.`);
if (failed.length > 0) {
  console.error(`Report: ${join(outRoot, 'report.md')}`);
  process.exit(1);
}
