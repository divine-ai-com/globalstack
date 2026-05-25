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

const store = new ResourceStore();
const runtime = createEmulatorRuntime({ store });

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
  onResourcePut: runtime.syncResource,
  onResourceDelete: runtime.unsyncResource,
  workflowRunner: runtime.workflowRunner,
  metricStore: runtime.metricStore,
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

await Promise.all([
  listen(armServer, Number(process.env.GLOBALSTACK_ARM_PORT ?? 4566), process.env.GLOBALSTACK_ARM_HOST ?? '0.0.0.0'),
  listen(blobServer, Number(process.env.GLOBALSTACK_BLOB_PORT ?? 10000)),
  listen(queueServer, Number(process.env.GLOBALSTACK_QUEUE_PORT ?? 10001)),
  listen(tableServer, Number(process.env.GLOBALSTACK_TABLE_PORT ?? 10002)),
  listen(keyVaultServer, Number(process.env.GLOBALSTACK_KEY_VAULT_PORT ?? 10003)),
  listen(edgeServer, Number(process.env.GLOBALSTACK_EDGE_PORT ?? 10004)),
  listen(appConfigurationServer, Number(process.env.GLOBALSTACK_APP_CONFIGURATION_PORT ?? 8483)),
  listen(eventGridServer, Number(process.env.GLOBALSTACK_EVENT_GRID_PORT ?? 6010)),
  listen(functionsServer, Number(process.env.GLOBALSTACK_FUNCTIONS_PORT ?? 7071)),
  listen(kubernetesServer, Number(process.env.GLOBALSTACK_KUBERNETES_PORT ?? 10005)),
]);

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
  ]);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
