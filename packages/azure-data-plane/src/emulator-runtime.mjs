import { URL } from 'node:url';
import { capabilityForResourceType } from '../../core/src/azure-tier1-capabilities.mjs';
import { createAppConfigurationRouter } from './app-configuration-router.mjs';
import { createDnsRegistry } from './dns-registry.mjs';
import { createEventGridRouter } from './event-grid-router.mjs';
import { createFunctionsRouter } from './functions-router.mjs';
import { createKeyVaultRouter } from './key-vault-router.mjs';
import { createMetricStore } from './metric-store.mjs';
import { createNetworkModel } from './network-model.mjs';
import { createServiceDiscoveryRegistry } from './service-discovery-registry.mjs';
import { createStorageDataPlaneRouter } from './storage-router.mjs';
import { createWorkflowRunner } from './workflow-runner.mjs';

function registeredStorageAccountKey(resourceStore, providerRoute) {
  return resourceStore.listStorageAccountKeys(providerRoute)?.keys?.[0]?.value
    ?? process.env.GLOBALSTACK_AZURE_STORAGE_ACCOUNT_KEY
    ?? 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
}

function resourceNameFromId(id) {
  return String(id ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

function dnsRouteParts(providerRoute) {
  const parts = providerRoute.typePath.split('/');
  return {
    zoneName: parts[1],
    recordType: parts.at(-2),
    recordName: parts.at(-1),
    linkName: parts.at(-1),
  };
}

export function createEmulatorRuntime({ store }) {
  const storageRouter = createStorageDataPlaneRouter();
  const appConfigurationRouter = createAppConfigurationRouter();
  const eventGridRouter = createEventGridRouter();
  const functionsRouter = createFunctionsRouter();
  const serviceDiscoveryRegistry = createServiceDiscoveryRegistry();
  const dnsRegistry = createDnsRegistry();
  const networkModel = createNetworkModel();
  const metricStore = createMetricStore();
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
      return;
    }

    if (resourceType === 'Microsoft.Network/virtualNetworks') {
      networkModel.registerVirtualNetwork(resource);
      return;
    }

    if (resourceType === 'Microsoft.Network/virtualNetworks/subnets') {
      networkModel.registerSubnet(resource);
      return;
    }

    if (resourceType === 'Microsoft.Network/privateEndpoints') {
      networkModel.registerPrivateEndpoint(resource);
      return;
    }

    if (resourceType === 'Microsoft.Network/dnsZones') {
      dnsRegistry.registerZone({ zoneName: resource.name, privateZone: false });
      return;
    }

    if (resourceType === 'Microsoft.Network/privateDnsZones') {
      dnsRegistry.registerZone({ zoneName: resource.name, privateZone: true });
      return;
    }

    if (resourceType.startsWith('Microsoft.Network/dnsZones/') || resourceType.startsWith('Microsoft.Network/privateDnsZones/')) {
      const privateZone = resourceType.startsWith('Microsoft.Network/privateDnsZones/');
      const { zoneName, recordType, recordName, linkName } = dnsRouteParts(providerRoute);
      if (resourceType === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks') {
        dnsRegistry.registerVirtualNetworkLink({
          zoneName,
          linkName,
          vnetId: resource.properties?.virtualNetwork?.id,
          registrationEnabled: resource.properties?.registrationEnabled,
        });
        return;
      }
      dnsRegistry.registerRecord({
        zoneName,
        privateZone,
        recordType,
        recordName,
        properties: resource.properties ?? {},
      });
      return;
    }

    if (resourceType === 'Microsoft.Insights/actionGroups') {
      metricStore.registerActionGroup(resource);
      return;
    }

    if (resourceType === 'Microsoft.Insights/metricAlerts') {
      metricStore.registerMetricAlert(resource);
      return;
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
      return;
    }

    if (resourceType === 'Microsoft.Network/virtualNetworks') {
      networkModel.unregisterVirtualNetwork(resource ?? providerRoute.typePath.split('/')[1]);
      return;
    }

    if (resourceType === 'Microsoft.Network/virtualNetworks/subnets') {
      networkModel.unregisterSubnet(resource ?? providerRoute.typePath.split('/').at(-1));
      return;
    }

    if (resourceType === 'Microsoft.Network/privateEndpoints') {
      networkModel.unregisterPrivateEndpoint(resource ?? providerRoute.typePath.split('/')[1]);
      return;
    }

    if (resourceType === 'Microsoft.Network/dnsZones') {
      dnsRegistry.unregisterZone({ zoneName: resource?.name ?? providerRoute.typePath.split('/')[1], privateZone: false });
      return;
    }

    if (resourceType === 'Microsoft.Network/privateDnsZones') {
      dnsRegistry.unregisterZone({ zoneName: resource?.name ?? providerRoute.typePath.split('/')[1], privateZone: true });
      return;
    }

    if (resourceType.startsWith('Microsoft.Network/dnsZones/') || resourceType.startsWith('Microsoft.Network/privateDnsZones/')) {
      const privateZone = resourceType.startsWith('Microsoft.Network/privateDnsZones/');
      const { zoneName, recordType, recordName, linkName } = dnsRouteParts(providerRoute);
      if (resourceType === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks') {
        dnsRegistry.unregisterVirtualNetworkLink({ zoneName, linkName });
        return;
      }
      dnsRegistry.unregisterRecord({
        zoneName,
        privateZone,
        recordType,
        recordName,
      });
      return;
    }

    if (resourceType === 'Microsoft.Insights/actionGroups') {
      metricStore.unregisterActionGroup(resource ?? providerRoute.typePath.split('/')[1]);
      return;
    }

    if (resourceType === 'Microsoft.Insights/metricAlerts') {
      metricStore.unregisterMetricAlert(resource ?? providerRoute.typePath.split('/')[1]);
    }
  }

  return {
    storageRouter,
    appConfigurationRouter,
    eventGridRouter,
    functionsRouter,
    keyVaultRouter,
    workflowRunner,
    serviceDiscoveryRegistry,
    dnsRegistry,
    networkModel,
    metricStore,
    syncResource,
    unsyncResource,
  };
}
