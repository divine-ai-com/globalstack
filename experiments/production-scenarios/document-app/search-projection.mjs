import assert from 'node:assert/strict';
import { documentIndex } from './search-schema.mjs';

const storageIdPattern = /^\/subscriptions\/[0-9a-f-]{36}\/resourceGroups\/[a-z0-9._()-]+\/providers\/Microsoft\.Storage\/storageAccounts\/[a-z0-9]{3,24}$/i;

export const projectionIndex = {
  ...documentIndex,
  name: 'document-projection',
  fields: [...documentIndex.fields, { name: 'deleted', type: 'Edm.String', filterable: true, searchable: false }],
};

export function projectionDataSource(storageResourceId) {
  assert.match(storageResourceId, storageIdPattern, 'Expected an Azure Storage account resource ID');
  return {
    name: 'document-projection-source',
    type: 'azureblob',
    credentials: { connectionString: `ResourceId=${storageResourceId};` },
    container: { name: 'clean-projection' },
    dataDeletionDetectionPolicy: {
      '@odata.type': '#Microsoft.Azure.Search.SoftDeleteColumnDeletionDetectionPolicy',
      softDeleteColumnName: 'isdeleted',
      softDeleteMarkerValue: 'true',
    },
  };
}

export const projectionIndexer = {
  name: 'document-projection-indexer',
  dataSourceName: 'document-projection-source',
  targetIndexName: projectionIndex.name,
  fieldMappings: [{ sourceFieldName: '/document_id', targetFieldName: 'document_id' }],
  parameters: { configuration: { parsingMode: 'json' } },
  schedule: { interval: 'PT5M' },
};

export function projectionBlob(document, operation) {
  assert.equal(typeof document?.document_id, 'string', 'A projection requires a document ID');
  assert.ok(document.document_id.length > 0, 'A projection requires a document ID');
  assert.ok(['upload', 'delete'].includes(operation), 'Unsupported projection operation');
  const deleted = operation === 'delete' ? 'true' : 'false';
  return {
    name: `${document.document_id}.json`,
    body: operation === 'delete' ? { document_id: document.document_id, deleted } : { ...document, deleted },
    metadata: { isdeleted: deleted },
  };
}
