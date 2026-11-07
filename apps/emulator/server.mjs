import { readFile } from 'node:fs/promises';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createAppConfigurationRouterServer } from '../../packages/azure-data-plane/src/app-configuration-router.mjs';
import { createEdgeRouterServer } from '../../packages/azure-data-plane/src/edge-router.mjs';
import { createBlobStorageServer, createQueueStorageServer, createTableStorageServer } from '../../packages/azure-data-plane/src/storage-router.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createEventGridRouterServer } from '../../packages/azure-data-plane/src/event-grid-router.mjs';
import { createFunctionsRouterServer } from '../../packages/azure-data-plane/src/functions-router.mjs';
import { createKubernetesRouterServer } from '../../packages/azure-data-plane/src/kubernetes-router.mjs';
import { createKeyVaultRouterServer } from '../../packages/azure-data-plane/src/key-vault-router.mjs';
import { createSearchRouterServer } from '../../packages/azure-data-plane/src/search-router.mjs';
import { createApiManagementRouterServer } from '../../packages/azure-data-plane/src/api-management-router.mjs';

const store = new ResourceStore();
const nativeFunctionsWorkers = process.env.GLOBALSTACK_FUNCTIONS_WORKERS_FILE
  ? JSON.parse(await readFile(process.env.GLOBALSTACK_FUNCTIONS_WORKERS_FILE, 'utf8')) : [];
const storageTokenTrusts = process.env.GLOBALSTACK_STORAGE_TOKEN_TRUSTS_FILE
  ? JSON.parse(await readFile(process.env.GLOBALSTACK_STORAGE_TOKEN_TRUSTS_FILE, 'utf8')) : [];
const keyVaultTokenTrusts = process.env.GLOBALSTACK_KEY_VAULT_TOKEN_TRUSTS_FILE
  ? JSON.parse(await readFile(process.env.GLOBALSTACK_KEY_VAULT_TOKEN_TRUSTS_FILE, 'utf8')) : [];
const runtime = createEmulatorRuntime({ store, nativeFunctionsWorkers, storageTokenTrusts, keyVaultTokenTrusts });

async function listen(server, port, host = process.env.GLOBALSTACK_HOST ?? '127.0.0.1') {
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
  onResourcePut: runtime.syncResource,
  onResourceDelete: runtime.unsyncResource,
  workflowRunner: runtime.workflowRunner,
  migrationRunner: runtime.migrationRunner,
  metricStore: runtime.metricStore,
  kubernetesRouter: runtime.kubernetesRouter,
  functionsRouter: runtime.functionsRouter,
});
const blobServer = createBlobStorageServer(runtime.storageRouter);
const queueServer = createQueueStorageServer(runtime.storageRouter);
const tableServer = createTableStorageServer(runtime.storageRouter);
const appConfigurationServer = createAppConfigurationRouterServer(runtime.appConfigurationRouter);
const edgeServer = createEdgeRouterServer(runtime.edgeRouter);
const eventGridServer = createEventGridRouterServer(runtime.eventGridRouter);
const functionsServer = createFunctionsRouterServer(runtime.functionsRouter);
const kubernetesServer = createKubernetesRouterServer(runtime.kubernetesRouter);
const keyVaultServer = createKeyVaultRouterServer(runtime.keyVaultRouter);
const searchServer = createSearchRouterServer(runtime.searchRouter);
const apiManagementServer = createApiManagementRouterServer(runtime.apiManagementRouter);

await Promise.all([
  listen(armServer, Number(process.env.GLOBALSTACK_ARM_PORT ?? 4566), process.env.GLOBALSTACK_ARM_HOST ?? process.env.GLOBALSTACK_HOST ?? '127.0.0.1'),
  listen(blobServer, Number(process.env.GLOBALSTACK_BLOB_PORT ?? 10000)),
  listen(queueServer, Number(process.env.GLOBALSTACK_QUEUE_PORT ?? 10001)),
  listen(tableServer, Number(process.env.GLOBALSTACK_TABLE_PORT ?? 10002)),
  listen(keyVaultServer, Number(process.env.GLOBALSTACK_KEY_VAULT_PORT ?? 10003)),
  listen(edgeServer, Number(process.env.GLOBALSTACK_EDGE_PORT ?? 10004)),
  listen(appConfigurationServer, Number(process.env.GLOBALSTACK_APP_CONFIGURATION_PORT ?? 8483)),
  listen(eventGridServer, Number(process.env.GLOBALSTACK_EVENT_GRID_PORT ?? 6010)),
  listen(functionsServer, Number(process.env.GLOBALSTACK_FUNCTIONS_PORT ?? 7071)),
  listen(kubernetesServer, Number(process.env.GLOBALSTACK_KUBERNETES_PORT ?? 10005)),
  listen(searchServer, Number(process.env.GLOBALSTACK_SEARCH_PORT ?? 10006)),
  listen(apiManagementServer, Number(process.env.GLOBALSTACK_API_MANAGEMENT_PORT ?? 10007)),
]);

// Process-level tests can discover ephemeral ports without reserving fixed ports.
process.send?.({ type: 'ready', ports: {
  arm: armServer.address().port, search: searchServer.address().port, apiManagement: apiManagementServer.address().port,
} });

const shutdown = async () => {
  await Promise.all([
    new Promise(resolve => armServer.close(resolve)),
    new Promise(resolve => blobServer.close(resolve)),
    new Promise(resolve => queueServer.close(resolve)),
    new Promise(resolve => tableServer.close(resolve)),
    new Promise(resolve => keyVaultServer.close(resolve)),
    new Promise(resolve => edgeServer.close(resolve)),
    new Promise(resolve => appConfigurationServer.close(resolve)),
    new Promise(resolve => eventGridServer.close(resolve)),
    new Promise(resolve => functionsServer.close(resolve)),
    new Promise(resolve => kubernetesServer.close(resolve)),
    new Promise(resolve => searchServer.close(resolve)),
    new Promise(resolve => apiManagementServer.close(resolve)),
  ]);
  await runtime.dispose?.();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
