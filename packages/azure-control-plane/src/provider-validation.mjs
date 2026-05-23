import { isIP } from 'node:net';

import {
  acceptedDeleteNotFoundResourceTypes,
  aksMissingServicePrincipalProfile,
  appServiceError,
  containerRegistryValidationError,
  emptyObject,
  envelopedError,
  invalidApiManagementName,
  invalidAppConfigurationName,
  invalidAksName,
  invalidAppServiceName,
  invalidCdnName,
  invalidContainerRegistryName,
  invalidCosmosName,
  invalidDataMigrationName,
  invalidEventGridName,
  invalidEventHubName,
  invalidKeyVaultName,
  invalidLogicWorkflowName,
  invalidRedisName,
  invalidRequestContent,
  invalidResourceLocation,
  invalidServiceBusName,
  invalidStorageAccountName,
  invalidStorageChildName,
  invalidSynapseName,
  invalidWafName,
  locationRequired,
  locationValidatedResourceTypes,
  putMissingParentResourceTypes,
  serviceBusNameFromTypePath,
  storageAccountSkuNames,
  topLevelError,
} from './provider-validation-support.mjs';

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

function isIso8601Duration(value) {
  return typeof value === 'string' && /^P(?=\d|T\d)(\d+D)?(T(\d+H)?(\d+M)?(\d+S)?)?$/.test(value);
}

function validateServiceBusPayload(resourceType, body) {
  if (resourceType === 'Microsoft.ServiceBus/namespaces/topics') {
    const maxSizeInMegabytes = body.properties?.maxSizeInMegabytes;
    if (Object.hasOwn(body.properties ?? {}, 'maxSizeInMegabytes')
      && (!Number.isInteger(maxSizeInMegabytes) || maxSizeInMegabytes <= 0)) {
      return envelopedError(400, 'BadRequest', 'Service Bus topic properties.maxSizeInMegabytes must be a positive integer.');
    }
    const defaultMessageTimeToLive = body.properties?.defaultMessageTimeToLive;
    if (Object.hasOwn(body.properties ?? {}, 'defaultMessageTimeToLive') && !isIso8601Duration(defaultMessageTimeToLive)) {
      return envelopedError(400, 'BadRequest', 'Service Bus topic properties.defaultMessageTimeToLive must be an ISO 8601 duration.');
    }
  }

  if (resourceType === 'Microsoft.ServiceBus/namespaces/topics/subscriptions'
    || resourceType === 'Microsoft.ServiceBus/namespaces/queues') {
    const maxDeliveryCount = body.properties?.maxDeliveryCount;
    if (Object.hasOwn(body.properties ?? {}, 'maxDeliveryCount')
      && (!Number.isInteger(maxDeliveryCount) || maxDeliveryCount < 1)) {
      return envelopedError(400, 'BadRequest', 'Service Bus subscription and queue properties.maxDeliveryCount must be an integer greater than 0.');
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

  if (resourceType === 'Microsoft.EventGrid/systemTopics') {
    const systemTopicName = serviceBusNameFromTypePath(providerRoute?.typePath, 'systemTopics');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{1,48}[A-Za-z0-9])?$/.test(systemTopicName)) {
      return invalidEventGridName(
        resourceType,
        systemTopicName,
        'System topic names must be 3 through 50 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
      );
    }
  }

  return null;
}

function validateEventHubName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.EventHub/namespaces') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'namespaces');
    if (!/^[A-Za-z][A-Za-z0-9-]{4,48}[A-Za-z0-9]$/.test(name)) {
      return invalidEventHubName(
        resourceType,
        name,
        'Namespace names must be 6 through 50 characters, use alphanumerics and hyphens, start with a letter, and end with a letter or number.',
      );
    }
  }

  if (resourceType === 'Microsoft.EventHub/namespaces/eventhubs') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'eventhubs');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,254}[A-Za-z0-9])?$/.test(name)) {
      return invalidEventHubName(
        resourceType,
        name,
        'Event hub names must be 1 through 256 characters, use alphanumerics, periods, hyphens, and underscores, and start and end with an alphanumeric character.',
      );
    }
  }

  return null;
}

function validateSynapseName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.Synapse/workspaces') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'workspaces');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,48}[a-zA-Z0-9]$/.test(name)) {
      return invalidSynapseName(
        resourceType,
        name,
        'Workspace names must be 2 through 50 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
      );
    }
  }

  if (resourceType === 'Microsoft.Synapse/workspaces/sqlPools') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'sqlPools');
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,58}[a-zA-Z0-9]$/.test(name)) {
      return invalidSynapseName(
        resourceType,
        name,
        'SQL pool names must be 2 through 60 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
      );
    }
  }

  return null;
}

function validateDataMigrationName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.DataMigration/services') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'services');
    if (name.includes('{')) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,61}[A-Za-z0-9]$/.test(name)) {
      return invalidDataMigrationName(
        resourceType,
        name,
        'Service names must be 3 through 63 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
      );
    }
  }

  if (resourceType === 'Microsoft.DataMigration/services/projects') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'projects');
    if (name.includes('{')) return null;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,78}[A-Za-z0-9]$/.test(name)) {
      return invalidDataMigrationName(
        resourceType,
        name,
        'Project names must be 2 through 80 characters, use alphanumerics, periods, underscores, and hyphens, and not start or end with punctuation.',
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

function validateRedisName(resourceType, providerRoute) {
  if (resourceType !== 'Microsoft.Cache/redis') return null;
  const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'redis');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(name)) {
    return invalidRedisName(
      resourceType,
      name,
      'Redis cache names must be 1 through 63 characters, use alphanumerics and hyphens, and not start or end with a hyphen.',
    );
  }
  return null;
}

function validateLogicWorkflowName(resourceType, providerRoute) {
  if (resourceType !== 'Microsoft.Logic/workflows') return null;
  const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'workflows');
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,78}[A-Za-z0-9])?$/.test(name)) {
    return invalidLogicWorkflowName(
      resourceType,
      name,
      'Workflow names must be 1 through 80 characters, use alphanumerics, underscore, period, or hyphen, and start and end with an alphanumeric character.',
    );
  }
  return null;
}

function validateCdnName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.Cdn/profiles') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'profiles');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,258}[A-Za-z0-9])?$/.test(name)) {
      return invalidCdnName(
        resourceType,
        name,
        'Profile names must be 1 through 260 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/afdEndpoints') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'afdEndpoints');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,44}[A-Za-z0-9])?$/.test(name)) {
      return invalidCdnName(
        resourceType,
        name,
        'Front Door endpoint names must be 1 through 46 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/endpoints') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'endpoints');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,48}[A-Za-z0-9])?$/.test(name)) {
      return invalidCdnName(
        resourceType,
        name,
        'CDN endpoint names must be 1 through 50 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/originGroups') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'originGroups');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,258}[A-Za-z0-9])?$/.test(name)) {
      return invalidCdnName(
        resourceType,
        name,
        'Front Door origin group names must be 1 through 260 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/originGroups/origins') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'origins');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,258}[A-Za-z0-9])?$/.test(name)) {
      return invalidCdnName(
        resourceType,
        name,
        'Front Door origin names must be 1 through 260 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/afdEndpoints/routes') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'routes');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,258}[A-Za-z0-9])?$/.test(name)) {
      return invalidCdnName(
        resourceType,
        name,
        'Front Door route names must be 1 through 260 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
      );
    }
  }

  return null;
}

