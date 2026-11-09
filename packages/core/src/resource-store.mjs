import { createHash, createHmac } from 'node:crypto';
import { capabilityForResourceType } from './azure-tier1-capabilities.mjs';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function deterministicGuid(seed) {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeResourceGroupId(subscriptionId, resourceGroupName) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
}

function normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath, scopeId = null) {
  const scopePrefix = scopeId
    ? String(scopeId).replace(/\/$/, '')
    : normalizeResourceGroupId(subscriptionId, resourceGroupName);
  return `${scopePrefix}/providers/${providerNamespace}/${typePath}`;
}

function normalizeDeploymentId(subscriptionId, resourceGroupName, deploymentName) {
  const scope = resourceGroupName
    ? `${normalizeResourceGroupId(subscriptionId, resourceGroupName)}/providers`
    : `/subscriptions/${subscriptionId}/providers`;
  return `${scope}/Microsoft.Resources/deployments/${deploymentName}`;
}

function normalizeInlineSubnetProperties(subnet = {}) {
  const properties = subnet.properties ?? subnet;
  return {
    ...(properties.addressPrefix ? { addressPrefix: properties.addressPrefix } : {}),
    ...(Array.isArray(properties.addressPrefixes) ? { addressPrefixes: deepClone(properties.addressPrefixes) } : {}),
    ...(Array.isArray(properties.delegations) ? { delegations: deepClone(properties.delegations) } : {}),
    ...(properties.privateEndpointNetworkPolicies !== undefined
      ? { privateEndpointNetworkPolicies: properties.privateEndpointNetworkPolicies }
      : {}),
    ...(properties.privateLinkServiceNetworkPolicies !== undefined
      ? { privateLinkServiceNetworkPolicies: properties.privateLinkServiceNetworkPolicies }
      : {}),
    ...(Array.isArray(properties.serviceEndpoints) ? { serviceEndpoints: deepClone(properties.serviceEndpoints) } : {}),
    ...(Array.isArray(properties.serviceEndpointPolicies)
      ? { serviceEndpointPolicies: deepClone(properties.serviceEndpointPolicies) }
      : {}),
    ...(properties.routeTable ? { routeTable: deepClone(properties.routeTable) } : {}),
    ...(properties.networkSecurityGroup ? { networkSecurityGroup: deepClone(properties.networkSecurityGroup) } : {}),
    ...(properties.natGateway ? { natGateway: deepClone(properties.natGateway) } : {}),
    ...(Array.isArray(properties.ipConfigurations) ? { ipConfigurations: deepClone(properties.ipConfigurations) } : {}),
    ...(Array.isArray(properties.applicationGatewayIpConfigurations)
      ? { applicationGatewayIpConfigurations: deepClone(properties.applicationGatewayIpConfigurations) }
      : {}),
  };
}

function emulationDepth(capability) {
  if (!capability) return 'unsupported';
  if (capability.cloudValidated) return 'cloud-validated';
  if (capability.primaryModes.includes('official-emulator')) return 'official-emulator-backed-local';
  return 'metadata-only-control-plane';
}

function lifecycleStateFor(resource) {
  return resource?.globalstack?.lifecycleState ?? null;
}

function asyncLifecycleSequence(type) {
  if (type === 'Microsoft.Storage/storageAccounts') return ['Creating', 'ResolvingDns', 'Succeeded'];
  if (type === 'Microsoft.ServiceBus/namespaces') return ['Creating', 'Activating', 'Succeeded'];
  if (type === 'Microsoft.ApiManagement/service') return ['Creating', 'Activating', 'Succeeded'];
  if (type === 'Microsoft.Cache/redis') return ['Creating', 'Provisioning', 'Succeeded'];
  if (type === 'Microsoft.Web/serverfarms') return ['Creating', 'Ready', 'Succeeded'];
  if (type === 'Microsoft.Web/sites') return ['Creating', 'Starting', 'Succeeded'];
  if (type === 'Microsoft.ContainerService/managedClusters') return ['Creating', 'Reconciling', 'Succeeded'];
  if (type === 'Microsoft.DocumentDB/databaseAccounts') return ['Creating', 'Online', 'Succeeded'];
  if (type === 'Microsoft.Network/privateDnsZones') return ['Creating', 'Succeeded'];
  return null;
}

function aksDeferredProvisioningError(type, body = {}) {
  if (type !== 'Microsoft.ContainerService/managedClusters') return null;
  const networkPlugin = body.properties?.networkProfile?.networkPlugin;
  if (!networkPlugin || ['azure', 'kubenet'].includes(networkPlugin)) return null;
  return {
    code: 'InvalidParameter',
    message: 'AKS networkProfile.networkPlugin must be azure or kubenet when provided.',
    target: 'networkProfile.networkPlugin',
  };
}

function apiManagementGatewayUrl(name) {
  return `https://${name}.azure-api.net`;
}

function eventGridTopicHostname(name, location) {
  return `${name}.${location ?? 'global'}-1.eventgrid.azure.net`;
}

function eventGridTopicEndpoint(name, location) {
  return `https://${eventGridTopicHostname(name, location)}/api/events`;
}

function eventHubNamespaceEndpoint(name) {
  return `https://${name}.servicebus.windows.net:443/`;
}

function serviceBusNamespacePrimaryKey(id, keyName) {
  return createHash('sha256')
    .update(`globalstack:servicebus:${keyName}:primary:${id.toLowerCase()}`)
    .digest('base64');
}

function serviceBusNamespaceSecondaryKey(id, keyName) {
  return createHash('sha256')
    .update(`globalstack:servicebus:${keyName}:secondary:${id.toLowerCase()}`)
    .digest('base64');
}

function eventGridTopicKey(id, slot) {
  return createHash('sha256')
    .update(`globalstack:event-grid:${slot}:${id.toLowerCase()}`)
    .digest('base64url');
}

function storageAccountKey(id, slot) {
  return createHash('sha256')
    .update(`globalstack:storage:${slot}:${id.toLowerCase()}`)
    .digest('base64');
}

