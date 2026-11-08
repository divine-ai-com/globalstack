export const locationValidatedResourceTypes = new Set([
  'Microsoft.ApiManagement/service',
  'Microsoft.App/containerApps',
  'Microsoft.App/managedEnvironments',
  'Microsoft.AppConfiguration/configurationStores',
  'Microsoft.Cache/redis',
  'Microsoft.Cache/redisEnterprise',
  'Microsoft.Cdn/profiles',
  'Microsoft.Cdn/profiles/afdEndpoints',
  'Microsoft.Cdn/profiles/endpoints',
  'Microsoft.ContainerRegistry/registries',
  'Microsoft.ContainerService/managedClusters',
  'Microsoft.DBforMySQL/flexibleServers',
  'Microsoft.DBforPostgreSQL/flexibleServers',
  'Microsoft.DataMigration/services',
  'Microsoft.DataMigration/services/projects',
  'Microsoft.DocumentDB/databaseAccounts',
  'Microsoft.EventGrid/systemTopics',
  'Microsoft.EventGrid/topics',
  'Microsoft.EventHub/namespaces',
  'Microsoft.Insights/components',
  'Microsoft.Insights/actionGroups',
  'Microsoft.Insights/metricAlerts',
  'Microsoft.KeyVault/vaults',
  'Microsoft.Logic/workflows',
  'Microsoft.ManagedIdentity/userAssignedIdentities',
  'Microsoft.NetApp/netAppAccounts/capacityPools/volumes',
  'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies',
  'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies',
  'Microsoft.Network/applicationGateways',
  'Microsoft.Network/publicIPAddresses',
  'Microsoft.Network/dnsZones',
  'Microsoft.Network/privateDnsZones/virtualNetworkLinks',
  'Microsoft.Network/loadBalancers',
  'Microsoft.Network/privateDnsZones',
  'Microsoft.Network/privateEndpoints',
  'Microsoft.Network/virtualNetworks',
  'Microsoft.OperationalInsights/workspaces',
  'Microsoft.ServiceBus/namespaces',
  'Microsoft.Storage/storageAccounts',
  'Microsoft.Synapse/workspaces',
  'Microsoft.Synapse/workspaces/sqlPools',
  'Microsoft.Web/serverfarms',
  'Microsoft.Web/sites',
]);