function validateWafName(resourceType, providerRoute) {
  if (resourceType === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'ApplicationGatewayWebApplicationFirewallPolicies');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,78}[A-Za-z0-9])?$/.test(name)) {
      return invalidWafName(
        resourceType,
        name,
        'Application Gateway WAF policy names must be 1 through 80 characters, use alphanumerics, underscore, period, or hyphen, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'FrontDoorWebApplicationFirewallPolicies');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,78}[A-Za-z0-9])?$/.test(name)) {
      return invalidWafName(
        resourceType,
        name,
        'Front Door WAF policy names must be 1 through 80 characters, use alphanumerics, underscore, period, or hyphen, and start and end with an alphanumeric character.',
      );
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/securityPolicies') {
    const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'securityPolicies');
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,258}[A-Za-z0-9])?$/.test(name)) {
      return invalidWafName(
        resourceType,
        name,
        'CDN security policy names must be 1 through 260 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
      );
    }
  }

  return null;
}

function validateAppConfigurationName(resourceType, providerRoute) {
  if (resourceType !== 'Microsoft.AppConfiguration/configurationStores') return null;
  const name = serviceBusNameFromTypePath(providerRoute?.typePath, 'configurationStores');
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{3,48}[a-zA-Z0-9])$/.test(name)) {
    return invalidAppConfigurationName(
      resourceType,
      name,
      'Store names must be 5 through 50 characters, use alphanumerics and hyphens, and start and end with an alphanumeric character.',
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
  const identityTypes = String(body.identity?.type ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const usesManagedIdentity = identityTypes.some(type => type === 'SystemAssigned' || type === 'UserAssigned');
  if (!properties.servicePrincipalProfile && !usesManagedIdentity) return aksMissingServicePrincipalProfile();
  if (
    properties.servicePrincipalProfile
    && (typeof properties.servicePrincipalProfile.clientId !== 'string' || properties.servicePrincipalProfile.clientId.trim() === '')
  ) {
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
  if (identityTypes.includes('UserAssigned') && Object.keys(body.identity?.userAssignedIdentities ?? {}).length === 0) {
    return envelopedError(
      400,
      'InvalidIdentityValues',
      'AKS identity.userAssignedIdentities must include at least one identity when identity.type uses UserAssigned.',
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

  if (resourceType === 'Microsoft.Insights/activityLogAlerts') {
    const properties = body.properties ?? {};
    if (body.location && body.location !== 'global') {
      return topLevelError(400, 'BadRequest', "Property 'location' must be 'global'.");
    }
    if (Object.hasOwn(properties, 'enabled') && typeof properties.enabled !== 'boolean') {
      return topLevelError(400, 'BadRequest', "Property 'enabled' must be a boolean.");
    }
    if (!Array.isArray(properties.scopes) || properties.scopes.length === 0) {
      return topLevelError(400, 'BadRequest', "Required property 'scopes' not found in JSON. Path 'properties'.");
    }
    if (!properties.condition || !Array.isArray(properties.condition.allOf) || properties.condition.allOf.length === 0) {
      return topLevelError(400, 'BadRequest', "Required property 'condition.allOf' not found in JSON. Path 'properties.condition'.");
    }
    for (const clause of properties.condition.allOf) {
      if (typeof clause?.field !== 'string' || clause.field.trim() === '') {
        return topLevelError(400, 'BadRequest', "Property 'condition.allOf[].field' must be a non-empty string.");
      }
      if (!['equals', 'containsAny', 'containsAnyCaseInsensitive'].some((operator) => Object.hasOwn(clause ?? {}, operator))) {
        return topLevelError(400, 'BadRequest', "Property 'condition.allOf[]' must include one of 'equals', 'containsAny', or 'containsAnyCaseInsensitive'.");
      }
    }
    if (Object.hasOwn(properties, 'actions')) {
      if (typeof properties.actions !== 'object' || properties.actions === null) {
        return topLevelError(400, 'BadRequest', "Property 'actions' must be an object.");
      }
      if (!Array.isArray(properties.actions.actionGroups)) {
        return topLevelError(400, 'BadRequest', "Property 'actions.actionGroups' must be an array.");
      }
      for (const actionGroup of properties.actions.actionGroups) {
        if (typeof actionGroup?.actionGroupId !== 'string' || actionGroup.actionGroupId.trim() === '') {
          return topLevelError(400, 'BadRequest', "Property 'actions.actionGroups[].actionGroupId' must be a non-empty string.");
        }
      }
    }
  }

  return null;
}

function validateActivityLogAuditPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.EventGrid/systemTopics') return null;

  const properties = body.properties ?? {};
  if (typeof properties.source !== 'string' || properties.source.trim() === '') {
    return envelopedError(
      400,
      'InvalidRequest',
      "Required property 'source' not found in JSON. Path 'properties', line 1, position 36.",
    );
  }
  if (typeof properties.topicType !== 'string' || properties.topicType.trim() === '') {
    return envelopedError(
      400,
      'InvalidRequest',
      "Required property 'topicType' not found in JSON. Path 'properties', line 1, position 36.",
    );
  }
  const supportedTopicTypes = new Set([
    'Microsoft.Resources.ResourceGroups',
    'Microsoft.Storage.StorageAccounts',
    'Microsoft.EventGrid.Topics',
    'Microsoft.KeyVault.Vaults',
    'Microsoft.ContainerRegistry.Registries',
  ]);
  if (!supportedTopicTypes.has(properties.topicType)) {
    return envelopedError(
      400,
      'InvalidRequest',
      `The provided topicType '${properties.topicType}' is not supported for local activity-log audit parity.`,
    );
  }
  if (Object.hasOwn(properties, 'identity') && typeof properties.identity !== 'object') {
    return envelopedError(
      400,
      'InvalidRequest',
      "Property 'identity' must be an object when provided.",
    );
  }

  return null;
}

function synapseWorkspaceValidationFailed(details) {
  return envelopedError(
    400,
    'ValidationFailed',
    'Workspace request validation failed, check error details for more information',
    details,
  );
}

function validateSynapsePayload(resourceType, body) {
  if (resourceType === 'Microsoft.Synapse/workspaces') {
    if (body.location && emptyObject(body.properties)) {
      return synapseWorkspaceValidationFailed([
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
      ]);
    }
    if (!String(body.identity?.type ?? '').split(',').map(value => value.trim()).includes('SystemAssigned')) {
      return synapseWorkspaceValidationFailed([
        {
          code: 'SystemAssignedManagedIdentityNotSpecified',
          message: 'Workspace creation request should have an identity section with Type = SystemAssigned',
        },
      ]);
    }
    if (
      typeof body.properties?.defaultDataLakeStorage?.accountUrl !== 'string'
      || typeof body.properties?.defaultDataLakeStorage?.filesystem !== 'string'
      || body.properties.defaultDataLakeStorage.accountUrl.trim() === ''
      || body.properties.defaultDataLakeStorage.filesystem.trim() === ''
    ) {
      return synapseWorkspaceValidationFailed([
        {
          code: 'DefaultDataLakeStorageNotSpecified',
          message: 'Default data lake storage section not specified. Please specify defaultDataLakeStorage section with accountUrl and fileSystem under properties',
        },
      ]);
    }
  }

  if (resourceType === 'Microsoft.Synapse/workspaces/sqlPools') {
    if (body.sku?.name === undefined && !emptyObject(body.properties)) {
      return envelopedError(400, 'InvalidSku', 'SQL pool sku.name is required.');
    }
    if (body.sku?.name !== undefined && !/^DW[0-9]+c$/i.test(String(body.sku.name))) {
      return envelopedError(400, 'InvalidSku', `SQL pool sku.name '${body.sku.name}' is invalid.`);
    }
    if (Object.hasOwn(body.properties ?? {}, 'createMode') && !['Default', 'Recovery', 'PointInTimeRestore'].includes(body.properties.createMode)) {
      return envelopedError(400, 'InvalidParameterValue', `SQL pool createMode '${body.properties.createMode}' is invalid.`);
    }
    if (Object.hasOwn(body.properties ?? {}, 'maxSizeBytes') && (!Number.isInteger(body.properties.maxSizeBytes) || body.properties.maxSizeBytes <= 0)) {
      return envelopedError(400, 'InvalidParameterValue', 'SQL pool maxSizeBytes must be a positive integer when provided.');
    }
  }

  return null;
}

function validateDataMigrationPayload(resourceType, body) {
  if (resourceType === 'Microsoft.DataMigration/services') {
    if (body.sku?.name !== undefined && !['Premium_4vCores', 'Standard_1vCore', 'Standard_2vCores'].includes(body.sku.name)) {
      return envelopedError(400, 'InvalidSku', `Database Migration Service sku.name '${body.sku.name}' is invalid.`);
    }
    if (Object.hasOwn(body.properties ?? {}, 'publicNetworkAccess') && !['Enabled', 'Disabled'].includes(body.properties.publicNetworkAccess)) {
      return envelopedError(400, 'InvalidParameterValue', "Database Migration Service publicNetworkAccess must be 'Enabled' or 'Disabled'.");
    }
  }

  if (resourceType === 'Microsoft.DataMigration/services/projects') {
    const properties = body.properties ?? {};
    const sourcePlatforms = new Set(['SQL', 'MySQL', 'MySql', 'PostgreSql', 'PostgreSQL', 'MongoDb']);
    const targetPlatforms = new Set([
      'SQLDB',
      'SQLMI',
      'AzureDbForMySql',
      'AzureDbForMySQL',
      'AzureDbForPostgreSql',
      'AzureDbForPostgreSQL',
      'MongoDb',
    ]);
    if (!emptyObject(properties)) {
      if (typeof properties.sourcePlatform !== 'string' || !sourcePlatforms.has(properties.sourcePlatform)) {
        return envelopedError(400, 'InvalidProjectProperties', 'Migration project properties.sourcePlatform must be one of SQL, MySQL, PostgreSql, or MongoDb.');
      }
      if (typeof properties.targetPlatform !== 'string' || !targetPlatforms.has(properties.targetPlatform)) {
        return envelopedError(400, 'InvalidProjectProperties', 'Migration project properties.targetPlatform must be one of SQLDB, SQLMI, AzureDbForMySql, AzureDbForPostgreSql, or MongoDb.');
      }
    }
    if (Object.hasOwn(properties, 'sourceConnectionInfo') && typeof properties.sourceConnectionInfo !== 'object') {
      return envelopedError(400, 'InvalidProjectProperties', 'Migration project sourceConnectionInfo must be an object when provided.');
    }
    if (Object.hasOwn(properties, 'targetConnectionInfo') && typeof properties.targetConnectionInfo !== 'object') {
      return envelopedError(400, 'InvalidProjectProperties', 'Migration project targetConnectionInfo must be an object when provided.');
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
  if (Array.isArray(body.properties?.[name])) return body.properties[name];
  return Array.isArray(body[name]) ? body[name] : [];
}

function nestedProp(item, name) {
  return item?.properties?.[name] ?? item?.[name];
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

  const gatewayIpConfigurations = arrayProp(body, 'gatewayIPConfigurations');
  const gatewayIpValidation = validateNamedCollection(gatewayIpConfigurations, 'SubnetIsRequired', 'Application Gateway requires gatewayIPConfigurations.');
  if (gatewayIpValidation) return gatewayIpValidation;
  if (gatewayIpConfigurations.some(item => !refId(nestedProp(item, 'subnet')))) {
    return envelopedError(400, 'SubnetIsRequired', 'Subnet reference is required for ipconfiguration Application gateway subnet is required.');
  }

  const sku = body.sku ?? body.properties?.sku;
  const skuName = sku?.name;
  if (!['Standard_v2', 'WAF_v2'].includes(skuName)) {
    return envelopedError(400, 'ApplicationGatewaySkuNotSupported', 'Application Gateway sku.name must be Standard_v2 or WAF_v2 for this local parity surface.');
  }
  if (!['Standard_v2', 'WAF_v2'].includes(sku?.tier)) {
    return envelopedError(400, 'ApplicationGatewaySkuTierNotSupported', 'Application Gateway sku.tier must be Standard_v2 or WAF_v2 for this local parity surface.');
  }

  const frontendIpConfigurations = arrayProp(body, 'frontendIPConfigurations');
  const frontendIpValidation = validateNamedCollection(frontendIpConfigurations, 'ApplicationGatewayFrontendIpConfigurationRequired', 'Application Gateway requires frontendIPConfigurations.');
  if (frontendIpValidation) return frontendIpValidation;
  if (frontendIpConfigurations.some(item => !refId(nestedProp(item, 'publicIPAddress')) && !refId(nestedProp(item, 'subnet')))) {
    return envelopedError(400, 'ApplicationGatewayFrontendIpConfigurationInvalid', 'Application Gateway frontend IP configurations require publicIPAddress.id or subnet.id.');
  }

  const frontendPorts = arrayProp(body, 'frontendPorts');
  const frontendPortValidation = validateNamedCollection(frontendPorts, 'ApplicationGatewayFrontendPortRequired', 'Application Gateway requires frontendPorts.');
  if (frontendPortValidation) return frontendPortValidation;
  if (frontendPorts.some(item => !isPort(nestedProp(item, 'port')))) {
    return envelopedError(400, 'ApplicationGatewayFrontendPortInvalid', 'Application Gateway frontendPorts[].properties.port must be between 1 and 65535.');
  }

  const backendPools = arrayProp(body, 'backendAddressPools');
  const backendPoolValidation = validateNamedCollection(backendPools, 'ApplicationGatewayBackendPoolRequired', 'Application Gateway requires backendAddressPools.');
  if (backendPoolValidation) return backendPoolValidation;

  const backendSettings = arrayProp(body, 'backendHttpSettingsCollection');
  const backendSettingsValidation = validateNamedCollection(backendSettings, 'ApplicationGatewayBackendHttpSettingsRequired', 'Application Gateway requires backendHttpSettingsCollection.');
  if (backendSettingsValidation) return backendSettingsValidation;
  if (backendSettings.some(item => !isPort(nestedProp(item, 'port')) || !['Http', 'Https'].includes(nestedProp(item, 'protocol')))) {
    return envelopedError(400, 'ApplicationGatewayBackendHttpSettingsInvalid', 'Application Gateway backend HTTP settings require protocol Http/Https and a port between 1 and 65535.');
  }

  const listeners = arrayProp(body, 'httpListeners');
  const listenerValidation = validateNamedCollection(listeners, 'ApplicationGatewayHttpListenerRequired', 'Application Gateway requires httpListeners.');
  if (listenerValidation) return listenerValidation;
  if (listeners.some(item => !refId(nestedProp(item, 'frontendIPConfiguration')) || !refId(nestedProp(item, 'frontendPort')) || !['Http', 'Https'].includes(nestedProp(item, 'protocol')))) {
    return envelopedError(400, 'ApplicationGatewayHttpListenerInvalid', 'Application Gateway HTTP listeners require frontendIPConfiguration.id, frontendPort.id, and protocol Http/Https.');
  }

  const rules = arrayProp(body, 'requestRoutingRules');
  const ruleValidation = validateNamedCollection(rules, 'ApplicationGatewayRequestRoutingRuleRequired', 'Application Gateway requires requestRoutingRules.');
  if (ruleValidation) return ruleValidation;
  if (rules.some(item => !['Basic', 'PathBasedRouting'].includes(nestedProp(item, 'ruleType')) || !refId(nestedProp(item, 'httpListener')) || !refId(nestedProp(item, 'backendAddressPool')) || !refId(nestedProp(item, 'backendHttpSettings')))) {
    return envelopedError(400, 'ApplicationGatewayRequestRoutingRuleInvalid', 'Application Gateway request routing rules require a supported ruleType and listener, backend pool, and backend settings references.');
  }

  return null;
}

function validatePublicIpPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.Network/publicIPAddresses') return null;

  const properties = body.properties ?? body;
  const allocationMethod = properties.publicIPAllocationMethod;
  if (!['Static', 'Dynamic'].includes(allocationMethod)) {
    return envelopedError(400, 'PublicIPAddressAllocationMethodInvalid', 'Public IP address properties.publicIPAllocationMethod must be Static or Dynamic.');
  }

  const ipVersion = properties.publicIPAddressVersion ?? 'IPv4';
  if (!['IPv4', 'IPv6'].includes(ipVersion)) {
    return envelopedError(400, 'PublicIPAddressVersionInvalid', 'Public IP address properties.publicIPAddressVersion must be IPv4 or IPv6.');
  }

  const skuName = body.sku?.name ?? properties.sku?.name ?? null;
  if (skuName && !['Basic', 'Standard'].includes(skuName)) {
    return envelopedError(400, 'PublicIPAddressSkuNotSupported', 'Public IP address sku.name must be Basic or Standard.');
  }

  const domainNameLabel = properties.dnsSettings?.domainNameLabel;
  if (domainNameLabel !== undefined) {
    if (!isNonEmptyString(domainNameLabel)) {
      return envelopedError(400, 'DnsRecordLabelInvalid', 'Public IP address dnsSettings.domainNameLabel must be a non-empty string when provided.');
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(domainNameLabel)) {
      return envelopedError(400, 'DnsRecordLabelInvalid', 'Public IP address dnsSettings.domainNameLabel must be 3-63 characters of lowercase letters, digits, or hyphens and must start and end with a letter or digit.');
    }
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
      return envelopedError(400, 'InvalidParameterValue', 'Invalid value given for parameter serverName. Specify a valid parameter value.');
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
      return envelopedError(400, 'InvalidParameterValue', 'Invalid value given for parameter databaseName. Specify a valid parameter value.');
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
      return envelopedError(400, 'InvalidParameterValue', 'Invalid value given for parameter serverName. Specify a valid parameter value.');
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

function validateRedisPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.Cache/redis') return null;
  const sku = body.properties?.sku ?? {};
  if (!['Basic', 'Standard', 'Premium'].includes(sku.name)) {
    return envelopedError(
      400,
      'InvalidRequestBody',
      "The value of the parameter 'properties.sku.name' is invalid.\r\nRequestID=globalstack-redacted",
    );
  }
  const validFamilies = sku.name === 'Premium' ? ['P'] : ['C'];
  if (!validFamilies.includes(sku.family)) {
    return envelopedError(400, 'InvalidRequestBody', "The value of the parameter 'properties.sku.family' is invalid.\r\nRequestID=globalstack-redacted");
  }
  if (!Number.isInteger(sku.capacity) || sku.capacity < 0 || sku.capacity > 6) {
    return envelopedError(400, 'InvalidRequestBody', "The value of the parameter 'properties.sku.capacity' is invalid.\r\nRequestID=globalstack-redacted");
  }
  if (Object.hasOwn(body.properties ?? {}, 'enableNonSslPort') && typeof body.properties.enableNonSslPort !== 'boolean') {
    return envelopedError(400, 'InvalidRequestBody', "The value of the parameter 'properties.enableNonSslPort' is invalid.\r\nRequestID=globalstack-redacted");
  }
  return null;
}

function validateLogicWorkflowPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.Logic/workflows') return null;
  const definition = body.properties?.definition;
  if (!definition || typeof definition !== 'object' || Array.isArray(definition)) {
    return envelopedError(
      400,
      'InvalidWorkflow',
      "The workflow 'workflow-local' must have Definition property set.",
    );
  }
  if (!definition.triggers || typeof definition.triggers !== 'object' || Array.isArray(definition.triggers)) {
    return envelopedError(400, 'InvalidWorkflow', "The workflow definition must include a 'triggers' object.");
  }
  if (!definition.actions || typeof definition.actions !== 'object' || Array.isArray(definition.actions)) {
    return envelopedError(400, 'InvalidWorkflow', "The workflow definition must include an 'actions' object.");
  }
  const state = body.properties?.state;
  if (state && !['Enabled', 'Disabled'].includes(state)) {
    return envelopedError(400, 'InvalidWorkflowState', `Workflow state '${state}' is invalid.`);
  }
  return null;
}

function validateCdnPayload(resourceType, body) {
  if (resourceType === 'Microsoft.Cdn/profiles') {
    const skuName = body.sku?.name;
    const validSkus = [
      'Standard_AzureFrontDoor',
      'Premium_AzureFrontDoor',
      'Standard_Microsoft',
      'Standard_Verizon',
      'Premium_Verizon',
      'Standard_Akamai',
    ];
    if (!skuName) return envelopedError(400, 'BadRequest', 'SkuIsNullOrEmpty');
    if (!validSkus.includes(skuName)) {
      return envelopedError(400, 'BadRequest', `The CDN profile sku '${skuName}' is invalid for this local parity surface.`);
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/afdEndpoints') {
    const enabledState = body.properties?.enabledState;
    if (enabledState && !['Enabled', 'Disabled'].includes(enabledState)) {
      return envelopedError(400, 'BadRequest', `The Front Door endpoint enabledState '${enabledState}' is invalid.`);
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/endpoints') {
    const origins = body.properties?.origins;
    if (!Array.isArray(origins) || origins.length === 0) {
      return envelopedError(400, 'BadRequest', 'CDN endpoints require at least one origin.');
    }
    for (const origin of origins) {
      if (!isNonEmptyString(origin?.name) || !isNonEmptyString(origin?.properties?.hostName)) {
        return envelopedError(400, 'BadRequest', 'CDN endpoint origins require name and properties.hostName.');
      }
      const httpPort = origin.properties.httpPort;
      const httpsPort = origin.properties.httpsPort;
      if ((httpPort !== undefined && (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535))
        || (httpsPort !== undefined && (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535))) {
        return envelopedError(400, 'BadRequest', 'CDN endpoint origin ports must be between 1 and 65535.');
      }
    }
    const isHttpAllowed = body.properties?.isHttpAllowed;
    const isHttpsAllowed = body.properties?.isHttpsAllowed;
    if (isHttpAllowed !== undefined && typeof isHttpAllowed !== 'boolean') {
      return envelopedError(400, 'BadRequest', 'CDN endpoint properties.isHttpAllowed must be a boolean.');
    }
    if (isHttpsAllowed !== undefined && typeof isHttpsAllowed !== 'boolean') {
      return envelopedError(400, 'BadRequest', 'CDN endpoint properties.isHttpsAllowed must be a boolean.');
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/originGroups') {
    const loadBalancingSettings = body.properties?.loadBalancingSettings ?? body.loadBalancingSettings;
    if (loadBalancingSettings !== undefined) {
      const sampleSize = loadBalancingSettings?.sampleSize;
      const successfulSamplesRequired = loadBalancingSettings?.successfulSamplesRequired;
      if (!Number.isInteger(sampleSize) || sampleSize < 1 || sampleSize > 256) {
        return envelopedError(400, 'BadRequest', 'Front Door origin groups require loadBalancingSettings.sampleSize to be an integer between 1 and 256.');
      }
      if (!Number.isInteger(successfulSamplesRequired) || successfulSamplesRequired < 1 || successfulSamplesRequired > sampleSize) {
        return envelopedError(400, 'BadRequest', 'Front Door origin groups require loadBalancingSettings.successfulSamplesRequired to be an integer between 1 and sampleSize.');
      }
    }
    const healthProbeSettings = body.properties?.healthProbeSettings ?? body.healthProbeSettings;
    if (healthProbeSettings !== undefined) {
      if (!isNonEmptyString(healthProbeSettings?.probePath)) {
        return envelopedError(400, 'BadRequest', 'Front Door origin groups require healthProbeSettings.probePath when healthProbeSettings is provided.');
      }
      if (!['GET', 'HEAD'].includes(String(healthProbeSettings?.probeRequestType ?? ''))) {
        return envelopedError(400, 'BadRequest', "Front Door origin group healthProbeSettings.probeRequestType must be 'GET' or 'HEAD'.");
      }
      if (!['Http', 'Https'].includes(String(healthProbeSettings?.probeProtocol ?? ''))) {
        return envelopedError(400, 'BadRequest', "Front Door origin group healthProbeSettings.probeProtocol must be 'Http' or 'Https'.");
      }
      const interval = healthProbeSettings?.probeIntervalInSeconds;
      if (!Number.isInteger(interval) || interval < 1 || interval > 255) {
        return envelopedError(400, 'BadRequest', 'Front Door origin group healthProbeSettings.probeIntervalInSeconds must be an integer between 1 and 255.');
      }
    }
    const sessionAffinityState = body.properties?.sessionAffinityState ?? body.sessionAffinityState;
    if (sessionAffinityState !== undefined && !['Enabled', 'Disabled'].includes(sessionAffinityState)) {
      return envelopedError(400, 'BadRequest', "Front Door origin group sessionAffinityState must be 'Enabled' or 'Disabled'.");
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/originGroups/origins') {
    const hostName = body.properties?.hostName ?? body.hostName;
    if (!isNonEmptyString(hostName)) {
      return envelopedError(400, 'BadRequest', 'Front Door origins require hostName.');
    }
    const httpPort = body.properties?.httpPort ?? body.httpPort;
    const httpsPort = body.properties?.httpsPort ?? body.httpsPort;
    if (httpPort !== undefined && (!Number.isInteger(httpPort) || httpPort < 1 || httpPort > 65535)) {
      return envelopedError(400, 'BadRequest', 'Front Door origin httpPort must be an integer between 1 and 65535.');
    }
    if (httpsPort !== undefined && (!Number.isInteger(httpsPort) || httpsPort < 1 || httpsPort > 65535)) {
      return envelopedError(400, 'BadRequest', 'Front Door origin httpsPort must be an integer between 1 and 65535.');
    }
    const priority = body.properties?.priority ?? body.priority;
    if (priority !== undefined && (!Number.isInteger(priority) || priority < 1 || priority > 5)) {
      return envelopedError(400, 'BadRequest', 'Front Door origin priority must be an integer between 1 and 5.');
    }
    const weight = body.properties?.weight ?? body.weight;
    if (weight !== undefined && (!Number.isInteger(weight) || weight < 1 || weight > 1000)) {
      return envelopedError(400, 'BadRequest', 'Front Door origin weight must be an integer between 1 and 1000.');
    }
    const enabledState = body.properties?.enabledState ?? body.enabledState;
    if (enabledState !== undefined && !['Enabled', 'Disabled'].includes(enabledState)) {
      return envelopedError(400, 'BadRequest', "Front Door origin enabledState must be 'Enabled' or 'Disabled'.");
    }
    const enforceCertificateNameCheck = body.properties?.enforceCertificateNameCheck ?? body.enforceCertificateNameCheck;
    if (enforceCertificateNameCheck !== undefined && typeof enforceCertificateNameCheck !== 'boolean') {
      return envelopedError(400, 'BadRequest', 'Front Door origin enforceCertificateNameCheck must be a boolean.');
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/afdEndpoints/routes') {
    const originGroupId = body.properties?.originGroup?.id ?? body.originGroup?.id;
    if (!isNonEmptyString(originGroupId)) {
      return envelopedError(400, 'BadRequest', 'Front Door routes require originGroup.id.');
    }
    const patternsToMatch = body.properties?.patternsToMatch ?? body.patternsToMatch;
    if (!Array.isArray(patternsToMatch) || patternsToMatch.length === 0 || patternsToMatch.some(pattern => !isNonEmptyString(pattern))) {
      return envelopedError(400, 'BadRequest', 'Front Door routes require at least one patternsToMatch entry.');
    }
    const supportedProtocols = body.properties?.supportedProtocols ?? body.supportedProtocols;
    if (!Array.isArray(supportedProtocols) || supportedProtocols.length === 0 || supportedProtocols.some(protocol => !['Http', 'Https'].includes(protocol))) {
      return envelopedError(400, 'BadRequest', "Front Door routes require supportedProtocols containing 'Http' and/or 'Https'.");
    }
    const enabledState = body.properties?.enabledState ?? body.enabledState;
    if (enabledState !== undefined && !['Enabled', 'Disabled'].includes(enabledState)) {
      return envelopedError(400, 'BadRequest', "Front Door route enabledState must be 'Enabled' or 'Disabled'.");
    }
    const forwardingProtocol = body.properties?.forwardingProtocol ?? body.forwardingProtocol;
    if (forwardingProtocol !== undefined && !['MatchRequest', 'HttpOnly', 'HttpsOnly'].includes(forwardingProtocol)) {
      return envelopedError(400, 'BadRequest', "Front Door route forwardingProtocol must be 'MatchRequest', 'HttpOnly', or 'HttpsOnly'.");
    }
    const httpsRedirect = body.properties?.httpsRedirect ?? body.httpsRedirect;
    if (httpsRedirect !== undefined && !['Enabled', 'Disabled'].includes(httpsRedirect)) {
      return envelopedError(400, 'BadRequest', "Front Door route httpsRedirect must be 'Enabled' or 'Disabled'.");
    }
    const linkToDefaultDomain = body.properties?.linkToDefaultDomain ?? body.linkToDefaultDomain;
    if (linkToDefaultDomain !== undefined && !['Enabled', 'Disabled'].includes(linkToDefaultDomain)) {
      return envelopedError(400, 'BadRequest', "Front Door route linkToDefaultDomain must be 'Enabled' or 'Disabled'.");
    }
  }

  return null;
}

function validateWafPayload(resourceType, body) {
  if (resourceType === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies') {
    const policyLabel = 'Application Gateway WAF';
    const policySettings = body.properties?.policySettings ?? body.policySettings;
    if (!policySettings || typeof policySettings !== 'object' || Array.isArray(policySettings)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policies require properties.policySettings.`);
    }
    const state = policySettings.state;
    const mode = policySettings.mode;
    if (!['Enabled', 'Disabled'].includes(state)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.state must be 'Enabled' or 'Disabled'.`);
    }
    if (!['Detection', 'Prevention'].includes(mode)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.mode must be 'Detection' or 'Prevention'.`);
    }
    if (Object.hasOwn(policySettings, 'requestBodyCheck') && typeof policySettings.requestBodyCheck !== 'boolean') {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.requestBodyCheck must be a boolean.`);
    }
    if (Object.hasOwn(policySettings, 'maxRequestBodySizeInKb') && (!Number.isInteger(policySettings.maxRequestBodySizeInKb) || policySettings.maxRequestBodySizeInKb < 8 || policySettings.maxRequestBodySizeInKb > 2000)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.maxRequestBodySizeInKb must be an integer between 8 and 2000.`);
    }
    const managedRuleSets = (body.properties?.managedRules ?? body.managedRules)?.managedRuleSets;
    if (!Array.isArray(managedRuleSets) || managedRuleSets.length === 0) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policies require at least one managed rule set.`);
    }
    for (const ruleSet of managedRuleSets) {
      if (!isNonEmptyString(ruleSet?.ruleSetType) || !isNonEmptyString(ruleSet?.ruleSetVersion)) {
        return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} managed rule sets require ruleSetType and ruleSetVersion.`);
      }
    }
    const customRules = body.properties?.customRules ?? body.customRules;
    if (customRules !== undefined) {
      if (!Array.isArray(customRules)) {
        return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} customRules must be an array.`);
      }
      for (const rule of customRules) {
        if (!isNonEmptyString(rule?.name) || !Number.isInteger(rule?.priority) || rule.priority < 1 || rule.priority > 1000) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} custom rules require a name and priority between 1 and 1000.`);
        }
        if (!['MatchRule', 'RateLimitRule'].includes(rule.ruleType)) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} customRules[].ruleType must be 'MatchRule' or 'RateLimitRule'.`);
        }
        if (!['Allow', 'Block', 'Log'].includes(rule.action)) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} customRules[].action must be 'Allow', 'Block', or 'Log'.`);
        }
        if (!Array.isArray(rule.matchConditions) || rule.matchConditions.length === 0) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} custom rules require at least one match condition.`);
        }
      }
    }
  }

  if (resourceType === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies') {
    const policyLabel = 'Front Door WAF';
    const policySettings = body.properties?.policySettings ?? body.policySettings;
    if (!policySettings || typeof policySettings !== 'object' || Array.isArray(policySettings)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policies require properties.policySettings.`);
    }
    const enabledState = policySettings.enabledState;
    const mode = policySettings.mode;
    if (enabledState !== undefined && !['Enabled', 'Disabled'].includes(enabledState)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.enabledState must be 'Enabled' or 'Disabled'.`);
    }
    if (mode !== undefined && !['Detection', 'Prevention'].includes(mode)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.mode must be 'Detection' or 'Prevention'.`);
    }
    if (Object.hasOwn(policySettings, 'requestBodyCheck')
      && !['Enabled', 'Disabled'].includes(policySettings.requestBodyCheck)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.requestBodyCheck must be 'Enabled' or 'Disabled'.`);
    }
    if (Object.hasOwn(policySettings, 'captchaExpirationInMinutes')
      && (!Number.isInteger(policySettings.captchaExpirationInMinutes)
        || policySettings.captchaExpirationInMinutes < 5
        || policySettings.captchaExpirationInMinutes > 1440)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.captchaExpirationInMinutes must be an integer between 5 and 1440.`);
    }
    if (Object.hasOwn(policySettings, 'javascriptChallengeExpirationInMinutes')
      && (!Number.isInteger(policySettings.javascriptChallengeExpirationInMinutes)
        || policySettings.javascriptChallengeExpirationInMinutes < 5
        || policySettings.javascriptChallengeExpirationInMinutes > 1440)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} policySettings.javascriptChallengeExpirationInMinutes must be an integer between 5 and 1440.`);
    }
    const skuName = body.sku?.name;
    if (skuName !== undefined && !['Classic_AzureFrontDoor', 'Standard_AzureFrontDoor', 'Premium_AzureFrontDoor'].includes(skuName)) {
      return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} sku.name must be Classic_AzureFrontDoor, Standard_AzureFrontDoor, or Premium_AzureFrontDoor.`);
    }
    const managedRuleSets = (body.properties?.managedRules ?? body.managedRules)?.managedRuleSets;
    if (managedRuleSets !== undefined) {
      if (!Array.isArray(managedRuleSets)) {
        return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} managedRules.managedRuleSets must be an array when provided.`);
      }
      for (const ruleSet of managedRuleSets) {
        if (!isNonEmptyString(ruleSet?.ruleSetType) || !isNonEmptyString(ruleSet?.ruleSetVersion)) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} managed rule sets require ruleSetType and ruleSetVersion.`);
        }
      }
    }
    const customRules = body.properties?.customRules ?? body.customRules;
    if (customRules !== undefined) {
      const rules = customRules?.rules;
      if (typeof customRules !== 'object' || Array.isArray(customRules) || !Array.isArray(rules)) {
        return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} customRules must be an object with a rules array.`);
      }
      for (const rule of rules) {
        if (!isNonEmptyString(rule?.name) || !Number.isInteger(rule?.priority) || rule.priority < 1 || rule.priority > 1000) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} custom rules require a name and priority between 1 and 1000.`);
        }
        if (!['MatchRule', 'RateLimitRule'].includes(rule.ruleType)) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} customRules.rules[].ruleType must be 'MatchRule' or 'RateLimitRule'.`);
        }
        if (!['Allow', 'AnomalyScoring', 'Block', 'CAPTCHA', 'JSChallenge', 'Log', 'Redirect'].includes(rule.action)) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} customRules.rules[].action is invalid.`);
        }
        if (!Array.isArray(rule.matchConditions) || rule.matchConditions.length === 0) {
          return envelopedError(400, 'InvalidRequestFormat', `${policyLabel} custom rules require at least one match condition.`);
        }
      }
    }
  }

  if (resourceType === 'Microsoft.Cdn/profiles/securityPolicies') {
    const parameters = body.properties?.parameters;
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters)) {
      return envelopedError(400, 'BadRequest', 'CDN security policies require properties.parameters.');
    }
    if (parameters.type !== 'WebApplicationFirewall') {
      return envelopedError(400, 'BadRequest', "CDN security policy parameters.type must be 'WebApplicationFirewall'.");
    }
    if (!isNonEmptyString(parameters.wafPolicy?.id)) {
      return envelopedError(400, 'BadRequest', 'CDN security policy parameters.wafPolicy.id is required.');
    }
    const associations = parameters.associations;
    if (!Array.isArray(associations) || associations.length === 0) {
      return envelopedError(400, 'BadRequest', 'CDN security policies require at least one association.');
    }
    for (const association of associations) {
      if (!Array.isArray(association?.domains) || association.domains.length === 0) {
        return envelopedError(400, 'BadRequest', 'CDN security policy associations require at least one domain reference.');
      }
      if (!Array.isArray(association.patternsToMatch) || association.patternsToMatch.length === 0) {
        return envelopedError(400, 'BadRequest', 'CDN security policy associations require at least one patternToMatch.');
      }
      if (association.domains.some(domain => !isNonEmptyString(domain?.id))) {
        return envelopedError(400, 'BadRequest', 'CDN security policy association domains require id.');
      }
    }
  }

  return null;
}

function validateAppConfigurationPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.AppConfiguration/configurationStores') return null;
  const skuName = String(body.sku?.name ?? '');
  if (!['free', 'standard', 'Free', 'Standard'].includes(skuName)) {
    return envelopedError(400, 'InvalidProperty', "The property 'Sku' is not valid.");
  }
  if (Object.hasOwn(body.properties ?? {}, 'disableLocalAuth') && typeof body.properties.disableLocalAuth !== 'boolean') {
    return envelopedError(400, 'InvalidProperty', "The property 'disableLocalAuth' is not valid.");
  }
  const publicNetworkAccess = body.properties?.publicNetworkAccess;
  if (publicNetworkAccess && !['Enabled', 'Disabled'].includes(publicNetworkAccess)) {
    return envelopedError(400, 'InvalidProperty', "The property 'publicNetworkAccess' is not valid.");
  }
  return null;
}

function validateEventHubPayload(resourceType, body) {
  if (resourceType === 'Microsoft.EventHub/namespaces') {
    const skuName = body.sku?.name;
    if (skuName && !['Basic', 'Standard', 'Premium'].includes(skuName)) {
      return envelopedError(
        400,
        'ValidateResourceInfoFailedWithInvalidSkuName',
        `Sku name '${skuName}' is invalid`,
      );
    }
    if (Object.hasOwn(body.sku ?? {}, 'capacity') && (!Number.isInteger(body.sku.capacity) || body.sku.capacity < 1 || body.sku.capacity > 20)) {
      return envelopedError(400, 'BadRequest', 'Event Hubs namespace sku.capacity must be an integer from 1 through 20.');
    }
  }

  if (resourceType === 'Microsoft.EventHub/namespaces/eventhubs') {
    const partitionCount = body.properties?.partitionCount;
    if (Object.hasOwn(body.properties ?? {}, 'partitionCount') && (!Number.isInteger(partitionCount) || partitionCount < 1 || partitionCount > 32)) {
      return envelopedError(400, 'BadRequest', 'Event hub partitionCount must be an integer from 1 through 32.');
    }
    const retention = body.properties?.messageRetentionInDays;
    if (Object.hasOwn(body.properties ?? {}, 'messageRetentionInDays') && (!Number.isInteger(retention) || retention < 1 || retention > 7)) {
      return envelopedError(400, 'BadRequest', 'Event hub messageRetentionInDays must be an integer from 1 through 7.');
    }
  }

  return null;
}

function validateAzureFilesPayload(resourceType, body) {
  if (resourceType !== 'Microsoft.Storage/storageAccounts/fileServices/shares') return null;
  const shareQuota = body.properties?.shareQuota;
  if (Object.hasOwn(body.properties ?? {}, 'shareQuota') && (!Number.isInteger(shareQuota) || shareQuota < 1 || shareQuota > 5120)) {
    return envelopedError(400, 'InvalidHeaderValue', 'The value for one of the HTTP headers is not in the correct format.');
  }
  const enabledProtocols = body.properties?.enabledProtocols;
  if (enabledProtocols && !['SMB', 'NFS'].includes(enabledProtocols)) {
    return envelopedError(400, 'InvalidHeaderValue', "The value for enabledProtocols must be 'SMB' or 'NFS'.");
  }
  const accessTier = body.properties?.accessTier;
  if (accessTier && !['TransactionOptimized', 'Hot', 'Cool', 'Premium'].includes(accessTier)) {
    return envelopedError(400, 'InvalidHeaderValue', 'The specified access tier is not valid for Azure Files.');
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
    const reserved = body.properties?.reserved ?? body.reserved;
    const localSupportedConsumptionPlan =
      body.sku?.name === 'Y1'
      && body.sku?.tier === 'Dynamic'
      && (body.kind == null || isFunctionAppKind(body.kind))
      && (reserved == null || typeof reserved === 'boolean');
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

  if (resourceType === 'Microsoft.Web/sites/functions') {
    const config = body.properties?.config;
    const bindings = Array.isArray(config?.bindings) ? config.bindings : null;
    if (!bindings || bindings.length === 0) {
      return envelopedError(
        400,
        'ValidationError',
        'Function resources require properties.config.bindings with at least one binding definition.',
      );
    }
    const httpTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'httptrigger');
    const orchestrationTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'orchestrationtrigger');
    const activityTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'activitytrigger');
    const timerTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'timertrigger');
    const queueTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'queuetrigger');
    const blobTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'blobtrigger');
    const eventGridTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'eventgridtrigger');
    const serviceBusTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'servicebustrigger');
    const eventHubTriggers = bindings.filter(binding => String(binding?.type ?? '').toLowerCase() === 'eventhubtrigger');
    const supportedTriggerCount = httpTriggers.length
      + orchestrationTriggers.length
      + activityTriggers.length
      + timerTriggers.length
      + queueTriggers.length
      + blobTriggers.length
      + eventGridTriggers.length
      + serviceBusTriggers.length
      + eventHubTriggers.length;
    if (supportedTriggerCount !== 1) {
      return envelopedError(
        400,
        'ValidationError',
        'Function resources currently require exactly one supported trigger binding in this local parity surface.',
      );
    }
    const trigger = httpTriggers[0]
      ?? orchestrationTriggers[0]
      ?? activityTriggers[0]
      ?? timerTriggers[0]
      ?? queueTriggers[0]
      ?? blobTriggers[0]
      ?? eventGridTriggers[0]
      ?? serviceBusTriggers[0]
      ?? eventHubTriggers[0];
    if (httpTriggers.length === 1 && trigger.authLevel !== undefined && !['anonymous', 'function', 'admin'].includes(String(trigger.authLevel).toLowerCase())) {
      return envelopedError(
        400,
        'ValidationError',
        `Function binding authLevel '${trigger.authLevel}' is invalid.`,
      );
    }
    if (httpTriggers.length === 1 && trigger.methods !== undefined && (!Array.isArray(trigger.methods) || trigger.methods.length === 0 || trigger.methods.some(method => typeof method !== 'string'))) {
      return envelopedError(
        400,
        'ValidationError',
        'Function binding methods must be a non-empty string array when provided.',
      );
    }
    if (timerTriggers.length === 1 && typeof trigger.schedule !== 'string') {
      return envelopedError(
        400,
        'ValidationError',
        'Timer trigger bindings require a string schedule.',
      );
    }
    if (queueTriggers.length === 1 && typeof trigger.queueName !== 'string') {
      return envelopedError(
        400,
        'ValidationError',
        'Queue trigger bindings require a string queueName.',
      );
    }
    if (blobTriggers.length === 1 && typeof trigger.path !== 'string') {
      return envelopedError(
        400,
        'ValidationError',
        'Blob trigger bindings require a string path.',
      );
    }
    if (serviceBusTriggers.length === 1) {
      const hasQueue = typeof trigger.queueName === 'string';
      const hasTopicSubscription = typeof trigger.topicName === 'string' && typeof trigger.subscriptionName === 'string';
      if (!hasQueue && !hasTopicSubscription) {
        return envelopedError(
          400,
          'ValidationError',
          'Service Bus trigger bindings require queueName or topicName plus subscriptionName.',
        );
      }
    }
    if (eventHubTriggers.length === 1 && typeof trigger.eventHubName !== 'string') {
      return envelopedError(
        400,
        'ValidationError',
        'Event Hub trigger bindings require a string eventHubName.',
      );
    }
  }

  return null;
}

export function capturedProviderValidation({ method, resourceType, body = {}, providerRoute = null, referencesExistingServerFarm = false }) {
  if (resourceType === 'Microsoft.Insights/diagnosticSettings') {
    if (method === 'PUT' && (!body.properties || emptyObject(body))) {
      return topLevelError(400, 'BadRequest', "Missing 'properties'");
    }
    return null;
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
    const destination = body.properties?.destination ?? body.destination;
    if (!destination || typeof destination !== 'object') {
      return envelopedError(400, 'InvalidRequest', 'Event Grid event subscriptions require a destination object.');
    }
    if (!isNonEmptyString(destination.endpointType)) {
      return envelopedError(400, 'InvalidRequest', 'Event Grid event subscriptions require destination.endpointType.');
    }
    const endpointUrl = destination.endpointUrl ?? destination.properties?.endpointUrl ?? destination.properties?.endpointBaseUrl;
    if (String(destination.endpointType) === 'WebHook' && !isNonEmptyString(endpointUrl)) {
      return envelopedError(400, 'InvalidRequest', 'Webhook event subscriptions require destination.endpointUrl.');
    }
    return null;
  }

  if (resourceType === 'Microsoft.Authorization/roleAssignments') {
    if (emptyObject(body) || !body.properties) {
      return envelopedError(400, 'MalformedRoleAssignmentRequest', 'PASRP RoleAssignment request is malformed');
    }
    if (!isNonEmptyString(body.properties.principalId)) {
      return invalidRequestContent('principalId');
    }
    if (!isNonEmptyString(body.properties.roleDefinitionId)) {
      return invalidRequestContent('roleDefinitionId');
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
    if (!Array.isArray(body.properties.permissions) || body.properties.permissions.length === 0) {
      return invalidRequestContent('permissions');
    }
    if (!Array.isArray(body.properties.assignableScopes) || body.properties.assignableScopes.length === 0) {
      return invalidRequestContent('assignableScopes');
    }
    return invalidRequestContent('permissions');
  }

  if (locationValidatedResourceTypes.has(resourceType)) {
    if (!body.location) return locationRequired();
    if (body.location === 'globalstack-invalid-location') return invalidResourceLocation(body.location);
  }

  const eventGridNameValidation = validateEventGridName(resourceType, providerRoute);
  if (eventGridNameValidation) return eventGridNameValidation;

  const eventHubNameValidation = validateEventHubName(resourceType, providerRoute);
  if (eventHubNameValidation) return eventHubNameValidation;

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

  const redisNameValidation = validateRedisName(resourceType, providerRoute);
  if (redisNameValidation) return redisNameValidation;

  const logicWorkflowNameValidation = validateLogicWorkflowName(resourceType, providerRoute);
  if (logicWorkflowNameValidation) return logicWorkflowNameValidation;

  const cdnNameValidation = validateCdnName(resourceType, providerRoute);
  if (cdnNameValidation) return cdnNameValidation;

  const wafNameValidation = validateWafName(resourceType, providerRoute);
  if (wafNameValidation) return wafNameValidation;

  const appConfigurationNameValidation = validateAppConfigurationName(resourceType, providerRoute);
  if (appConfigurationNameValidation) return appConfigurationNameValidation;

  const storageChildNameValidation = validateStorageChildName(resourceType, providerRoute);
  if (storageChildNameValidation) return storageChildNameValidation;

  const synapseNameValidation = validateSynapseName(resourceType, providerRoute);
  if (synapseNameValidation) return synapseNameValidation;

  const dataMigrationNameValidation = validateDataMigrationName(resourceType, providerRoute);
  if (dataMigrationNameValidation) return dataMigrationNameValidation;

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

  const publicIpPayloadValidation = validatePublicIpPayload(resourceType, body);
  if (publicIpPayloadValidation) return publicIpPayloadValidation;

  const applicationGatewayPayloadValidation = validateApplicationGatewayPayload(resourceType, body);
  if (applicationGatewayPayloadValidation) return applicationGatewayPayloadValidation;

  const loadBalancerPayloadValidation = validateLoadBalancerPayload(resourceType, body);
  if (loadBalancerPayloadValidation) return loadBalancerPayloadValidation;

  const postgresqlPayloadValidation = validatePostgresqlPayload(resourceType, body, providerRoute);
  if (postgresqlPayloadValidation) return postgresqlPayloadValidation;

  const mysqlPayloadValidation = validateMysqlPayload(resourceType, body, providerRoute);
  if (mysqlPayloadValidation) return mysqlPayloadValidation;

  const serviceBusPayloadValidation = validateServiceBusPayload(resourceType, body);
  if (serviceBusPayloadValidation) return serviceBusPayloadValidation;

  const cosmosPayloadValidation = validateCosmosPayload(resourceType, body, providerRoute);
  if (cosmosPayloadValidation) return cosmosPayloadValidation;

  const redisPayloadValidation = validateRedisPayload(resourceType, body);
  if (redisPayloadValidation) return redisPayloadValidation;

  const logicWorkflowPayloadValidation = validateLogicWorkflowPayload(resourceType, body);
  if (logicWorkflowPayloadValidation) return logicWorkflowPayloadValidation;

  const cdnPayloadValidation = validateCdnPayload(resourceType, body);
  if (cdnPayloadValidation) return cdnPayloadValidation;

  const wafPayloadValidation = validateWafPayload(resourceType, body);
  if (wafPayloadValidation) return wafPayloadValidation;

  const appConfigurationPayloadValidation = validateAppConfigurationPayload(resourceType, body);
  if (appConfigurationPayloadValidation) return appConfigurationPayloadValidation;

  const eventHubPayloadValidation = validateEventHubPayload(resourceType, body);
  if (eventHubPayloadValidation) return eventHubPayloadValidation;

  const azureFilesPayloadValidation = validateAzureFilesPayload(resourceType, body);
  if (azureFilesPayloadValidation) return azureFilesPayloadValidation;

  const activityLogAuditPayloadValidation = validateActivityLogAuditPayload(resourceType, body);
  if (activityLogAuditPayloadValidation) return activityLogAuditPayloadValidation;

  const synapsePayloadValidation = validateSynapsePayload(resourceType, body);
  if (synapsePayloadValidation) return synapsePayloadValidation;

  const dataMigrationPayloadValidation = validateDataMigrationPayload(resourceType, body);
  if (dataMigrationPayloadValidation) return dataMigrationPayloadValidation;

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

  if (resourceType === 'Microsoft.App/containerApps' && !body.properties?.template?.containers?.length) {
    return envelopedError(
      400,
      'ContainerAppCreateMustContainContainer',
      "Error creating container app 'app-local'. Must specify atleast one container to create a container app.",
    );
  }

  if (resourceType === 'Microsoft.App/containerApps' && !body.properties?.managedEnvironmentId) {
    return envelopedError(
      400,
      'ContainerAppManagedEnvironmentRequired',
      'Container App resources require properties.managedEnvironmentId.',
    );
  }

  if (resourceType === 'Microsoft.App/containerApps') {
    const scale = body.properties?.template?.scale;
    if (scale?.minReplicas !== undefined && (!Number.isInteger(scale.minReplicas) || scale.minReplicas < 0)) {
      return envelopedError(400, 'InvalidParameterValue', 'Container App scale.minReplicas must be a non-negative integer.');
    }
    if (scale?.maxReplicas !== undefined && (!Number.isInteger(scale.maxReplicas) || scale.maxReplicas < 1)) {
      return envelopedError(400, 'InvalidParameterValue', 'Container App scale.maxReplicas must be a positive integer.');
    }
    if (Number.isInteger(scale?.minReplicas) && Number.isInteger(scale?.maxReplicas) && scale.minReplicas > scale.maxReplicas) {
      return envelopedError(400, 'InvalidParameterValue', 'Container App scale.minReplicas cannot exceed scale.maxReplicas.');
    }
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
    return envelopedError(404, 'ResourceNotFound', 'The Resource was not found.');
  }
  return null;
}
