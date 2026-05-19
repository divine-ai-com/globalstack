import { isIP } from 'node:net';

const locationValidatedResourceTypes = new Set([
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
  'Microsoft.Insights/actionGroups',
  'Microsoft.Insights/metricAlerts',
  'Microsoft.KeyVault/vaults',
  'Microsoft.Logic/workflows',
  'Microsoft.ManagedIdentity/userAssignedIdentities',
  'Microsoft.NetApp/netAppAccounts/capacityPools/volumes',
  'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies',
  'Microsoft.Network/applicationGateways',
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

const putMissingParentResourceTypes = new Map([
  ['Microsoft.ApiManagement/service/apis', 'ResourceNotFound'],
  ['Microsoft.Cdn/profiles/afdEndpoints', 'ParentResourceNotFound'],
  ['Microsoft.Cdn/profiles/endpoints', 'ParentResourceNotFound'],
  ['Microsoft.Cdn/profiles/securityPolicies', 'ParentResourceNotFound'],
  ['Microsoft.DataMigration/services/projects', 'ParentResourceNotFound'],
  ['Microsoft.DBforMySQL/flexibleServers/databases', 'ResourceNotFound'],
  ['Microsoft.DBforPostgreSQL/flexibleServers/databases', 'ResourceNotFound'],
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
  ['Microsoft.ServiceBus/namespaces/queues', 'ParentResourceNotFound'],
  ['Microsoft.ServiceBus/namespaces/topics', 'ParentResourceNotFound'],
  ['Microsoft.ServiceBus/namespaces/topics/subscriptions', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/blobServices/containers', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/fileServices/shares', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/queueServices/queues', 'ParentResourceNotFound'],
  ['Microsoft.Storage/storageAccounts/tableServices/tables', 'ParentResourceNotFound'],
  ['Microsoft.Synapse/workspaces/sqlPools', 'ParentResourceNotFound'],
]);

const storageAccountSkuNames = new Set([
  'Premium_LRS',
  'Premium_ZRS',
  'Standard_GRS',
  'Standard_GZRS',
  'Standard_LRS',
  'Standard_RAGRS',
  'Standard_RAGZRS',
  'Standard_ZRS',
]);

const acceptedDeleteNotFoundResourceTypes = new Set([
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
  'Microsoft.DocumentDB/databaseAccounts',
  'Microsoft.DocumentDB/databaseAccounts/sqlDatabases',
  'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers',
  'Microsoft.EventGrid/eventSubscriptions',
  'Microsoft.EventGrid/systemTopics',
  'Microsoft.EventGrid/topics',
  'Microsoft.EventHub/namespaces',
  'Microsoft.Insights/actionGroups',
  'Microsoft.Insights/metricAlerts',
  'Microsoft.KeyVault/vaults',
  'Microsoft.Logic/workflows',
  'Microsoft.ManagedIdentity/userAssignedIdentities',
  'Microsoft.NetApp/netAppAccounts/capacityPools/volumes',
  'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies',
  'Microsoft.Network/applicationGateways',
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
  'Microsoft.Network/virtualNetworks',
  'Microsoft.OperationalInsights/workspaces',
  'Microsoft.ServiceBus/namespaces',
  'Microsoft.Storage/storageAccounts',
  'Microsoft.Synapse/workspaces',
  'Microsoft.Synapse/workspaces/sqlPools',
  'Microsoft.Web/serverfarms',
  'Microsoft.Web/sites',
]);

function envelopedError(status, code, message, details = []) {
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

function topLevelError(status, code, message) {
  return {
    status,
    body: {
      code,
      message,
    },
  };
}

function appServiceError(status, code, message) {
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

function emptyObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

function invalidResourceLocation(location) {
  return envelopedError(
    400,
    'InvalidResourceLocation',
    `The specified location '${location}' is invalid. A location must consist of characters, whitespace, digit, or following symbols '(,)'.`,
  );
}

function locationRequired() {
  return envelopedError(400, 'LocationRequired', 'The location property is required for this definition.');
}

function invalidRequestContent(requiredProperty) {
  return envelopedError(
    400,
    'InvalidRequestContent',
    `The content of your request was not valid, and the original object could not be deserialized. Exception message: 'Required property '${requiredProperty}' not found in JSON. Path 'properties'.'`,
  );
}

function invalidStorageAccountName(name) {
  return envelopedError(
    400,
    'AccountNameInvalid',
    `The storage account named ${name} is invalid. Storage account names must be between 3 and 24 characters in length and use numbers and lower-case letters only.`,
  );
}

function invalidStorageChildName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The storage child resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidServiceBusName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadRequest',
    `The Service Bus resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidEventGridName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadRequest',
    `The Event Grid resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidApiManagementName(resourceType, name, rule) {
  return envelopedError(
    400,
    'ValidationError',
    `The API Management resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidAppServiceName(resourceType, name, rule) {
  return envelopedError(
    400,
    'ValidationError',
    `The App Service resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidKeyVaultName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadParameter',
    `The Key Vault resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidContainerRegistryName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The Container Registry resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidAksName(resourceType, name, rule) {
  return envelopedError(
    400,
    'InvalidResourceName',
    `The AKS managed cluster resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function invalidCosmosName(resourceType, name, rule) {
  return envelopedError(
    400,
    'BadRequest',
    `The Cosmos DB resource name '${name}' is invalid for ${resourceType}. ${rule}`,
  );
}

function containerRegistryValidationError() {
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

function aksMissingServicePrincipalProfile() {
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

function serviceBusNameFromTypePath(typePath, marker) {
  const parts = String(typePath ?? '').split('/');
  const index = parts.indexOf(marker);
  return index >= 0 ? parts[index + 1] ?? '' : '';
}

function validateServiceBusName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.ServiceBus/namespaces') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'namespaces');
    if (!/^[A-Za-z][A-Za-z0-9-]{4,48}[A-Za-z0-9]$/.test(name)) {
      return invalidServiceBusName(
        resourceType,
        name,
        'Namespace names must be 6 through 50 characters, use alphanumerics and hyphens, start with a letter, and end with a letter or number.',
      );
    }
  }

  if (resourceType === 'Microsoft.ServiceBus/namespaces/queues') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'queues');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,258}[A-Za-z0-9])?$/.test(name)) {
      return invalidServiceBusName(
        resourceType,
        name,
        'Queue names must be 1 through 260 characters, use alphanumerics, periods, hyphens, underscores, and slashes, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.ServiceBus/namespaces/topics') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'topics');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._/-]{0,258}[A-Za-z0-9])?$/.test(name)) {
      return invalidServiceBusName(
        resourceType,
        name,
        'Topic names must be 1 through 260 characters, use alphanumerics, periods, hyphens, underscores, and slashes, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.ServiceBus/namespaces/topics/subscriptions') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'subscriptions');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,48}[A-Za-z0-9])?$/.test(name)) {
      return invalidServiceBusName(
        resourceType,
        name,
        'Subscription names must be 1 through 50 characters, use alphanumerics, periods, hyphens, and underscores, and start and end with an alphanumeric character.',
      );
    }
  }

  return null;
}

function validateEventGridName(resourceType, providerRoute) {
  const name = serviceBusNameFromTypePath(providerRoute?.typePath, resourceType.endsWith('/topics') ? 'topics' : 'eventSubscriptions');
  if (resourceType === 'Microsoft.EventGrid/topics') {
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{1,48}[A-Za-z0-9])?$/.test(name)) {
      return invalidEventGridName(
        resourceType,
        name,
        'Topic names must be 3 through 50 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
      );
    }
  }

  return null;
}

function validateApiManagementName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.ApiManagement/service') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'service');
    if (!/^[A-Za-z](?:[A-Za-z0-9-]{0,48}[A-Za-z0-9])?$/.test(name)) {
      return invalidApiManagementName(
        resourceType,
        name,
        'Service names must be 1 through 50 characters, use alphanumerics and hyphens, start with a letter, and end with a letter or number.',
      );
    }
  }

  if (resourceType === 'Microsoft.ApiManagement/service/apis') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'apis');
    if (!name || name.length > 256 || /[*#&+:<>?]/.test(name)) {
      return invalidApiManagementName(
        resourceType,
        name,
        'API identifiers must be 1 through 256 characters and cannot contain *, #, &, +, :, <, >, or ?.',
      );
    }
  }

  return null;
}

