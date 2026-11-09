import { createHash } from 'node:crypto';

const lower = value => String(value ?? '').toLowerCase();
const storageReadRoles = new Set([
  '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1',
  'ba92f5b4-2d11-453d-a403-e96b0029c9fe',
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b',
]);
const storageIdPattern = /^\/subscriptions\/([^/]+)\/resourceGroups\/[^/]+\/providers\/Microsoft\.Storage\/storageAccounts\/([a-z0-9]{3,24})$/i;
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);
const etag = value => `"${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}"`;
const unsupported = message => ({ status: 501, code: 'NotImplemented', message });
const invalid = message => ({ status: 400, code: 'InvalidRequestParameter', message });

export function validateBlobDataSource(body) {
  if (!plainObject(body) || typeof body.name !== 'string' || !body.name) return invalid('A data source requires a name.');
  if (Object.keys(body).some(key => !['name', 'type', 'credentials', 'container', 'dataDeletionDetectionPolicy', 'description'].includes(key))
    || !plainObject(body.credentials) || Object.keys(body.credentials).some(key => key !== 'connectionString')
    || !plainObject(body.container) || Object.keys(body.container).some(key => !['name', 'query'].includes(key))
    || body.description !== undefined && typeof body.description !== 'string') {
    return unsupported('This data source contains properties outside the supported Blob projection subset.');
  }
  if (body.type !== 'azureblob') return unsupported('Only Azure Blob data sources are supported.');
  const match = /^ResourceId=(\/subscriptions\/[^;]+);$/i.exec(body.credentials?.connectionString ?? '');
  if (!match || !storageIdPattern.test(match[1])) return unsupported('Only managed-identity ResourceId storage connections are supported.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.container?.name ?? '') || body.container?.query) {
    return unsupported('Only an unfiltered Azure Blob container is supported.');
  }
  const policy = body.dataDeletionDetectionPolicy;
  if (!policy) return unsupported('Blob projection requires metadata soft-delete detection.');
  if (policy && (!plainObject(policy) || Object.keys(policy).some(key => !['@odata.type', 'softDeleteColumnName', 'softDeleteMarkerValue'].includes(key)))) {
    return unsupported('This Blob deletion policy contains unsupported properties.');
  }
  if (policy && (policy['@odata.type'] !== '#Microsoft.Azure.Search.SoftDeleteColumnDeletionDetectionPolicy'
    || lower(policy.softDeleteColumnName) !== 'isdeleted' || lower(policy.softDeleteMarkerValue) !== 'true')) {
    return unsupported('Only the isdeleted=true Blob metadata soft-delete policy is supported.');
  }
  if (body.dataChangeDetectionPolicy || body.encryptionKey || body.identity) {
    return unsupported('This data source configuration is outside the supported Blob projection subset.');
  }
  return null;
}

export function validateBlobIndexer(body, service) {
  if (!plainObject(body) || typeof body.name !== 'string' || !body.name) return invalid('An indexer requires a name.');
  if (Object.keys(body).some(key => !['name', 'dataSourceName', 'targetIndexName', 'parameters', 'schedule', 'fieldMappings', 'description'].includes(key))) {
    return unsupported('This indexer contains properties outside the supported Blob projection subset.');
  }
  if (!plainObject(body.parameters) || Object.keys(body.parameters).some(key => key !== 'configuration')
    || !plainObject(body.parameters.configuration) || Object.keys(body.parameters.configuration).some(key => key !== 'parsingMode')
    || !plainObject(body.schedule) || Object.keys(body.schedule).some(key => key !== 'interval')
    || body.description !== undefined && typeof body.description !== 'string') {
    return unsupported('This indexer has unsupported configuration fields.');
  }
  if (!service.dataSources.has(body.dataSourceName)) return invalid(`Data source '${body.dataSourceName}' does not exist.`);
  if (!service.indexes.has(body.targetIndexName)) return invalid(`Target index '${body.targetIndexName}' does not exist.`);
  if (service.indexes.get(body.targetIndexName).fields.find(field => field.key)?.name !== 'document_id') {
    return unsupported('The target index must use document_id as its key.');
  }
  if (body.parameters?.configuration?.parsingMode !== 'json' || body.schedule?.interval !== 'PT5M'
    || body.skillsetName || body.outputFieldMappings?.length || body.disabled === true) {
    return unsupported('Only scheduled five-minute JSON Blob indexing without a skillset is supported.');
  }
  if (!Array.isArray(body.fieldMappings) || body.fieldMappings.length !== 1
    || !plainObject(body.fieldMappings[0]) || Object.keys(body.fieldMappings[0]).some(key => !['sourceFieldName', 'targetFieldName'].includes(key))
    || body.fieldMappings[0].sourceFieldName !== '/document_id'
    || body.fieldMappings[0].targetFieldName !== 'document_id'
    || body.fieldMappings[0].mappingFunction) {
    return unsupported('Only the /document_id to document_id JSON field mapping is supported.');
  }
  return null;
}

