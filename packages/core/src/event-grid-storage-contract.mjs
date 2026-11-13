const senderRoles = new Set(['c6a89b2d-59bc-44d0-9896-0f6e12d7b80a', '974c5e8b-45b9-4653-ba55-5f855dd0fb88']);
const blobContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe';
const lower = value => String(value ?? '').toLowerCase();
const error = (status, code, message) => ({ status, body: { error: { code, message } } });
export const storedResource = (store, id) => store.resources.get(lower(id));

export function queueSenderAuthorized(store, principal, destinationId) {
  if (!principal || !destinationId) return false;
  const target = lower(destinationId);
  return [...store.resources.values()].some(resource => {
    if (lower(resource.type) !== 'microsoft.authorization/roleassignments') return false;
    const properties = resource.properties ?? {};
    const scope = lower(properties.scope);
    return scope && (target === scope || target.startsWith(`${scope}/`))
      && lower(properties.principalId) === lower(principal)
      && !properties.condition && senderRoles.has(lower(properties.roleDefinitionId).split('/').at(-1));
  });
}

export function blobDeadLetterAuthorized(store, principal, containerId) {
  if (!principal || !containerId) return false;
  const target = lower(containerId);
  return [...store.resources.values()].some(resource => {
    if (lower(resource.type) !== 'microsoft.authorization/roleassignments') return false;
    const properties = resource.properties ?? {};
    const scope = lower(properties.scope);
    return scope && (target === scope || target.startsWith(`${scope}/`))
      && lower(properties.principalId) === lower(principal)
      && !properties.condition && lower(properties.roleDefinitionId).split('/').at(-1) === blobContributor;
  });
}

export function systemTopicDeadLetter(store, topic, properties) {
  const config = properties?.deadLetterWithResourceIdentity;
  const destination = config?.deadLetterDestination;
  const account = storedResource(store, destination?.properties?.resourceId);
  const containerId = account && typeof destination?.properties?.blobContainerName === 'string'
    ? `${account.id}/blobServices/default/containers/${destination.properties.blobContainerName}` : null;
  return { config, destination, account, containerId, container: storedResource(store, containerId), principal: topic?.identity?.principalId };
}

export function systemTopicDestination(store, topic, properties) {
  const delivery = properties?.deliveryWithResourceIdentity;
  const destination = delivery?.destination;
  const account = storedResource(store, destination?.properties?.resourceId);
  const queueId = account ? `${account.id}/queueServices/default/queues/${destination?.properties?.queueName}` : null;
  return { delivery, destination, account, queueId, queue: storedResource(store, queueId), principal: topic?.identity?.principalId };
}

