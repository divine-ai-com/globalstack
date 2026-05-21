import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'dist', 'platform-images');
const templateRoot = join(root, 'templates');

async function readTemplate(relPath) {
  return readFile(join(templateRoot, relPath), 'utf8');
}

async function write(relPath, content, mode) {
  const abs = join(outRoot, relPath);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, { mode });
}

function composeFor(platform) {
  return [
    'services:',
    '  globalstack-azure:',
    '    image: ${GLOBALSTACK_AZURE_IMAGE:-globalstack/azure-emulator:local}',
    '    build:',
    '      context: ../../..',
    '      dockerfile: templates/emulator/Dockerfile',
    '      labels:',
    '        io.globalstack.owner: globalstack',
    '        io.globalstack.product: azure-emulator',
    '        io.globalstack.scope: platform-runtime',
    '        io.globalstack.cloud: azure',
    `    container_name: globalstack-${platform.id}-azure`,
    '    labels:',
    '      io.globalstack.owner: globalstack',
    '      io.globalstack.product: azure-emulator',
    '      io.globalstack.scope: platform-runtime',
    '      io.globalstack.cloud: azure',
    `      io.globalstack.platform: ${platform.id}`,
    '    ports:',
    '      - "127.0.0.1:4566:4566"',
    '    environment:',
    '      GLOBALSTACK_AUTH_TOKEN: ${GLOBALSTACK_AUTH_TOKEN:?GLOBALSTACK_AUTH_TOKEN must already be exported in the host shell}',
    '      GLOBALSTACK_ARM_HOST: 0.0.0.0',
    '      GLOBALSTACK_ARM_PORT: 4566',
    '      GLOBALSTACK_AZURE_SUBSCRIPTION_ID: ${ARM_SUBSCRIPTION_ID:-00000000-0000-0000-0000-000000000000}',
    '      GLOBALSTACK_AZURE_TENANT_ID: ${ARM_TENANT_ID:-00000000-0000-0000-0000-000000000000}',
    '      GLOBALSTACK_AZURE_CLIENT_ID: ${ARM_CLIENT_ID:-11111111-1111-1111-1111-111111111111}',
    '      GLOBALSTACK_AZURE_CLIENT_SECRET: ${ARM_CLIENT_SECRET:-globalstack}',
    '      DEBUG: ${DEBUG:-1}',
    '    volumes:',
    '      - ./volume:/var/lib/globalstack',
    '    healthcheck:',
    '      test: ["CMD", "node", "-e", "fetch(\'http://localhost:4566/_globalstack/health\').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]',
    '      interval: 5s',
    '      timeout: 5s',
    '      retries: 30',
    '      start_period: 10s',
    '',
    '  runner:',
    `    image: \${GLOBALSTACK_RUNNER_IMAGE:-${platform.imageTag}}`,
    '    build:',
    '      context: .',
    '      dockerfile: Dockerfile',
    '      labels:',
    '        io.globalstack.owner: globalstack',
    '        io.globalstack.product: azure-runner',
    '        io.globalstack.scope: platform-runtime',
    '        io.globalstack.cloud: azure',
    `        io.globalstack.platform: ${platform.id}`,
    '    network_mode: "service:globalstack-azure"',
    '    depends_on:',
      '      globalstack-azure:',
      '        condition: service_healthy',
    '    labels:',
    '      io.globalstack.owner: globalstack',
    '      io.globalstack.product: azure-runner',
    '      io.globalstack.scope: platform-runtime',
    '      io.globalstack.cloud: azure',
    `      io.globalstack.platform: ${platform.id}`,
    '    environment:',
    '      PROVIDER: ${PROVIDER:-}',
    '      CLOUD_PROVIDER: ${CLOUD_PROVIDER:-}',
    `      PLATFORM_ID: ${platform.id}`,
    `      LANGUAGE: ${platform.language}`,
    `      TOOLCHAIN: ${platform.toolchain}`,
    '      ENVIRONMENT_SUFFIX: ${ENVIRONMENT_SUFFIX:-dev}',
    '      AZURE_LOCATION: ${AZURE_LOCATION:-eastus}',
    '      AZURE_ENDPOINT_URL: http://localhost:4566',
    '      ARM_ENDPOINT: http://localhost:4566',
    '      ARM_RESOURCE_MANAGER_ENDPOINT: http://localhost:4566/',
    '      GLOBALSTACK_AZURE_HOST: localhost',
    '      PIPELINE_STAGE_SCOPE: ${PIPELINE_STAGE_SCOPE:-local-only}',
    '    volumes:',
    '      - ${LOCAL_TASK_PATH:-./sample-task}:/workspace/task:ro',
    '      - ./reports:/workspace/reports',
    '      - ./work:/workspace/work',
    '',
  ].join('\n');
}

