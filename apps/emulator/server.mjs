import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createAppConfigurationRouter, createAppConfigurationRouterServer } from '../../packages/azure-data-plane/src/app-configuration-router.mjs';
import { createEventGridRouter, createEventGridRouterServer } from '../../packages/azure-data-plane/src/event-grid-router.mjs';
import { createFunctionsRouter, createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';
import { createKeyVaultRouter, createKeyVaultRouterServer } from '../../packages/azure-data-plane/src/key-vault-router.mjs';
import {
  createBlobStorageServer,
  createQueueStorageServer,
  createStorageDataPlaneRouter,
  createTableStorageServer,
} from '../../packages/azure-data-plane/src/storage-router.mjs';
import { createWorkflowRunner } from '../../packages/azure-data-plane/src/workflow-runner.mjs';
import { capabilityForResourceType } from '../../packages/core/src/azure-tier1-capabilities.mjs';

const store = new ResourceStore();
const storageRouter = createStorageDataPlaneRouter();
const appConfigurationRouter = createAppConfigurationRouter();
const eventGridRouter = createEventGridRouter();
const functionsRouter = createFunctionsRouter();
const keyVaultRouter = createKeyVaultRouter({
  onSecretSet({ subscriptionId, resourceGroupName, vaultName, secretName, value, contentType, tags, attributes }) {
    if (!subscriptionId || !resourceGroupName) return;
    store.putResource({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.KeyVault',
      typePath: `vaults/${vaultName}/secrets/${secretName}`,
      body: {
        properties: {
          value,
          ...(contentType ? { contentType } : {}),
          ...(attributes ? { attributes } : {}),
        },
        ...(tags ? { tags } : {}),
      },
      apiVersion: '2023-07-01',
      capability: capabilityForResourceType('Microsoft.KeyVault/vaults/secrets'),
    });
  },
  onSecretDelete({ subscriptionId, resourceGroupName, vaultName, secretName }) {
    if (!subscriptionId || !resourceGroupName) return;
    store.deleteResource({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.KeyVault',
      typePath: `vaults/${vaultName}/secrets/${secretName}`,
    });
  },
  onKeyCreate({ subscriptionId, resourceGroupName, vaultName, keyName, kty, keyOps, keySize, tags }) {
    if (!subscriptionId || !resourceGroupName) return;
    store.putResource({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.KeyVault',
      typePath: `vaults/${vaultName}/keys/${keyName}`,
      body: {
        properties: {
          kty,
          keyOps,
          ...(keySize ? { keySize } : {}),
        },
        ...(tags ? { tags } : {}),
      },
      apiVersion: '2023-07-01',
      capability: capabilityForResourceType('Microsoft.KeyVault/vaults/keys'),
    });
  },
  onKeyDelete({ subscriptionId, resourceGroupName, vaultName, keyName }) {
    if (!subscriptionId || !resourceGroupName) return;
    store.deleteResource({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.KeyVault',
      typePath: `vaults/${vaultName}/keys/${keyName}`,
    });
  },
});
const workflowRunner = createWorkflowRunner();

function registeredStorageAccountKey(resourceStore, providerRoute) {
  return resourceStore.listStorageAccountKeys(providerRoute)?.keys?.[0]?.value
    ?? process.env.GLOBALSTACK_AZURE_STORAGE_ACCOUNT_KEY
    ?? 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
}

function resourceNameFromId(id) {
  return String(id ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

function syncResource({ store: resourceStore, providerRoute, resourceType, resource }) {
  if (resourceType === 'Microsoft.Storage/storageAccounts') {
    storageRouter.registerStorageAccount({
      accountName: resource.name,
      accountKey: registeredStorageAccountKey(resourceStore, providerRoute),
    });
    return;
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/blobServices/containers') {
    const accountName = providerRoute.typePath.split('/')[1];
    const containerName = providerRoute.typePath.split('/').at(-1);
    storageRouter.registerContainer({ accountName, containerName });
    return;
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/queueServices/queues') {
    const accountName = providerRoute.typePath.split('/')[1];
    const queueName = providerRoute.typePath.split('/').at(-1);
    storageRouter.registerQueue({ accountName, queueName });
    return;
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/tableServices/tables') {
    const accountName = providerRoute.typePath.split('/')[1];
    const tableName = providerRoute.typePath.split('/').at(-1);
    storageRouter.registerTable({ accountName, tableName });
    return;
  }

  if (resourceType === 'Microsoft.AppConfiguration/configurationStores') {
    appConfigurationRouter.registerStore({
      storeName: resource.name,
      endpoint: resource.properties?.endpoint,
    });
    return;
  }

  if (resourceType === 'Microsoft.Web/sites') {
    functionsRouter.registerApp({
      appName: resource.name,
      defaultHostName: resource.properties?.defaultHostName,
    });
    return;
  }

  if (resourceType === 'Microsoft.Web/sites/functions') {
    const [, appName, , functionName] = providerRoute.typePath.split('/');
    functionsRouter.registerFunctionResource({
      appName,
      functionName,
      config: resource.properties?.config ?? {},
    });
    return;
  }

  if (resourceType === 'Microsoft.Logic/workflows') {
    workflowRunner.registerWorkflow({
      workflowName: resource.name,
      properties: resource.properties,
    });
    return;
  }

  if (resourceType === 'Microsoft.EventGrid/topics') {
    const keys = resourceStore.listEventGridTopicKeys(providerRoute);
    const endpoint = resource.properties?.endpoint;
    const host = endpoint ? new URL(endpoint).host : undefined;
    eventGridRouter.registerTopic({
      topicName: resource.name,
      host,
      key1: keys?.key1,
      key2: keys?.key2,
    });
    return;
  }

  if (resourceType === 'Microsoft.EventGrid/eventSubscriptions') {
    eventGridRouter.registerSubscription({
      topicName: resourceNameFromId(resource.properties?.scope),
      subscriptionName: resource.name,
      destination: resource.properties?.destination ?? {},
    });
    return;
  }

  if (resourceType === 'Microsoft.KeyVault/vaults') {
    keyVaultRouter.registerVault({
      vaultName: resource.name,
      vaultUri: resource.properties?.vaultUri,
      subscriptionId: providerRoute.subscriptionId,
      resourceGroupName: providerRoute.resourceGroupName,
    });
    return;
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/secrets') {
    const [, vaultName, , secretName] = providerRoute.typePath.split('/');
    keyVaultRouter.setSecret({
      vaultName,
      secretName,
      value: resource.properties?.value ?? '',
      contentType: resource.properties?.contentType ?? null,
      tags: resource.tags ?? {},
      attributes: resource.properties?.attributes ?? {},
      emitHook: false,
    });
    return;
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/keys') {
    const [, vaultName, , keyName] = providerRoute.typePath.split('/');
    keyVaultRouter.createKey({
      vaultName,
      keyName,
      kty: resource.properties?.kty ?? 'RSA',
      keyOps: resource.properties?.keyOps ?? ['encrypt', 'decrypt'],
      keySize: resource.properties?.keySize ?? 2048,
      tags: resource.tags ?? {},
      emitHook: false,
    });
  }
}

function unsyncResource({ providerRoute, resourceType, resource }) {
  if (resourceType === 'Microsoft.Storage/storageAccounts') {
    storageRouter.unregisterStorageAccount(resource?.name ?? providerRoute.typePath.split('/')[1]);
    return;
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/blobServices/containers') {
    storageRouter.unregisterContainer({
      accountName: providerRoute.typePath.split('/')[1],
      containerName: providerRoute.typePath.split('/').at(-1),
    });
    return;
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/queueServices/queues') {
    storageRouter.unregisterQueue({
      accountName: providerRoute.typePath.split('/')[1],
      queueName: providerRoute.typePath.split('/').at(-1),
    });
    return;
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/tableServices/tables') {
    storageRouter.unregisterTable({
      accountName: providerRoute.typePath.split('/')[1],
      tableName: providerRoute.typePath.split('/').at(-1),
    });
    return;
  }

  if (resourceType === 'Microsoft.AppConfiguration/configurationStores') {
    appConfigurationRouter.unregisterStore(resource?.name ?? providerRoute.typePath.split('/')[1]);
    return;
  }

  if (resourceType === 'Microsoft.Web/sites') {
    functionsRouter.unregisterApp(resource?.name ?? providerRoute.typePath.split('/')[1]);
    return;
  }

  if (resourceType === 'Microsoft.Web/sites/functions') {
    const [, appName, , functionName] = providerRoute.typePath.split('/');
    functionsRouter.unregisterFunctionResource({
      appName,
      functionName,
      config: resource?.properties?.config ?? {},
    });
    return;
  }

  if (resourceType === 'Microsoft.Logic/workflows') {
    workflowRunner.unregisterWorkflow(resource?.name ?? providerRoute.typePath.split('/')[1]);
    return;
  }

  if (resourceType === 'Microsoft.EventGrid/topics') {
    eventGridRouter.unregisterTopic(resource?.name ?? providerRoute.typePath.split('/')[1]);
    return;
  }

  if (resourceType === 'Microsoft.EventGrid/eventSubscriptions') {
    eventGridRouter.unregisterSubscription({
      topicName: resourceNameFromId(resource?.properties?.scope),
      subscriptionName: resource?.name ?? providerRoute.typePath.split('/').at(-1),
    });
    return;
  }

  if (resourceType === 'Microsoft.KeyVault/vaults') {
    keyVaultRouter.unregisterVault(resource?.name ?? providerRoute.typePath.split('/')[1]);
    return;
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/secrets') {
    const [, vaultName, , secretName] = providerRoute.typePath.split('/');
    keyVaultRouter.removeSecret({ vaultName, secretName });
    return;
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/keys') {
    const [, vaultName, , keyName] = providerRoute.typePath.split('/');
    keyVaultRouter.removeKey({ vaultName, keyName });
  }
}

async function listen(server, port, host = '0.0.0.0') {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

const armServer = createArmServer({
  store,
  onResourcePut: syncResource,
  onResourceDelete: unsyncResource,
  workflowRunner,
});
const blobServer = createBlobStorageServer(storageRouter);
const queueServer = createQueueStorageServer(storageRouter);
const tableServer = createTableStorageServer(storageRouter);
const appConfigurationServer = createAppConfigurationRouterServer(appConfigurationRouter);
const eventGridServer = createEventGridRouterServer(eventGridRouter);
const functionsServer = createFunctionsRouterServer(functionsRouter);
const keyVaultServer = createKeyVaultRouterServer(keyVaultRouter);

await Promise.all([
  listen(armServer, Number(process.env.GLOBALSTACK_ARM_PORT ?? 4566), process.env.GLOBALSTACK_ARM_HOST ?? '0.0.0.0'),
  listen(blobServer, Number(process.env.GLOBALSTACK_BLOB_PORT ?? 10000)),
  listen(queueServer, Number(process.env.GLOBALSTACK_QUEUE_PORT ?? 10001)),
  listen(tableServer, Number(process.env.GLOBALSTACK_TABLE_PORT ?? 10002)),
  listen(keyVaultServer, Number(process.env.GLOBALSTACK_KEY_VAULT_PORT ?? 10003)),
  listen(appConfigurationServer, Number(process.env.GLOBALSTACK_APP_CONFIGURATION_PORT ?? 8483)),
  listen(eventGridServer, Number(process.env.GLOBALSTACK_EVENT_GRID_PORT ?? 6010)),
  listen(functionsServer, Number(process.env.GLOBALSTACK_FUNCTIONS_PORT ?? 7071)),
]);

const shutdown = async () => {
  await Promise.all([
    new Promise(resolve => armServer.close(resolve)),
    new Promise(resolve => blobServer.close(resolve)),
    new Promise(resolve => queueServer.close(resolve)),
    new Promise(resolve => tableServer.close(resolve)),
    new Promise(resolve => keyVaultServer.close(resolve)),
    new Promise(resolve => appConfigurationServer.close(resolve)),
    new Promise(resolve => eventGridServer.close(resolve)),
    new Promise(resolve => functionsServer.close(resolve)),
  ]);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