function validateAppServiceName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.Web/serverfarms') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'serverfarms');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$/.test(name)) {
      return invalidAppServiceName(
        resourceType,
        name,
        'Server farm names must be 1 through 40 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
      );
    }
  }

  if (resourceType === 'Microsoft.Web/sites') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'sites');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,58}[A-Za-z0-9])?$/.test(name)) {
      return invalidAppServiceName(
        resourceType,
        name,
        'Function App names must be 2 through 60 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
      );
    }
  }

  return null;
}

function validateKeyVaultName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.KeyVault/vaults') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'vaults');
    if (!/^[A-Za-z](?:[A-Za-z0-9-]{1,22}[A-Za-z0-9])?$/.test(name) || name.includes('--')) {
      return invalidKeyVaultName(
        resourceType,
        name,
        'Vault names must be 3 through 24 characters, use alphanumerics and hyphens, start with a letter, end with a letter or number, and not contain consecutive hyphens.',
      );
    }
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/keys') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'keys');
    if (!/^[A-Za-z0-9-]{1,127}$/.test(name)) {
      return invalidKeyVaultName(
        resourceType,
        name,
        'Key names must be 1 through 127 characters and use alphanumerics and hyphens.',
      );
    }
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/secrets') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'secrets');
    if (!/^[A-Za-z0-9-]{1,127}$/.test(name)) {
      return invalidKeyVaultName(
        resourceType,
        name,
        'Secret names must be 1 through 127 characters and use alphanumerics and hyphens.',
      );
    }
  }

  return null;
}

function validateContainerRegistryName(resourceType, providerRoute) {
  if (resourceType !== 'Microsoft.ContainerRegistry/registries') return null;
  const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'registries');
  if (!/^[A-Za-z0-9]{5,50}$/.test(name)) {
    return invalidContainerRegistryName(
      resourceType,
      name,
      'Registry names must be 5 through 50 characters and use only alphanumerics.',
    );
  }
  return null;
}

function validateAksName(resourceType, providerRoute) {
  if (resourceType !== 'Microsoft.ContainerService/managedClusters') return null;
  const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'managedClusters');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,61}[A-Za-z0-9])?$/.test(name)) {
    return invalidAksName(
      resourceType,
      name,
      'Cluster names must be 1 through 63 characters, use alphanumerics, hyphens, and underscores, and start and end with an alphanumeric character.',
    );
  }
  return null;
}

function validateCosmosName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.DocumentDB/databaseAccounts') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'databaseAccounts');
    if (!/^[a-z0-9](?:[a-z0-9-]{1,42}[a-z0-9])?$/.test(name)) {
      return invalidCosmosName(
        resourceType,
        name,
        'Account names must be 3 through 44 lowercase letters, numbers, or hyphens, and start and end with a letter or number.',
      );
    }
  }

  if (resourceType === 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'sqlDatabases');
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(name)) {
      return invalidCosmosName(
        resourceType,
        name,
        'SQL database names must be 1 through 255 characters and use alphanumerics, underscore, or hyphen for this local parity surface.',
      );
    }
  }

  if (resourceType === 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'containers');
    if (!/^[A-Za-z0-9_-]{1,255}$/.test(name)) {
      return invalidCosmosName(
        resourceType,
        name,
        'SQL container names must be 1 through 255 characters and use alphanumerics, underscore, or hyphen for this local parity surface.',
      );
    }
  }

  return null;
}

function validateStorageChildName(resourceType, providerRoute) {
  const dnsStyle = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
  const noConsecutiveHyphen = name => !name.includes('--');

  if (resourceType === 'Microsoft.Storage/storageAccounts/blobServices/containers') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'containers');
    if (!dnsStyle.test(name) || !noConsecutiveHyphen(name)) {
      return invalidStorageChildName(
        resourceType,
        name,
        'Container names must be lowercase DNS-style names from 3 through 63 characters, use alphanumerics and hyphens, and not start, end, or repeat hyphens.',
      );
    }
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/queueServices/queues') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'queues');
    if (!dnsStyle.test(name) || !noConsecutiveHyphen(name)) {
      return invalidStorageChildName(
        resourceType,
        name,
        'Queue names must be lowercase DNS-style names from 3 through 63 characters, use alphanumerics and hyphens, and not start, end, or repeat hyphens.',
      );
    }
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/fileServices/shares') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'shares');
    if (!dnsStyle.test(name) || !noConsecutiveHyphen(name)) {
      return invalidStorageChildName(
        resourceType,
        name,
        'File share names must be lowercase DNS-style names from 3 through 63 characters, use alphanumerics and hyphens, and not start, end, or repeat hyphens.',
      );
    }
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts/tableServices/tables') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'tables');
    if (!/^[A-Za-z][A-Za-z0-9]{2,62}$/.test(name)) {
      return invalidStorageChildName(
        resourceType,
        name,
        'Table names must be 3 through 63 alphanumeric characters and start with a letter.',
      );
    }
  }

  return null;
}

function validateApiManagementPayload(resourceType, body) {
  if (resourceType === 'Microsoft.ApiManagement/service') {
    if (!body.sku || !body.sku.name) {
      return envelopedError(
        400,
        'InvalidParameters',
        'Invalid parameter: Value cannot be null.\r\nParameter name: skuproperties',
      );
    }
    if (!body.properties?.publisherEmail || !body.properties?.publisherName) {
      return envelopedError(
        400,
        'ValidationError',
        'API Management service properties.publisherEmail and properties.publisherName are required for local APIM service creation.',
      );
    }
  }

  if (resourceType === 'Microsoft.ApiManagement/service/apis') {
    if (!body.properties?.path) {
      return envelopedError(
        400,
        'ValidationError',
        'API Management API properties.path is required.',
      );
    }
    if (body.properties.protocols && !Array.isArray(body.properties.protocols)) {
      return envelopedError(
        400,
        'ValidationError',
        'API Management API properties.protocols must be an array when provided.',
      );
    }
  }

  return null;
}

function validateContainerRegistryPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.ContainerRegistry/registries') return null;
  if (!body.sku?.name) return containerRegistryValidationError();
  if (!['Basic', 'Standard', 'Premium'].includes(body.sku.name)) {
    return envelopedError(
      400,
      'SkuNameInvalid',
      `The SKU name '${body.sku.name}' is invalid. Allowed values are Basic, Standard, and Premium.`,
    );
  }
  if (Object.hasOwn(body.properties ?? {}, 'adminUserEnabled') && typeof body.properties.adminUserEnabled !== 'boolean') {
    return envelopedError(
      400,
      'InvalidRequestBody',
      'Container Registry properties.adminUserEnabled must be a boolean when provided.',
    );
  }
  if (
    Object.hasOwn(body.properties ?? {}, 'publicNetworkAccess')
    && !['Enabled', 'Disabled'].includes(body.properties.publicNetworkAccess)
  ) {
    return envelopedError(
      400,
      'InvalidRequestBody',
      'Container Registry properties.publicNetworkAccess must be Enabled or Disabled when provided.',
    );
  }
  return null;
}

function validateAksPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.ContainerService/managedClusters') return null;
  const properties = body.properties ?? {};
  if (!properties.servicePrincipalProfile) return aksMissingServicePrincipalProfile();
  if (typeof properties.servicePrincipalProfile.clientId !== 'string' || properties.servicePrincipalProfile.clientId.trim() === '') {
    return envelopedError(
      400,
      'InvalidParameter',
      'AKS properties.servicePrincipalProfile.clientId must be provided for this local metadata surface.',
    );
  }
  if (typeof properties.dnsPrefix !== 'string' || properties.dnsPrefix.trim() === '') {
    return envelopedError(
      400,
      'InvalidParameter',
      'AKS properties.dnsPrefix is required.',
    );
  }
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,52}[A-Za-z0-9])?$/.test(properties.dnsPrefix)) {
    return envelopedError(
      400,
      'InvalidDnsPrefix',
      'AKS properties.dnsPrefix must be 1 through 54 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
    );
  }
  if (!Array.isArray(properties.agentPoolProfiles) || properties.agentPoolProfiles.length === 0) {
    return envelopedError(
      400,
      'InvalidParameter',
      'AKS properties.agentPoolProfiles must include at least one node pool.',
    );
  }
  for (const pool of properties.agentPoolProfiles) {
    if (!/^[a-z][a-z0-9]{0,11}$/.test(pool?.name ?? '')) {
      return envelopedError(
        400,
        'InvalidAgentPoolName',
        'AKS agent pool names must start with a lowercase letter, use lowercase alphanumerics only, and be 1 through 12 characters.',
      );
    }
    if (!Number.isInteger(pool.count) || pool.count < 1 || pool.count > 100) {
      return envelopedError(
        400,
        'InvalidAgentPoolCount',
        'AKS agent pool count must be an integer between 1 and 100.',
      );
    }
    if (typeof pool.vmSize !== 'string' || pool.vmSize.trim() === '') {
      return envelopedError(
        400,
        'InvalidParameter',
        'AKS agent pool vmSize is required.',
      );
    }
    if (pool.mode && !['System', 'User'].includes(pool.mode)) {
      return envelopedError(
        400,
        'InvalidParameter',
        'AKS agent pool mode must be System or User when provided.',
      );
    }
    if (pool.osType && !['Linux', 'Windows'].includes(pool.osType)) {
      return envelopedError(
        400,
        'InvalidParameter',
        'AKS agent pool osType must be Linux or Windows when provided.',
      );
    }
  }
  if (properties.kubernetesVersion && !/^\d+\.\d+(?:\.\d+)?$/.test(properties.kubernetesVersion)) {
    return envelopedError(
      400,
      'InvalidKubernetesVersion',
      'AKS properties.kubernetesVersion must use a semantic version such as 1.29.2.',
    );
  }
  if (body.identity?.type && !['SystemAssigned', 'UserAssigned', 'SystemAssigned, UserAssigned', 'None'].includes(body.identity.type)) {
    return envelopedError(
      400,
      'InvalidIdentityType',
      'AKS identity.type must be SystemAssigned, UserAssigned, SystemAssigned, UserAssigned, or None when provided.',
    );
  }
  return null;
}

function validateKeyVaultPayload(resourceType, body) {
  if (resourceType === 'Microsoft.KeyVault/vaults') {
    if (!body.properties?.tenantId) {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault properties.tenantId is required.',
      );
    }
    if (body.properties?.sku?.family !== 'A' || !['standard', 'premium'].includes(String(body.properties?.sku?.name ?? '').toLowerCase())) {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault properties.sku must specify family A and name standard or premium.',
      );
    }
    if (!Array.isArray(body.properties?.accessPolicies)) {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault properties.accessPolicies must be an array.',
      );
    }
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/secrets') {
    if (typeof body.properties?.value !== 'string' || body.properties.value.length === 0) {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault secret properties.value must be a non-empty string.',
      );
    }
    if (Object.hasOwn(body.properties, 'contentType') && typeof body.properties.contentType !== 'string') {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault secret properties.contentType must be a string when provided.',
      );
    }
  }

  if (resourceType === 'Microsoft.KeyVault/vaults/keys') {
    const supportedKeyTypes = new Set(['RSA', 'RSA-HSM', 'EC', 'EC-HSM']);
    if (!supportedKeyTypes.has(body.properties?.kty)) {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault key properties.kty must be one of RSA, RSA-HSM, EC, or EC-HSM.',
      );
    }
    if (body.properties?.keyOps && !Array.isArray(body.properties.keyOps)) {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault key properties.keyOps must be an array when provided.',
      );
    }
    if (Array.isArray(body.properties?.keyOps)) {
      const supportedOps = new Set(['encrypt', 'decrypt', 'sign', 'verify', 'wrapKey', 'unwrapKey']);
      if (body.properties.keyOps.some(op => !supportedOps.has(op))) {
        return envelopedError(
          400,
          'BadParameter',
          'Key Vault key properties.keyOps contains an unsupported operation.',
        );
      }
    }
    if (body.properties?.keySize !== undefined && (!Number.isInteger(body.properties.keySize) || body.properties.keySize < 2048)) {
      return envelopedError(
        400,
        'BadParameter',
        'Key Vault RSA key properties.keySize must be an integer greater than or equal to 2048 when provided.',
      );
    }
  }

  return null;
}

function validateMonitorMetricsPayload(resourceType, body) {
  if (resourceType === 'Microsoft.Insights/actionGroups') {
    const properties = body.properties ?? {};
    if (typeof properties.groupShortName !== 'string' || properties.groupShortName.trim() === '') {
      return topLevelError(400, 'BadRequest', "'Group Short Name' must not be empty.");
    }
    if (properties.groupShortName.length > 12) {
      return topLevelError(400, 'BadRequest', "'Group Short Name' must not be longer than 12 characters.");
    }
    if (Object.hasOwn(properties, 'enabled') && typeof properties.enabled !== 'boolean') {
      return topLevelError(400, 'BadRequest', "Property 'enabled' must be a boolean.");
    }
  }

  if (resourceType === 'Microsoft.Insights/metricAlerts') {
    const properties = body.properties ?? {};
    if (!Number.isInteger(properties.severity)) {
      return topLevelError(
        400,
        'BadRequest',
        "Required property 'severity' not found in JSON. Path 'properties', line 1, position 36. Activity ID: globalstack-redacted.",
      );
    }
    if (properties.severity < 0 || properties.severity > 4) {
      return topLevelError(400, 'BadRequest', "Property 'severity' must be between 0 and 4.");
    }
    if (Object.hasOwn(properties, 'enabled') && typeof properties.enabled !== 'boolean') {
      return topLevelError(400, 'BadRequest', "Property 'enabled' must be a boolean.");
    }
    if (!Array.isArray(properties.scopes) || properties.scopes.length === 0) {
      return topLevelError(400, 'BadRequest', "Required property 'scopes' not found in JSON. Path 'properties'.");
    }
    if (!properties.criteria || !Array.isArray(properties.criteria.allOf) || properties.criteria.allOf.length === 0) {
      return topLevelError(400, 'BadRequest', "Required property 'criteria.allOf' not found in JSON. Path 'properties.criteria'.");
    }
  }

  return null;
}