function storageServiceSasSignature(accountKey, fields) {
  const stringToSign = [
    fields.permissions ?? '',
    fields.startTime ?? '',
    fields.expiryTime ?? '',
    fields.canonicalizedResource ?? '',
    fields.protocols ?? '',
    fields.version ?? '',
    fields.resource ?? '',
    fields.cacheControl ?? '',
    fields.contentDisposition ?? '',
    fields.contentEncoding ?? '',
    fields.contentLanguage ?? '',
    fields.contentType ?? '',
  ].join('\n');
  return createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

function appInsightsAppId(id) {
  return createHash('sha256')
    .update(`globalstack:appinsights:app:${id.toLowerCase()}`)
    .digest('hex')
    .slice(0, 32);
}

function appInsightsInstrumentationKey(id) {
  const digest = createHash('sha256')
    .update(`globalstack:appinsights:ikey:${id.toLowerCase()}`)
    .digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function appInsightsConnectionString(id, location = 'global') {
  const instrumentationKey = appInsightsInstrumentationKey(id);
  const appId = appInsightsAppId(id);
  return `InstrumentationKey=${instrumentationKey};IngestionEndpoint=https://${location}.in.applicationinsights.azure.com/;LiveEndpoint=https://${location}.livediagnostics.monitor.azure.com/;ApplicationId=${appId}`;
}

function operationalInsightsWorkspaceCustomerId(id) {
  return deterministicGuid(`globalstack:operationalinsights:customer:${id.toLowerCase()}`);
}

function operationalInsightsWorkspaceSharedKey(id, slot) {
  return createHash('sha256')
    .update(`globalstack:operationalinsights:${slot}:${id.toLowerCase()}`)
    .digest('base64');
}

function functionAppHostName(name) {
  return `${name}.azurewebsites.net`;
}

function iotHubHostName(name) {
  return `${name}.azure-devices.net`;
}

function keyVaultUri(name) {
  return `https://${name}.vault.azure.net/`;
}

function containerRegistryLoginServer(name) {
  return `${name}.azurecr.io`;
}

function postgresqlFullyQualifiedDomainName(name) {
  return `${name}.postgres.database.azure.com`;
}

function mysqlFullyQualifiedDomainName(name) {
  return `${name}.mysql.database.azure.com`;
}

function cosmosDocumentEndpoint(name) {
  return `https://${name}.documents.azure.com:443/`;
}

function digitalTwinsHostName(name, location = 'global') {
  return `${name}.api.${location}.digitaltwins.azure.net`;
}

function searchServiceEndpoint(name) {
  return `https://${name}.search.windows.net`;
}

function redisHostName(name) {
  return `${name}.redis.cache.windows.net`;
}

function publicIpAddress(id) {
  const digest = createHash('sha256')
    .update(`globalstack:network:publicip:${id.toLowerCase()}`)
    .digest();
  return `20.${(digest[0] % 200) + 20}.${digest[1]}.${(digest[2] % 254) + 1}`;
}

function publicIpFqdn(label, location = 'eastus') {
  return `${label}.${location}.cloudapp.azure.com`;
}

function aksFqdn(name, location, dnsPrefix) {
  const digest = createHash('sha256')
    .update(`globalstack:aks:${name}:${location}:${dnsPrefix}`)
    .digest('hex')
    .slice(0, 8);
  return `${dnsPrefix}-${digest}.hcp.${location}.azmk8s.io`;
}

function aksPrivateFqdn(name, location, dnsPrefix) {
  const digest = createHash('sha256')
    .update(`globalstack:aks:private:${name}:${location}:${dnsPrefix}`)
    .digest('hex')
    .slice(0, 8);
  return `${dnsPrefix}-${digest}.privatelink.${location}.azmk8s.io`;
}

export function aksKubeToken(resourceId, role = 'user', generation = 0) {
  const normalizedRole = role === 'admin' ? 'admin' : 'user';
  return createHash('sha256')
    .update(`globalstack:aks:kube:${normalizedRole}:${Number(generation ?? 0)}:${String(resourceId ?? '').toLowerCase()}`)
    .digest('hex');
}

function aksNextNodeImageVersion(current = 'AKSUbuntu-2026.05.27') {
  const match = String(current ?? '').match(/^(.*?)(?:\.(\d+))?$/);
  const prefix = match?.[1] || 'AKSUbuntu-2026.05.27';
  const revision = Number(match?.[2] ?? 0) + 1;
  return `${prefix}.${revision}`;
}

function aksNodeResourceGroup(resourceGroupName, name, location) {
  return `MC_${resourceGroupName}_${name}_${location}`;
}

function materializeAksAgentPoolProfile(pool = {}, existingPool = {}, { clusterVersion = null } = {}) {
  const poolType = pool.type ?? existingPool.type ?? 'VirtualMachineScaleSets';
  return {
    ...existingPool,
    ...deepClone(pool),
    provisioningState: 'Succeeded',
    powerState: { code: 'Running' },
    type: poolType,
    mode: pool.mode ?? existingPool.mode ?? 'User',
    osType: pool.osType ?? existingPool.osType ?? 'Linux',
    enableAutoScaling: pool.enableAutoScaling ?? existingPool.enableAutoScaling ?? false,
    minCount: pool.minCount ?? existingPool.minCount ?? null,
    maxCount: pool.maxCount ?? existingPool.maxCount ?? null,
    orchestratorVersion: pool.orchestratorVersion ?? existingPool.orchestratorVersion ?? clusterVersion,
    nodeImageVersion: pool.nodeImageVersion ?? existingPool.nodeImageVersion ?? 'AKSUbuntu-2026.05.27',
  };
}

function materializeAksNetworkProfile(input = {}, existing = {}) {
  const networkPlugin = input.networkPlugin ?? existing.networkPlugin ?? 'kubenet';
  const serviceCidr = input.serviceCidr ?? input.serviceCIDR ?? existing.serviceCidr ?? '10.0.0.0/16';
  return {
    ...deepClone(existing),
    ...deepClone(input),
    networkPlugin,
    ...(input.networkPolicy ?? existing.networkPolicy ? { networkPolicy: input.networkPolicy ?? existing.networkPolicy } : {}),
    serviceCidr,
    dnsServiceIP: input.dnsServiceIP ?? existing.dnsServiceIP ?? '10.0.0.10',
    dockerBridgeCidr: input.dockerBridgeCidr ?? existing.dockerBridgeCidr ?? '172.17.0.1/16',
    loadBalancerSku: input.loadBalancerSku ?? existing.loadBalancerSku ?? 'standard',
  };
}

function materializeAksApiServerAccessProfile(input = {}, existing = {}) {
  const enablePrivateCluster = input.enablePrivateCluster ?? existing.enablePrivateCluster ?? false;
  const publicFqdnValue = input.enablePrivateClusterPublicFQDN ?? existing.enablePrivateClusterPublicFQDN;
  return {
    ...deepClone(existing),
    ...deepClone(input),
    enablePrivateCluster,
    ...(input.privateDNSZone ?? existing.privateDNSZone ? { privateDNSZone: input.privateDNSZone ?? existing.privateDNSZone } : {}),
    ...(publicFqdnValue !== undefined || enablePrivateCluster === true
      ? { enablePrivateClusterPublicFQDN: publicFqdnValue ?? true }
      : {}),
  };
}

function dnsNameServers(name) {
  const digest = createHash('sha256')
    .update(`globalstack:dns:${name}`)
    .digest('hex');
  return [0, 1, 2, 3].map(index => `ns${index + 1}-${digest.slice(index * 4, index * 4 + 4)}.azure-dns-${index + 1}.com.`);
}

function dnsRecordFqdn(typePath) {
  const parts = String(typePath ?? '').split('/');
  const zoneName = parts[1];
  const recordName = parts[3];
  if (!zoneName || !recordName) return undefined;
  const fqdn = recordName === '@' ? zoneName : `${recordName}.${zoneName}`;
  return fqdn.endsWith('.') ? fqdn : `${fqdn}.`;
}

function apiManagementIdentityFields(typePath) {
  const parts = String(typePath ?? '').split('/');
  if (parts[0] !== 'service' || !parts[1]) return {};
  const identifiers = {
    serviceName: parts[1],
  };

  for (let index = 2; index < parts.length; index += 2) {
    const segmentType = parts[index];
    const segmentName = parts[index + 1];
    if (!segmentType || !segmentName) break;
    if (segmentType === 'apis') identifiers.apiId = segmentName;
    if (segmentType === 'products') identifiers.productId = segmentName;
    if (segmentType === 'operations') identifiers.operationId = segmentName;
    if (segmentType === 'policies') identifiers.policyId = segmentName;
    if (segmentType === 'namedValues') identifiers.namedValueId = segmentName;
    if (segmentType === 'loggers') identifiers.loggerId = segmentName;
    if (segmentType === 'diagnostics') identifiers.diagnosticId = segmentName;
  }

  return identifiers;
}

function keyVaultChildVaultName(name) {
  return String(name ?? '').split('/')[0] ?? '';
}

function keyVaultSecretUri(name) {
  const [vaultName, secretName] = String(name ?? '').split('/');
  return `${keyVaultUri(vaultName)}secrets/${secretName}`;
}

function keyVaultKeyUri(name) {
  const [vaultName, keyName] = String(name ?? '').split('/');
  return `${keyVaultUri(vaultName)}keys/${keyName}`;
}

function materializeIdentity(identity, resourceId) {
  if (!identity || typeof identity !== 'object') return identity;
  const type = String(identity.type ?? '');
  const includesSystemAssigned = type
    .split(',')
    .map(value => value.trim().toLowerCase())
    .includes('systemassigned');
  if (!includesSystemAssigned) return deepClone(identity);
  return {
    ...deepClone(identity),
    principalId: identity.principalId ?? deterministicGuid(`${resourceId}:principalId`),
    tenantId: identity.tenantId ?? '00000000-0000-0000-0000-000000000000',
  };
}

function userAssignedIdentityProperties(existingProperties, resourceId) {
  return {
    ...(existingProperties ?? {}),
    clientId: existingProperties?.clientId ?? deterministicGuid(`${resourceId}:clientId`),
    principalId: existingProperties?.principalId ?? deterministicGuid(`${resourceId}:principalId`),
    tenantId:
      existingProperties?.tenantId
      ?? process.env.GLOBALSTACK_AZURE_TENANT_ID
      ?? process.env.ARM_TENANT_ID
      ?? '00000000-0000-0000-0000-000000000000',
    provisioningState: existingProperties?.provisioningState ?? 'Succeeded',
  };
}

export class ResourceStore {
  constructor({ subscriptionId = '00000000-0000-0000-0000-000000000000' } = {}) {
    this.subscriptionId = subscriptionId;
    this.resourceGroups = new Map();
    this.resources = new Map();
    this.deployments = new Map();
    this.asyncOperations = new Map();
    this.calls = [];
  }

  recordCall(call) {
    this.calls.push({
      ...call,
      observedAt: nowIso(),
    });
    if (this.calls.length > 1000) this.calls.shift();
  }

  putResourceGroup(subscriptionId, name, body = {}) {
    const id = normalizeResourceGroupId(subscriptionId, name);
    const existing = this.resourceGroups.get(id.toLowerCase());
    const resourceGroup = {
      id,
      name,
      type: 'Microsoft.Resources/resourceGroups',
      location: body.location ?? existing?.location ?? 'eastus',
      tags: body.tags ?? existing?.tags ?? {},
      properties: {
        provisioningState: 'Succeeded',
      },
      globalstack: {
        supportLevel: 'globalstack-facade',
        capabilityId: 'resource-groups',
        emulationDepth: 'metadata-only-control-plane',
        realAzureApiComplete: false,
        cloudValidated: false,
      },
    };
    this.resourceGroups.set(id.toLowerCase(), resourceGroup);
    return { resourceGroup: deepClone(resourceGroup), created: !existing };
  }

  getResourceGroup(subscriptionId, name) {
    const id = normalizeResourceGroupId(subscriptionId, name);
    const resourceGroup = this.resourceGroups.get(id.toLowerCase());
    return resourceGroup ? deepClone(resourceGroup) : null;
  }

  listResourceGroups(subscriptionId) {
    const prefix = `/subscriptions/${subscriptionId}/resourcegroups/`;
    return [...this.resourceGroups.values()]
      .filter(item => item.id.toLowerCase().startsWith(prefix))
      .map(deepClone);
  }

  deleteResourceGroup(subscriptionId, name) {
    const id = normalizeResourceGroupId(subscriptionId, name);
    const key = id.toLowerCase();
    const existed = this.resourceGroups.delete(key);
    for (const resourceId of [...this.resources.keys()]) {
      if (resourceId.startsWith(`${key}/providers/`)) this.resources.delete(resourceId);
    }
    for (const deploymentId of [...this.deployments.keys()]) {
      if (deploymentId.startsWith(`${key}/providers/microsoft.resources/deployments/`)) this.deployments.delete(deploymentId);
    }
    return existed;
  }

  putDeployment({ subscriptionId, resourceGroupName = null, deploymentName, body }) {
    const id = normalizeDeploymentId(subscriptionId, resourceGroupName, deploymentName);
    const deployment = {
      ...deepClone(body),
      id,
      name: deploymentName,
      type: 'Microsoft.Resources/deployments',
    };
    this.deployments.set(id.toLowerCase(), deployment);
    return deepClone(deployment);
  }

  getDeployment({ subscriptionId, resourceGroupName = null, deploymentName }) {
    const id = normalizeDeploymentId(subscriptionId, resourceGroupName, deploymentName);
    const deployment = this.deployments.get(id.toLowerCase());
    return deployment ? deepClone(deployment) : null;
  }

  deleteDeployment({ subscriptionId, resourceGroupName = null, deploymentName }) {
    const id = normalizeDeploymentId(subscriptionId, resourceGroupName, deploymentName);
    return this.deployments.delete(id.toLowerCase());
  }

  putResource({ subscriptionId, resourceGroupName, providerNamespace, typePath, scopeId = null, body = {}, apiVersion, capability }) {
    const id = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath, scopeId);
    const key = id.toLowerCase();
    const existing = this.resources.get(key);
    const typeParts = typePath.split('/');
    const type = `${providerNamespace}/${typeParts.filter((_, index) => index % 2 === 0).join('/')}`;
    const name = typeParts.filter((_, index) => index % 2 === 1).join('/');
    const leafName = typeParts.at(-1);
    const supportLevel = capability.primaryModes.join('+');
    const deferredProvisioningError = aksDeferredProvisioningError(type, body);
    const lifecycleSequence = deferredProvisioningError
      ? [existing ? 'Updating' : 'Creating', 'Failed']
      : !existing
        ? asyncLifecycleSequence(type)
        : null;
    const resource = {
      id,
      name,
      type,
      resourceGroupName,
      ...(providerNamespace === 'Microsoft.ApiManagement' ? apiManagementIdentityFields(typePath) : {}),
      location: body.location ?? existing?.location ?? 'global',
      tags: body.tags ?? existing?.tags ?? {},
      sku:
        type === 'Microsoft.Cache/redis'
          ? undefined
          : type === 'Microsoft.Network/loadBalancers'
            ? {
                ...(body.sku ?? body.properties?.sku ?? existing?.sku ?? {}),
                name: (body.sku ?? body.properties?.sku ?? existing?.sku)?.name ?? 'Basic',
                tier: (body.sku ?? body.properties?.sku ?? existing?.sku)?.tier ?? 'Regional',
              }
            : (body.sku ?? body.properties?.sku),
      kind: body.kind,
      identity: materializeIdentity(body.identity ?? existing?.identity, id),
      properties: {
        ...(existing?.properties ?? {}),
        ...(body.properties ?? {}),
        ...(type === 'Microsoft.EventGrid/topics'
          ? { endpoint: eventGridTopicEndpoint(name, body.location ?? existing?.location ?? 'global') }
          : {}),
        ...(type === 'Microsoft.EventGrid/eventSubscriptions'
          ? {
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              destination: body.properties?.destination ?? body.destination ?? existing?.properties?.destination ?? null,
              eventDeliverySchema: body.properties?.eventDeliverySchema ?? body.eventDeliverySchema ?? existing?.properties?.eventDeliverySchema ?? 'EventGridSchema',
              expirationTimeUtc: body.properties?.expirationTimeUtc ?? existing?.properties?.expirationTimeUtc ?? null,
            }
          : {}),
        ...(type === 'Microsoft.Storage/storageAccounts'
          ? {
              minimumTlsVersion:
                body.properties?.minimumTlsVersion
                ?? body.minimumTlsVersion
                ?? existing?.properties?.minimumTlsVersion
                ?? 'TLS1_1',
              allowBlobPublicAccess:
                body.properties?.allowBlobPublicAccess
                ?? body.allowBlobPublicAccess
                ?? existing?.properties?.allowBlobPublicAccess
                ?? false,
              supportsHttpsTrafficOnly:
                body.properties?.supportsHttpsTrafficOnly
                ?? body.enableHttpsTrafficOnly
                ?? body.supportsHttpsTrafficOnly
                ?? existing?.properties?.supportsHttpsTrafficOnly
                ?? true,
              primaryEndpoints:
                existing?.properties?.primaryEndpoints
                ?? {
                  blob: `https://${name}.blob.core.windows.net/`,
                  queue: `https://${name}.queue.core.windows.net/`,
                  table: `https://${name}.table.core.windows.net/`,
                  file: `https://${name}.file.core.windows.net/`,
                  web: `https://${name}.web.core.windows.net/`,
                  dfs: `https://${name}.dfs.core.windows.net/`,
                },
              primaryLocation:
                existing?.properties?.primaryLocation
                ?? body.location
                ?? existing?.location
                ?? 'global',
              publicNetworkAccess:
                body.properties?.publicNetworkAccess
                ?? body.publicNetworkAccess
                ?? existing?.properties?.publicNetworkAccess
                ?? 'Enabled',
            }
          : {}),
        ...(type === 'Microsoft.EventGrid/systemTopics'
          ? {
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              metricResourceId: existing?.properties?.metricResourceId ?? id,
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.EventHub/namespaces'
          ? {
              serviceBusEndpoint: existing?.properties?.serviceBusEndpoint ?? eventHubNamespaceEndpoint(name),
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              status: lifecycleSequence ? 'Creating' : existing?.properties?.status ?? 'Active',
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.EventHub/namespaces/eventhubs'
          ? {
              status: existing?.properties?.status ?? 'Active',
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
              partitionIds: existing?.properties?.partitionIds ?? Array.from(
                { length: body.properties?.partitionCount ?? existing?.properties?.partitionCount ?? 1 },
                (_, index) => String(index),
              ),
            }
          : {}),
        ...(type === 'Microsoft.Synapse/workspaces'
          ? {
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              connectivityEndpoints: existing?.properties?.connectivityEndpoints ?? {
                web: `https://web.azuresynapse.net?workspace=%2fsubscriptions%2f${subscriptionId}%2fresourceGroups%2f${resourceGroupName}%2fproviders%2fMicrosoft.Synapse%2fworkspaces%2f${name}`,
                dev: `https://${name}.dev.azuresynapse.net`,
                sql: `${name}.sql.azuresynapse.net`,
                sqlOnDemand: `${name}-ondemand.sql.azuresynapse.net`,
              },
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.Synapse/workspaces/sqlPools'
          ? {
              status: existing?.properties?.status ?? 'Online',
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.DataMigration/services'
          ? {
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              publicNetworkAccess: body.properties?.publicNetworkAccess ?? existing?.properties?.publicNetworkAccess ?? 'Enabled',
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.DataMigration/services/projects'
          ? {
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              migrationState: existing?.properties?.migrationState ?? 'Ready',
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.DataMigration/services/projects/tasks'
          ? {
              taskType: body.properties?.taskType ?? existing?.properties?.taskType ?? null,
              state: existing?.properties?.state ?? 'Queued',
              output: existing?.properties?.output ?? [],
              errors: existing?.properties?.errors ?? [],
              commands: existing?.properties?.commands ?? [],
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.App/managedEnvironments'
          ? {
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              defaultDomain: existing?.properties?.defaultDomain ?? `${name}.globalstack.local`,
              staticIp: existing?.properties?.staticIp ?? '10.255.0.10',
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.App/containerApps'
          ? {
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
              latestRevisionName: existing?.properties?.latestRevisionName ?? `${leafName}--0000001`,
              configuration: {
                ...(body.properties?.configuration ?? existing?.properties?.configuration ?? {}),
                ingress: {
                  ...(body.properties?.configuration?.ingress ?? existing?.properties?.configuration?.ingress ?? {}),
                  fqdn: body.properties?.configuration?.ingress?.fqdn ?? existing?.properties?.configuration?.ingress?.fqdn ?? `${leafName}.${resourceGroupName}.globalstack.local`,
                },
              },
              createdAt: existing?.properties?.createdAt ?? nowIso(),
              updatedAt: nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.ApiManagement/service'
          ? {
              gatewayUrl: existing?.properties?.gatewayUrl ?? apiManagementGatewayUrl(name),
              developerPortalUrl: existing?.properties?.developerPortalUrl ?? `${apiManagementGatewayUrl(name)}/developer`,
            }
          : {}),
        ...(type === 'Microsoft.Web/sites'
          ? {
              defaultHostName: existing?.properties?.defaultHostName ?? functionAppHostName(name),
              hostNames: existing?.properties?.hostNames ?? [functionAppHostName(name)],
              state: lifecycleSequence ? 'Starting' : 'Running',
              enabled: body.properties?.enabled ?? existing?.properties?.enabled ?? true,
            }
          : {}),
        ...(type === 'Microsoft.KeyVault/vaults'
          ? {
              vaultUri: existing?.properties?.vaultUri ?? keyVaultUri(name),
            }
          : {}),
        ...(type === 'Microsoft.ContainerRegistry/registries'
          ? {
              loginServer: existing?.properties?.loginServer ?? containerRegistryLoginServer(name),
              creationDate: existing?.properties?.creationDate ?? nowIso(),
              adminUserEnabled: body.properties?.adminUserEnabled ?? existing?.properties?.adminUserEnabled ?? false,
              publicNetworkAccess: body.properties?.publicNetworkAccess ?? existing?.properties?.publicNetworkAccess ?? 'Enabled',
          }
          : {}),
        ...(type === 'Microsoft.ManagedIdentity/userAssignedIdentities'
          ? userAssignedIdentityProperties(existing?.properties, id)
          : {}),
        ...(type === 'Microsoft.DBforPostgreSQL/flexibleServers'
          ? {
              fullyQualifiedDomainName: existing?.properties?.fullyQualifiedDomainName ?? postgresqlFullyQualifiedDomainName(name),
              state: lifecycleSequence ? 'Ready' : existing?.properties?.state ?? 'Ready',
            }
          : {}),
        ...(type === 'Microsoft.DBforMySQL/flexibleServers'
          ? {
              fullyQualifiedDomainName: existing?.properties?.fullyQualifiedDomainName ?? mysqlFullyQualifiedDomainName(name),
              state: lifecycleSequence ? 'Ready' : existing?.properties?.state ?? 'Ready',
            }
          : {}),
        ...(type === 'Microsoft.DocumentDB/databaseAccounts'
          ? {
              documentEndpoint: existing?.properties?.documentEndpoint ?? cosmosDocumentEndpoint(name),
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
            }
          : {}),
        ...(type === 'Microsoft.Devices/IotHubs'
          ? {
              hostName: existing?.properties?.hostName ?? iotHubHostName(name),
              provisioningState: lifecycleSequence ? lifecycleSequence[0] : existing?.properties?.provisioningState ?? 'Succeeded',
              state: existing?.properties?.state ?? 'Active',
              eventHubEndpoints: existing?.properties?.eventHubEndpoints ?? {
                events: {
                  endpoint: `sb://${name}.servicebus.windows.net/`,
                  path: 'messages/events',
                  partitionCount: 4,
                  retentionTimeInDays: 1,
                },
              },
            }
          : {}),
        ...(type === 'Microsoft.DigitalTwins/digitalTwinsInstances'
          ? {
              hostName: existing?.properties?.hostName ?? digitalTwinsHostName(name, body.location ?? existing?.location ?? 'global'),
              provisioningState: lifecycleSequence ? lifecycleSequence[0] : existing?.properties?.provisioningState ?? 'Succeeded',
              publicNetworkAccess: body.properties?.publicNetworkAccess ?? existing?.properties?.publicNetworkAccess ?? 'Enabled',
            }
          : {}),
        ...(type === 'Microsoft.Search/searchServices'
          ? {
              endpoint: existing?.properties?.endpoint ?? searchServiceEndpoint(name),
              hostName: existing?.properties?.hostName ?? `${name}.search.windows.net`,
              provisioningState: lifecycleSequence ? lifecycleSequence[0] : existing?.properties?.provisioningState ?? 'Succeeded',
              publicNetworkAccess: body.properties?.publicNetworkAccess ?? existing?.properties?.publicNetworkAccess ?? 'Enabled',
            }
          : {}),
        ...(type === 'Microsoft.Cache/redis'
          ? {
              sku: body.properties?.sku ?? existing?.properties?.sku,
              hostName: existing?.properties?.hostName ?? redisHostName(name),
              port: existing?.properties?.port ?? 6379,
              sslPort: existing?.properties?.sslPort ?? 6380,
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
            }
          : {}),
        ...(type === 'Microsoft.Logic/workflows'
          ? {
              state: body.properties?.state ?? existing?.properties?.state ?? 'Enabled',
              accessEndpoint: existing?.properties?.accessEndpoint ?? `https://logic.azure.com/workflows/${name}`,
            }
          : {}),
        ...(type === 'Microsoft.Network/virtualNetworks/virtualNetworkPeerings'
          ? {
              remoteVirtualNetwork:
                body.properties?.remoteVirtualNetwork
                ?? existing?.properties?.remoteVirtualNetwork
                ?? null,
              allowVirtualNetworkAccess:
                body.properties?.allowVirtualNetworkAccess
                ?? existing?.properties?.allowVirtualNetworkAccess
                ?? true,
              allowForwardedTraffic:
                body.properties?.allowForwardedTraffic
                ?? existing?.properties?.allowForwardedTraffic
                ?? false,
              allowGatewayTransit:
                body.properties?.allowGatewayTransit
                ?? existing?.properties?.allowGatewayTransit
                ?? false,
              useRemoteGateways:
                body.properties?.useRemoteGateways
                ?? existing?.properties?.useRemoteGateways
                ?? false,
              peeringState: existing?.properties?.peeringState ?? 'Connected',
              provisioningState: existing?.properties?.provisioningState ?? 'Succeeded',
            }
          : {}),
        ...(type === 'Microsoft.Insights/components'
          ? {
              AppId: existing?.properties?.AppId ?? appInsightsAppId(id),
              InstrumentationKey: existing?.properties?.InstrumentationKey ?? appInsightsInstrumentationKey(id),
              ConnectionString: existing?.properties?.ConnectionString ?? appInsightsConnectionString(id, body.location ?? existing?.location ?? 'global'),
              ApplicationId: existing?.properties?.ApplicationId ?? appInsightsAppId(id),
              provisioningState: lifecycleSequence ? lifecycleSequence[0] : existing?.properties?.provisioningState ?? 'Succeeded',
            }
          : {}),
        ...(type === 'Microsoft.OperationalInsights/workspaces'
          ? {
              customerId: existing?.properties?.customerId ?? operationalInsightsWorkspaceCustomerId(id),
              provisioningState: lifecycleSequence ? lifecycleSequence[0] : existing?.properties?.provisioningState ?? 'Succeeded',
              publicNetworkAccessForIngestion:
                body.properties?.publicNetworkAccessForIngestion
                ?? existing?.properties?.publicNetworkAccessForIngestion
                ?? 'Enabled',
              publicNetworkAccessForQuery:
                body.properties?.publicNetworkAccessForQuery
                ?? existing?.properties?.publicNetworkAccessForQuery
                ?? 'Enabled',
            }
          : {}),
        ...(type === 'Microsoft.Cdn/profiles'
          ? {
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              resourceState: existing?.properties?.resourceState ?? 'Active',
            }
          : {}),
        ...(type === 'Microsoft.Cdn/profiles/afdEndpoints'
          ? {
              hostName: existing?.properties?.hostName ?? `${leafName}.azurefd.net`,
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              deploymentStatus: existing?.properties?.deploymentStatus ?? 'NotStarted',
              enabledState: body.properties?.enabledState ?? existing?.properties?.enabledState ?? 'Enabled',
            }
          : {}),
        ...(type === 'Microsoft.Cdn/profiles/originGroups'
          ? {
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              deploymentStatus: existing?.properties?.deploymentStatus ?? 'NotStarted',
              profileName: existing?.properties?.profileName ?? typeParts[1],
              sessionAffinityState:
                body.properties?.sessionAffinityState
                ?? body.sessionAffinityState
                ?? existing?.properties?.sessionAffinityState
                ?? 'Disabled',
            }
          : {}),
        ...(type === 'Microsoft.Cdn/profiles/originGroups/origins'
          ? {
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              deploymentStatus: existing?.properties?.deploymentStatus ?? 'NotStarted',
              profileName: existing?.properties?.profileName ?? typeParts[1],
              originGroupName: existing?.properties?.originGroupName ?? typeParts[3],
              enabledState:
                body.properties?.enabledState
                ?? body.enabledState
                ?? existing?.properties?.enabledState
                ?? 'Enabled',
              enforceCertificateNameCheck:
                body.properties?.enforceCertificateNameCheck
                ?? body.enforceCertificateNameCheck
                ?? existing?.properties?.enforceCertificateNameCheck
                ?? true,
            }
          : {}),
        ...(type === 'Microsoft.Cdn/profiles/endpoints'
          ? {
              hostName: existing?.properties?.hostName ?? `${leafName}.azureedge.net`,
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              resourceState: existing?.properties?.resourceState ?? 'Running',
            }
          : {}),
        ...(type === 'Microsoft.Cdn/profiles/afdEndpoints/routes'
          ? {
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              deploymentStatus: existing?.properties?.deploymentStatus ?? 'NotStarted',
              profileName: existing?.properties?.profileName ?? typeParts[1],
              endpointName: existing?.properties?.endpointName ?? typeParts[3],
              enabledState:
                body.properties?.enabledState
                ?? body.enabledState
                ?? existing?.properties?.enabledState
                ?? 'Enabled',
            }
          : {}),
        ...(
          (type === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies'
            || type === 'Microsoft.Network/FrontDoorWebApplicationFirewallPolicies')
          ? {
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              resourceState: existing?.properties?.resourceState ?? 'Enabled',
            }
          : {}),
        ...(type === 'Microsoft.Cdn/profiles/securityPolicies'
          ? {
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              deploymentStatus: existing?.properties?.deploymentStatus ?? 'NotStarted',
            }
          : {}),
        ...(type === 'Microsoft.AppConfiguration/configurationStores'
          ? {
              endpoint: existing?.properties?.endpoint ?? `https://${name}.azconfig.io`,
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              creationDate: existing?.properties?.creationDate ?? nowIso(),
              disableLocalAuth: body.properties?.disableLocalAuth ?? existing?.properties?.disableLocalAuth ?? false,
              publicNetworkAccess: body.properties?.publicNetworkAccess ?? existing?.properties?.publicNetworkAccess ?? 'Enabled',
          }
          : {}),
        ...(type === 'Microsoft.Storage/storageAccounts/fileServices/shares'
          ? {
              accessTier: body.properties?.accessTier ?? existing?.properties?.accessTier ?? 'TransactionOptimized',
              enabledProtocols: body.properties?.enabledProtocols ?? existing?.properties?.enabledProtocols ?? 'SMB',
              shareQuota: body.properties?.shareQuota ?? existing?.properties?.shareQuota ?? 5120,
              deleted: false,
              version: existing?.properties?.version ?? nowIso(),
            }
          : {}),
        ...(type === 'Microsoft.ContainerService/managedClusters'
          ? (() => {
              const location = body.location ?? existing?.location ?? 'global';
              const dnsPrefix = body.properties?.dnsPrefix ?? existing?.properties?.dnsPrefix ?? name;
              const version = body.properties?.kubernetesVersion ?? existing?.properties?.kubernetesVersion ?? '1.29.2';
              const apiServerAccessProfile = materializeAksApiServerAccessProfile(
                body.properties?.apiServerAccessProfile ?? {},
                existing?.properties?.apiServerAccessProfile ?? {},
              );
              const privateFQDN = apiServerAccessProfile.enablePrivateCluster === true
                ? existing?.properties?.privateFQDN ?? aksPrivateFqdn(name, location, dnsPrefix)
                : undefined;
              return {
                fqdn: existing?.properties?.fqdn ?? aksFqdn(name, location, dnsPrefix),
                privateFQDN,
                apiServerAccessProfile,
                networkProfile: materializeAksNetworkProfile(
                  body.properties?.networkProfile ?? {},
                  existing?.properties?.networkProfile ?? {},
                ),
                nodeResourceGroup: body.properties?.nodeResourceGroup ?? existing?.properties?.nodeResourceGroup ?? aksNodeResourceGroup(resourceGroupName, name, location),
                currentKubernetesVersion: version,
                kubernetesVersion: version,
                credentialGeneration: existing?.properties?.credentialGeneration ?? 0,
                powerState: { code: 'Running' },
                agentPoolProfiles: (body.properties?.agentPoolProfiles ?? existing?.properties?.agentPoolProfiles ?? []).map(pool =>
                  materializeAksAgentPoolProfile(
                    pool,
                    (existing?.properties?.agentPoolProfiles ?? []).find(existingPool => String(existingPool?.name ?? '').toLowerCase() === String(pool?.name ?? '').toLowerCase()),
                    { clusterVersion: version },
                  )
                ),
              };
            })()
          : {}),
        ...(type === 'Microsoft.ContainerService/managedClusters/agentPools'
          ? (() => {
              const parentCluster = this.resources.get(id.toLowerCase().replace(/\/agentpools\/[^/]+$/, ''));
              const clusterVersion = parentCluster?.properties?.kubernetesVersion ?? parentCluster?.properties?.currentKubernetesVersion ?? null;
              return {
                ...materializeAksAgentPoolProfile(body.properties ?? {}, existing?.properties ?? {}, { clusterVersion }),
                count: body.properties?.count ?? existing?.properties?.count ?? 1,
                vmSize: body.properties?.vmSize ?? existing?.properties?.vmSize ?? 'Standard_DS2_v2',
              };
            })()
          : {}),
        ...(type === 'Microsoft.Network/dnsZones'
          ? {
              nameServers: existing?.properties?.nameServers ?? dnsNameServers(name),
              numberOfRecordSets: existing?.properties?.numberOfRecordSets ?? 2,
            }
          : {}),
        ...(type === 'Microsoft.Network/publicIPAddresses'
          ? {
              publicIPAllocationMethod:
                body.properties?.publicIPAllocationMethod
                ?? body.publicIPAllocationMethod
                ?? existing?.properties?.publicIPAllocationMethod
                ?? 'Static',
              publicIPAddressVersion:
                body.properties?.publicIPAddressVersion
                ?? body.publicIPAddressVersion
                ?? existing?.properties?.publicIPAddressVersion
                ?? 'IPv4',
              idleTimeoutInMinutes:
                body.properties?.idleTimeoutInMinutes
                ?? body.idleTimeoutInMinutes
                ?? existing?.properties?.idleTimeoutInMinutes
                ?? 4,
              ipAddress: existing?.properties?.ipAddress ?? publicIpAddress(id),
              dnsSettings: (() => {
                const existingDns = existing?.properties?.dnsSettings ?? {};
                const inputDns = deepClone(body.properties?.dnsSettings ?? body.dnsSettings ?? {});
                const label = inputDns.domainNameLabel ?? existingDns.domainNameLabel;
                if (!label && Object.keys(existingDns).length === 0 && Object.keys(inputDns).length === 0) {
                  return undefined;
                }
                return {
                  ...existingDns,
                  ...inputDns,
                  ...(label ? { domainNameLabel: label, fqdn: publicIpFqdn(label, body.location ?? existing?.location ?? 'eastus') } : {}),
                };
              })(),
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              resourceGuid: existing?.properties?.resourceGuid ?? createHash('sha256').update(`globalstack:pip:${id}`).digest('hex').slice(0, 32),
            }
          : {}),
        ...(type === 'Microsoft.Network/applicationGateways'
          ? {
              gatewayIPConfigurations:
                body.properties?.gatewayIPConfigurations
                ?? body.gatewayIPConfigurations
                ?? existing?.properties?.gatewayIPConfigurations
                ?? [],
              frontendIPConfigurations:
                body.properties?.frontendIPConfigurations
                ?? body.frontendIPConfigurations
                ?? existing?.properties?.frontendIPConfigurations
                ?? [],
              frontendPorts:
                body.properties?.frontendPorts
                ?? body.frontendPorts
                ?? existing?.properties?.frontendPorts
                ?? [],
              backendAddressPools:
                body.properties?.backendAddressPools
                ?? body.backendAddressPools
                ?? existing?.properties?.backendAddressPools
                ?? [],
              backendHttpSettingsCollection:
                body.properties?.backendHttpSettingsCollection
                ?? body.backendHttpSettingsCollection
                ?? existing?.properties?.backendHttpSettingsCollection
                ?? [],
              httpListeners:
                body.properties?.httpListeners
                ?? body.httpListeners
                ?? existing?.properties?.httpListeners
                ?? [],
              requestRoutingRules:
                body.properties?.requestRoutingRules
                ?? body.requestRoutingRules
                ?? existing?.properties?.requestRoutingRules
                ?? [],
              operationalState: 'Running',
              resourceGuid: existing?.properties?.resourceGuid ?? createHash('sha256').update(`globalstack:appgw:${id}`).digest('hex').slice(0, 32),
            }
          : {}),
        ...(type === 'Microsoft.Network/loadBalancers'
          ? {
              frontendIPConfigurations:
                body.properties?.frontendIPConfigurations
                ?? body.frontendIPConfigurations
                ?? existing?.properties?.frontendIPConfigurations
                ?? [],
              backendAddressPools:
                body.properties?.backendAddressPools
                ?? body.backendAddressPools
                ?? existing?.properties?.backendAddressPools
                ?? [],
              loadBalancingRules:
                body.properties?.loadBalancingRules
                ?? body.loadBalancingRules
                ?? existing?.properties?.loadBalancingRules
                ?? [],
              probes:
                body.properties?.probes
                ?? body.probes
                ?? existing?.properties?.probes
                ?? [],
              inboundNatRules:
                body.properties?.inboundNatRules
                ?? body.inboundNatRules
                ?? existing?.properties?.inboundNatRules
                ?? [],
              inboundNatPools:
                body.properties?.inboundNatPools
                ?? body.inboundNatPools
                ?? existing?.properties?.inboundNatPools
                ?? [],
              outboundRules:
                body.properties?.outboundRules
                ?? body.outboundRules
                ?? existing?.properties?.outboundRules
                ?? [],
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              resourceGuid: existing?.properties?.resourceGuid ?? createHash('sha256').update(`globalstack:lb:${id}`).digest('hex').slice(0, 32),
            }
          : {}),
        ...((type.startsWith('Microsoft.Network/dnsZones/') || type.startsWith('Microsoft.Network/privateDnsZones/'))
          && !type.endsWith('/virtualNetworkLinks')
          ? {
              fqdn: existing?.properties?.fqdn ?? dnsRecordFqdn(typePath),
            }
          : {}),
        ...(type === 'Microsoft.KeyVault/vaults/secrets'
          ? {
              secretUri: existing?.properties?.secretUri ?? keyVaultSecretUri(name),
              secretUriWithVersion: existing?.properties?.secretUriWithVersion ?? `${keyVaultSecretUri(name)}/globalstack-version`,
              vaultName: keyVaultChildVaultName(name),
            }
          : {}),
        ...(type === 'Microsoft.KeyVault/vaults/keys'
          ? {
              keyUri: existing?.properties?.keyUri ?? keyVaultKeyUri(name),
              keyUriWithVersion: existing?.properties?.keyUriWithVersion ?? `${keyVaultKeyUri(name)}/globalstack-version`,
              vaultName: keyVaultChildVaultName(name),
            }
          : {}),
        provisioningState: lifecycleSequence ? lifecycleSequence[0] : 'Succeeded',
        ...(type === 'Microsoft.ServiceBus/namespaces'
          ? { status: lifecycleSequence ? lifecycleSequence[0] : 'Succeeded' }
          : {}),
      },
      apiVersion,
      ...(type === 'Microsoft.Insights/components'
        ? {
            appId: existing?.appId ?? appInsightsAppId(id),
            instrumentationKey: existing?.instrumentationKey ?? appInsightsInstrumentationKey(id),
            connectionString: existing?.connectionString ?? appInsightsConnectionString(id, body.location ?? existing?.location ?? 'global'),
          }
        : {}),
      ...(type === 'Microsoft.OperationalInsights/workspaces'
        ? {
            customerId: existing?.customerId ?? operationalInsightsWorkspaceCustomerId(id),
          }
        : {}),
      globalstack: {
        supportLevel,
        capabilityId: capability.id,
        backingEngines: capability.backingEngines,
        emulationDepth: emulationDepth(capability),
        realAzureApiComplete: false,
        cloudValidated: capability.cloudValidated,
        knownGaps: capability.knownGaps,
        ...(lifecycleSequence
          ? {
              lifecycleState: {
                provisioningSequence: lifecycleSequence,
                readCount: 0,
                ...(deferredProvisioningError
                  ? {
                      terminalStatus: 'Failed',
                      error: deferredProvisioningError,
                    }
                  : {}),
              },
            }
          : existing?.globalstack?.lifecycleState
            ? { lifecycleState: existing.globalstack.lifecycleState }
            : {}),
      },
    };
    this.resources.set(key, resource);
    if (type === 'Microsoft.Network/virtualNetworks') {
      const inlineSubnets = body.properties?.subnets ?? body.subnets;
      if (Array.isArray(inlineSubnets)) {
        const subnetCapability = capabilityForResourceType('Microsoft.Network/virtualNetworks/subnets') ?? capability;
        const subnetPrefix = `${key}/subnets/`;
        const expectedSubnetNames = new Set();
        for (const subnet of inlineSubnets) {
          const subnetName = String(subnet?.name ?? subnet?.subnetName ?? '').trim();
          if (!subnetName) continue;
          expectedSubnetNames.add(subnetName.toLowerCase());
          this.putResource({
            subscriptionId,
            resourceGroupName,
            providerNamespace,
            typePath: `${typePath}/subnets/${subnetName}`,
            scopeId,
            apiVersion,
            capability: subnetCapability,
            body: {
              location: body.location ?? existing?.location ?? 'global',
              tags: subnet.tags ?? {},
              properties: normalizeInlineSubnetProperties(subnet),
            },
          });
        }
        for (const resourceId of [...this.resources.keys()]) {
          if (!resourceId.startsWith(subnetPrefix)) continue;
          const subnetName = resourceId.slice(subnetPrefix.length).split('/')[0];
          if (!expectedSubnetNames.has(subnetName)) this.resources.delete(resourceId);
        }
      }
    }
    if (type === 'Microsoft.ContainerService/managedClusters') {
      const inlineAgentPools = Array.isArray(resource.properties?.agentPoolProfiles) ? resource.properties.agentPoolProfiles : [];
      const agentPoolCapability = capabilityForResourceType('Microsoft.ContainerService/managedClusters/agentPools') ?? capability;
      const agentPoolPrefix = `${key}/agentpools/`;
      const expectedAgentPoolNames = new Set();
      for (const agentPool of inlineAgentPools) {
        const agentPoolName = String(agentPool?.name ?? '').trim();
        if (!agentPoolName) continue;
        expectedAgentPoolNames.add(agentPoolName.toLowerCase());
        this.putResource({
          subscriptionId,
          resourceGroupName,
          providerNamespace,
          typePath: `${typePath}/agentPools/${agentPoolName}`,
          scopeId,
          apiVersion,
          capability: agentPoolCapability,
          body: {
            location: body.location ?? existing?.location ?? 'global',
            tags: resource.tags,
            properties: deepClone(agentPool),
          },
        });
      }
      for (const resourceId of [...this.resources.keys()]) {
        if (!resourceId.startsWith(agentPoolPrefix)) continue;
        const agentPoolName = resourceId.slice(agentPoolPrefix.length).split('/')[0];
        if (!expectedAgentPoolNames.has(agentPoolName)) this.resources.delete(resourceId);
      }
    }
    if (type === 'Microsoft.ContainerService/managedClusters/agentPools') {
      const parentRoute = {
        subscriptionId,
        resourceGroupName,
        providerNamespace,
        typePath: typeParts.slice(0, -2).join('/'),
        scopeId,
      };
      const parentId = normalizeResourceId(
        parentRoute.subscriptionId,
        parentRoute.resourceGroupName,
        parentRoute.providerNamespace,
        parentRoute.typePath,
        parentRoute.scopeId ?? null,
      ).toLowerCase();
      const parentResource = this.resources.get(parentId);
      if (parentResource) {
        const profiles = Array.isArray(parentResource.properties?.agentPoolProfiles)
          ? parentResource.properties.agentPoolProfiles
          : [];
        const existingIndex = profiles.findIndex(pool => String(pool?.name ?? '').toLowerCase() === String(leafName ?? '').toLowerCase());
        const materialized = materializeAksAgentPoolProfile({
          ...resource.properties,
          name: leafName,
        }, profiles[existingIndex] ?? {}, {
          clusterVersion: parentResource.properties?.kubernetesVersion ?? parentResource.properties?.currentKubernetesVersion ?? null,
        });
        if (existingIndex >= 0) profiles[existingIndex] = materialized;
        else profiles.push(materialized);
        parentResource.properties.agentPoolProfiles = profiles;
      }
    }
    return {
      resource: deepClone(resource),
      created: !existing,
      asyncAccepted: Boolean(lifecycleSequence),
      asyncStatus: deferredProvisioningError && !existing ? 201 : undefined,
      asyncResponseBody: Boolean(deferredProvisioningError),
      deferredProvisioningError: deferredProvisioningError ? deepClone(deferredProvisioningError) : null,
    };
  }

  getResource({ subscriptionId, resourceGroupName, providerNamespace, typePath, scopeId = null }) {
    const id = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath, scopeId);
    const resource = this.resources.get(id.toLowerCase());
    if (!resource) return null;
    const lifecycleState = lifecycleStateFor(resource);
    if (lifecycleState?.provisioningSequence) {
      const index = Math.min(lifecycleState.readCount, lifecycleState.provisioningSequence.length - 1);
      resource.properties.provisioningState = lifecycleState.provisioningSequence[index];
      if (resource.type === 'Microsoft.ServiceBus/namespaces') {
        resource.properties.status = lifecycleState.provisioningSequence[index];
      }
      if (resource.type === 'Microsoft.Web/sites') {
        resource.properties.state = index >= lifecycleState.provisioningSequence.length - 1 ? 'Running' : 'Starting';
      }
      lifecycleState.readCount += 1;
    }
    return deepClone(resource);
  }

  resourceProvisioningState(route) {
    const id = normalizeResourceId(route.subscriptionId, route.resourceGroupName, route.providerNamespace, route.typePath, route.scopeId ?? null);
    const resource = this.resources.get(id.toLowerCase());
    return resource?.properties?.provisioningState ?? null;
  }

  completeResourceAsync(resource, { terminalStatus = null, error = null } = {}) {
    const lifecycleState = lifecycleStateFor(resource);
    if (!lifecycleState?.provisioningSequence) return;
    const finalState = terminalStatus ?? lifecycleState.terminalStatus ?? lifecycleState.provisioningSequence.at(-1);
    resource.properties.provisioningState = finalState;
    if (resource.type === 'Microsoft.ServiceBus/namespaces') {
      resource.properties.status = finalState;
    }
    if (resource.type === 'Microsoft.Web/sites') {
      resource.properties.state = finalState === 'Succeeded' ? 'Running' : 'Stopped';
    }
    if (resource.type === 'Microsoft.ContainerService/managedClusters' && Array.isArray(resource.properties.agentPoolProfiles)) {
      resource.properties.agentPoolProfiles = resource.properties.agentPoolProfiles.map(pool => ({
        ...pool,
        provisioningState: finalState,
      }));
    }
    if (error) {
      resource.properties.error = deepClone(error);
    }
    lifecycleState.readCount = lifecycleState.provisioningSequence.length - 1;
  }

  registerAsyncOperation(operationId, { providerRoute, result }) {
    if (!operationId || !providerRoute) return;
    const resourceId = normalizeResourceId(
      providerRoute.subscriptionId,
      providerRoute.resourceGroupName,
      providerRoute.providerNamespace,
      providerRoute.typePath,
      providerRoute.scopeId ?? null,
    ).toLowerCase();
    this.asyncOperations.set(String(operationId).toLowerCase(), {
      resourceId,
      terminalStatus: result?.deferredProvisioningError ? 'Failed' : 'Succeeded',
      error: result?.deferredProvisioningError ? deepClone(result.deferredProvisioningError) : null,
    });
  }

  asyncOperationStatus(operationId) {
    const operation = this.asyncOperations.get(String(operationId ?? '').toLowerCase());
    if (!operation) return null;
    const resource = this.resources.get(operation.resourceId);
    if (resource) {
      this.completeResourceAsync(resource, {
        terminalStatus: operation.terminalStatus,
        error: operation.error,
      });
    }
    return {
      status: operation.terminalStatus,
      properties: {
        provisioningState: operation.terminalStatus,
      },
      ...(operation.error ? { error: deepClone(operation.error) } : {}),
    };
  }

  completeAsyncProvisioning() {
    for (const resource of this.resources.values()) {
      const lifecycleState = lifecycleStateFor(resource);
      this.completeResourceAsync(resource, {
        terminalStatus: lifecycleState?.terminalStatus ?? lifecycleState?.provisioningSequence?.at(-1),
        error: lifecycleState?.error ?? null,
      });
    }
  }

  deleteResource({ subscriptionId, resourceGroupName, providerNamespace, typePath, scopeId = null }) {
    const id = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath, scopeId);
    const key = id.toLowerCase();
    const typeParts = typePath.split('/');
    const type = `${providerNamespace}/${typeParts.filter((_, index) => index % 2 === 0).join('/')}`;
    if (type === 'Microsoft.ContainerService/managedClusters/agentPools') {
      const parentTypePath = typeParts.slice(0, -2).join('/');
      const parentId = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, parentTypePath, scopeId).toLowerCase();
      const parentResource = this.resources.get(parentId);
      if (parentResource) {
        parentResource.properties.agentPoolProfiles = (parentResource.properties?.agentPoolProfiles ?? [])
          .filter(pool => String(pool?.name ?? '').toLowerCase() !== String(typeParts.at(-1) ?? '').toLowerCase());
      }
    }
    let deleted = false;
    for (const resourceId of [...this.resources.keys()]) {
      if (resourceId === key || resourceId.startsWith(`${key}/`)) {
        this.resources.delete(resourceId);
        deleted = true;
      }
    }
    return deleted;
  }

  listResources(subscriptionId, resourceGroupName) {
    const prefix = `${normalizeResourceGroupId(subscriptionId, resourceGroupName).toLowerCase()}/providers/`;
    return [...this.resources.values()]
      .filter(resource => resource.id.toLowerCase().startsWith(prefix))
      .map(deepClone);
  }

  listResourcesByType({ subscriptionId, resourceGroupName, providerNamespace, typePath }) {
    const rgPrefix = `${normalizeResourceGroupId(subscriptionId, resourceGroupName).toLowerCase()}/providers/`;
    const collectionPrefix = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath).toLowerCase();
    const collectionDepth = collectionPrefix.split('/').length;
    const typeParts = typePath.split('/');
    const resourceType = `${providerNamespace}/${typeParts.filter((_, index) => index % 2 === 0).join('/')}`;
    return [...this.resources.values()]
      .filter(resource => {
        const id = resource.id.toLowerCase();
        return id.startsWith(rgPrefix)
          && id.startsWith(`${collectionPrefix}/`)
          && id.split('/').length === collectionDepth + 1
          && resource.type.toLowerCase() === resourceType.toLowerCase();
      })
      .map(deepClone);
  }

  listEventGridTopicKeys(route) {
    const resource = this.getResource(route);
    if (!resource || resource.type !== 'Microsoft.EventGrid/topics') return null;
    return {
      key1: eventGridTopicKey(resource.id, 'key1'),
      key2: eventGridTopicKey(resource.id, 'key2'),
    };
  }

  listStorageAccountKeys(route) {
    const resource = this.getResource(route);
    if (!resource || resource.type !== 'Microsoft.Storage/storageAccounts') return null;
    return {
      keys: [
        {
          keyName: 'key1',
          permissions: 'FULL',
          value: storageAccountKey(resource.id, 'key1'),
          creationTime: nowIso(),
        },
        {
          keyName: 'key2',
          permissions: 'FULL',
          value: storageAccountKey(resource.id, 'key2'),
          creationTime: nowIso(),
        },
      ],
    };
  }

  listStorageAccountServiceSas(route, body = {}) {
    const resource = this.getResource(route);
    if (!resource || resource.type !== 'Microsoft.Storage/storageAccounts') return null;
    const accountKeys = this.listStorageAccountKeys(route);
    const accountKey = accountKeys?.keys?.[0]?.value;
    if (!accountKey) return null;
    const fields = {
      permissions: body.permissions ?? '',
      startTime: body.sharedAccessStartTime ?? '',
      expiryTime: body.sharedAccessExpiryTime ?? '',
      canonicalizedResource: body.canonicalizedResource ?? `/blob/${resource.name}`,
      protocols: body.protocols ?? 'Https',
      version: body.version ?? '2024-11-04',
      resource: body.resource ?? 'b',
      cacheControl: body.cacheControl ?? '',
      contentDisposition: body.contentDisposition ?? '',
      contentEncoding: body.contentEncoding ?? '',
      contentLanguage: body.contentLanguage ?? '',
      contentType: body.contentType ?? '',
    };
    const sig = storageServiceSasSignature(accountKey, fields);
    const params = new URLSearchParams();
    params.set('sv', fields.version);
    params.set('spr', String(fields.protocols).toLowerCase());
    if (fields.startTime) params.set('st', fields.startTime);
    if (fields.expiryTime) params.set('se', fields.expiryTime);
    if (fields.permissions) params.set('sp', fields.permissions);
    if (fields.resource) params.set('sr', String(fields.resource).toLowerCase());
    if (fields.cacheControl) params.set('rscc', fields.cacheControl);
    if (fields.contentDisposition) params.set('rscd', fields.contentDisposition);
    if (fields.contentEncoding) params.set('rsce', fields.contentEncoding);
    if (fields.contentLanguage) params.set('rscl', fields.contentLanguage);
    if (fields.contentType) params.set('rsct', fields.contentType);
    params.set('sig', sig);
    return {
      serviceSasToken: params.toString(),
    };
  }

  listOperationalInsightsWorkspaceSharedKeys(route) {
    const resource = this.getResource(route);
    if (!resource || resource.type !== 'Microsoft.OperationalInsights/workspaces') return null;
    return {
      primarySharedKey: operationalInsightsWorkspaceSharedKey(resource.id, 'primary'),
      secondarySharedKey: operationalInsightsWorkspaceSharedKey(resource.id, 'secondary'),
    };
  }

  listServiceBusNamespaceKeys(namespaceRoute, authorizationRuleName = 'RootManageSharedAccessKey') {
    const resource = this.getResource(namespaceRoute);
    if (!resource || resource.type !== 'Microsoft.ServiceBus/namespaces') return null;
    const keyName = authorizationRuleName.includes('/')
      ? authorizationRuleName.split('/').at(-1)
      : authorizationRuleName;
    const endpoint = `sb://${resource.name}.servicebus.windows.net/`;
    const primaryKey = serviceBusNamespacePrimaryKey(resource.id, keyName);
    const secondaryKey = serviceBusNamespaceSecondaryKey(resource.id, keyName);
    return {
      keyName,
      primaryKey,
      secondaryKey,
      primaryConnectionString: `Endpoint=${endpoint};SharedAccessKeyName=${keyName};SharedAccessKey=${primaryKey}`,
      secondaryConnectionString: `Endpoint=${endpoint};SharedAccessKeyName=${keyName};SharedAccessKey=${secondaryKey}`,
      aliasPrimaryConnectionString: '',
      aliasSecondaryConnectionString: '',
    };
  }

  listAksCredentials(route, role = 'user') {
    const resource = this.getResource(route);
    if (!resource || resource.type !== 'Microsoft.ContainerService/managedClusters') return null;
    const clusterName = resource.name;
    const userName = role === 'admin' ? 'clusterAdmin' : 'clusterUser';
    const token = aksKubeToken(resource.id, role, resource.properties?.credentialGeneration ?? 0);
    const kubeconfig = [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      `- name: ${clusterName}`,
      '  cluster:',
      `    server: https://${resource.properties.fqdn}`,
      '    certificate-authority-data: Z2xvYmFsc3RhY2stbG9jYWwtYWtzLWNh',
      'contexts:',
      `- name: ${userName}`,
      '  context:',
      `    cluster: ${clusterName}`,
      `    user: ${userName}`,
      `current-context: ${userName}`,
      'users:',
      `- name: ${userName}`,
      '  user:',
      `    token: ${token}`,
      '',
    ].join('\n');
    return {
      kubeconfigs: [
        {
          name: userName,
          value: Buffer.from(kubeconfig).toString('base64'),
        },
      ],
    };
  }

  updateAksRuntimePoolState(clusterId, poolName, updates = {}) {
    const normalizedClusterId = String(clusterId ?? '').toLowerCase();
    const normalizedPoolName = String(poolName ?? '').toLowerCase();
    if (!normalizedClusterId || !normalizedPoolName) return false;
    const cluster = this.resources.get(normalizedClusterId);
    if (!cluster || cluster.type !== 'Microsoft.ContainerService/managedClusters') return false;
    const childId = `${cluster.id}/agentPools/${poolName}`.toLowerCase();
    const child = this.resources.get(childId);

    const applyUpdates = (target) => {
      if (!target?.properties) return;
      if (Object.hasOwn(updates, 'count')) target.properties.count = updates.count;
      if (Object.hasOwn(updates, 'enableAutoScaling')) target.properties.enableAutoScaling = updates.enableAutoScaling;
      if (Object.hasOwn(updates, 'minCount')) target.properties.minCount = updates.minCount;
      if (Object.hasOwn(updates, 'maxCount')) target.properties.maxCount = updates.maxCount;
      if (Object.hasOwn(updates, 'provisioningState')) target.properties.provisioningState = updates.provisioningState;
      if (Object.hasOwn(updates, 'powerState')) target.properties.powerState = deepClone(updates.powerState);
      if (Object.hasOwn(updates, 'nodeImageVersion')) target.properties.nodeImageVersion = updates.nodeImageVersion;
      if (Object.hasOwn(updates, 'orchestratorVersion')) target.properties.orchestratorVersion = updates.orchestratorVersion;
    };

    const profiles = Array.isArray(cluster.properties?.agentPoolProfiles)
      ? cluster.properties.agentPoolProfiles
      : [];
    const profile = profiles.find(item => String(item?.name ?? '').toLowerCase() === normalizedPoolName);
    if (!profile) return false;
    applyUpdates({ properties: profile });
    if (child) applyUpdates(child);
    return true;
  }

  aksUpgradeProfile(route) {
    const resource = this.getResource(route);
    if (!resource || resource.type !== 'Microsoft.ContainerService/managedClusters') return null;
    const currentVersion = resource.properties?.currentKubernetesVersion ?? resource.properties?.kubernetesVersion ?? '1.29.2';
    const nextMinor = (() => {
      const [majorRaw, minorRaw] = String(currentVersion).split('.');
      const major = Number(majorRaw) || 1;
      const minor = Number(minorRaw) || 29;
      return `${major}.${minor + 1}.0`;
    })();
    const poolProfiles = (resource.properties?.agentPoolProfiles ?? []).map(pool => ({
      name: pool.name,
      kubernetesVersion: pool.orchestratorVersion ?? currentVersion,
      osType: pool.osType ?? 'Linux',
      upgrades: [
        {
          kubernetesVersion: nextMinor,
          isPreview: false,
        },
      ],
    }));
    return {
      id: `${resource.id}/upgradeProfiles/default`,
      name: 'default',
      type: 'Microsoft.ContainerService/managedClusters/upgradeProfiles',
      properties: {
        controlPlaneProfile: {
          kubernetesVersion: currentVersion,
          osType: 'Linux',
          upgrades: [
            {
              kubernetesVersion: nextMinor,
              isPreview: false,
            },
          ],
        },
        agentPoolProfiles: poolProfiles,
      },
    };
  }

  resetAksServicePrincipalProfile(route, body = {}) {
    const id = normalizeResourceId(route.subscriptionId, route.resourceGroupName, route.providerNamespace, route.typePath, route.scopeId ?? null);
    const resource = this.resources.get(id.toLowerCase());
    if (!resource || resource.type !== 'Microsoft.ContainerService/managedClusters') return null;
    if (resource.properties?.identityProfile || resource.identity?.type === 'SystemAssigned' || resource.identity?.type === 'UserAssigned') {
      return {
        error: {
          status: 400,
          code: 'BadRequest',
          message: 'Reset service principal profile cannot be performed on a managed identity cluster.',
        },
      };
    }
    const clientId = String(body.clientId ?? body.properties?.clientId ?? '').trim();
    if (!clientId) {
      return {
        error: {
          status: 400,
          code: 'InvalidParameter',
          message: 'AKS resetServicePrincipalProfile requires clientId.',
        },
      };
    }
    resource.properties.servicePrincipalProfile = {
      ...(resource.properties.servicePrincipalProfile ?? {}),
      clientId,
      secret: body.secret ?? body.properties?.secret ?? resource.properties.servicePrincipalProfile?.secret ?? null,
    };
    resource.properties.provisioningState = 'Succeeded';
    return deepClone(resource);
  }

  rotateAksClusterCertificates(route) {
    const id = normalizeResourceId(route.subscriptionId, route.resourceGroupName, route.providerNamespace, route.typePath, route.scopeId ?? null);
    const resource = this.resources.get(id.toLowerCase());
    if (!resource || resource.type !== 'Microsoft.ContainerService/managedClusters') return null;
    resource.properties.credentialGeneration = Number(resource.properties?.credentialGeneration ?? 0) + 1;
    resource.properties.provisioningState = 'Succeeded';
    resource.properties.certificateRotation = {
      generation: resource.properties.credentialGeneration,
      lastRotatedAt: nowIso(),
    };
    return deepClone(resource);
  }

  upgradeAksAgentPoolNodeImage(route) {
    const typeParts = String(route?.typePath ?? '').split('/');
    if (typeParts.length !== 4 || typeParts[0] !== 'managedClusters' || typeParts[2] !== 'agentPools') return null;
    const poolName = typeParts[3];
    const childId = normalizeResourceId(route.subscriptionId, route.resourceGroupName, route.providerNamespace, route.typePath, route.scopeId ?? null);
    const child = this.resources.get(childId.toLowerCase());
    const clusterRoute = {
      ...route,
      typePath: `managedClusters/${typeParts[1]}`,
    };
    const clusterId = normalizeResourceId(clusterRoute.subscriptionId, clusterRoute.resourceGroupName, clusterRoute.providerNamespace, clusterRoute.typePath, clusterRoute.scopeId ?? null);
    const cluster = this.resources.get(clusterId.toLowerCase());
    if (!cluster || cluster.type !== 'Microsoft.ContainerService/managedClusters') return null;
    const pool = (cluster.properties?.agentPoolProfiles ?? [])
      .find(item => String(item?.name ?? '').toLowerCase() === String(poolName).toLowerCase());
    if (!pool) return null;
    const nextImage = aksNextNodeImageVersion(pool.nodeImageVersion);
    pool.nodeImageVersion = nextImage;
    pool.provisioningState = 'Succeeded';
    if (child?.properties) {
      child.properties.nodeImageVersion = nextImage;
      child.properties.provisioningState = 'Succeeded';
    }
    return deepClone(child ?? {
      id: `${cluster.id}/agentPools/${poolName}`,
      name: poolName,
      type: 'Microsoft.ContainerService/managedClusters/agentPools',
      location: cluster.location,
      properties: pool,
    });
  }

  exportSnapshot() {
    return {
      subscriptionId: this.subscriptionId,
      resourceGroups: [...this.resourceGroups.values()],
      resources: [...this.resources.values()],
      calls: this.calls,
    };
  }
}
