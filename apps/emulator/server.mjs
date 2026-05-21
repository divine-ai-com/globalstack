import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createAppConfigurationRouter, createAppConfigurationRouterServer } from '../../packages/azure-data-plane/src/app-configuration-router.mjs';
import { createEventGridRouter, createEventGridRouterServer } from '../../packages/azure-data-plane/src/event-grid-router.mjs';
import { createFunctionsRouter, createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';
import {
  createBlobStorageServer,
  createQueueStorageServer,
  createStorageDataPlaneRouter,
  createTableStorageServer,
} from '../../packages/azure-data-plane/src/storage-router.mjs';
import { createWorkflowRunner } from '../../packages/azure-data-plane/src/workflow-runner.mjs';

const store = new ResourceStore();
const storageRouter = createStorageDataPlaneRouter();
const appConfigurationRouter = createAppConfigurationRouter();
const eventGridRouter = createEventGridRouter();
const functionsRouter = createFunctionsRouter();
const workflowRunner = createWorkflowRunner();
const storageAccountKey = process.env.GLOBALSTACK_AZURE_STORAGE_ACCOUNT_KEY
  ?? 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';

function syncResource({ store: resourceStore, providerRoute, resourceType, resource }) {
  if (resourceType === 'Microsoft.Storage/storageAccounts') {
    storageRouter.registerStorageAccount({
      accountName: resource.name,
      accountKey: storageAccountKey,
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

await Promise.all([
  listen(armServer, Number(process.env.GLOBALSTACK_ARM_PORT ?? 4566), process.env.GLOBALSTACK_ARM_HOST ?? '0.0.0.0'),
  listen(blobServer, Number(process.env.GLOBALSTACK_BLOB_PORT ?? 10000)),
  listen(queueServer, Number(process.env.GLOBALSTACK_QUEUE_PORT ?? 10001)),
  listen(tableServer, Number(process.env.GLOBALSTACK_TABLE_PORT ?? 10002)),
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
    new Promise(resolve => appConfigurationServer.close(resolve)),
    new Promise(resolve => eventGridServer.close(resolve)),
    new Promise(resolve => functionsServer.close(resolve)),
  ]);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
