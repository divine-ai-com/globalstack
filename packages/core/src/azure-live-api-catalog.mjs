import { allCapabilities } from './azure-tier1-capabilities.mjs';

export const defaultApiVersions = {
  'Microsoft.ApiManagement/service': '2023-05-01-preview',
  'Microsoft.ApiManagement/service/apis': '2023-05-01-preview',
  'Microsoft.App/managedEnvironments': '2023-05-01',
  'Microsoft.App/containerApps': '2023-05-01',
  'Microsoft.AppConfiguration/configurationStores': '2023-03-01',
  'Microsoft.Authorization/roleAssignments': '2022-04-01',
  'Microsoft.Authorization/roleDefinitions': '2022-04-01',
  'Microsoft.Cache/redis': '2023-08-01',
  'Microsoft.Cache/redisEnterprise': '2023-08-01',
  'Microsoft.Cdn/profiles': '2024-02-01',
  'Microsoft.Cdn/profiles/afdEndpoints': '2024-02-01',
  'Microsoft.Cdn/profiles/endpoints': '2024-02-01',
  'Microsoft.Cdn/profiles/securityPolicies': '2024-02-01',
  'Microsoft.ContainerRegistry/registries': '2023-07-01',
  'Microsoft.ContainerService/managedClusters': '2024-02-01',
  'Microsoft.DataMigration/services': '2022-03-30-preview',
  'Microsoft.DataMigration/services/projects': '2022-03-30-preview',
  'Microsoft.DBforMySQL/flexibleServers': '2023-12-30',
  'Microsoft.DBforMySQL/flexibleServers/databases': '2023-12-30',
  'Microsoft.DBforPostgreSQL/flexibleServers': '2023-06-01-preview',
  'Microsoft.DBforPostgreSQL/flexibleServers/databases': '2023-06-01-preview',
  'Microsoft.DocumentDB/databaseAccounts': '2024-05-15',
  'Microsoft.DocumentDB/databaseAccounts/sqlDatabases': '2024-05-15',
  'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers': '2024-05-15',
  'Microsoft.EventGrid/eventSubscriptions': '2022-06-15',
  'Microsoft.EventGrid/systemTopics': '2022-06-15',
  'Microsoft.EventGrid/topics': '2022-06-15',
  'Microsoft.EventHub/namespaces': '2024-01-01',
  'Microsoft.EventHub/namespaces/eventhubs': '2024-01-01',
  'Microsoft.Insights/actionGroups': '2023-01-01',
  'Microsoft.Insights/diagnosticSettings': '2021-05-01-preview',
  'Microsoft.Insights/metricAlerts': '2018-03-01',
  'Microsoft.KeyVault/vaults': '2023-07-01',
  'Microsoft.KeyVault/vaults/keys': '2023-07-01',
  'Microsoft.KeyVault/vaults/secrets': '2023-07-01',
  'Microsoft.Logic/workflows': '2019-05-01',
  'Microsoft.ManagedIdentity/userAssignedIdentities': '2023-01-31',
  'Microsoft.NetApp/netAppAccounts/capacityPools/volumes': '2023-11-01',
  'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies': '2023-09-01',
  'Microsoft.Network/applicationGateways': '2023-09-01',
  'Microsoft.Network/dnsZones': '2018-05-01',
  'Microsoft.Network/dnsZones/A': '2018-05-01',
  'Microsoft.Network/dnsZones/AAAA': '2018-05-01',
  'Microsoft.Network/dnsZones/CAA': '2018-05-01',
  'Microsoft.Network/dnsZones/CNAME': '2018-05-01',
  'Microsoft.Network/dnsZones/MX': '2018-05-01',
  'Microsoft.Network/dnsZones/NS': '2018-05-01',
  'Microsoft.Network/dnsZones/PTR': '2018-05-01',
  'Microsoft.Network/dnsZones/SOA': '2018-05-01',
  'Microsoft.Network/dnsZones/SRV': '2018-05-01',
  'Microsoft.Network/dnsZones/TXT': '2018-05-01',
  'Microsoft.Network/loadBalancers': '2023-09-01',
  'Microsoft.Network/privateDnsZones': '2020-06-01',
  'Microsoft.Network/privateDnsZones/A': '2020-06-01',
  'Microsoft.Network/privateDnsZones/AAAA': '2020-06-01',
  'Microsoft.Network/privateDnsZones/CNAME': '2020-06-01',
  'Microsoft.Network/privateDnsZones/MX': '2020-06-01',
  'Microsoft.Network/privateDnsZones/PTR': '2020-06-01',
  'Microsoft.Network/privateDnsZones/SOA': '2020-06-01',
  'Microsoft.Network/privateDnsZones/SRV': '2020-06-01',
  'Microsoft.Network/privateDnsZones/TXT': '2020-06-01',
  'Microsoft.Network/privateDnsZones/virtualNetworkLinks': '2020-06-01',
  'Microsoft.Network/privateEndpoints': '2023-09-01',
  'Microsoft.Network/virtualNetworks': '2023-09-01',
  'Microsoft.OperationalInsights/workspaces': '2022-10-01',
  'Microsoft.ServiceBus/namespaces': '2021-11-01',
  'Microsoft.ServiceBus/namespaces/queues': '2021-11-01',
  'Microsoft.ServiceBus/namespaces/topics': '2021-11-01',
  'Microsoft.Storage/storageAccounts': '2023-01-01',
  'Microsoft.Storage/storageAccounts/blobServices/containers': '2023-01-01',
  'Microsoft.Storage/storageAccounts/fileServices/shares': '2023-01-01',
  'Microsoft.Storage/storageAccounts/queueServices/queues': '2023-01-01',
  'Microsoft.Synapse/workspaces': '2021-06-01',
  'Microsoft.Synapse/workspaces/sqlPools': '2021-06-01',
  'Microsoft.Storage/storageAccounts/tableServices/tables': '2023-01-01',
  'Microsoft.Web/serverfarms': '2023-12-01',
  'Microsoft.Web/sites': '2023-12-01',
};

