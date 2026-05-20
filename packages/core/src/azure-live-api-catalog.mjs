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
  if (lower === 'microsoft.managedidentity/userassignedidentities') return { location: '{location}', properties: {} };
  if (lower === 'microsoft.authorization/roleassignments') {
    return {
      properties: {
        principalId: '33333333-3333-4333-8333-333333333333',
        principalType: 'ServicePrincipal',
        roleDefinitionId: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Authorization/roleDefinitions/{roleDefinitionsName}',
      },
    };
  }
  if (lower === 'microsoft.authorization/roledefinitions') {
    return {
      properties: {
        roleName: 'globalstack-conformance-role',
        description: 'GlobalStack conformance custom role',
        type: 'CustomRole',
        permissions: [
          {
            actions: ['Microsoft.ManagedIdentity/userAssignedIdentities/read'],
            notActions: [],
          },
        ],
        assignableScopes: ['/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}'],
      },
    };
  }
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
  if (lower === 'microsoft.servicebus/namespaces/topics') {
    return {
      properties: {
        defaultMessageTimeToLive: 'P14D',
        enableBatchedOperations: true,
        maxSizeInMegabytes: 1024,
      },
    };
  }
  if (lower === 'microsoft.servicebus/namespaces/topics/subscriptions') {
    return {
      properties: {
        maxDeliveryCount: 10,
        deadLetteringOnFilterEvaluationExceptions: true,
      },
    };
  }
  if (lower === 'microsoft.eventgrid/topics') {
    return {
      location: '{location}',
      properties: {
        inputSchema: 'EventGridSchema',
        publicNetworkAccess: 'Enabled',
      },
    };
  }
  if (lower.includes('microsoft.eventhub/namespaces/eventhubs')) return { properties: { partitionCount: 2, messageRetentionInDays: 1 } };
  if (lower.includes('microsoft.eventhub/namespaces')) return { location: '{location}', sku: { name: 'Standard', tier: 'Standard', capacity: 1 }, properties: {} };
  if (lower.includes('microsoft.dbformysql/flexibleservers/databases')) return { properties: { charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' } };
  if (lower.includes('microsoft.dbformysql/flexibleservers')) return { location: '{location}', sku: { name: 'Standard_B1ms', tier: 'Burstable' }, properties: { administratorLogin: 'globalstack', administratorLoginPassword: 'Globalstack1!', version: '8.0.21' } };
  if (lower.includes('microsoft.dbforpostgresql/flexibleservers/databases')) return { properties: { charset: 'UTF8', collation: 'en_US.utf8' } };
  if (lower.includes('microsoft.dbforpostgresql/flexibleservers')) return { location: '{location}', sku: { name: 'Standard_B1ms', tier: 'Burstable' }, properties: { administratorLogin: 'globalstack', administratorLoginPassword: 'Globalstack1!', version: '16' } };
  if (lower.includes('microsoft.documentdb/databaseaccounts/sqldatabases/containers')) return { properties: { resource: { id: '{containersName}', partitionKey: { paths: ['/pk'], kind: 'Hash' } }, options: { throughput: 400 } } };
  if (lower.includes('microsoft.documentdb/databaseaccounts/sqldatabases')) return { properties: { resource: { id: '{sqlDatabasesName}' }, options: { throughput: 400 } } };
  if (lower.includes('microsoft.documentdb/databaseaccounts')) return { location: '{location}', kind: 'GlobalDocumentDB', properties: { databaseAccountOfferType: 'Standard', locations: [{ locationName: '{location}', failoverPriority: 0, isZoneRedundant: false }], consistencyPolicy: { defaultConsistencyLevel: 'Session' } } };
  if (lower.includes('microsoft.cache/redis')) return { location: '{location}', sku: { name: 'Basic', family: 'C', capacity: 0 }, properties: { enableNonSslPort: true } };
  if (lower === 'microsoft.logic/workflows') return { location: '{location}', properties: { state: 'Enabled', definition: { '$schema': 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#', contentVersion: '1.0.0.0', triggers: { manual: { type: 'Request', kind: 'Http', inputs: { schema: {} } } }, actions: {}, outputs: {} }, parameters: {} } };
  if (lower === 'microsoft.cdn/profiles') return { location: '{location}', sku: { name: 'Standard_AzureFrontDoor' }, properties: {} };
  if (lower === 'microsoft.cdn/profiles/afdendpoints') return { location: '{location}', properties: { enabledState: 'Enabled' } };
  if (lower === 'microsoft.cdn/profiles/endpoints') return { location: '{location}', properties: { origins: [{ name: 'origin1', properties: { hostName: 'example.org', httpPort: 80, httpsPort: 443 } }], isHttpAllowed: true, isHttpsAllowed: true } };
  if (lower === 'microsoft.network/applicationgatewaywebapplicationfirewallpolicies') return { location: '{location}', properties: { policySettings: { state: 'Enabled', mode: 'Prevention', requestBodyCheck: true, maxRequestBodySizeInKb: 128 }, managedRules: { managedRuleSets: [{ ruleSetType: 'OWASP', ruleSetVersion: '3.2' }] } } };
  if (lower === 'microsoft.cdn/profiles/securitypolicies') return { properties: { parameters: { type: 'WebApplicationFirewall', wafPolicy: { id: '{wafPolicyId}' }, associations: [{ domains: [{ id: '{endpointId}' }], patternsToMatch: ['/*'] }] } } };
  if (lower === 'microsoft.appconfiguration/configurationstores') return { location: '{location}', sku: { name: 'free' }, properties: { disableLocalAuth: false, publicNetworkAccess: 'Enabled' } };
  if (lower === 'microsoft.network/virtualnetworks') {
    return {
      location: '{location}',
      properties: {
        addressSpace: {
          addressPrefixes: ['10.42.0.0/16'],
        },
        subnets: [
          {
            name: 'default',
            properties: {
              addressPrefix: '10.42.1.0/24',
            },
          },
        ],
      },
    };
  }
  if (lower === 'microsoft.network/privateendpoints') {
    return {
      location: '{location}',
      properties: {
        subnet: {
          id: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Network/virtualNetworks/{virtualNetworksName}/subnets/default',
        },
        privateLinkServiceConnections: [
          {
            name: 'blob',
            properties: {
              privateLinkServiceId: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Storage/storageAccounts/{storageAccountsName}',
              groupIds: ['blob'],
            },
          },
        ],
      },
    };
  }
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

function realAzureVariance(id, description, body, expectedAzure) {
  return {
    id,
    description,
    body,
    expectedAzure,
    localAssertion: 'record-gap-until-real-azure-captured',
    requiresRealAzure: true,
  };
}

function serviceSpecificVarianceCases(resourceType, createBody) {
  const lower = resourceType.toLowerCase();
  const cases = [];

  if (lower === 'microsoft.authorization/roleassignments') {
    cases.push(
      realAzureVariance(
        'missing-principal-id',
        'Create/update without properties.principalId.',
        {
          properties: {
            principalType: createBody.properties?.principalType ?? 'ServicePrincipal',
            roleDefinitionId: createBody.properties?.roleDefinitionId,
          },
        },
        'Role assignment validation error for missing principalId.',
      ),
      realAzureVariance(
        'missing-role-definition-id',
        'Create/update without properties.roleDefinitionId.',
        {
          properties: {
            principalId: createBody.properties?.principalId,
            principalType: createBody.properties?.principalType ?? 'ServicePrincipal',
          },
        },
        'Role assignment validation error for missing roleDefinitionId.',
      ),
    );
  }

  if (lower === 'microsoft.authorization/roledefinitions') {
    cases.push(
      realAzureVariance(
        'missing-permissions',
        'Create/update without properties.permissions.',
        {
          properties: {
            roleName: createBody.properties?.roleName ?? 'globalstack-conformance-role',
            description: createBody.properties?.description ?? 'GlobalStack conformance custom role',
            type: createBody.properties?.type ?? 'CustomRole',
            assignableScopes: createBody.properties?.assignableScopes ?? ['/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}'],
          },
        },
        'Role definition validation error for missing permissions.',
      ),
      realAzureVariance(
        'missing-assignable-scopes',
        'Create/update without properties.assignableScopes.',
        {
          properties: {
            roleName: createBody.properties?.roleName ?? 'globalstack-conformance-role',
            description: createBody.properties?.description ?? 'GlobalStack conformance custom role',
            type: createBody.properties?.type ?? 'CustomRole',
            permissions: createBody.properties?.permissions ?? [],
          },
        },
        'Role definition validation error for missing assignableScopes.',
      ),
    );
  }

  if (lower === 'microsoft.appconfiguration/configurationstores') {
    cases.push(
      realAzureVariance(
        'invalid-disable-local-auth-type',
        'Create/update with disableLocalAuth set to a non-boolean shape.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            disableLocalAuth: 'invalid',
          },
        },
        'Configuration store validation error for disableLocalAuth type.',
      ),
      realAzureVariance(
        'invalid-public-network-access',
        'Create/update with an unsupported publicNetworkAccess value.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            publicNetworkAccess: 'PartiallyEnabled',
          },
        },
        'Configuration store validation error for publicNetworkAccess.',
      ),
    );
  }

  if (lower === 'microsoft.network/virtualnetworks') {
    cases.push(
      realAzureVariance(
        'missing-address-space',
        'Create/update without addressSpace.addressPrefixes.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            addressSpace: {},
          },
        },
        'Virtual network validation error for missing address prefixes.',
      ),
      realAzureVariance(
        'invalid-address-prefix',
        'Create/update with an invalid virtual network CIDR.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            addressSpace: {
              addressPrefixes: ['10.42.0.0/99'],
            },
          },
        },
        'Virtual network validation error for invalid address prefix format.',
      ),
      realAzureVariance(
        'invalid-subnet-prefix',
        'Create/update with an invalid subnet CIDR.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            subnets: [
              {
                name: 'default',
                properties: {
                  addressPrefix: '10.42.1.0/99',
                },
              },
            ],
          },
        },
        'Virtual network validation error for invalid subnet address prefix format.',
      ),
    );
  }

  if (lower === 'microsoft.network/privateendpoints') {
    cases.push(
      realAzureVariance(
        'missing-private-link-connections',
        'Create/update without privateLinkServiceConnections.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            privateLinkServiceConnections: [],
          },
        },
        'Private endpoint validation error for missing private link service connections.',
      ),
      realAzureVariance(
        'missing-subnet-id',
        'Create/update without properties.subnet.id.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            subnet: {},
          },
        },
        'Private endpoint validation error for missing subnet.id.',
      ),
      realAzureVariance(
        'missing-group-ids',
        'Create/update with privateLinkServiceConnections but without groupIds.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            privateLinkServiceConnections: [
              {
                name: 'blob',
                properties: {
                  privateLinkServiceId: '/subscriptions/{subscriptionId}/resourceGroups/{resourceGroupName}/providers/Microsoft.Storage/storageAccounts/{storageAccountsName}',
                  groupIds: [],
                },
              },
            ],
          },
        },
        'Private endpoint validation error for missing groupIds.',
      ),
    );
  }

  if (lower === 'microsoft.dbforpostgresql/flexibleservers') {
    cases.push(
      realAzureVariance(
        'missing-admin-password',
        'Create/update without administratorLoginPassword.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            administratorLoginPassword: '',
          },
        },
        'PostgreSQL flexible server validation error for missing administrator password.',
      ),
      realAzureVariance(
        'weak-admin-password',
        'Create/update with a password that is too short.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            administratorLoginPassword: 'short',
          },
        },
        'PostgreSQL flexible server validation error for weak administrator password.',
      ),
      realAzureVariance(
        'invalid-version',
        'Create/update with an unsupported PostgreSQL version.',
        {
          ...createBody,
          properties: {
            ...(createBody.properties ?? {}),
            version: '99',
          },
        },
        'PostgreSQL flexible server validation error for invalid version.',
      ),
    );
  }

  if (lower === 'microsoft.dbforpostgresql/flexibleservers/databases') {
    cases.push(
      realAzureVariance(
        'missing-charset',
        'Create/update without properties.charset.',
        {
          properties: {
            collation: createBody.properties?.collation,
          },
        },
        'PostgreSQL database validation error for missing charset.',
      ),
      realAzureVariance(
        'missing-collation',
        'Create/update without properties.collation.',
        {
          properties: {
            charset: createBody.properties?.charset,
          },
        },
        'PostgreSQL database validation error for missing collation.',
      ),
    );
  }

  if (lower === 'microsoft.eventhub/namespaces') {
    cases.push(
      realAzureVariance(
        'invalid-capacity',
        'Create/update with an out-of-range sku.capacity.',
        {
          ...createBody,
          sku: {
            ...(createBody.sku ?? {}),
            capacity: 99,
          },
        },
        'Event Hubs namespace validation error for out-of-range capacity.',
      ),
    );
  }

  if (lower === 'microsoft.eventhub/namespaces/eventhubs') {
    cases.push(
      realAzureVariance(
        'invalid-partition-count',
        'Create/update with an out-of-range partitionCount.',
        {
          properties: {
            ...(createBody.properties ?? {}),
            partitionCount: 0,
          },
        },
        'Event hub validation error for invalid partitionCount.',
      ),
      realAzureVariance(
        'invalid-message-retention',
        'Create/update with an out-of-range messageRetentionInDays.',
        {
          properties: {
            ...(createBody.properties ?? {}),
            messageRetentionInDays: 30,
          },
        },
        'Event hub validation error for invalid messageRetentionInDays.',
      ),
    );
  }

  if (lower === 'microsoft.storage/storageaccounts/fileservices/shares') {
    cases.push(
      realAzureVariance(
        'invalid-share-quota',
        'Create/update with an out-of-range Azure Files shareQuota.',
        {
          properties: {
            ...(createBody.properties ?? {}),
            shareQuota: 0,
          },
        },
        'Azure Files validation error for invalid shareQuota.',
      ),
      realAzureVariance(
        'invalid-enabled-protocols',
        'Create/update with an unsupported Azure Files enabledProtocols value.',
        {
          properties: {
            ...(createBody.properties ?? {}),
            enabledProtocols: 'FTP',
          },
        },
        'Azure Files validation error for invalid enabledProtocols.',
      ),
    );
  }

  return cases;
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
      id: 'unsupported-api-version',
      description: 'Same create/update request with an intentionally unsupported API version.',
      apiVersionOverride: '1900-01-01',
      body: createBody,
      expectedAzure: 'ARM or provider error for an unsupported API version.',
      localAssertion: 'must-return-400-or-provider-routing-error',
      requiresRealAzure: true,
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

  if (Object.hasOwn(createBody, 'location')) {
    const { location, ...withoutLocation } = createBody;
    void location;
    cases.push({
      id: 'missing-location',
      description: 'Create/update without the top-level location field for a regional resource.',
      body: withoutLocation,
      expectedAzure: 'Provider-specific location-required validation error.',
      localAssertion: 'record-gap-until-real-azure-captured',
      requiresRealAzure: true,
    });
  }

  if (createBody.properties && typeof createBody.properties === 'object') {
    cases.push({
      id: 'null-properties',
      description: 'Create/update with properties explicitly set to null.',
      body: { ...createBody, properties: null },
      expectedAzure: 'Provider-specific null-properties validation, defaulting, or rejection behavior.',
      localAssertion: 'record-gap-until-real-azure-captured',
      requiresRealAzure: true,
    });
  }

  cases.push({
    id: 'invalid-tags-shape',
    description: 'Create/update with tags set to an invalid non-object shape.',
    body: { ...createBody, tags: 'globalstack-invalid-tags' },
    expectedAzure: 'ARM or provider tag-shape validation error.',
    localAssertion: 'record-gap-until-real-azure-captured',
    requiresRealAzure: true,
  });

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
  cases.push(...serviceSpecificVarianceCases(resourceType, createBody));
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
