import { URL } from 'node:url';
import { capabilityForResourceType } from '../../core/src/azure-tier1-capabilities.mjs';
import { createActivityLogStore } from './activity-log-store.mjs';
import { createAppConfigurationRouter } from './app-configuration-router.mjs';
import { createDnsRegistry } from './dns-registry.mjs';
import { createEdgeRouter } from './edge-router.mjs';
import { createEventGridRouter } from './event-grid-router.mjs';
import { createFunctionsRouter } from './functions-router.mjs';
import { createKubernetesRouter } from './kubernetes-router.mjs';
import { createKeyVaultRouter } from './key-vault-router.mjs';
import { createMetricStore } from './metric-store.mjs';
import { createMigrationPlanRunner } from './migration-plan-runner.mjs';
import { createNetworkModel } from './network-model.mjs';
import { createRelationalBackendManager } from './relational-backend-manager.mjs';
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

function publicIpRoute({ subscriptionId, resourceGroupName, publicIpName }) {
  return {
    subscriptionId,
    resourceGroupName,
    providerNamespace: 'Microsoft.Network',
    typePath: `publicIPAddresses/${publicIpName}`,
  };
}

function publicIpDetails(resource) {
  const properties = resource?.properties ?? {};
  return {
    ipAddress: properties.ipAddress ?? null,
    fqdn: properties.dnsSettings?.fqdn ?? null,
    hostName: properties.dnsSettings?.fqdn ?? properties.ipAddress ?? null,
  };
}

function frontendPublicIpReferences(resource) {
  return (resource?.properties?.frontendIPConfigurations ?? [])
    .map(config => config?.properties?.publicIPAddress?.id ?? null)
    .filter(Boolean);
}

function referenceName(id, segment) {
  const parts = resourceSegments(id);
  const index = parts.findIndex(part => part.toLowerCase() === String(segment).toLowerCase());
  return index >= 0 ? parts[index + 1] ?? null : null;
}

function originHostFromAppGateway(resource) {
  const pools = resource?.properties?.backendAddressPools ?? [];
  for (const pool of pools) {
    for (const address of pool?.properties?.backendAddresses ?? []) {
      if (address?.fqdn) return address.fqdn;
      if (address?.ipAddress) return address.ipAddress;
    }
  }
  return null;
}

function privateDnsZoneGroupParts(providerRoute) {
  const parts = String(providerRoute?.typePath ?? '').split('/');
  return {
    privateEndpointName: parts[1] ?? null,
    groupName: parts[3] ?? null,
  };
}

function zoneNameFromId(id) {
  const parts = resourceSegments(id);
  const index = parts.findIndex(part => part.toLowerCase() === 'privatednszones');
  return index >= 0 ? parts[index + 1] ?? '' : '';
}

