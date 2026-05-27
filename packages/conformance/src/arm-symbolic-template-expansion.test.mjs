import test from 'node:test';
import assert from 'node:assert/strict';
import { expandDeploymentTemplate } from '../../azure-control-plane/src/server-support.mjs';

test('ARM template expansion accepts languageVersion 2 symbolic resource objects and parent links', () => {
  const expanded = expandDeploymentTemplate({
    subscriptionId: '00000000-0000-0000-0000-000000000000',
    resourceGroupName: 'rg-symbolic',
    parameters: {
      location: { value: 'eastus' },
      storageAccountName: { value: 'gssymbolic001' },
      queueName: { value: 'jobs' },
    },
    template: {
      $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
      languageVersion: '2.0',
      contentVersion: '1.0.0.0',
      parameters: {
        location: { type: 'string' },
        storageAccountName: { type: 'string' },
        queueName: { type: 'string' },
      },
      resources: {
        account: {
          type: 'Microsoft.Storage/storageAccounts',
          apiVersion: '2023-01-01',
          name: "[parameters('storageAccountName')]",
          location: "[parameters('location')]",
          kind: 'StorageV2',
          sku: { name: 'Standard_LRS' },
          properties: { minimumTlsVersion: 'TLS1_2' },
        },
        queueService: {
          type: 'Microsoft.Storage/storageAccounts/queueServices',
          apiVersion: '2023-01-01',
          name: 'default',
          parent: 'account',
        },
        queue: {
          type: 'Microsoft.Storage/storageAccounts/queueServices/queues',
          apiVersion: '2023-01-01',
          name: "[parameters('queueName')]",
          parent: 'queueService',
          properties: {},
        },
      },
      outputs: {
        queueName: { type: 'string', value: "[parameters('queueName')]" },
      },
    },
  });

  const resourceTypePaths = expanded.operations
    .filter(operation => operation.kind === 'resource')
    .map(operation => operation.providerRoute.typePath);

  assert.deepEqual(resourceTypePaths, [
    'storageAccounts/gssymbolic001',
    'storageAccounts/gssymbolic001/queueServices/default',
    'storageAccounts/gssymbolic001/queueServices/default/queues/jobs',
  ]);
  assert.equal(expanded.outputs.queueName.value, 'jobs');
});

test('ARM template expansion accepts subscription nested deployments and child resources', () => {
  const expanded = expandDeploymentTemplate({
    subscriptionId: '00000000-0000-0000-0000-000000000000',
    parameters: {
      location: { value: 'eastus' },
      resourceGroupName: { value: 'rg-nested' },
      storageAccountName: { value: 'gsnested001' },
      containerName: { value: 'payloads' },
    },
    template: {
      $schema: 'https://schema.management.azure.com/schemas/2018-05-01/subscriptionDeploymentTemplate.json#',
      contentVersion: '1.0.0.0',
      parameters: {
        location: { type: 'string' },
        resourceGroupName: { type: 'string' },
        storageAccountName: { type: 'string' },
        containerName: { type: 'string' },
      },
      resources: [
        {
          type: 'Microsoft.Resources/resourceGroups',
          apiVersion: '2022-09-01',
          name: "[parameters('resourceGroupName')]",
          location: "[parameters('location')]",
        },
        {
          type: 'Microsoft.Resources/deployments',
          apiVersion: '2022-09-01',
          name: 'nested-workload',
          resourceGroup: "[parameters('resourceGroupName')]",
          properties: {
            mode: 'Incremental',
            parameters: {
              location: { value: "[parameters('location')]" },
              storageAccountName: { value: "[parameters('storageAccountName')]" },
              containerName: { value: "[parameters('containerName')]" },
            },
            template: {
              $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
              contentVersion: '1.0.0.0',
              parameters: {
                location: { type: 'string' },
                storageAccountName: { type: 'string' },
                containerName: { type: 'string' },
              },
              resources: [
                {
                  type: 'Microsoft.Storage/storageAccounts',
                  apiVersion: '2023-01-01',
                  name: "[parameters('storageAccountName')]",
                  location: "[parameters('location')]",
                  kind: 'StorageV2',
                  sku: { name: 'Standard_LRS' },
                  resources: [
                    {
                      type: 'blobServices',
                      apiVersion: '2023-01-01',
                      name: 'default',
                      resources: [
                        {
                          type: 'containers',
                          apiVersion: '2023-01-01',
                          name: "[parameters('containerName')]",
                          properties: { publicAccess: 'None' },
                        },
                      ],
                    },
                  ],
                },
              ],
              outputs: {
                containerName: { type: 'string', value: "[parameters('containerName')]" },
              },
            },
          },
        },
      ],
      outputs: {
        containerName: { type: 'string', value: "[parameters('containerName')]" },
      },
    },
  });

  const resourceTypePaths = expanded.operations
    .filter(operation => operation.kind === 'resource')
    .map(operation => operation.providerRoute.typePath);

  assert.deepEqual(resourceTypePaths, [
    'storageAccounts/gsnested001',
    'storageAccounts/gsnested001/blobServices/default',
    'storageAccounts/gsnested001/blobServices/default/containers/payloads',
  ]);
  assert.equal(expanded.deploymentOutputs['nested-workload'].containerName.value, 'payloads');
  assert.equal(expanded.outputs.containerName.value, 'payloads');
});