function canReadProjection(store, service, storageId, containerName) {
  const principal = lower(store?.resources.get(lower(service.resourceId))?.identity?.principalId);
  const subscription = storageIdPattern.exec(storageId)?.[1];
  const scope = lower(`${storageId}/blobServices/default/containers/${containerName}`);
  if (!principal || !subscription) return false;
  for (const resource of store.resources.values()) {
    if (lower(resource.type) !== 'microsoft.authorization/roleassignments') continue;
    const role = /^\/subscriptions\/([^/]+)\/providers\/Microsoft\.Authorization\/roleDefinitions\/([^/]+)$/i.exec(resource.properties?.roleDefinitionId ?? '');
    const assignedScope = lower(resource.properties?.scope);
    if (assignedScope && lower(role?.[1]) === lower(subscription) && storageReadRoles.has(lower(role?.[2]))
      && lower(resource.properties?.principalId) === principal && !resource.properties?.condition
      && !resource.properties?.conditionVersion && (scope === assignedScope || scope.startsWith(`${assignedScope}/`))) return true;
  }
  return false;
}

export function validateBlobIndexerAccess(body, service, store) {
  const source = service.dataSources.get(body.dataSourceName)?.definition;
  const storageId = /^ResourceId=([^;]+);$/i.exec(source?.credentials?.connectionString ?? '')?.[1];
  const accountName = storageIdPattern.exec(storageId ?? '')?.[2];
  if (!accountName || canReadProjection(store, service, storageId, source.container?.name)) return null;
  return { status: 401, code: '', message: `Unable to retrieve blob container for account '${accountName}' using your managed identity. Ensure the resource ID is correct and that the managed identity for your search service has been granted permission (e.g., Storage Blob Data Reader) to read blob container for this account. See https://go.microsoft.com/fwlink/?linkid=2193521 for detailed documentation of required permissions for your scenario.` };
}

function result(status, started, count, errors = []) {
  return {
    status,
    startTime: started,
    endTime: new Date().toISOString(),
    itemsProcessed: count,
    itemsFailed: errors.length,
    errors,
    warnings: [],
  };
}

export function runBlobIndexer({ service, indexer, storageRouter, store }) {
  const started = new Date().toISOString();
  const source = service.dataSources.get(indexer.definition.dataSourceName)?.definition;
  const index = service.indexes.get(indexer.definition.targetIndexName);
  const storageId = /^ResourceId=([^;]+);$/i.exec(source?.credentials?.connectionString ?? '')?.[1];
  const accountName = storageIdPattern.exec(storageId ?? '')?.[2];
  const containerName = source?.container?.name;
  const fail = message => result('transientFailure', started, 0, [{ errorMessage: message, statusCode: 403 }]);
  if (!source || !index || !accountName) return fail('The data source, target index, or storage account is unavailable.');
  if (!canReadProjection(store, service, storageId, containerName)) {
    return fail('The Search service identity lacks Storage Blob Data Reader access to the source container.');
  }
  let blobs;
  try { blobs = storageRouter?.searchBlobs({ accountName, resourceId: storageId, containerName }); }
  catch { return result('transientFailure', started, 0, [{ errorMessage: 'Blob projection exceeds the local indexer limit.', statusCode: 400 }]); }
  if (!blobs) return fail('The source Blob container is unavailable.');

  // Parse and validate the whole batch before changing the target index.
  const changes = [];
  const key = index.fields.find(field => field.key)?.name;
  for (const blob of blobs) {
    if (indexer.checkpoint.get(blob.name) === blob.etag) continue;
    let document;
    try { document = JSON.parse(blob.body.toString('utf8')); } catch {
      return result('transientFailure', started, 0, [{ errorMessage: `Blob '${blob.name}' is not valid JSON.`, statusCode: 400 }]);
    }
    if (!plainObject(document) || typeof document.document_id !== 'string' || !document.document_id) {
      return result('transientFailure', started, 0, [{ errorMessage: `Blob '${blob.name}' lacks document_id.`, statusCode: 400 }]);
    }
    const projected = Object.fromEntries(index.fields.filter(field => Object.hasOwn(document, field.name))
      .map(field => [field.name, document[field.name]]));
    if (typeof projected[key] !== 'string' || !projected[key]) {
      return result('transientFailure', started, 0, [{ errorMessage: `Blob '${blob.name}' lacks the target key.`, statusCode: 400 }]);
    }
    changes.push({ name: blob.name, etag: blob.etag, document: projected,
      deleted: lower(blob.metadata['x-ms-meta-isdeleted']) === 'true' });
  }
  for (const change of changes) {
    if (change.deleted) index.documents.delete(change.document[key]);
    else index.documents.set(change.document[key], change.document);
    indexer.checkpoint.set(change.name, change.etag);
  }
  return result('success', started, changes.length);
}
