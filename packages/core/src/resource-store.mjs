import { createHash } from 'node:crypto';

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeResourceGroupId(subscriptionId, resourceGroupName) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
}

function normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath) {
  return `${normalizeResourceGroupId(subscriptionId, resourceGroupName)}/providers/${providerNamespace}/${typePath}`;
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

function apiManagementGatewayUrl(name) {
  return `https://${name}.azure-api.net`;
}

function eventGridTopicHostname(name, location) {
  return `${name}.${location ?? 'global'}-1.eventgrid.azure.net`;
}

function eventGridTopicEndpoint(name, location) {
  return `https://${eventGridTopicHostname(name, location)}/api/events`;
}

function eventGridTopicKey(id, slot) {
  return createHash('sha256')
    .update(`globalstack:event-grid:${slot}:${id.toLowerCase()}`)
    .digest('base64url');
}

function functionAppHostName(name) {
  return `${name}.azurewebsites.net`;
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

function redisHostName(name) {
  return `${name}.redis.cache.windows.net`;
}

function aksFqdn(name, location, dnsPrefix) {
  const digest = createHash('sha256')
    .update(`globalstack:aks:${name}:${location}:${dnsPrefix}`)
    .digest('hex')
    .slice(0, 8);
  return `${dnsPrefix}-${digest}.hcp.${location}.azmk8s.io`;
}

function aksNodeResourceGroup(resourceGroupName, name, location) {
  return `MC_${resourceGroupName}_${name}_${location}`;
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

export class ResourceStore {
  constructor({ subscriptionId = '00000000-0000-0000-0000-000000000000' } = {}) {
    this.subscriptionId = subscriptionId;
    this.resourceGroups = new Map();
    this.resources = new Map();
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
    return existed;
  }

  putResource({ subscriptionId, resourceGroupName, providerNamespace, typePath, body = {}, apiVersion, capability }) {
    const id = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath);
    const key = id.toLowerCase();
    const existing = this.resources.get(key);
    const typeParts = typePath.split('/');
    const type = `${providerNamespace}/${typeParts.filter((_, index) => index % 2 === 0).join('/')}`;
    const name = typeParts.filter((_, index) => index % 2 === 1).join('/');
    const leafName = typeParts.at(-1);
    const supportLevel = capability.primaryModes.join('+');
    const lifecycleSequence = !existing ? asyncLifecycleSequence(type) : null;
    const resource = {
      id,
      name,
      type,
      location: body.location ?? existing?.location ?? 'global',
      tags: body.tags ?? existing?.tags ?? {},
      sku: body.sku,
      kind: body.kind,
      properties: {
        ...(existing?.properties ?? {}),
        ...(body.properties ?? {}),
        ...(type === 'Microsoft.EventGrid/topics'
          ? { endpoint: eventGridTopicEndpoint(name, body.location ?? existing?.location ?? 'global') }
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
        ...(type === 'Microsoft.Cache/redis'
          ? {
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
        ...(type === 'Microsoft.Cdn/profiles/endpoints'
          ? {
              hostName: existing?.properties?.hostName ?? `${leafName}.azureedge.net`,
              provisioningState: lifecycleSequence ? 'Creating' : existing?.properties?.provisioningState ?? 'Succeeded',
              resourceState: existing?.properties?.resourceState ?? 'Running',
            }
          : {}),
        ...(type === 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies'
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
        ...(type === 'Microsoft.ContainerService/managedClusters'
          ? {
              fqdn: existing?.properties?.fqdn ?? aksFqdn(name, body.location ?? existing?.location ?? 'global', body.properties?.dnsPrefix ?? existing?.properties?.dnsPrefix ?? name),
              nodeResourceGroup: body.properties?.nodeResourceGroup ?? existing?.properties?.nodeResourceGroup ?? aksNodeResourceGroup(resourceGroupName, name, body.location ?? existing?.location ?? 'global'),
              currentKubernetesVersion: body.properties?.kubernetesVersion ?? existing?.properties?.currentKubernetesVersion ?? '1.29.2',
              kubernetesVersion: body.properties?.kubernetesVersion ?? existing?.properties?.kubernetesVersion ?? '1.29.2',
              powerState: { code: 'Running' },
              agentPoolProfiles: (body.properties?.agentPoolProfiles ?? existing?.properties?.agentPoolProfiles ?? []).map(pool => ({
                ...pool,
                provisioningState: 'Succeeded',
                powerState: { code: 'Running' },
              })),
          }
          : {}),
        ...(type === 'Microsoft.Network/dnsZones'
          ? {
              nameServers: existing?.properties?.nameServers ?? dnsNameServers(name),
              numberOfRecordSets: existing?.properties?.numberOfRecordSets ?? 2,
            }
          : {}),
        ...(type === 'Microsoft.Network/applicationGateways'
          ? {
              operationalState: 'Running',
              resourceGuid: existing?.properties?.resourceGuid ?? createHash('sha256').update(`globalstack:appgw:${id}`).digest('hex').slice(0, 32),
            }
          : {}),
        ...(type === 'Microsoft.Network/loadBalancers'
          ? {
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
      globalstack: {
        supportLevel,
        capabilityId: capability.id,
        backingEngines: capability.backingEngines,
        emulationDepth: emulationDepth(capability),
        realAzureApiComplete: false,
        cloudValidated: capability.cloudValidated,
        knownGaps: capability.knownGaps,
        ...(lifecycleSequence
          ? { lifecycleState: { provisioningSequence: lifecycleSequence, readCount: 0 } }
          : existing?.globalstack?.lifecycleState
            ? { lifecycleState: existing.globalstack.lifecycleState }
            : {}),
      },
    };
    this.resources.set(key, resource);
    return { resource: deepClone(resource), created: !existing, asyncAccepted: Boolean(lifecycleSequence) };
  }

  getResource({ subscriptionId, resourceGroupName, providerNamespace, typePath }) {
    const id = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath);
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
    const id = normalizeResourceId(route.subscriptionId, route.resourceGroupName, route.providerNamespace, route.typePath);
    const resource = this.resources.get(id.toLowerCase());
    return resource?.properties?.provisioningState ?? null;
  }

  completeAsyncProvisioning() {
    for (const resource of this.resources.values()) {
      const lifecycleState = lifecycleStateFor(resource);
      if (lifecycleState?.provisioningSequence) {
        resource.properties.provisioningState = lifecycleState.provisioningSequence.at(-1);
        if (resource.type === 'Microsoft.ServiceBus/namespaces') {
          resource.properties.status = lifecycleState.provisioningSequence.at(-1);
        }
        if (resource.type === 'Microsoft.Web/sites') {
          resource.properties.state = 'Running';
        }
        lifecycleState.readCount = lifecycleState.provisioningSequence.length - 1;
      }
    }
  }

  deleteResource({ subscriptionId, resourceGroupName, providerNamespace, typePath }) {
    const id = normalizeResourceId(subscriptionId, resourceGroupName, providerNamespace, typePath);
    return this.resources.delete(id.toLowerCase());
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

  listAksCredentials(route, role = 'user') {
    const resource = this.getResource(route);
    if (!resource || resource.type !== 'Microsoft.ContainerService/managedClusters') return null;
    const clusterName = resource.name;
    const userName = role === 'admin' ? 'clusterAdmin' : 'clusterUser';
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
      `    token: globalstack-aks-${role}-token`,
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

  exportSnapshot() {
    return {
      subscriptionId: this.subscriptionId,
      resourceGroups: [...this.resourceGroups.values()],
      resources: [...this.resources.values()],
      calls: this.calls,
    };
  }
}