function logAsyncRuntimeFailure(surface, error) {
  console.error('[globalstack:azure-data-plane] async runtime reconciliation failed', {
    surface,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
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
  const relationalBackends = createRelationalBackendManager();
  const migrationRunner = createMigrationPlanRunner({ relationalBackends });
  const wafEvaluator = createWafEvaluator();
  const edgeRouter = createEdgeRouter({ wafEvaluator });
  const kubernetesRouter = createKubernetesRouter({ edgeRouter });
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

  function reconcilePrivateEndpointDnsZoneGroup({ providerRoute, resource }) {
    const ownerKey = `private-endpoint-zone-group:${String(resource?.id ?? resourcePath(providerRoute)).toLowerCase()}`;
    dnsRegistry.unregisterRecordsByOwner(ownerKey);

    const { privateEndpointName } = privateDnsZoneGroupParts(providerRoute);
    if (!privateEndpointName || !resource) return;

    const privateEndpointRoute = {
      subscriptionId: providerRoute.subscriptionId,
      resourceGroupName: providerRoute.resourceGroupName,
      providerNamespace: 'Microsoft.Network',
      typePath: `privateEndpoints/${privateEndpointName}`,
    };
    const privateEndpoint = store.getResource(privateEndpointRoute);
    const endpointState = networkModel.getPrivateEndpoint(privateEndpoint?.id);
    const serviceId = privateEndpoint?.properties?.privateLinkServiceConnections?.[0]?.properties?.privateLinkServiceId;
    const recordName = resourceNameFromId(serviceId);
    if (!privateEndpoint || !endpointState?.ipAddress || !recordName) return;

    for (const config of resource.properties?.privateDnsZoneConfigs ?? []) {
      const zoneName = zoneNameFromId(config?.properties?.privateDnsZoneId);
      if (!zoneName) continue;
      dnsRegistry.registerRecord({
        zoneName,
        privateZone: true,
        recordType: 'A',
        recordName,
        ownerKey,
        properties: {
          TTL: 60,
          ARecords: [{ ipv4Address: endpointState.ipAddress }],
        },
      });
    }
  }

  function reconcilePrivateEndpointDnsZoneGroupsForEndpoint(providerRoute) {
    const privateEndpointName = providerRoute.typePath.split('/')[1];
    const prefix = `/subscriptions/${providerRoute.subscriptionId}/resourceGroups/${providerRoute.resourceGroupName}/providers/Microsoft.Network/privateEndpoints/${privateEndpointName}/privateDnsZoneGroups/`;
    for (const resource of store.listResources(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
      if (resource.type !== 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups') continue;
      if (!String(resource.id ?? '').toLowerCase().startsWith(prefix.toLowerCase())) continue;
      reconcilePrivateEndpointDnsZoneGroup({
        providerRoute: {
          subscriptionId: providerRoute.subscriptionId,
          resourceGroupName: providerRoute.resourceGroupName,
          providerNamespace: 'Microsoft.Network',
          typePath: `privateEndpoints/${privateEndpointName}/privateDnsZoneGroups/${resource.name.split('/').at(-1)}`,
        },
        resource,
      });
    }
  }

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

    let wafPolicyId = null;
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
      wafPolicyId = securityPolicy.properties?.parameters?.wafPolicy?.id ?? null;
      wafPolicyName = resourceNameFromId(wafPolicyId);
      if (routePatterns.length === 0 && (matchedAssociation.patternsToMatch ?? []).length > 0) {
        routePatterns = matchedAssociation.patternsToMatch;
      }
      break;
    }
    return { origins, routePatterns, wafPolicyId, wafPolicyName };
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
    const { origins, routePatterns, wafPolicyId, wafPolicyName } = routeConfigForAfdEndpoint({
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
      wafPolicyId,
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

  function reconcileAllFrontDoorProfiles({ subscriptionId, resourceGroupName }) {
    for (const profile of listCdnResources({
      subscriptionId,
      resourceGroupName,
      typePath: 'profiles',
    })) {
      reconcileAllAfdEndpoints({
        subscriptionId,
        resourceGroupName,
        profileName: leafResourceName(profile.name),
      });
    }
  }

  function reconcileApplicationGateway({ subscriptionId, resourceGroupName, gatewayName }) {
    if (!gatewayName) return;
    const gatewayRoute = {
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Network',
      typePath: `applicationGateways/${gatewayName}`,
    };
    const gateway = store.getResource(gatewayRoute);
    if (!gateway) return;
    const publicIpIds = frontendPublicIpReferences(gateway);
    const originHost = originHostFromAppGateway(gateway);
    const listenerDisabled = (gateway.properties?.httpListeners ?? []).length === 0;
    const wafPolicyId = gateway.properties?.firewallPolicy?.id ?? null;
    const wafPolicyName = resourceNameFromId(wafPolicyId);
    for (const publicIpId of publicIpIds) {
      const publicIpName = referenceName(publicIpId, 'publicIPAddresses');
      if (!publicIpName) continue;
      const publicIp = store.getResource(publicIpRoute({ subscriptionId, resourceGroupName, publicIpName }));
      const publicIpState = publicIpDetails(publicIp);
      if (!publicIpState.hostName) continue;
      edgeRouter.registerEndpoint({
        endpointName: gatewayName,
        hostName: publicIpState.hostName,
        kind: 'application-gateway',
        enabledState: listenerDisabled ? 'Disabled' : 'Enabled',
        origins: originHost
          ? [{
              name: 'backend',
              hostName: originHost,
              httpPort: 80,
              httpsPort: 443,
            }]
          : [],
        routePatterns: ['/*'],
        wafPolicyId,
        wafPolicyName,
      });
    }
  }

  function reconcileAllApplicationGateways({ subscriptionId, resourceGroupName }) {
    for (const gateway of store.listResourcesByType({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Network',
      typePath: 'applicationGateways',
    })) {
      reconcileApplicationGateway({
        subscriptionId,
        resourceGroupName,
        gatewayName: leafResourceName(gateway.name),
      });
    }
  }

  function reconcileLoadBalancer({ subscriptionId, resourceGroupName, loadBalancerName }) {
    if (!loadBalancerName) return;
    const loadBalancerRoute = {
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Network',
      typePath: `loadBalancers/${loadBalancerName}`,
    };
    const loadBalancer = store.getResource(loadBalancerRoute);
    if (!loadBalancer) {
      return;
    }
    const publicIpIds = frontendPublicIpReferences(loadBalancer);
    const backendPoolName = (loadBalancer.properties?.backendAddressPools ?? [])[0]?.name ?? 'backend';
    const probePort = (loadBalancer.properties?.probes ?? [])[0]?.properties?.port ?? 80;
    const hasRule = (loadBalancer.properties?.loadBalancingRules ?? []).length > 0;
    for (const publicIpId of publicIpIds) {
      const publicIpName = referenceName(publicIpId, 'publicIPAddresses');
      if (!publicIpName) continue;
      const publicIp = store.getResource(publicIpRoute({ subscriptionId, resourceGroupName, publicIpName }));
      const publicIpState = publicIpDetails(publicIp);
      if (!publicIpState.hostName) continue;
      edgeRouter.registerEndpoint({
        endpointName: loadBalancerName,
        hostName: publicIpState.hostName,
        kind: 'load-balancer',
        enabledState: hasRule ? 'Enabled' : 'Disabled',
        origins: [{
          name: backendPoolName,
          hostName: `${loadBalancerName}.internal.globalstack`,
          httpPort: probePort,
          httpsPort: probePort,
        }],
        routePatterns: ['/*'],
      });
    }
  }

  function reconcileAllLoadBalancers({ subscriptionId, resourceGroupName }) {
    for (const loadBalancer of store.listResourcesByType({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.Network',
      typePath: 'loadBalancers',
    })) {
      reconcileLoadBalancer({
        subscriptionId,
        resourceGroupName,
        loadBalancerName: leafResourceName(loadBalancer.name),
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

    if (resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers') {
      relationalBackends.registerServer({
        engine: 'postgres',
        serverName: resource.name,
        fqdn: resource.properties?.fullyQualifiedDomainName,
        administratorLogin: resource.properties?.administratorLogin ?? null,
        administratorLoginPassword: resource.properties?.administratorLoginPassword ?? null,
      });
      return;
    }

    if (resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers/databases') {
      const [, serverName, , databaseName] = providerRoute.typePath.split('/');
      void relationalBackends.ensureDatabase({
        engine: 'postgres',
        serverName,
        databaseName,
      }).catch(error => logAsyncRuntimeFailure(`postgres-database:${serverName}/${databaseName}`, error));
      return;
    }

    if (resourceType === 'Microsoft.DBforMySQL/flexibleServers') {
      relationalBackends.registerServer({
        engine: 'mysql',
        serverName: resource.name,
        fqdn: resource.properties?.fullyQualifiedDomainName,
        administratorLogin: resource.properties?.administratorLogin ?? null,
        administratorLoginPassword: resource.properties?.administratorLoginPassword ?? null,
      });
      return;
    }

    if (resourceType === 'Microsoft.DBforMySQL/flexibleServers/databases') {
      const [, serverName, , databaseName] = providerRoute.typePath.split('/');
      void relationalBackends.ensureDatabase({
        engine: 'mysql',
        serverName,
        databaseName,
      }).catch(error => logAsyncRuntimeFailure(`mysql-database:${serverName}/${databaseName}`, error));
      return;
    }

    if (resourceType === 'Microsoft.ContainerService/managedClusters') {
      kubernetesRouter.registerCluster(resource);
      return;
    }

    if (resourceType === 'Microsoft.ContainerService/managedClusters/agentPools') {
      const parentRoute = {
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        providerNamespace: 'Microsoft.ContainerService',
        typePath: providerRoute.typePath.split('/').slice(0, -2).join('/'),
      };
      const cluster = store.getResource(parentRoute);
      if (cluster) kubernetesRouter.registerCluster(cluster);
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

    if (resourceType === 'Microsoft.DataMigration/services/projects') {
      const [, serviceName, , projectName] = providerRoute.typePath.split('/');
      migrationRunner.registerProject({
        serviceName,
        projectName,
        properties: resource.properties,
      });
      return;
    }

    if (resourceType === 'Microsoft.DataMigration/services/projects/tasks') {
      const [, serviceName, , projectName, , taskName] = providerRoute.typePath.split('/');
      migrationRunner.registerTask({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        serviceName,
        projectName,
        taskName,
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

    if (resourceType === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies'
      || resourceType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies') {
      const policyId = resourcePath({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        providerNamespace: 'Microsoft.Network',
        typePath: providerRoute.typePath,
      });
      wafEvaluator.registerPolicy({
        policyId,
        policyName: resource.name,
        policyType: resourceType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies' ? 'frontdoor' : 'application-gateway',
        properties: resource.properties ?? {},
      });
      if (resourceType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies') {
        reconcileAllFrontDoorProfiles({
          subscriptionId: providerRoute.subscriptionId,
          resourceGroupName: providerRoute.resourceGroupName,
        });
      }
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

    if (resourceType === 'Microsoft.Network/publicIPAddresses') {
      reconcileAllApplicationGateways({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
      });
      reconcileAllLoadBalancers({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
      });
      return;
    }

    if (resourceType === 'Microsoft.Network/applicationGateways') {
      reconcileApplicationGateway({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        gatewayName: leafResourceName(resource.name),
      });
      return;
    }

    if (resourceType === 'Microsoft.Network/loadBalancers') {
      reconcileLoadBalancer({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        loadBalancerName: leafResourceName(resource.name),
      });
      return;
    }

    if (resourceType === 'Microsoft.Network/privateEndpoints') {
      networkModel.registerPrivateEndpoint(resource);
      reconcilePrivateEndpointDnsZoneGroupsForEndpoint(providerRoute);
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

    if (resourceType === 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups') {
      reconcilePrivateEndpointDnsZoneGroup({ providerRoute, resource });
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

    if (resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers') {
      relationalBackends.unregisterServer({
        engine: 'postgres',
        serverName: resource?.name ?? providerRoute.typePath.split('/')[1],
        fqdn: resource?.properties?.fullyQualifiedDomainName ?? null,
      });
      return;
    }

    if (resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers/databases') {
      const [, serverName, , databaseName] = providerRoute.typePath.split('/');
      void relationalBackends.dropDatabase({
        engine: 'postgres',
        serverName,
        databaseName,
      }).catch(error => logAsyncRuntimeFailure(`drop-postgres-database:${serverName}/${databaseName}`, error));
      return;
    }

    if (resourceType === 'Microsoft.DBforMySQL/flexibleServers') {
      relationalBackends.unregisterServer({
        engine: 'mysql',
        serverName: resource?.name ?? providerRoute.typePath.split('/')[1],
        fqdn: resource?.properties?.fullyQualifiedDomainName ?? null,
      });
      return;
    }

    if (resourceType === 'Microsoft.DBforMySQL/flexibleServers/databases') {
      const [, serverName, , databaseName] = providerRoute.typePath.split('/');
      void relationalBackends.dropDatabase({
        engine: 'mysql',
        serverName,
        databaseName,
      }).catch(error => logAsyncRuntimeFailure(`drop-mysql-database:${serverName}/${databaseName}`, error));
      return;
    }

    if (resourceType === 'Microsoft.ContainerService/managedClusters') {
      kubernetesRouter.unregisterCluster(resource ?? providerRoute.typePath.split('/')[1]);
      return;
    }

    if (resourceType === 'Microsoft.ContainerService/managedClusters/agentPools') {
      const parentRoute = {
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        providerNamespace: 'Microsoft.ContainerService',
        typePath: providerRoute.typePath.split('/').slice(0, -2).join('/'),
      };
      const cluster = store.getResource(parentRoute);
      if (cluster) kubernetesRouter.registerCluster(cluster);
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

    if (resourceType === 'Microsoft.DataMigration/services/projects') {
      const [, serviceName, , projectName] = providerRoute.typePath.split('/');
      migrationRunner.unregisterProject({
        serviceName,
        projectName,
      });
      return;
    }

    if (resourceType === 'Microsoft.DataMigration/services/projects/tasks') {
      const [, serviceName, , projectName, , taskName] = providerRoute.typePath.split('/');
      migrationRunner.unregisterTask({
        serviceName,
        projectName,
        taskName,
      });
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

    if (resourceType === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies'
      || resourceType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies') {
      const policyId = resourcePath({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
        providerNamespace: 'Microsoft.Network',
        typePath: providerRoute.typePath,
      });
      wafEvaluator.unregisterPolicy(policyId);
      wafEvaluator.unregisterPolicy(resource?.name ?? providerRoute.typePath.split('/')[1]);
      if (resourceType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies') {
        reconcileAllFrontDoorProfiles({
          subscriptionId: providerRoute.subscriptionId,
          resourceGroupName: providerRoute.resourceGroupName,
        });
      }
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

    if (resourceType === 'Microsoft.Network/publicIPAddresses') {
      const publicIpState = publicIpDetails(resource);
      if (publicIpState.hostName) edgeRouter.unregisterEndpoint(publicIpState.hostName);
      reconcileAllApplicationGateways({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
      });
      reconcileAllLoadBalancers({
        subscriptionId: providerRoute.subscriptionId,
        resourceGroupName: providerRoute.resourceGroupName,
      });
      return;
    }

    if (resourceType === 'Microsoft.Network/applicationGateways') {
      const publicIpIds = frontendPublicIpReferences(resource);
      for (const publicIpId of publicIpIds) {
        const publicIpName = referenceName(publicIpId, 'publicIPAddresses');
        if (!publicIpName) continue;
        const publicIp = store.getResource(publicIpRoute({
          subscriptionId: providerRoute.subscriptionId,
          resourceGroupName: providerRoute.resourceGroupName,
          publicIpName,
        }));
        const publicIpState = publicIpDetails(publicIp);
        if (publicIpState.hostName) edgeRouter.unregisterEndpoint(publicIpState.hostName);
      }
      return;
    }

    if (resourceType === 'Microsoft.Network/loadBalancers') {
      const publicIpIds = frontendPublicIpReferences(resource);
      for (const publicIpId of publicIpIds) {
        const publicIpName = referenceName(publicIpId, 'publicIPAddresses');
        if (!publicIpName) continue;
        const publicIp = store.getResource(publicIpRoute({
          subscriptionId: providerRoute.subscriptionId,
          resourceGroupName: providerRoute.resourceGroupName,
          publicIpName,
        }));
        const publicIpState = publicIpDetails(publicIp);
        if (publicIpState.hostName) edgeRouter.unregisterEndpoint(publicIpState.hostName);
      }
      return;
    }

    if (resourceType === 'Microsoft.Network/privateEndpoints') {
      networkModel.unregisterPrivateEndpoint(resource ?? providerRoute.typePath.split('/')[1]);
      reconcilePrivateEndpointDnsZoneGroupsForEndpoint(providerRoute);
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

    if (resourceType === 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups') {
      dnsRegistry.unregisterRecordsByOwner(`private-endpoint-zone-group:${String(resource?.id ?? resourcePath(providerRoute)).toLowerCase()}`);
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

  async function dispose() {
    await kubernetesRouter.dispose?.();
  }

  return {
    storageRouter,
    appConfigurationRouter,
    eventGridRouter,
    edgeRouter,
    functionsRouter,
    kubernetesRouter,
    keyVaultRouter,
    workflowRunner,
    migrationRunner,
    relationalBackends,
    serviceDiscoveryRegistry,
    activityLogStore,
    dnsRegistry,
    networkModel,
    metricStore,
    wafEvaluator,
    syncResource,
    unsyncResource,
    dispose,
  };
}