const singletonNames = {
  blobServices: 'default',
  fileServices: 'default',
  queueServices: 'default',
  tableServices: 'default',
};

function slug(value) {
  return String(value).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function placeholderFor(typeSegment) {
  return `{${typeSegment}Name}`;
}

function resourcePathTemplate(resourceType) {
  const [providerNamespace, ...typeSegments] = resourceType.split('/');
  const path = [`providers/${providerNamespace}`];
  for (const typeSegment of typeSegments) {
    path.push(typeSegment);
    path.push(singletonNames[typeSegment] ?? placeholderFor(typeSegment));
  }
  return path.join('/');
}

function collectionPathTemplate(resourceType) {
  const [providerNamespace, ...typeSegments] = resourceType.split('/');
  const path = [`providers/${providerNamespace}`];
  for (let index = 0; index < typeSegments.length; index += 1) {
    const typeSegment = typeSegments[index];
    path.push(typeSegment);
    if (index < typeSegments.length - 1) path.push(singletonNames[typeSegment] ?? placeholderFor(typeSegment));
  }
  return path.join('/');
}

function baseResourceUrl(resourceType) {
  return `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/${resourcePathTemplate(resourceType)}`;
}

function baseCollectionUrl(resourceType) {
  return `/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/${collectionPathTemplate(resourceType)}`;
}

function bodyFor(resourceType) {
  const lower = resourceType.toLowerCase();
  if (lower.endsWith('/dnszones/a') || lower.endsWith('/privatednszones/a')) return { properties: { TTL: 60, ARecords: [{ ipv4Address: '10.10.1.10' }] } };
  if (lower.endsWith('/dnszones/aaaa') || lower.endsWith('/privatednszones/aaaa')) return { properties: { TTL: 60, AAAARecords: [{ ipv6Address: '2001:db8::10' }] } };
  if (lower.endsWith('/dnszones/caa')) return { properties: { TTL: 60, CAARecords: [{ flags: 0, tag: 'issue', value: 'example.com' }] } };
  if (lower.endsWith('/dnszones/cname') || lower.endsWith('/privatednszones/cname')) return { properties: { TTL: 60, CNAMERecord: { cname: 'target.example.test.' } } };
  if (lower.endsWith('/dnszones/mx') || lower.endsWith('/privatednszones/mx')) return { properties: { TTL: 60, MXRecords: [{ preference: 10, exchange: 'mail.example.test.' }] } };
  if (lower.endsWith('/dnszones/ns')) return { properties: { TTL: 60, NSRecords: [{ nsdname: 'ns1.example.test.' }] } };
  if (lower.endsWith('/dnszones/ptr') || lower.endsWith('/privatednszones/ptr')) return { properties: { TTL: 60, PTRRecords: [{ ptrdname: 'host.example.test.' }] } };
  if (lower.endsWith('/dnszones/soa') || lower.endsWith('/privatednszones/soa')) return { properties: { TTL: 3600, SOARecord: { host: 'ns1.example.test.', email: 'azuredns-hostmaster.microsoft.com', serialNumber: 1, refreshTime: 3600, retryTime: 300, expireTime: 2419200, minimumTTL: 300 } } };
  if (lower.endsWith('/dnszones/srv') || lower.endsWith('/privatednszones/srv')) return { properties: { TTL: 60, SRVRecords: [{ priority: 1, weight: 5, port: 443, target: 'service.example.test.' }] } };
  if (lower.endsWith('/dnszones/txt') || lower.endsWith('/privatednszones/txt')) return { properties: { TTL: 60, TXTRecords: [{ value: ['globalstack=parity'] }] } };
  if (lower.endsWith('/privatednszones/virtualnetworklinks')) {
    return {
      location: 'global',
      properties: {
        registrationEnabled: false,
        virtualNetwork: {
          id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/virtualNetworks/{virtualNetworksName}',
        },
      },
    };
  }
  if (lower === 'microsoft.storage/storageaccounts') {
    return { location: '{location}', sku: { name: 'Standard_LRS' }, kind: 'StorageV2', properties: { allowBlobPublicAccess: false } };
  }
  if (lower.includes('/blobservices/containers')) return { properties: { publicAccess: 'None' } };
  if (lower.includes('/queues')) return { properties: {} };
  if (lower.includes('/fileservices/shares')) return { properties: { shareQuota: 1 } };
  if (lower.includes('/tableservices/tables')) return { properties: {} };
  if (lower.includes('microsoft.keyvault/vaults')) {
    return { location: '{location}', properties: { tenantId: '{tenantId}', sku: { family: 'A', name: 'standard' }, accessPolicies: [] } };
  }
  if (lower.includes('microsoft.servicebus/namespaces')) return { location: '{location}', sku: { name: 'Standard', tier: 'Standard' }, properties: {} };
  if (lower.includes('microsoft.eventhub/namespaces')) return { location: '{location}', sku: { name: 'Standard', tier: 'Standard', capacity: 1 }, properties: {} };
  if (lower.includes('microsoft.eventhub/namespaces/eventhubs')) return { properties: { partitionCount: 2, messageRetentionInDays: 1 } };
  if (lower.includes('microsoft.dbformysql/flexibleservers/databases')) return { properties: { charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' } };
  if (lower.includes('microsoft.dbformysql/flexibleservers')) return { location: '{location}', sku: { name: 'Standard_B1ms', tier: 'Burstable' }, properties: { administratorLogin: 'globalstack', administratorLoginPassword: 'Globalstack1!', version: '8.0.21' } };
  if (lower.includes('microsoft.dbforpostgresql/flexibleservers/databases')) return { properties: { charset: 'UTF8', collation: 'en_US.utf8' } };
  if (lower.includes('microsoft.dbforpostgresql/flexibleservers')) return { location: '{location}', sku: { name: 'Standard_B1ms', tier: 'Burstable' }, properties: { administratorLogin: 'globalstack', administratorLoginPassword: 'Globalstack1!', version: '16' } };
  if (lower.includes('microsoft.documentdb/databaseaccounts/sqldatabases/containers')) return { properties: { resource: { id: '{containersName}', partitionKey: { paths: ['/pk'], kind: 'Hash' } }, options: { throughput: 400 } } };
  if (lower.includes('microsoft.documentdb/databaseaccounts/sqldatabases')) return { properties: { resource: { id: '{sqlDatabasesName}' }, options: { throughput: 400 } } };
  if (lower.includes('microsoft.documentdb/databaseaccounts')) return { location: '{location}', kind: 'GlobalDocumentDB', properties: { databaseAccountOfferType: 'Standard', locations: [{ locationName: '{location}', failoverPriority: 0, isZoneRedundant: false }], consistencyPolicy: { defaultConsistencyLevel: 'Session' } } };
  if (lower.includes('microsoft.cache/redis')) return { location: '{location}', sku: { name: 'Basic', family: 'C', capacity: 0 }, properties: { enableNonSslPort: true } };
  if (lower === 'microsoft.logic/workflows') return { location: '{location}', properties: { state: 'Enabled', definition: { '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#', contentVersion: '1.0.0.0', triggers: { manual: { type: 'Request', kind: 'Http', inputs: { schema: {} } } }, actions: {}, outputs: {} }, parameters: {} } };
  if (lower.includes('microsoft.network/privatednszones') || lower.includes('microsoft.network/dnszones')) return { location: 'global', properties: {} };
  if (lower === 'microsoft.network/applicationgateways') {
    return {
      location: '{location}',
      sku: { name: 'Standard_v2', tier: 'Standard_v2', capacity: 1 },
      properties: {
        gatewayIPConfigurations: [{
          name: 'appGatewayIpConfig',
          properties: {
            subnet: {
              id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/virtualNetworks/{virtualNetworksName}/subnets/default',
            },
          },
        }],
        frontendIPConfigurations: [{
          name: 'frontend',
          properties: {
            publicIPAddress: {
              id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/publicIPAddresses/pip-local',
            },
          },
        }],
        frontendPorts: [{ name: 'http', properties: { port: 80 } }],
        backendAddressPools: [{ name: 'backend', properties: { backendAddresses: [{ ipAddress: '10.73.1.10' }] } }],
        backendHttpSettingsCollection: [{ name: 'httpSettings', properties: { port: 80, protocol: 'Http', cookieBasedAffinity: 'Disabled' } }],
        httpListeners: [{
          name: 'listener',
          properties: {
            frontendIPConfiguration: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/applicationGateways/{applicationGatewaysName}/frontendIPConfigurations/frontend' },
            frontendPort: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/applicationGateways/{applicationGatewaysName}/frontendPorts/http' },
            protocol: 'Http',
          },
        }],
        requestRoutingRules: [{
          name: 'rule',
          properties: {
            ruleType: 'Basic',
            priority: 100,
            httpListener: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/applicationGateways/{applicationGatewaysName}/httpListeners/listener' },
            backendAddressPool: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/applicationGateways/{applicationGatewaysName}/backendAddressPools/backend' },
            backendHttpSettings: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/applicationGateways/{applicationGatewaysName}/backendHttpSettingsCollection/httpSettings' },
          },
        }],
      },
    };
  }
  if (lower === 'microsoft.network/loadbalancers') {
    return {
      location: '{location}',
      sku: { name: 'Standard' },
      properties: {
        frontendIPConfigurations: [{
          name: 'frontend',
          properties: {
            publicIPAddress: {
              id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/publicIPAddresses/pip-local',
            },
          },
        }],
        backendAddressPools: [{ name: 'backend', properties: {} }],
        probes: [{ name: 'tcpProbe', properties: { protocol: 'Tcp', port: 80, intervalInSeconds: 5, numberOfProbes: 2 } }],
        loadBalancingRules: [{
          name: 'httpRule',
          properties: {
            protocol: 'Tcp',
            frontendPort: 80,
            backendPort: 80,
            frontendIPConfiguration: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/loadBalancers/{loadBalancersName}/frontendIPConfigurations/frontend' },
            backendAddressPool: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/loadBalancers/{loadBalancersName}/backendAddressPools/backend' },
            probe: { id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/loadBalancers/{loadBalancersName}/probes/tcpProbe' },
          },
        }],
      },
    };
  }
  if (lower.includes('webapplicationfirewallpolicies')) return { location: '{location}', properties: { policySettings: { enabledState: 'Enabled', mode: 'Prevention' }, managedRules: { managedRuleSets: [] } } };
  if (lower.includes('microsoft.appconfiguration/configurationstores')) return { location: '{location}', sku: { name: 'free' }, properties: { disableLocalAuth: false } };
  if (lower.includes('microsoft.operationalinsights/workspaces')) return { location: '{location}', properties: { retentionInDays: 30 }, sku: { name: 'PerGB2018' } };
  if (lower.includes('microsoft.web/serverfarms')) return { location: '{location}', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} };
  if (lower.includes('microsoft.web/sites')) return { location: '{location}', kind: 'functionapp', properties: { serverFarmId: '{serverFarmId}', httpsOnly: true } };
  return { location: '{location}', properties: {} };
}

function invalidSkuBody(body) {
  return {
    ...body,
    sku: { name: 'GlobalStack_InvalidSku_For_Conformance' },
  };
}

function varianceCases(resourceType, createBody) {
  const cases = [
    {
      id: 'valid-minimal',
      description: 'Create/update with the minimal candidate body for the selected API version.',
      body: createBody,
      expectedAzure: '2xx or accepted async for valid resources, otherwise captured provider error to refine the template.',
      localAssertion: 'must-return-success-for-registered-resource-type',
      requiresRealAzure: false,
    },
    {
      id: 'missing-api-version',
      description: 'Same create/update request without api-version.',
      omitApiVersion: true,
      body: createBody,
      expectedAzure: 'ARM error for missing api-version.',
      localAssertion: 'must-return-400',
      requiresRealAzure: false,
    },
    {
      id: 'invalid-location',
      description: 'Create/update with an intentionally invalid location value.',
      body: { ...createBody, location: 'globalstack-invalid-location' },
      expectedAzure: 'Provider-specific location validation error.',
      localAssertion: 'record-gap-until-real-azure-captured',
      requiresRealAzure: true,
    },
    {
      id: 'empty-body',
      description: 'Create/update with an empty JSON body.',
      body: {},
      expectedAzure: 'Provider-specific required-field validation error or accepted default behavior.',
      localAssertion: 'record-gap-until-real-azure-captured',
      requiresRealAzure: true,
    },
  ];

  if (createBody.sku || resourceType.toLowerCase().includes('sku')) {
    cases.push({
      id: 'invalid-sku',
      description: 'Create/update with an intentionally invalid SKU.',
      body: invalidSkuBody(createBody),
      expectedAzure: 'Provider-specific SKU validation error.',
      localAssertion: 'record-gap-until-real-azure-captured',
      requiresRealAzure: true,
    });
  }
  return cases;
}

function callSetForResourceType(capability, resourceType) {
  const apiVersion = defaultApiVersions[resourceType] ?? 'provider-default-required';
  const path = baseResourceUrl(resourceType);
  const collectionPath = baseCollectionUrl(resourceType);
  const createBody = bodyFor(resourceType);
  const base = {
    capabilityId: capability.id,
    tier: capability.tier,
    awsAnalogue: capability.awsAnalogue,
    azureEquivalent: capability.azureEquivalent,
    resourceType,
    apiVersion,
    source: 'globalstack-capability-registry',
    validationState: 'candidate-until-live-azure-captured',
  };
  return [
    {
      ...base,
      id: `${capability.id}.${slug(resourceType)}.createOrUpdate`,
      operation: 'CreateOrUpdate',
      method: 'PUT',
      pathTemplate: path,
      requestBodyTemplate: createBody,
      varianceCases: varianceCases(resourceType, createBody),
    },
    {
      ...base,
      id: `${capability.id}.${slug(resourceType)}.get`,
      operation: 'Get',
      method: 'GET',
      pathTemplate: path,
      requestBodyTemplate: null,
      varianceCases: [],
    },
    {
      ...base,
      id: `${capability.id}.${slug(resourceType)}.listByResourceGroup`,
      operation: 'ListByResourceGroup',
      method: 'GET',
      pathTemplate: collectionPath,
      requestBodyTemplate: null,
      varianceCases: [],
    },
    {
      ...base,
      id: `${capability.id}.${slug(resourceType)}.delete`,
      operation: 'Delete',
      method: 'DELETE',
      pathTemplate: path,
      requestBodyTemplate: null,
      varianceCases: [],
    },
  ];
}

export function buildAzureLiveApiCatalog({ capabilities = allCapabilities } = {}) {
  const calls = capabilities.flatMap(capability =>
    capability.resourceTypes.flatMap(resourceType => callSetForResourceType(capability, resourceType))
  );
  return {
    _meta: {
      generatedAt: new Date().toISOString(),
      source: 'globalstack-tier-capability-registry',
      intent: 'Filter candidate live Azure management-plane API calls for Tier 1 and Tier 2 AWS-equivalent capabilities.',
      callCount: calls.length,
      createOrUpdateCallCount: calls.filter(call => call.operation === 'CreateOrUpdate').length,
      capabilityCount: capabilities.length,
      tier1CapabilityCount: capabilities.filter(capability => capability.tier === 1).length,
      tier2CapabilityCount: capabilities.filter(capability => capability.tier === 2).length,
      validationPolicy: 'No call is considered Azure-correct until executed against real Azure or matched to an official emulator with conformance tests.',
      liveProviderSurfaceSource: 'Use Azure Resource Manager provider/operations APIs or azure-rest-api-specs before marking apiVersion/resource shape as cloudValidated.',
    },
    calls,
  };
}