export const putMissingParentResourceTypes = new Map([
  ['Microsoft.ApiManagement/service/apis', 'ResourceNotFound'],
  ['Microsoft.ApiManagement/service/apis/operations', 'ResourceNotFound'],
  ['Microsoft.Cdn/profiles/afdEndpoints', 'ParentResourceNotFound'],
  ['Microsoft.Cdn/profiles/endpoints', 'ParentResourceNotFound'],
  ['Microsoft.Cdn/profiles/securityPolicies', 'ParentResourceNotFound'],
  ['Microsoft.DataMigration/services/projects', 'ParentResourceNotFound'],
  ['Microsoft.DataMigration/services/projects/tasks', 'ParentResourceNotFound'],
  ['Microsoft.DBforMySQL/flexibleServers/databases', 'ResourceNotFound'],
  ['Microsoft.DBforPostgreSQL/flexibleServers/databases', 'ResourceNotFound'],
  ['Microsoft.DBforPostgreSQL/flexibleServers/administrators', 'ResourceNotFound'],
  ['Microsoft.DocumentDB/databaseAccounts/sqlDatabases', 'ResourceNotFound'],
  ['Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers', 'ResourceNotFound'],
  ['Microsoft.EventHub/namespaces/eventhubs', 'ParentResourceNotFound'],
  ['Microsoft.KeyVault/vaults/keys', 'ParentResourceNotFound'],
  ['Microsoft.KeyVault/vaults/secrets', 'ParentResourceNotFound'],
  ['Microsoft.NetApp/netAppAccounts/capacityPools/volumes', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/A', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/AAAA', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/CAA', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/CNAME', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/MX', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/NS', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/PTR', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/SOA', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/SRV', 'ParentResourceNotFound'],
  ['Microsoft.Network/dnsZones/TXT', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/A', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/AAAA', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/CNAME', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/MX', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/PTR', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/SOA', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/SRV', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/TXT', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateDnsZones/virtualNetworkLinks', 'ParentResourceNotFound'],
  ['Microsoft.Network/privateEndpoints/privateDnsZoneGroups', 'ParentResourceNotFound'],
  ['Microsoft.Network/virtualNetworks/virtualNetworkPeerings', 'ParentResourceNotFound'],
  ['Microsoft.ServiceBus/namespaces/queues', 'ParentResourceNotFound'],
  ['Microsoft.ServiceBus/namespaces/topics', 'ParentResourceNotFound'],
  ['Microsoft.ServiceBus/namespaces/topics/subscriptions', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/blobServices/containers', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/fileServices/shares', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/queueServices/queues', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/tableServices/tables', 'ParentResourceNotFound'],
  ['Microsoft.Synapse/workspaces/sqlPools', 'ParentResourceNotFound'],
]);

export const storageAccountSkuNames = new Set([
  'Premium_LRS',
  'Premium_ZRS',
  'Standard_GRS',
  'Standard_GZRS',
  'Standard_LRS',
  'Standard_RAGRS',
  'Standard_RAGZRS',
  'Standard_ZRS',
]);

export const acceptedDeleteNotFoundResourceTypes = new Set([
  'Microsoft.ApiManagement/service',
  'Microsoft.App/containerApps',
  'Microsoft.App/managedEnvironments',
  'Microsoft.AppConfiguration/configurationStores',
  'Microsoft.Authorization/roleAssignments',
  'Microsoft.Authorization/roleDefinitions',
  'Microsoft.Cache/redis',
  'Microsoft.Cache/redisEnterprise',
  'Microsoft.Cdn/profiles',
  'Microsoft.Cdn/profiles/afdEndpoints',
  'Microsoft.Cdn/profiles/endpoints',
  'Microsoft.ContainerRegistry/registries',
  'Microsoft.ContainerService/managedClusters',
  'Microsoft.DBforMySQL/flexibleServers',
  'Microsoft.DBforPostgreSQL/flexibleServers',
  'Microsoft.DataMigration/services',
  'Microsoft.DataMigration/services/projects',
  'Microsoft.DataMigration/services/projects/tasks',
  'Microsoft.DocumentDB/databaseAccounts',
  'Microsoft.DocumentDB/databaseAccounts/sqlDatabases',
  'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers',
  'Microsoft.EventGrid/eventSubscriptions',
  'Microsoft.EventGrid/systemTopics',
  'Microsoft.EventGrid/topics',
  'Microsoft.EventHub/namespaces',
  'Microsoft.Insights/components',
  'Microsoft.Insights/actionGroups',
  'Microsoft.Insights/metricAlerts',
  'Microsoft.KeyVault/vaults',
  'Microsoft.Logic/workflows',
  'Microsoft.ManagedIdentity/userAssignedIdentities',
  'Microsoft.NetApp/netAppAccounts/capacityPools/volumes',
  'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies',
  'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies',
  'Microsoft.Network/applicationGateways',
  'Microsoft.Network/publicIPAddresses',
  'Microsoft.Network/dnsZones',
  'Microsoft.Network/dnsZones/A',
  'Microsoft.Network/dnsZones/AAAA',
  'Microsoft.Network/dnsZones/CAA',
  'Microsoft.Network/dnsZones/CNAME',
  'Microsoft.Network/dnsZones/MX',
  'Microsoft.Network/dnsZones/NS',
  'Microsoft.Network/dnsZones/PTR',
  'Microsoft.Network/dnsZones/SOA',
  'Microsoft.Network/dnsZones/SRV',
  'Microsoft.Network/dnsZones/TXT',
  'Microsoft.Network/loadBalancers',
  'Microsoft.Network/privateDnsZones',
  'Microsoft.Network/privateDnsZones/A',
  'Microsoft.Network/privateDnsZones/AAAA',
  'Microsoft.Network/privateDnsZones/CNAME',
  'Microsoft.Network/privateDnsZones/MX',
  'Microsoft.Network/privateDnsZones/PTR',
  'Microsoft.Network/privateDnsZones/SOA',
  'Microsoft.Network/privateDnsZones/SRV',
  'Microsoft.Network/privateDnsZones/TXT',
  'Microsoft.Network/privateDnsZones/virtualNetworkLinks',
  'Microsoft.Network/privateEndpoints',
  'Microsoft.Network/privateEndpoints/privateDnsZoneGroups',
  'Microsoft.Network/virtualNetworks',
  'Microsoft.Network/virtualNetworks/virtualNetworkPeerings',
  'Microsoft.OperationalInsights/workspaces',
  'Microsoft.ServiceBus/namespaces',
  'Microsoft.Storage/storageAccounts',
  'Microsoft.Synapse/workspaces',
  'Microsoft.Synapse/workspaces/sqlPools',
  'Microsoft.Web/serverfarms',
  'Microsoft.Web/sites',
]);

export function envelopedError(status, code, message, details = []) {
  return {
    status,
    body: {
      error: {
        code,
        message,
        details,
      },
    },
  };
}
export function topLevelError(status, code, message) {
  return {
    status,
    body: {
      code,
      message,
    },
  };
}

export function appServiceError(status, code, message) {
  return {
    status,
    body: {
      Code: code,
      Message: message,
      Target: null,
      Details: [
        { Message: message },
        { Code: code },
      ],
      Innererror: null,
    },
  };
}

export function emptyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

export function invalidResourceLocation(location) {
  return envelopedError(
    400,
    'InvalidResourceLocation',
    `The specified location '${location}' is invalid. A location must consist of characters, whitespace, digit, or following symbols '(,)'.`,
  );
}

export function locationRequired() {
  return envelopedError(400, 'LocationRequired', 'The location property is required for this definition.');
}

export function invalidRequestContent(requiredProperty) {
  return envelopedError(
    400,
    'InvalidRequestContent',
    `The content of your request was not valid, and the original object could not be deserialized. Exception message: 'Required property '${requiredProperty}' not found in JSON. Path 'properties'.'`,
  );
}

export function invalidStorageAccountName(name) {
  return envelopedError(
    400,
    'AccountNameInvalid',
    `The storage account named ${name} is invalid. Storage account names must be between 3 and 24 characters in length and use numbers and lower-case letters only.`,
  );
}

export function invalidStorageChildName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The storage child resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidServiceBusName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadRequest',
    `The Service Bus resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidEventGridName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadRequest',
    `The Event Grid resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidEventHubName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadRequest',
    `The Event Hubs resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidApiManagementName(resourceType, name, rule) {
  return envelopedError(
    400,
    'ValidationError',
    `The API Management resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidAppServiceName(resourceType, name, rule) {
  return envelopedError(
    400,
    'ValidationError',
    `The App Service resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidKeyVaultName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadParameter',
    `The Key Vault resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidContainerRegistryName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The Container Registry resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidAksName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The AKS managed cluster resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidCosmosName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadRequest',
    `The Cosmos DB resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidRedisName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The Redis resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidLogicWorkflowName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidWorkflowName',
    `The Logic workflow name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidCdnName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The CDN or Front Door resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidWafName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The WAF policy name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidAppConfigurationName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The App Configuration store name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidSynapseName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The Synapse resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function invalidDataMigrationName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The Database Migration Service resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

export function containerRegistryValidationError() {
  return {
    status: 400,
    body: {
      errors: {
        Sku: [
          'The Sku field is required.',
        ],
      },
      type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
      title: 'One or more validation errors occurred.',
      status: 400,
    },
  };
}

export function aksMissingServicePrincipalProfile() {
  return {
    status: 400,
    body: {
      code: 'InvalidParameter',
      details: null,
      message: 'Required parameter servicePrincipalProfile is missing (null).',
      subcode: '',
      target: 'servicePrincipalProfile',
    },
  };
}

export function serviceBusNameFromTypePath(typePath, marker) {
  const parts = String(typePath ?? '').split('/');
  const index = parts.indexOf(marker);
  return index >= 0 ? parts[index + 1] ?? '' : '';
}