export function validateStorageSystemSubscription(store, providerRoute, body, functionsRouter) {
  const topicId = `/subscriptions/${providerRoute.subscriptionId}/resourceGroups/${providerRoute.resourceGroupName}/providers/Microsoft.EventGrid/${providerRoute.typePath.split('/').slice(0, 2).join('/')}`;
  const topic = storedResource(store, topicId);
  if (!topic) return error(404, 'ResourceNotFound', 'The system topic does not exist.');
  const properties = body.properties ?? {};
  const unsupported = message => error(501, 'GlobalStackEventDeliveryNotImplemented', message);
  if (topic.properties?.topicType !== 'Microsoft.Storage.StorageAccounts') return unsupported('Only Storage system topic delivery is implemented.');
  if (properties.eventDeliverySchema && properties.eventDeliverySchema !== 'EventGridSchema') return unsupported('Only EventGridSchema delivery is implemented.');
  if (properties.deadLetterDestination || properties.expirationTimeUtc) return unsupported('Non-identity dead-letter destinations and expiring subscriptions are not implemented.');
  if (properties.deadLetterWithResourceIdentity) {
    const { config, destination, account, container } = systemTopicDeadLetter(store, topic, properties);
    if (config.identity?.type !== 'SystemAssigned' || destination?.endpointType !== 'StorageBlob') {
      return unsupported('Only system-assigned identity dead lettering to Storage Blob is implemented.');
    }
    if (!topic.identity?.principalId || !account || account.type !== 'Microsoft.Storage/storageAccounts' || !container) {
      return error(400, 'InvalidRequest', 'The dead-letter Storage account, container or system topic identity does not exist.');
    }
  }
  const filter = properties.filter ?? {};
  if (Object.keys(filter).some(key => !['includedEventTypes', 'subjectBeginsWith', 'subjectEndsWith', 'isSubjectCaseSensitive'].includes(key))) return unsupported('Only event type and subject prefix/suffix filters are implemented.');
  if (filter.includedEventTypes !== undefined && (!Array.isArray(filter.includedEventTypes) || !filter.includedEventTypes.every(type => typeof type === 'string'))) return error(400, 'InvalidRequest', 'includedEventTypes must be a string array.');
  if (['subjectBeginsWith', 'subjectEndsWith'].some(key => filter[key] !== undefined && typeof filter[key] !== 'string')
    || filter.isSubjectCaseSensitive !== undefined && typeof filter.isSubjectCaseSensitive !== 'boolean') return error(400, 'InvalidRequest', 'Invalid subject filter.');
  const policy = properties.retryPolicy ?? {};
  if (policy.maxDeliveryAttempts !== undefined && (!Number.isInteger(policy.maxDeliveryAttempts) || policy.maxDeliveryAttempts < 1 || policy.maxDeliveryAttempts > 30)
    || policy.eventTimeToLiveInMinutes !== undefined && (!Number.isInteger(policy.eventTimeToLiveInMinutes) || policy.eventTimeToLiveInMinutes < 1 || policy.eventTimeToLiveInMinutes > 1440)) return error(400, 'InvalidRequest', 'Invalid event retry policy.');
  if (properties.destination?.endpointType === 'AzureFunction') {
    if (properties.deliveryWithResourceIdentity) return unsupported('Identity-based Azure Function delivery is not implemented.');
    const destination = properties.destination.properties ?? {};
    if (Object.keys(destination).some(key => key !== 'resourceId')) return unsupported('Azure Function batching options are not implemented.');
    const functionId = destination.resourceId;
    const match = typeof functionId === 'string' && /^(.*\/providers\/Microsoft\.Web\/sites\/[^/]+)\/functions\/[^/]+$/i.exec(functionId);
    const fn = match && storedResource(store, functionId), site = match && storedResource(store, match[1]);
    if (!site) {
      return error(400, 'InvalidRequest', 'The destination must be an existing Event Grid function.');
    }
    if (!functionsRouter?.hasNativeWorker(site.id)) return unsupported('The destination function needs a configured native worker.');
    if (!functionsRouter.hasNativeEventGridFunction(functionId)
      || (fn && !fn.properties?.config?.bindings?.some(binding => lower(binding.type) === 'eventgridtrigger'))) {
      return error(400, 'InvalidRequest', 'The destination must be an existing Event Grid function.');
    }
    return null;
  }
  const { delivery, destination, account, queue, principal } = systemTopicDestination(store, topic, properties);
  if (delivery?.identity?.type !== 'SystemAssigned' || destination?.endpointType !== 'StorageQueue') return unsupported('Only system-assigned identity delivery to Storage Queue is implemented.');
  if (!account || account.type !== 'Microsoft.Storage/storageAccounts' || !queue) return error(400, 'InvalidRequest', 'The destination Storage account or queue does not exist.');
  const ttl = destination.properties.queueMessageTimeToLiveInSeconds ?? 604800;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 604800) return unsupported('This delivery path supports queue message TTL between 1 and 604800 seconds.');
  // Account-scoped setup has a successful Azure capture. Queue-only setup
  // failed there, but the cause is not established as a universal Azure rule.
  if (!queueSenderAuthorized(store, principal, account.id)) {
    if (queueSenderAuthorized(store, principal, queue.id)) return unsupported('Queue-scoped identity setup needs further Azure validation; only account-scoped setup is implemented.');
    return error(409, 'Managed Identity Authorization Error', 'Managed identity for event subscription does not have authorization to deliver to the endpoint.');
  }
  return null;
}

export function storageEventMatches(event, filter = {}) {
  if (filter.includedEventTypes?.length && !filter.includedEventTypes.includes(event.eventType)) return false;
  const normalize = value => filter.isSubjectCaseSensitive ? String(value ?? '') : lower(value);
  const subject = normalize(event.subject);
  return subject.startsWith(normalize(filter.subjectBeginsWith)) && subject.endsWith(normalize(filter.subjectEndsWith));
}