function isIpv4Cidr(value) {
  const match = String(value ?? '').match(/^(\d{1,3})(?:\.(\d{1,3})){3}\/(\d{1,2})$/);
  if (!match) return false;
  const [address, prefix] = String(value).split('/');
  const octets = address.split('.').map(Number);
  return octets.every(octet => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    && Number(prefix) >= 0
    && Number(prefix) <= 32;
}

function validateVirtualNetworkPayload(resourceType, body, providerRoute = null) {
  if (resourceType === 'Microsoft.Network/virtualNetworks') {
    const addressPrefixes = body.properties?.addressSpace?.addressPrefixes;
    if (!Array.isArray(addressPrefixes) || addressPrefixes.length === 0) {
      return envelopedError(
        400,
        'NoAddressPrefixOrPoolProvided',
        `Address prefix and ipam pool reference are both empty/null in request payload of resource ${providerRoute?.typePath ?? 'virtualNetworks'}. Please provide either address prefix or ipam pool reference.`,
      );
    }
    if (addressPrefixes.some(prefix => !isIpv4Cidr(prefix))) {
      return envelopedError(400, 'InvalidAddressPrefixFormat', 'Virtual network address prefixes must be valid IPv4 CIDR blocks.');
    }
    for (const subnet of body.properties?.subnets ?? []) {
      if (typeof subnet?.name !== 'string' || subnet.name.trim() === '') {
        return envelopedError(400, 'InvalidRequestFormat', 'Subnet name is required.');
      }
      const subnetPrefixes = [
        subnet.properties?.addressPrefix,
        ...(Array.isArray(subnet.properties?.addressPrefixes) ? subnet.properties.addressPrefixes : []),
      ].filter(Boolean);
      if (subnetPrefixes.length === 0) {
        return envelopedError(400, 'SubnetAddressPrefixCannotBeEmpty', 'Subnet address prefix cannot be empty.');
      }
      if (subnetPrefixes.some(prefix => !isIpv4Cidr(prefix))) {
        return envelopedError(400, 'InvalidAddressPrefixFormat', 'Subnet address prefixes must be valid IPv4 CIDR blocks.');
      }
    }
  }

  if (resourceType === 'Microsoft.Network/virtualNetworks/subnets') {
    const prefixes = [
      body.properties?.addressPrefix,
      ...(Array.isArray(body.properties?.addressPrefixes) ? body.properties.addressPrefixes : []),
    ].filter(Boolean);
    if (prefixes.length === 0) {
      return envelopedError(400, 'SubnetAddressPrefixCannotBeEmpty', 'Subnet address prefix cannot be empty.');
    }
    if (prefixes.some(prefix => !isIpv4Cidr(prefix))) {
      return envelopedError(400, 'InvalidAddressPrefixFormat', 'Subnet address prefixes must be valid IPv4 CIDR blocks.');
    }
  }

  if (resourceType === 'Microsoft.Network/privateEndpoints') {
    const connections = body.properties?.privateLinkServiceConnections;
    if (!Array.isArray(connections) || connections.length === 0) {
      return envelopedError(
        400,
        'MissingParameterOnPrivateEndpoint',
        `Private endpoint ${providerRoute?.typePath ?? 'privateEndpoints'} is missing required parameter 'private link service connection.'.`,
      );
    }
    if (typeof body.properties?.subnet?.id !== 'string' || body.properties.subnet.id.trim() === '') {
      return envelopedError(400, 'PrivateEndpointSubnetIdRequired', 'Private endpoint requires properties.subnet.id.');
    }
    for (const connection of connections) {
      if (typeof connection?.name !== 'string' || connection.name.trim() === '') {
        return envelopedError(400, 'InvalidRequestFormat', 'Private link service connection name is required.');
      }
      if (typeof connection.properties?.privateLinkServiceId !== 'string' || connection.properties.privateLinkServiceId.trim() === '') {
        return envelopedError(400, 'PrivateLinkServiceIdRequired', 'Private link service connection requires properties.privateLinkServiceId.');
      }
      if (!Array.isArray(connection.properties?.groupIds) || connection.properties.groupIds.length === 0) {
        return envelopedError(400, 'PrivateEndpointGroupIdRequired', 'Private link service connection requires at least one group ID.');
      }
    }
  }

  if (resourceType === 'Microsoft.Network/privateDnsZones') {
    const name = providerRoute?.typePath?.split('/')[1] ?? '';
    if (!/^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/.test(name) || !name.includes('.')) {
      return envelopedError(400, 'InvalidDomainName', `The private DNS zone name '${name}' is invalid.`);
    }
    if (body.location && body.location !== 'global') {
      return envelopedError(400, 'InvalidResourceLocation', "Private DNS zones must use location 'global'.");
    }
  }

  return null;
}

function dnsNameFromTypePath(providerRoute, collection) {
  const parts = providerRoute?.typePath?.split('/') ?? [];
  const index = parts.findIndex(part => part.toLowerCase() === collection.toLowerCase());
  return index >= 0 ? parts[index + 1] ?? '' : '';
}

function isValidZoneName(name) {
  return /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(?:\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/.test(name) && name.includes('.');
}

function isValidRelativeRecordName(name) {
  if (name === '@') return true;
  return /^(?!-)[A-Za-z0-9_*.-]{1,253}(?<!-)$/.test(name) && !String(name).includes('..');
}

function dnsProperty(properties, ...names) {
  for (const name of names) {
    if (Object.hasOwn(properties ?? {}, name)) return properties[name];
  }
  return undefined;
}

function ttlValue(properties) {
  return dnsProperty(properties, 'TTL', 'ttl');
}

function validateRecordArray({ properties, arrayNames, code, message, predicate }) {
  const records = dnsProperty(properties, ...arrayNames);
  if (!Array.isArray(records) || records.length === 0) return envelopedError(400, code, message);
  if (predicate && records.some(record => !predicate(record))) return envelopedError(400, code, message);
  return null;
}

function validateDnsRecordSet(resourceType, body, providerRoute) {
  const properties = body.properties ?? {};
  if (emptyObject(body) || emptyObject(properties)) {
    return envelopedError(400, 'BadRequest', 'DNS record set properties are required.');
  }
  const ttl = ttlValue(properties);
  if (!Number.isInteger(ttl) || ttl < 0 || ttl > 2147483647) {
    return envelopedError(400, 'InvalidTtl', 'DNS record set TTL must be an integer between 0 and 2147483647.');
  }

  const parts = providerRoute?.typePath?.split('/') ?? [];
  const recordType = parts.at(-2);
  const recordName = parts.at(-1);
  if (!isValidRelativeRecordName(recordName)) {
    return envelopedError(400, 'InvalidRecordSetName', `The DNS record set name '${recordName}' is invalid.`);
  }

  switch (recordType) {
    case 'A':
      return validateRecordArray({
        properties,
        arrayNames: ['ARecords', 'aRecords'],
        code: 'InvalidARecord',
        message: 'A record sets require at least one valid IPv4 address.',
        predicate: record => isIP(record?.ipv4Address) === 4,
      });
    case 'AAAA':
      return validateRecordArray({
        properties,
        arrayNames: ['AAAARecords', 'aaaaRecords'],
        code: 'InvalidAaaaRecord',
        message: 'AAAA record sets require at least one valid IPv6 address.',
        predicate: record => isIP(record?.ipv6Address) === 6,
      });
    case 'CAA':
      return validateRecordArray({
        properties,
        arrayNames: ['CAARecords', 'caaRecords'],
        code: 'InvalidCaaRecord',
        message: 'CAA record sets require flags, tag, and value.',
        predicate: record => Number.isInteger(record?.flags) && typeof record?.tag === 'string' && record.tag !== '' && typeof record?.value === 'string' && record.value !== '',
      });
    case 'CNAME': {
      const record = dnsProperty(properties, 'CNAMERecord', 'cnameRecord');
      if (!record || typeof record.cname !== 'string' || record.cname.trim() === '') {
        return envelopedError(400, 'InvalidCnameRecord', 'CNAME record sets require properties.CNAMERecord.cname.');
      }
      return null;
    }
    case 'MX':
      return validateRecordArray({
        properties,
        arrayNames: ['MXRecords', 'mxRecords'],
        code: 'InvalidMxRecord',
        message: 'MX record sets require preference and exchange values.',
        predicate: record => Number.isInteger(record?.preference) && typeof record?.exchange === 'string' && record.exchange !== '',
      });
    case 'NS':
      return validateRecordArray({
        properties,
        arrayNames: ['NSRecords', 'nsRecords'],
        code: 'InvalidNsRecord',
        message: 'NS record sets require nsdname values.',
        predicate: record => typeof record?.nsdname === 'string' && record.nsdname !== '',
      });
    case 'PTR':
      return validateRecordArray({
        properties,
        arrayNames: ['PTRRecords', 'ptrRecords'],
        code: 'InvalidPtrRecord',
        message: 'PTR record sets require ptrdname values.',
        predicate: record => typeof record?.ptrdname === 'string' && record.ptrdname !== '',
      });
    case 'SOA': {
      const record = dnsProperty(properties, 'SOARecord', 'soaRecord');
      const integerFields = ['serialNumber', 'refreshTime', 'retryTime', 'expireTime', 'minimumTTL'];
      if (
        !record
        || typeof record.host !== 'string'
        || record.host === ''
        || typeof record.email !== 'string'
        || record.email === ''
        || integerFields.some(field => !Number.isInteger(record[field]))
      ) {
        return envelopedError(400, 'InvalidSoaRecord', 'SOA record sets require host, email, serialNumber, refreshTime, retryTime, expireTime, and minimumTTL.');
      }
      return null;
    }
    case 'SRV':
      return validateRecordArray({
        properties,
        arrayNames: ['SRVRecords', 'srvRecords'],
        code: 'InvalidSrvRecord',
        message: 'SRV record sets require priority, weight, port, and target values.',
        predicate: record => Number.isInteger(record?.priority) && Number.isInteger(record?.weight) && Number.isInteger(record?.port) && typeof record?.target === 'string' && record.target !== '',
      });
    case 'TXT':
      return validateRecordArray({
        properties,
        arrayNames: ['TXTRecords', 'txtRecords'],
        code: 'InvalidTxtRecord',
        message: 'TXT record sets require at least one text value.',
        predicate: record => Array.isArray(record?.value) && record.value.length > 0 && record.value.every(item => typeof item === 'string' && item !== ''),
      });
    default:
      return envelopedError(501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure DNS record type ${resourceType}.`);
  }
}

function validateDnsPayload(resourceType, body, providerRoute = null) {
  if (resourceType === 'Microsoft.Network/dnsZones') {
    const name = dnsNameFromTypePath(providerRoute, 'dnsZones');
    if (!isValidZoneName(name)) return envelopedError(400, 'InvalidDomainName', `The DNS zone name '${name}' is invalid.`);
    if (body.location && body.location !== 'global') return envelopedError(400, 'InvalidResourceLocation', "DNS zones must use location 'global'.");
  }

  if (resourceType === 'Microsoft.Network/privateDnsZones') {
    const name = dnsNameFromTypePath(providerRoute, 'privateDnsZones');
    if (!isValidZoneName(name)) return envelopedError(400, 'InvalidDomainName', `The private DNS zone name '${name}' is invalid.`);
    if (body.location && body.location !== 'global') return envelopedError(400, 'InvalidResourceLocation', "Private DNS zones must use location 'global'.");
  }

  if (resourceType.startsWith('Microsoft.Network/dnsZones/') || resourceType.startsWith('Microsoft.Network/privateDnsZones/')) {
    if (resourceType === 'Microsoft.Network/privateDnsZones/virtualNetworkLinks') {
      if (body.location && body.location !== 'global') return envelopedError(400, 'InvalidResourceLocation', "Private DNS virtual network links must use location 'global'.");
      if (typeof body.properties?.virtualNetwork?.id !== 'string' || body.properties.virtualNetwork.id.trim() === '') {
        return envelopedError(400, 'VirtualNetworkLinkReferenceMissing', 'Private DNS virtual network links require properties.virtualNetwork.id.');
      }
      if (Object.hasOwn(body.properties ?? {}, 'registrationEnabled') && typeof body.properties.registrationEnabled !== 'boolean') {
        return envelopedError(400, 'InvalidRequestFormat', 'Private DNS virtual network link properties.registrationEnabled must be a boolean.');
      }
      return null;
    }
    return validateDnsRecordSet(resourceType, body, providerRoute);
  }

  return null;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

function arrayProp(body, name) {
  return Array.isArray(body.properties?.[name]) ? body.properties[name] : [];
}

function refId(value) {
  return isNonEmptyString(value?.id);
}

function validateNamedCollection(items, code, message) {
  if (!Array.isArray(items) || items.length === 0) return envelopedError(400, code, message);
  if (items.some(item => !isNonEmptyString(item?.name))) return envelopedError(400, 'InvalidRequestFormat', `${message} Each item requires a name.`);
  return null;
}

function validateApplicationGatewayPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.Network/applicationGateways') return null;

  const skuName = body.sku?.name;
  if (!['Standard_v2', 'WAF_v2'].includes(skuName)) {
    return envelopedError(400, 'ApplicationGatewaySkuNotSupported', 'Application Gateway sku.name must be Standard_v2 or WAF_v2 for this local parity surface.');
  }
  if (!['Standard_v2', 'WAF_v2'].includes(body.sku?.tier)) {
    return envelopedError(400, 'ApplicationGatewaySkuTierNotSupported', 'Application Gateway sku.tier must be Standard_v2 or WAF_v2 for this local parity surface.');
  }

  const gatewayIpConfigurations = arrayProp(body, 'gatewayIPConfigurations');
  const gatewayIpValidation = validateNamedCollection(gatewayIpConfigurations, 'SubnetIsRequired', 'Application Gateway requires gatewayIPConfigurations.');
  if (gatewayIpValidation) return gatewayIpValidation;
  if (gatewayIpConfigurations.some(item => !refId(item.properties?.subnet))) {
    return envelopedError(400, 'SubnetIsRequired', 'Subnet reference is required for ipconfiguration Application gateway subnet is required.');
  }

  const frontendIpConfigurations = arrayProp(body, 'frontendIPConfigurations');
  const frontendIpValidation = validateNamedCollection(frontendIpConfigurations, 'ApplicationGatewayFrontendIpConfigurationRequired', 'Application Gateway requires frontendIPConfigurations.');
  if (frontendIpValidation) return frontendIpValidation;
  if (frontendIpConfigurations.some(item => !refId(item.properties?.publicIPAddress) && !refId(item.properties?.subnet))) {
    return envelopedError(400, 'ApplicationGatewayFrontendIpConfigurationInvalid', 'Application Gateway frontend IP configurations require publicIPAddress.id or subnet.id.');
  }

  const frontendPorts = arrayProp(body, 'frontendPorts');
  const frontendPortValidation = validateNamedCollection(frontendPorts, 'ApplicationGatewayFrontendPortRequired', 'Application Gateway requires frontendPorts.');
  if (frontendPortValidation) return frontendPortValidation;
  if (frontendPorts.some(item => !isPort(item.properties?.port))) {
    return envelopedError(400, 'ApplicationGatewayFrontendPortInvalid', 'Application Gateway frontendPorts[].properties.port must be between 1 and 65535.');
  }

  const backendPools = arrayProp(body, 'backendAddressPools');
  const backendPoolValidation = validateNamedCollection(backendPools, 'ApplicationGatewayBackendPoolRequired', 'Application Gateway requires backendAddressPools.');
  if (backendPoolValidation) return backendPoolValidation;

  const backendSettings = arrayProp(body, 'backendHttpSettingsCollection');
  const backendSettingsValidation = validateNamedCollection(backendSettings, 'ApplicationGatewayBackendHttpSettingsRequired', 'Application Gateway requires backendHttpSettingsCollection.');
  if (backendSettingsValidation) return backendSettingsValidation;
  if (backendSettings.some(item => !isPort(item.properties?.port) || !['Http', 'Https'].includes(item.properties?.protocol))) {
    return envelopedError(400, 'ApplicationGatewayBackendHttpSettingsInvalid', 'Application Gateway backend HTTP settings require protocol Http/Https and a port between 1 and 65535.');
  }

  const listeners = arrayProp(body, 'httpListeners');
  const listenerValidation = validateNamedCollection(listeners, 'ApplicationGatewayHttpListenerRequired', 'Application Gateway requires httpListeners.');
  if (listenerValidation) return listenerValidation;
  if (listeners.some(item => !refId(item.properties?.frontendIPConfiguration) || !refId(item.properties?.frontendPort) || !['Http', 'Https'].includes(item.properties?.protocol))) {
    return envelopedError(400, 'ApplicationGatewayHttpListenerInvalid', 'Application Gateway HTTP listeners require frontendIPConfiguration.id, frontendPort.id, and protocol Http/Https.');
  }

  const rules = arrayProp(body, 'requestRoutingRules');
  const ruleValidation = validateNamedCollection(rules, 'ApplicationGatewayRequestRoutingRuleRequired', 'Application Gateway requires requestRoutingRules.');
  if (ruleValidation) return ruleValidation;
  if (rules.some(item => !['Basic', 'PathBasedRouting'].includes(item.properties?.ruleType) || !refId(item.properties?.httpListener) || !refId(item.properties?.backendAddressPool) || !refId(item.properties?.backendHttpSettings))) {
    return envelopedError(400, 'ApplicationGatewayRequestRoutingRuleInvalid', 'Application Gateway request routing rules require a supported ruleType and listener, backend pool, and backend settings references.');
  }

  return null;
}

function validateLoadBalancerPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.Network/loadBalancers') return null;

  const skuName = body.sku?.name;
  if (!['Basic', 'Standard'].includes(skuName)) {
    return envelopedError(400, 'LoadBalancerSkuNotSupported', 'Load Balancer sku.name must be Basic or Standard for this local parity surface.');
  }

  const frontendIpConfigurations = arrayProp(body, 'frontendIPConfigurations');
  const frontendIpValidation = validateNamedCollection(frontendIpConfigurations, 'LoadBalancerFrontendIpConfigurationRequired', 'Load Balancer requires frontendIPConfigurations.');
  if (frontendIpValidation) return frontendIpValidation;
  if (frontendIpConfigurations.some(item => !refId(item.properties?.publicIPAddress) && !refId(item.properties?.subnet))) {
    return envelopedError(400, 'LoadBalancerFrontendIpConfigurationInvalid', 'Load Balancer frontend IP configurations require publicIPAddress.id or subnet.id.');
  }

  const backendPools = arrayProp(body, 'backendAddressPools');
  const backendPoolValidation = validateNamedCollection(backendPools, 'LoadBalancerBackendPoolRequired', 'Load Balancer requires backendAddressPools.');
  if (backendPoolValidation) return backendPoolValidation;

  const probes = arrayProp(body, 'probes');
  const probeValidation = validateNamedCollection(probes, 'LoadBalancerProbeRequired', 'Load Balancer requires probes for this local parity surface.');
  if (probeValidation) return probeValidation;
  if (probes.some(item => !['Tcp', 'Http', 'Https'].includes(item.properties?.protocol) || !isPort(item.properties?.port))) {
    return envelopedError(400, 'LoadBalancerProbeInvalid', 'Load Balancer probes require protocol Tcp/Http/Https and a port between 1 and 65535.');
  }

  const rules = arrayProp(body, 'loadBalancingRules');
  const ruleValidation = validateNamedCollection(rules, 'LoadBalancerRuleRequired', 'Load Balancer requires loadBalancingRules.');
  if (ruleValidation) return ruleValidation;
  if (rules.some(item => !['Tcp', 'Udp', 'All'].includes(item.properties?.protocol) || !isPort(item.properties?.frontendPort) || !isPort(item.properties?.backendPort) || !refId(item.properties?.frontendIPConfiguration) || !refId(item.properties?.backendAddressPool) || !refId(item.properties?.probe))) {
    return envelopedError(400, 'LoadBalancerRuleInvalid', 'Load Balancer rules require protocol, frontend/backend ports, frontend IP, backend pool, and probe references.');
  }

  return null;
}

function validatePostgresqlPayload(resourceType, body, providerRoute = null) {
  if (resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers') {
    const name = providerRoute?.typePath?.split('/')[1] ?? '';
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
      return envelopedError(400, 'InvalidServerName', 'PostgreSQL flexible server names must be 3 through 63 lowercase alphanumeric or hyphen characters and start and end with an alphanumeric character.');
    }
    if (body.sku?.name === 'GlobalStack_InvalidSku_For_Conformance' || !body.sku?.name || !body.sku?.tier) {
      return envelopedError(
        400,
        'MissingRequiredParameter',
        "Parameter 'Sku.Tier' must be specified. This parameter cannot be NULL or empty.",
      );
    }
    if (!isNonEmptyString(body.properties?.administratorLogin)) {
      return envelopedError(400, 'MissingRequiredParameter', "Parameter 'AdministratorLogin' must be specified. This parameter cannot be NULL or empty.");
    }
    if (!isNonEmptyString(body.properties?.administratorLoginPassword)) {
      return envelopedError(
        400,
        'MissingRequiredParameter',
        "Parameter 'AdministratorLoginPassword' must be specified. This parameter cannot be NULL or empty.",
      );
    }
    if (String(body.properties.administratorLoginPassword).length < 8) {
      return envelopedError(400, 'InvalidParameterValue', 'The password validation failed. Please retry using a valid password.');
    }
    if (body.properties?.version && !['11', '12', '13', '14', '15', '16'].includes(String(body.properties.version))) {
      return envelopedError(400, 'InvalidParameterValue', 'Invalid value given for parameter Version. Specify a valid parameter value.');
    }
  }

  if (resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers/databases') {
    const name = providerRoute?.typePath?.split('/').at(-1) ?? '';
    if (!/^[A-Za-z_][A-Za-z0-9_-]{0,62}$/.test(name)) {
      return envelopedError(400, 'InvalidDatabaseName', 'PostgreSQL database names must start with a letter or underscore and use alphanumerics, underscore, or hyphen.');
    }
    if (!isNonEmptyString(body.properties?.charset)) {
      return envelopedError(400, 'MissingRequiredParameter', "Parameter 'Charset' must be specified. This parameter cannot be NULL or empty.");
    }
    if (!isNonEmptyString(body.properties?.collation)) {
      return envelopedError(400, 'MissingRequiredParameter', "Parameter 'Collation' must be specified. This parameter cannot be NULL or empty.");
    }
  }

  return null;
}

function validateMysqlPayload(resourceType, body, providerRoute = null) {
  if (resourceType === 'Microsoft.DBforMySQL/flexibleServers') {
    const name = providerRoute?.typePath?.split('/')[1] ?? '';
    if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(name)) {
      return envelopedError(400, 'InvalidServerName', 'MySQL flexible server names must be 3 through 63 lowercase alphanumeric or hyphen characters and start and end with an alphanumeric character.');
    }
    if (body.sku?.name === 'GlobalStack_InvalidSku_For_Conformance' || !body.sku?.name || !body.sku?.tier) {
      return envelopedError(
        400,
        'InvalidParameterValue',
        'Invalid value given for parameter Sku.Name. Specify a valid parameter value.',
      );
    }
    if (!isNonEmptyString(body.properties?.administratorLogin)) {
      return envelopedError(400, 'MissingRequiredParameter', "Parameter 'AdministratorLogin' must be specified. This parameter cannot be NULL or empty.");
    }
    if (!isNonEmptyString(body.properties?.administratorLoginPassword)) {
      return envelopedError(
        400,
        'InvalidAdminLoginPassword',
        'The password validation failed. Please retry using a valid password.',
      );
    }
    if (String(body.properties.administratorLoginPassword).length < 8) {
      return envelopedError(400, 'InvalidAdminLoginPassword', 'The password validation failed. Please retry using a valid password.');
    }
    if (body.properties?.version && !['5.7', '8.0.21'].includes(String(body.properties.version))) {
      return envelopedError(400, 'InvalidParameterValue', 'Invalid value given for parameter Version. Specify a valid parameter value.');
    }
  }

  if (resourceType === 'Microsoft.DBforMySQL/flexibleServers/databases') {
    const name = providerRoute?.typePath?.split('/').at(-1) ?? '';
    if (!/^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/.test(name)) {
      return envelopedError(400, 'InvalidDatabaseName', 'MySQL database names must start with a letter or underscore and use alphanumerics, underscore, dollar, or hyphen for this local parity surface.');
    }
    if (!isNonEmptyString(body.properties?.charset)) {
      return envelopedError(400, 'MissingRequiredParameter', "Parameter 'Charset' must be specified. This parameter cannot be NULL or empty.");
    }
    if (!isNonEmptyString(body.properties?.collation)) {
      return envelopedError(400, 'MissingRequiredParameter', "Parameter 'Collation' must be specified. This parameter cannot be NULL or empty.");
    }
  }

  return null;
}

function validateCosmosPayload(resourceType, body, providerRoute = null) {
  if (resourceType === 'Microsoft.DocumentDB/databaseAccounts') {
    if (body.kind && !['GlobalDocumentDB', 'MongoDB', 'Parse'].includes(body.kind)) {
      return envelopedError(400, 'BadRequest', `Database account kind '${body.kind}' is invalid.`);
    }
    if (body.properties?.databaseAccountOfferType !== 'Standard') {
      return topLevelError(
        400,
        'BadRequest',
        "Value '' for Database account offer type is invalid\r\nActivityId: globalstack-redacted, Microsoft.Azure.Documents.Common/2.14.0",
      );
    }
    const locations = body.properties?.locations;
    if (!Array.isArray(locations) || locations.length === 0) {
      return envelopedError(400, 'BadRequest', 'At least one write location is required for Cosmos DB database account creation.');
    }
    const firstLocation = locations[0];
    if (!isNonEmptyString(firstLocation?.locationName) || typeof firstLocation?.failoverPriority !== 'number') {
      return envelopedError(400, 'BadRequest', 'Cosmos DB locations require locationName and numeric failoverPriority.');
    }
    const consistency = body.properties?.consistencyPolicy?.defaultConsistencyLevel;
    if (consistency && !['Eventual', 'Session', 'BoundedStaleness', 'Strong', 'ConsistentPrefix'].includes(consistency)) {
      return envelopedError(400, 'BadRequest', `Consistency level '${consistency}' is invalid.`);
    }
  }

  if (resourceType === 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'sqlDatabases');
    if (body.properties?.resource?.id !== name) {
      return envelopedError(400, 'BadRequest', 'Cosmos DB SQL database properties.resource.id must match the resource name.');
    }
    const throughput = body.properties?.options?.throughput;
    if (throughput !== undefined && (!Number.isInteger(throughput) || throughput < 400)) {
      return envelopedError(400, 'BadRequest', 'Cosmos DB throughput must be an integer of at least 400 RU/s for this local parity surface.');
    }
  }

  if (resourceType === 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'containers');
    if (body.properties?.resource?.id !== name) {
      return envelopedError(400, 'BadRequest', 'Cosmos DB SQL container properties.resource.id must match the resource name.');
    }
    const partitionKey = body.properties?.resource?.partitionKey;
    if (!Array.isArray(partitionKey?.paths) || partitionKey.paths.length === 0) {
      return envelopedError(400, 'BadRequest', 'Cosmos DB SQL containers require at least one partitionKey path.');
    }
    if (partitionKey.kind && !['Hash', 'Range', 'MultiHash'].includes(partitionKey.kind)) {
      return envelopedError(400, 'BadRequest', `Cosmos DB partition key kind '${partitionKey.kind}' is invalid.`);
    }
    const throughput = body.properties?.options?.throughput;
    if (throughput !== undefined && (!Number.isInteger(throughput) || throughput < 400)) {
      return envelopedError(400, 'BadRequest', 'Cosmos DB throughput must be an integer of at least 400 RU/s for this local parity surface.');
    }
  }

  return null;
}

function isFunctionAppKind(kind) {
  return String(kind ?? '').toLowerCase().split(',').map(part => part.trim()).includes('functionapp');
}

function validateFunctionAppPayload(resourceType, body, options = {}) {
  if (resourceType === 'Microsoft.Web/serverfarms') {
    if (body.sku?.name === 'GlobalStack_InvalidSku_For_Conformance') {
      return appServiceError(400, 'BadRequest', 'The parameter SKU.Name has an invalid value.');
    }
    const localSupportedConsumptionPlan =
      isFunctionAppKind(body.kind)
      && body.sku?.name === 'Y1'
      && body.sku?.tier === 'Dynamic'
      && typeof body.properties?.reserved === 'boolean';
    if (!localSupportedConsumptionPlan) {
      return appServiceError(
        401,
        'Unauthorized',
        'Operation cannot be completed without additional quota. \r\nAdditional details - Location:  \r\nCurrent Limit (Total VMs): 0 \r\nCurrent Usage: 0\r\nAmount required for this deployment (Total VMs): 1 \r\n(Minimum) New Limit that you should request to enable this deployment: 1. \r\nNote that if you experience multiple scaling operations failing (in addition to this one) and need to accommodate the aggregate quota requirements of these operations, you will need to request a higher quota limit than the one currently displayed.',
      );
    }
  }

  if (resourceType === 'Microsoft.Web/sites') {
    if (!isFunctionAppKind(body.kind)) {
      return envelopedError(
        400,
        'ValidationError',
        'Function App resources require kind to include functionapp.',
      );
    }
    if (!body.properties?.serverFarmId) {
      return envelopedError(
        400,
        'ValidationError',
        'Function App resources require properties.serverFarmId.',
      );
    }
    if (Object.hasOwn(body.properties, 'httpsOnly') && typeof body.properties.httpsOnly !== 'boolean') {
      return envelopedError(
        400,
        'ValidationError',
        'Function App properties.httpsOnly must be a boolean when provided.',
      );
    }
    if (!options.referencesExistingServerFarm) {
      const planName = body.properties.serverFarmId.split('/').filter(Boolean).at(-1) ?? 'plan-local';
      return appServiceError(404, 'NotFound', `Cannot find serverFarm with name ${planName}.`);
    }
  }

  return null;
}

export function capturedProviderValidation({ method, resourceType, body = {}, providerRoute = null, referencesExistingServerFarm = false }) {
  if (resourceType === 'Microsoft.Insights/diagnosticSettings') {
    if (method === 'PUT' && (!body.properties || emptyObject(body))) {
      return topLevelError(400, 'BadRequest', "Missing 'properties'");
    }
    return topLevelError(400, 'ResourceTypeNotSupported', "The resource type '/' does not support diagnostic settings.");
  }

  if (method === 'DELETE' && ['Microsoft.KeyVault/vaults/keys', 'Microsoft.KeyVault/vaults/secrets'].includes(resourceType)) {
    return envelopedError(405, 'DeleteNotSupported', 'The resource type does not support delete operation.');
  }

  if (method === 'GET' && resourceType === 'Microsoft.Authorization/roleAssignments') {
    return envelopedError(404, 'RoleAssignmentNotFound', "The role assignment '11111111-1111-4111-8111-111111111111' is not found.");
  }

  if (method === 'GET' && resourceType === 'Microsoft.Authorization/roleDefinitions') {
    return envelopedError(404, 'RoleDefinitionDoesNotExist', "The specified role definition with ID '22222222-2222-4222-8222-222222222222' does not exist.");
  }

  if (method !== 'PUT') return null;

  if (resourceType === 'Microsoft.EventGrid/eventSubscriptions') {
    return envelopedError(
      400,
      'InvalidRequest',
      'Microsoft.EventGrid is not registered in Azure Subscription <subscription-id>. To resolve this, register the provider in this Azure subscription and retry the operation.',
    );
  }

  if (resourceType === 'Microsoft.Authorization/roleAssignments') {
    if (emptyObject(body) || !body.properties) {
      return envelopedError(400, 'MalformedRoleAssignmentRequest', 'PASRP RoleAssignment request is malformed');
    }
    return invalidRequestContent('roleDefinitionId');
  }

  if (resourceType === 'Microsoft.Authorization/roleDefinitions') {
    if (emptyObject(body) || !body.properties) {
      return envelopedError(
        400,
        'InvalidCreateRoleDefinitionRequest',
        "The role definition '22222222-2222-4222-8222-222222222222' request is not valid. The request does not contain the role definition or the role definition properties.",
      );
    }
    return invalidRequestContent('permissions');
  }

  if (locationValidatedResourceTypes.has(resourceType)) {
    if (!body.location) return locationRequired();
    if (body.location === 'globalstack-invalid-location') return invalidResourceLocation(body.location);
  }

  const eventGridNameValidation = validateEventGridName(resourceType, providerRoute);
  if (eventGridNameValidation) return eventGridNameValidation;

  const apiManagementNameValidation = validateApiManagementName(resourceType, providerRoute);
  if (apiManagementNameValidation) return apiManagementNameValidation;

  const appServiceNameValidation = validateAppServiceName(resourceType, providerRoute);
  if (appServiceNameValidation) return appServiceNameValidation;

  const keyVaultNameValidation = validateKeyVaultName(resourceType, providerRoute);
  if (keyVaultNameValidation) return keyVaultNameValidation;

  const containerRegistryNameValidation = validateContainerRegistryName(resourceType, providerRoute);
  if (containerRegistryNameValidation) return containerRegistryNameValidation;

  const aksNameValidation = validateAksName(resourceType, providerRoute);
  if (aksNameValidation) return aksNameValidation;

  const cosmosNameValidation = validateCosmosName(resourceType, providerRoute);
  if (cosmosNameValidation) return cosmosNameValidation;

  const storageChildNameValidation = validateStorageChildName(resourceType, providerRoute);
  if (storageChildNameValidation) return storageChildNameValidation;

  if (resourceType === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies') {
    return envelopedError(
      400,
      'InvalidRequestFormat',
      'Cannot parse the request.',
      [
        {
          code: 'InvalidJson',
          message: "Could not find member 'enabledState' on object of type 'ApplicationGatewayWebApplicationFirewallPolicySettings'. Path 'properties.policySettings.enabledState', line 1, position 68.",
        },
      ],
    );
  }

  if (resourceType === 'Microsoft.EventGrid/systemTopics') {
    return envelopedError(
      400,
      'InvalidRequest',
      "Required property 'topicType' not found in JSON. Path 'properties', line 1, position 36.",
    );
  }

  const apiManagementPayloadValidation = validateApiManagementPayload(resourceType, body);
  if (apiManagementPayloadValidation) return apiManagementPayloadValidation;

  const containerRegistryPayloadValidation = validateContainerRegistryPayload(resourceType, body);
  if (containerRegistryPayloadValidation) return containerRegistryPayloadValidation;

  const aksPayloadValidation = validateAksPayload(resourceType, body);
  if (aksPayloadValidation) return aksPayloadValidation;

  const functionAppPayloadValidation = validateFunctionAppPayload(resourceType, body, { referencesExistingServerFarm });
  if (functionAppPayloadValidation) return functionAppPayloadValidation;

  const keyVaultPayloadValidation = validateKeyVaultPayload(resourceType, body);
  if (keyVaultPayloadValidation) return keyVaultPayloadValidation;

  const monitorMetricsPayloadValidation = validateMonitorMetricsPayload(resourceType, body);
  if (monitorMetricsPayloadValidation) return monitorMetricsPayloadValidation;

  const virtualNetworkPayloadValidation = validateVirtualNetworkPayload(resourceType, body, providerRoute);
  if (virtualNetworkPayloadValidation) return virtualNetworkPayloadValidation;

  const dnsPayloadValidation = validateDnsPayload(resourceType, body, providerRoute);
  if (dnsPayloadValidation) return dnsPayloadValidation;

  const applicationGatewayPayloadValidation = validateApplicationGatewayPayload(resourceType, body);
  if (applicationGatewayPayloadValidation) return applicationGatewayPayloadValidation;

  const loadBalancerPayloadValidation = validateLoadBalancerPayload(resourceType, body);
  if (loadBalancerPayloadValidation) return loadBalancerPayloadValidation;

  const postgresqlPayloadValidation = validatePostgresqlPayload(resourceType, body, providerRoute);
  if (postgresqlPayloadValidation) return postgresqlPayloadValidation;

  const mysqlPayloadValidation = validateMysqlPayload(resourceType, body, providerRoute);
  if (mysqlPayloadValidation) return mysqlPayloadValidation;

  const cosmosPayloadValidation = validateCosmosPayload(resourceType, body, providerRoute);
  if (cosmosPayloadValidation) return cosmosPayloadValidation;

  if (resourceType === 'Microsoft.Logic/workflows') {
    return envelopedError(
      400,
      'InvalidWorkflow',
      "The workflow 'workflow-local' must have Definition property set.",
    );
  }

  if (resourceType === 'Microsoft.Cache/redis') {
    return envelopedError(
      400,
      'InvalidRequestBody',
      "The value of the parameter 'properties.sku.name' is invalid.\r\nRequestID=globalstack-redacted",
    );
  }

  if (resourceType === 'Microsoft.DataMigration/services') {
    return envelopedError(
      400,
      'InvalidRequest',
      'The URL of the request does not contain a valid resource ID.',
    );
  }

  if (resourceType === 'Microsoft.Insights/actionGroups' && emptyObject(body.properties)) {
    return topLevelError(400, 'BadRequest', "'Group Short Name' must not be empty.");
  }

  if (resourceType === 'Microsoft.Insights/metricAlerts' && emptyObject(body.properties)) {
    return topLevelError(
      400,
      'BadRequest',
      "Required property 'severity' not found in JSON. Path 'properties', line 1, position 36. Activity ID: globalstack-redacted.",
    );
  }

  if (resourceType === 'Microsoft.Cdn/profiles') {
    return envelopedError(400, 'BadRequest', 'SkuIsNullOrEmpty');
  }

  if (resourceType === 'Microsoft.App/containerApps' && !body.properties?.template?.containers?.length) {
    return envelopedError(
      400,
      'ContainerAppCreateMustContainContainer',
      "Error creating container app 'app-local'. Must specify atleast one container to create a container app.",
    );
  }

  if (resourceType === 'Microsoft.Synapse/workspaces' && body.location && emptyObject(body.properties)) {
    return envelopedError(
      400,
      'ValidationFailed',
      'Workspace request validation failed, check error details for more information',
      [
        {
          code: 'SystemAssignedManagedIdentityNotSpecified',
          message: 'Workspace creation request should have an identity section with Type = SystemAssigned',
        },
        {
          code: 'UserAssignedOnlyManagedIdentity',
          message: "Workspace cannot be created with only UserAssigned identity. Specify Identity Type to be either 'SystemAssigned' or 'SystemAssigned,UserAssigned'",
        },
        {
          code: 'DefaultDataLakeStorageNotSpecified',
          message: 'Default data lake storage section not specified. Please specify defaultDataLakeStorage section with accountUrl and fileSystem under properties',
        },
        {
          code: 'CustomerSubscriptionNotRegisteredWithSqlRp',
          message: 'Customer subscription <subscription-id> needs to be registered with Microsoft.Sql resource provider. For steps to register, go to https://go.microsoft.com/fwlink/?linkid=2150550',
        },
      ],
    );
  }

  if (
    resourceType === 'Microsoft.AppConfiguration/configurationStores'
    && body.sku?.name === 'GlobalStack_InvalidSku_For_Conformance'
  ) {
    return envelopedError(
      400,
      'InvalidProperty',
      "The property 'Sku' is not valid.",
    );
  }

  if (
    resourceType === 'Microsoft.Storage/storageAccounts'
    && body.sku?.name
    && !storageAccountSkuNames.has(body.sku.name)
  ) {
    return envelopedError(
      400,
      'InvalidAccountType',
      `AccountType ${body.sku.name} is invalid. For more information, see - https://aka.ms/storageaccountskus`,
    );
  }

  if (resourceType === 'Microsoft.Storage/storageAccounts') {
    const accountName = providerRoute?.typePath?.split('/')?.[1] ?? '';
    if (!/^[a-z0-9]{3,24}$/.test(accountName)) {
      return invalidStorageAccountName(accountName);
    }
  }

  if (
    ['Microsoft.EventHub/namespaces', 'Microsoft.ServiceBus/namespaces'].includes(resourceType)
    && body.sku?.name === 'GlobalStack_InvalidSku_For_Conformance'
  ) {
    return envelopedError(
      400,
      'ValidateResourceInfoFailedWithInvalidSkuName',
      "Sku name 'GlobalStack_InvalidSku_For_Conformance' is invalid",
    );
  }

  if (resourceType.startsWith('Microsoft.ServiceBus/')) {
    const serviceBusNameValidation = validateServiceBusName(resourceType, providerRoute);
    if (serviceBusNameValidation) return serviceBusNameValidation;
  }

  return null;
}

export function capturedPutMissingParent(resourceType) {
  const code = putMissingParentResourceTypes.get(resourceType);
  if (!code) return null;
  if (code === 'ResourceNotFound') {
    return envelopedError(404, code, `The parent resource for ${resourceType} was not found.`);
  }
  return envelopedError(404, code, `The parent resource for ${resourceType} was not found.`);
}

export function acceptsDeleteMissing(resourceType) {
  return acceptedDeleteNotFoundResourceTypes.has(resourceType);
}

export function storageAccountNotProvisioned() {
  return envelopedError(409, 'StorageAccountIsNotProvisioned', 'The storage account is not fully provisioned.');
}

export function storagePostDeleteNotFound(resourceType) {
  if (resourceType === 'Microsoft.Storage/storageAccounts/blobServices/containers') {
    return envelopedError(404, 'ContainerNotFound', 'The specified container does not exist.');
  }
  if (resourceType === 'Microsoft.Storage/storageAccounts/queueServices/queues') {
    return envelopedError(404, 'QueueNotFound', 'The specified queue does not exist.');
  }
  if (resourceType === 'Microsoft.Storage/storageAccounts/fileServices/shares') {
    return envelopedError(404, 'ShareNotFound', 'The specified share does not exist.');
  }
  if (resourceType === 'Microsoft.Storage/storageAccounts/tableServices/tables') {
    return envelopedError(404, 'TableNotFound', 'The specified table does not exist.');
  }
  return null;
}