function metadataFor(platform) {
  return `${JSON.stringify({
    id: platform.id,
    label: platform.label,
    cloud: 'azure',
    localCloud: 'globalstack-azure',
    image: platform.imageTag,
    toolchain: platform.toolchain,
    language: platform.language,
    solutionFiles: platform.solutionFiles,
    testFiles: platform.testFiles,
    environment: {
      authToken: 'GLOBALSTACK_AUTH_TOKEN is required on the host and passed only to the GlobalStack Azure sidecar',
      endpoint: 'http://localhost:4566',
      location: 'AZURE_LOCATION defaults to eastus',
    },
  }, null, 2)}\n`;
}

await rm(outRoot, { recursive: true, force: true });

const commonEntry = await readTemplate('runner/common/entrypoint.sh');
const commonAzure = await readTemplate('runner/common/globalstack-azure.sh');
const bicepStages = [
  'common.sh',
  'build.sh',
  'lint.sh',
  'unit-tests.sh',
  'deploy.sh',
  'integration-tests.sh',
  'destroy.sh',
];
const bicepSampleFiles = [
  'metadata.json',
  'README.md',
  'lib/main.bicep',
  'lib/workload.bicep',
  'lib/parameters.json',
];

async function copyTemplateTree(sourceRel, targetRel) {
  const entries = await readdir(join(templateRoot, sourceRel), { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = `${sourceRel}/${entry.name}`;
    const targetPath = `${targetRel}/${entry.name}`;
    if (entry.isDirectory()) {
      await copyTemplateTree(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await write(targetPath, await readTemplate(sourcePath), entry.name.endsWith('.sh') ? 0o755 : 0o644);
    }
  }
}

function armContractTemplate() {
  return `${JSON.stringify({
    $schema: 'https://schema.management.azure.com/schemas/2018-05-01/subscriptionDeploymentTemplate.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      location: { type: 'string', defaultValue: 'eastus' },
      resourceGroupName: { type: 'string' },
      storageAccountName: { type: 'string' },
      queueName: { type: 'string', defaultValue: 'jobs' },
    },
    resources: [
      {
        type: 'Microsoft.Resources/resourceGroups',
        apiVersion: '2022-09-01',
        name: "[parameters('resourceGroupName')]",
        location: "[parameters('location')]",
        tags: { purpose: 'globalstack-platform-runner-smoke' },
      },
      {
        type: 'Microsoft.Resources/deployments',
        apiVersion: '2022-09-01',
        name: 'platform-runner-workload',
        resourceGroup: "[parameters('resourceGroupName')]",
        properties: {
          mode: 'Incremental',
          parameters: {
            location: { value: "[parameters('location')]" },
            storageAccountName: { value: "[parameters('storageAccountName')]" },
            queueName: { value: "[parameters('queueName')]" },
          },
          template: {
            $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
            contentVersion: '1.0.0.0',
            parameters: {
              location: { type: 'string' },
              storageAccountName: { type: 'string' },
              queueName: { type: 'string' },
            },
            resources: [
              {
                type: 'Microsoft.Storage/storageAccounts',
                apiVersion: '2023-05-01',
                name: "[parameters('storageAccountName')]",
                location: "[parameters('location')]",
                kind: 'StorageV2',
                sku: { name: 'Standard_LRS' },
                properties: {
                  accessTier: 'Hot',
                  allowBlobPublicAccess: false,
                  minimumTlsVersion: 'TLS1_2',
                  supportsHttpsTrafficOnly: true,
                },
              },
              {
                type: 'Microsoft.Storage/storageAccounts/queueServices',
                apiVersion: '2023-05-01',
                name: "[concat(parameters('storageAccountName'), '/default')]",
                properties: {},
              },
              {
                type: 'Microsoft.Storage/storageAccounts/queueServices/queues',
                apiVersion: '2023-05-01',
                name: "[concat(parameters('storageAccountName'), '/default/', parameters('queueName'))]",
                properties: {},
              },
            ],
            outputs: {
              storageAccountName: { type: 'string', value: "[parameters('storageAccountName')]" },
              queueName: { type: 'string', value: "[parameters('queueName')]" },
            },
          },
        },
      },
    ],
    outputs: {
      resourceGroupName: { type: 'string', value: "[parameters('resourceGroupName')]" },
    },
  }, null, 2)}\n`;
}

function armContractParameters(platformId) {
  const safe = platformId.replace(/^azure-/, '').replace(/[^a-z0-9]/g, '').slice(0, 14);
  return `${JSON.stringify({
    $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#',
    contentVersion: '1.0.0.0',
    parameters: {
      location: { value: 'eastus' },
      resourceGroupName: { value: `rg-gs-${platformId.replace(/^azure-/, '').slice(0, 40)}` },
      storageAccountName: { value: `gs${safe}001`.slice(0, 24) },
      queueName: { value: 'jobs' },
    },
  }, null, 2)}\n`;
}

function platformSampleFiles(platform) {
  const common = {
    'metadata.json': `${JSON.stringify({
      provider: 'GlobalStack',
      description: 'Runner smoke target. Set provider to Azure to run the same task against real Azure credentials.',
    }, null, 2)}\n`,
    'globalstack/azuredeploy.json': armContractTemplate(),
    'globalstack/azuredeploy.parameters.json': armContractParameters(platform.id),
  };
  switch (platform.id) {
    case 'azure-arm-json':
      return {
        ...common,
        'README.md': '# Azure ARM JSON Runner Sample\n\nThis sample is a deployment-runner fixture.\n',
        'lib/azuredeploy.json': armContractTemplate(),
        'lib/azuredeploy.parameters.json': armContractParameters(platform.id),
      };
    case 'azure-terraform-hcl':
    case 'azure-opentofu-hcl':
      return {
        ...common,
        'README.md': `# ${platform.label} Runner Sample\n\nThis sample validates native HCL and deploys through native provider apply against GlobalStack.\n`,
        'lib/provider.tf': `terraform {\n  required_providers {\n    azapi = {\n      source  = "azure/azapi"\n      version = "~> 2.0"\n    }\n  }\n}\n\nprovider "azapi" {\n  subscription_id = var.subscription_id\n}\n`,
        'lib/variables.tf': 'variable "location" {\n  type    = string\n  default = "eastus"\n}\n\nvariable "subscription_id" {\n  type    = string\n  default = "00000000-0000-0000-0000-000000000000"\n}\n\nvariable "resource_group_name" {\n  type    = string\n  default = "rg-gs-hcl-sample"\n}\n\nvariable "storage_account_name" {\n  type    = string\n  default = "gshclsample001"\n}\n',
        'lib/main.tf': 'resource "azapi_resource" "resource_group" {\n  type      = "Microsoft.Resources/resourceGroups@2022-09-01"\n  name      = var.resource_group_name\n  location  = var.location\n  parent_id = "/subscriptions/${var.subscription_id}"\n}\n\nresource "azapi_resource" "storage_account" {\n  type      = "Microsoft.Storage/storageAccounts@2023-05-01"\n  name      = var.storage_account_name\n  location  = var.location\n  parent_id = azapi_resource.resource_group.id\n  body = {\n    kind       = "StorageV2"\n    sku        = { name = "Standard_LRS" }\n    properties = { minimumTlsVersion = "TLS1_2" }\n  }\n}\n',
        'lib/outputs.tf': 'output "resource_group_name" { value = var.resource_group_name }\noutput "storage_account_name" { value = var.storage_account_name }\n',
      };
    case 'azure-pulumi-ts':
      return {
        ...common,
        'README.md': '# Pulumi Azure TypeScript Runner Sample\n\nThis sample deploys through native `pulumi up` when the platform runner executes a full lifecycle.\n',
        'package.json': '{\n  "dependencies": {\n    "@pulumi/pulumi": "^3.122.0",\n    "@pulumi/azure-native": "^2.80.0",\n    "@types/node": "^20.0.0",\n    "typescript": "^5.0.0",\n    "ts-node": "^10.9.2"\n  }\n}\n',
        'Pulumi.yaml': 'name: globalstack-azure-pulumi-ts-sample\nruntime:\n  name: nodejs\n  options:\n    typescript: true\nmain: bin/tap.ts\n',
        'bin/tap.ts': 'import { createTapStack } from "../lib/tap-stack";\n\nconst stack = createTapStack();\n\nexport const resourceGroupNameOut = stack.resourceGroup.name;\nexport const storageAccountNameOut = stack.storageAccount.name;\n',
        'lib/tap-stack.ts': 'import * as resources from "@pulumi/azure-native/resources";\nimport * as storage from "@pulumi/azure-native/storage";\n\nexport function createTapStack() {\n  const location = process.env.AZURE_LOCATION ?? "eastus";\n  const resourceGroupName = process.env.GLOBALSTACK_RESOURCE_GROUP_NAME ?? "rg-gs-pulumi-ts";\n  const storageAccountName = process.env.GLOBALSTACK_STORAGE_ACCOUNT_NAME ?? "gspulumits001";\n\n  const resourceGroup = new resources.ResourceGroup("rg", {\n    resourceGroupName,\n    location,\n    tags: { purpose: "globalstack-platform-runner-smoke" },\n  });\n\n  const storageAccount = new storage.StorageAccount("acct", {\n    accountName: storageAccountName,\n    resourceGroupName: resourceGroup.name,\n    location,\n    sku: { name: storage.SkuName.Standard_LRS },\n    kind: storage.Kind.StorageV2,\n    minimumTlsVersion: storage.MinimumTlsVersion.TLS1_2,\n    allowBlobPublicAccess: false,\n  });\n\n  return {\n    resourceGroup,\n    storageAccount,\n  };\n}\n',
      };
    case 'azure-pulumi-py':
      return {
        ...common,
        'README.md': '# Pulumi Azure Python Runner Sample\n\nThis sample deploys through native `pulumi up` when the platform runner executes a full lifecycle.\n',
        'Pulumi.yaml': 'name: globalstack-azure-pulumi-py-sample\nruntime: python\nmain: tap.py\n',
        'requirements.txt': 'pulumi>=3.0.0\npulumi-azure-native>=2.0.0\n',
        'tap.py': 'from pathlib import Path\nimport sys\n\nsys.path.insert(0, str(Path(__file__).resolve().parent))\n\nfrom lib.tap_stack import create_stack\n\ncreate_stack()\n',
        'lib/__init__.py': '',
        'lib/tap_stack.py': 'import os\n\nimport pulumi\nimport pulumi_azure_native.resources as resources\nimport pulumi_azure_native.storage as storage\n\n\ndef create_stack():\n    location = os.getenv("AZURE_LOCATION", "eastus")\n    resource_group_name = os.getenv("GLOBALSTACK_RESOURCE_GROUP_NAME", "rg-gs-pulumi-py")\n    storage_account_name = os.getenv("GLOBALSTACK_STORAGE_ACCOUNT_NAME", "gspulumipy001")\n\n    rg = resources.ResourceGroup(\n        "rg",\n        resource_group_name=resource_group_name,\n        location=location,\n        tags={"purpose": "globalstack-platform-runner-smoke"},\n    )\n    account = storage.StorageAccount(\n        "acct",\n        account_name=storage_account_name,\n        resource_group_name=rg.name,\n        location=location,\n        sku=storage.SkuArgs(name=storage.SkuName.STANDARD_LRS),\n        kind=storage.Kind.STORAGE_V2,\n        minimum_tls_version=storage.MinimumTlsVersion.TLS1_2,\n        allow_blob_public_access=False,\n    )\n    pulumi.export("resourceGroupNameOut", rg.name)\n    pulumi.export("storageAccountNameOut", account.name)\n',
      };
    case 'azure-pulumi-yaml':
      return {
        ...common,
        'README.md': '# Pulumi Azure YAML Runner Sample\n\nThis sample deploys through native `pulumi up` when the platform runner executes a full lifecycle.\n',
        'Pulumi.yaml': 'name: globalstack-azure-pulumi-yaml-sample\nruntime: yaml\nresources:\n  rg:\n    type: azure-native:resources:ResourceGroup\n    properties:\n      resourceGroupName: rg-gs-pulumi-yaml\n      location: eastus\n      tags:\n        purpose: globalstack-platform-runner-smoke\n  account:\n    type: azure-native:storage:StorageAccount\n    properties:\n      accountName: gspulumiyaml001\n      resourceGroupName: ${rg.name}\n      location: eastus\n      sku:\n        name: Standard_LRS\n      kind: StorageV2\n      minimumTlsVersion: TLS1_2\n      allowBlobPublicAccess: false\noutputs:\n  resourceGroupNameOut: ${rg.name}\n  storageAccountNameOut: ${account.name}\n',
      };
    case 'azure-ansible-yaml':
      return {
        ...common,
        'README.md': '# Ansible Azure YAML Runner Sample\n\nThis sample deploys through native `azure.azcollection` modules when the platform runner executes a full lifecycle.\n',
        'inventory.yml': 'all:\n  hosts:\n    localhost:\n      ansible_connection: local\n',
        'ansible.cfg': '[defaults]\ninventory = inventory.yml\nhost_key_checking = False\nretry_files_enabled = False\n',
        'lib/playbook.yml': '---\n- name: GlobalStack Azure Ansible sample\n  hosts: localhost\n  gather_facts: false\n  collections:\n    - azure.azcollection\n  vars:\n    resource_group_name: "{{ lookup(\'env\', \'GLOBALSTACK_RESOURCE_GROUP_NAME\') | default(\'rg-gs-ansible-yaml\', true) }}"\n    storage_account_name: "{{ lookup(\'env\', \'GLOBALSTACK_STORAGE_ACCOUNT_NAME\') | default(\'gsansibleyaml001\', true) }}"\n    location: "{{ lookup(\'env\', \'GLOBALSTACK_LOCATION\') | default(\'eastus\', true) }}"\n  tasks:\n    - name: Create resource group\n      azure_rm_resourcegroup:\n        name: "{{ resource_group_name }}"\n        location: "{{ location }}"\n        auth_source: env\n        tags:\n          purpose: globalstack-platform-runner-smoke\n    - name: Create storage account\n      azure_rm_resource:\n        resource_group: "{{ resource_group_name }}"\n        provider: Storage\n        resource_type: storageAccounts\n        resource_name: "{{ storage_account_name }}"\n        api_version: "2023-01-01"\n        polling_timeout: 60\n        polling_interval: 1\n        auth_source: env\n        body:\n          location: "{{ location }}"\n          kind: StorageV2\n          sku:\n            name: Standard_LRS\n          properties:\n            accessTier: Hot\n            allowBlobPublicAccess: false\n            minimumTlsVersion: TLS1_2\n            supportsHttpsTrafficOnly: true\n',
      };
    default:
      return {
        'README.md': `# ${platform.label} sample task\n\nGenerated placeholder for smoke runs.\n`,
      };
  }
}

for (const platform of azurePlatforms) {
  const dockerfile = await readTemplate(`runner/dockerfiles/${platform.dockerfile}`);
  const platformRoot = platform.id;
  await write(`${platformRoot}/Dockerfile`, dockerfile, 0o644);
  await write(`${platformRoot}/common/entrypoint.sh`, commonEntry, 0o755);
  await write(`${platformRoot}/common/globalstack-azure.sh`, commonAzure, 0o755);
  await copyTemplateTree('runner/stages', `${platformRoot}/stages`);
  await write(`${platformRoot}/docker-compose.yml`, composeFor(platform), 0o644);
  await write(`${platformRoot}/platform.json`, metadataFor(platform), 0o644);
  if (platform.id === 'azure-bicep') {
    for (const sampleFile of bicepSampleFiles) {
      await write(`${platformRoot}/sample-task/${sampleFile}`, await readTemplate(`sample-tasks/azure-bicep/${sampleFile}`), 0o644);
    }
  } else {
    const sampleFiles = platformSampleFiles(platform);
    for (const [filePath, content] of Object.entries(sampleFiles)) {
      await write(`${platformRoot}/sample-task/${filePath}`, content, 0o644);
    }
  }
}

await writeFile(join(root, 'dist', 'platforms.json'), `${JSON.stringify(azurePlatforms, null, 2)}\n`);
console.log(`Rendered ${azurePlatforms.length} Azure platform image templates to ${outRoot}`);
