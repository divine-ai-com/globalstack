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
  ['Microsoft.EventHub/namespaces/eventhubs', 'ParentResourceNotFound'],
  ['Microsoft.KeyVault/vaults/keys', 'ParentResourceNotFound'],
  ['Microsoft.KeyVault/vaults/secrets', 'ParentResourceNotFound'],
  ['Microsoft.NetApp/netAppAccounts/capacityPools/volumes', 'ParentResourceNotFound'],
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

  if (resourceType === 'Microsoft.Network/applicationGateways') {
    return envelopedError(
      400,
      'SubnetIsRequired',
      'Subnet reference is required for ipconfiguration Application gateway subnet is required.',
    );
  }

  if (resourceType === 'Microsoft.Network/virtualNetworks' && emptyObject(body.properties)) {
    return envelopedError(
      400,
      'NoAddressPrefixOrPoolProvided',
      `Address prefix and ipam pool reference are both empty/null in request payload of resource ${providerRoute?.typePath ?? 'virtualNetworks'}. Please provide either address prefix or ipam pool reference.`,
    );
  }

  if (resourceType === 'Microsoft.Network/privateEndpoints' && emptyObject(body.properties)) {
    return envelopedError(
      400,
      'MissingParameterOnPrivateEndpoint',
      `Private endpoint ${providerRoute?.typePath ?? 'privateEndpoints'} is missing required parameter 'private link service connection.'.`,
    );
  }

  if (resourceType === 'Microsoft.DBforPostgreSQL/flexibleServers') {
    if (body.sku?.name === 'GlobalStack_InvalidSku_For_Conformance') {
      return envelopedError(
        400,
        'MissingRequiredParameter',
        "Parameter 'Sku.Tier' must be specified. This parameter cannot be NULL or empty.",
      );
    }
    return envelopedError(
      400,
      'MissingRequiredParameter',
      "Parameter 'AdministratorLoginPassword' must be specified. This parameter cannot be NULL or empty.",
    );
  }

  if (resourceType === 'Microsoft.DBforMySQL/flexibleServers') {
    if (body.sku?.name === 'GlobalStack_InvalidSku_For_Conformance') {
      return envelopedError(
        400,
        'InvalidParameterValue',
        'Invalid value given for parameter Sku.Name. Specify a valid parameter value.',
      );
    }
    return envelopedError(
      400,
      'InvalidAdminLoginPassword',
      'The password validation failed. Please retry using a valid password.',
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
    resourceType === 'Microsoft.DocumentDB/databaseAccounts'
    && body.location
    && emptyObject(body.properties)
  ) {
    return topLevelError(
      400,
      'BadRequest',
      "Value '' for Database account offer type is invalid\r\nActivityId: globalstack-redacted, Microsoft.Azure.Documents.Common/2.14.0",
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
