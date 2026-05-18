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

  exportSnapshot() {
    return {
      subscriptionId: this.subscriptionId,
      resourceGroups: [...this.resourceGroups.values()],
      resources: [...this.resources.values()],
      calls: this.calls,
    };
  }
}
