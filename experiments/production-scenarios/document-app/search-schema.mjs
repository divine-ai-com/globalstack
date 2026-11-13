// The push index contains only committed document metadata and extracted text.
// Quarantined source bytes are never indexed.
export const documentIndex = {
  name: 'documents',
  fields: [
    { name: 'document_id', type: 'Edm.String', key: true, filterable: true, searchable: false },
    { name: 'tenant_id', type: 'Edm.String', filterable: true, searchable: false },
    { name: 'owner_id', type: 'Edm.String', filterable: true, searchable: false },
    { name: 'read_groups', type: 'Collection(Edm.String)', filterable: true, searchable: false },
    { name: 'root_correlation_id', type: 'Edm.String', filterable: true, searchable: false },
    { name: 'file_name', type: 'Edm.String', searchable: true },
    { name: 'scan_status', type: 'Edm.String', filterable: true, searchable: false },
    { name: 'extracted_text', type: 'Edm.String', searchable: true },
    { name: 'revision_id', type: 'Edm.String', filterable: true, searchable: false },
  ],
};
