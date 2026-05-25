import { URL } from 'node:url';
import { capabilityForResourceType } from '../../core/src/azure-tier1-capabilities.mjs';
import { createActivityLogStore } from './activity-log-store.mjs';
import { createAppConfigurationRouter } from './app-configuration-router.mjs';
import { createDnsRegistry } from './dns-registry.mjs';
import { createEdgeRouter } from './edge-router.mjs';
import { createEventGridRouter } from './event-grid-router.mjs';
import { createFunctionsRouter } from './functions-router.mjs';
import { createKeyVaultRouter } from './key-vault-router.mjs';
import { createMetricStore } from './metric-store.mjs';
import { createNetworkModel } from './network-model.mjs';
import { createServiceDiscoveryRegistry } from './service-discovery-registry.mjs';
import { createStorageDataPlaneRouter } from './storage-router.mjs';
import { createWafEvaluator } from './waf-evaluator.mjs';
import { createWorkflowRunner } from './workflow-runner.mjs';

function registeredStorageAccountKey(resourceStore, providerRoute) {
  return resourceStore.listStorageAccountKeys(providerRoute)?.keys?.[0]?.value
    ?? process.env.GLOBALSTACK_AZURE_STORAGE_ACCOUNT_KEY
    ?? 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
}

function resourceNameFromId(id) {
  return String(id ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

function leafResourceName(name) {
  return String(name ?? '').split('/').filter(Boolean).at(-1) ?? '';
}

function resourceSegments(id) {
  return String(id ?? '').split('/').filter(Boolean);
}

function resourcePath({ subscriptionId, resourceGroupName, providerNamespace, typePath }) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/${providerNamespace}/${typePath}`;
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

function cdnTypeParts(typePath) {
  return String(typePath ?? '').split('/');
}

function frontDoorProfileName(typePath) {
  return cdnTypeParts(typePath)[1] ?? null;
}

function frontDoorEndpointName(typePath) {
  return cdnTypeParts(typePath)[3] ?? null;
}

function frontDoorOriginGroupName(typePath) {
  return cdnTypeParts(typePath)[3] ?? null;
}

function resourceIdMatches(a, b) {
  return String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();
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
  const wafEvaluator = createWafEvaluator();
  const edgeRouter = createEdgeRouter({ wafEvaluator });
  const activityLogStore = createActivityLogStore();
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

  function emitActivityLog({ providerRoute, resourceType, resource, verb }) {
    if (!providerRoute?.resourceGroupName || !resourceType) return;
    activityLogStore.emit({
      resourceId: resource?.id ?? resourcePath(providerRoute),
      resourceGroup: providerRoute.resourceGroupName,
      operationName: `${resourceType}/${verb}`,
      status: 'Succeeded',
      properties: {
        providerNamespace: providerRoute.providerNamespace,
        typePath: providerRoute.typePath,
      },
    });
  }

  function listCdnResources({ subscriptionId, resourceGroupName, typePath }) {
    return store.listResourcesByType({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Cdn',
      typePath,
    });
  }

  function reconcileCdnEndpoint({ subscriptionId, resourceGroupName, profileName, endpointName }) {
    if (!profileName || !endpointName) return;
    const endpointRoute = {
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Cdn',
      typePath: `profiles/${profileName}/endpoints/${endpointName}`,
    };
    const endpoint = store.getResource(endpointRoute);
    if (!endpoint) {
      edgeRouter.unregisterEndpoint(`${endpointName}.azureedge.net`);
      return;
    }
    edgeRouter.registerEndpoint({
      endpointName,
      hostName: endpoint.properties?.hostName,
      kind: 'cdn',
      enabledState: endpoint.properties?.isCompressionEnabled === false ? 'Enabled' : endpoint.properties?.resourceState ?? 'Enabled',
      origins: endpoint.properties?.origins ?? [],
      isHttpAllowed: endpoint.properties?.isHttpAllowed ?? true,
      isHttpsAllowed: endpoint.properties?.isHttpsAllowed ?? true,
    });
  }

  function reconcileAllCdnEndpoints({ subscriptionId, resourceGroupName, profileName }) {
    if (!profileName) return;
    for (const endpoint of listCdnResources({
      subscriptionId,
      resourceGroupName,
      typePath: `profiles/${profileName}/endpoints`,
    })) {
      reconcileCdnEndpoint({
        subscriptionId,
        resourceGroupName,
        profileName,
        endpointName: leafResourceName(endpoint.name),
      });
    }
  }

  function routeConfigForAfdEndpoint({ subscriptionId, resourceGroupName, profileName, endpointName }) {
    const routes = listCdnResources({
      subscriptionId,
      resourceGroupName,
      typePath: `profiles/${profileName}/afdEndpoints/${endpointName}/routes`,
    });
    const route = routes.find(item => (item.properties?.enabledState ?? 'Enabled') === 'Enabled') ?? routes[0] ?? null;
    let routePatterns = route?.properties?.patternsToMatch ?? [];
    let origins = [];
    const originGroupId = route?.properties?.originGroup?.id ?? route?.properties?.originGroup?.resourceId ?? null;
    if (originGroupId) {
      const parts = resourceSegments(originGroupId);
      const originGroupName = parts[parts.indexOf('originGroups') + 1] ?? null;
      if (originGroupName) {
        origins = listCdnResources({
          subscriptionId,
          resourceGroupName,
          typePath: `profiles/${profileName}/originGroups/${originGroupName}/origins`,
        });
      }
    }

    let wafPolicyName = null;
    const securityPolicies = listCdnResources({
      subscriptionId,
      resourceGroupName,
      typePath: `profiles/${profileName}/securityPolicies`,
    });
    for (const securityPolicy of securityPolicies) {
      const associations = securityPolicy.properties?.parameters?.associations ?? [];
      const matchedAssociation = associations.find(association =>
        (association.domains ?? []).some(domain => resourceIdMatches(domain.id, endpointRouteId({ subscriptionId, resourceGroupName, profileName, endpointName }))),
      );
      if (!matchedAssociation) continue;
      wafPolicyName = resourceNameFromId(securityPolicy.properties?.parameters?.wafPolicy?.id);
      if (routePatterns.length === 0 && (matchedAssociation.patternsToMatch ?? []).length > 0) {
        routePatterns = matchedAssociation.patternsToMatch;
      }
      break;
    }
    return { origins, routePatterns, wafPolicyName };
  }

  function endpointRouteId({ subscriptionId, resourceGroupName, profileName, endpointName }) {
    return resourcePath({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Cdn',
      typePath: `profiles/${profileName}/afdEndpoints/${endpointName}`,
    });
  }

  function reconcileAfdEndpoint({ subscriptionId, resourceGroupName, profileName, endpointName }) {
    if (!profileName || !endpointName) return;
    const endpointRoute = {
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Cdn',
      typePath: `profiles/${profileName}/afdEndpoints/${endpointName}`,
    };
    const endpoint = store.getResource(endpointRoute);
    if (!endpoint) {
      edgeRouter.unregisterEndpoint(`${endpointName}.azurefd.net`);
      return;
    }
    const { origins, routePatterns, wafPolicyName } = routeConfigForAfdEndpoint({
      subscriptionId,
      resourceGroupName,
      profileName,
      endpointName,
    });
    edgeRouter.registerEndpoint({
      endpointName,
      hostName: endpoint.properties?.hostName,
      kind: 'frontdoor',
      enabledState: endpoint.properties?.enabledState ?? 'Enabled',
      origins,
      routePatterns,
      wafPolicyName,
    });
  }

  function reconcileAllAfdEndpoints({ subscriptionId, resourceGroupName, profileName }) {
    if (!profileName) return;
    for (const endpoint of listCdnResources({
      subscriptionId,
      resourceGroupName,
      typePath: `profiles/${profileName}/afdEndpoints`,
    })) {
      reconcileAfdEndpoint({
        subscriptionId,
        resourceGroupName,
        profileName,
        endpointName: leafResourceName(endpoint.name),
      });
    }
  }

  function syncResource({ store: resourceStore, providerRoute, resourceType, resource }) {
    emitActivityLog({ providerRoute, resourceType, resource, verb: 'write' });

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

    if (resourceType === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies') {
      wafEvaluator.registerPolicy({
        policyName: resource.name,
        properties: resource.properties ?? {},
      });
      return;
    }

    if (resourceType === 'Microsoft.Cdn/profiles/endpoints') {
      reconcileCdnEndpoint({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        profileName: frontDoorProfileName(providerRoute.typePath),
        endpointName: leafResourceName(resource.name),
      });
      return;
    }

    if (resourceType === 'Microsoft.Cdn/profiles/afdEndpoints') {
      reconcileAfdEndpoint({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        profileName: frontDoorProfileName(providerRoute.typePath),
        endpointName: leafResourceName(resource.name),
      });
      return;
    }

    if (resourceType === 'Microsoft.Cdn/profiles/originGroups/origins'
      || resourceType === 'Microsoft.Cdn/profiles/afdEndpoints/routes'
      || resourceType === 'Microsoft.Cdn/profiles/securityPolicies') {
      reconcileAllAfdEndpoints({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        profileName: frontDoorProfileName(providerRoute.typePath),
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
    emitActivityLog({ providerRoute, resourceType, resource, verb: 'delete' });

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

    if (resourceType === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies') {
      wafEvaluator.unregisterPolicy(resource?.name ?? providerRoute.typePath.split('/')[1]);
      return;
    }

    if (resourceType === 'Microsoft.Cdn/profiles/endpoints') {
      edgeRouter.unregisterEndpoint(resource?.properties?.hostName ?? `${providerRoute.typePath.split('/').at(-1)}.azureedge.net`);
      reconcileAllCdnEndpoints({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        profileName: frontDoorProfileName(providerRoute.typePath),
      });
      return;
    }

    if (resourceType === 'Microsoft.Cdn/profiles/afdEndpoints') {
      edgeRouter.unregisterEndpoint(resource?.properties?.hostName ?? `${providerRoute.typePath.split('/').at(-1)}.azurefd.net`);
      reconcileAllAfdEndpoints({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        profileName: frontDoorProfileName(providerRoute.typePath),
      });
      return;
    }

    if (resourceType === 'Microsoft.Cdn/profiles/originGroups/origins'
      || resourceType === 'Microsoft.Cdn/profiles/afdEndpoints/routes'
      || resourceType === 'Microsoft.Cdn/profiles/securityPolicies') {
      reconcileAllAfdEndpoints({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        profileName: frontDoorProfileName(providerRoute.typePath),
      });
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
    edgeRouter,
    functionsRouter,
    keyVaultRouter,
    workflowRunner,
    serviceDiscoveryRegistry,
    activityLogStore,
    dnsRegistry,
    networkModel,
    metricStore,
    wafEvaluator,
    syncResource,
    unsyncResource,
  };
}
