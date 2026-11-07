CREATE TABLE IF NOT EXISTS document_access (
    document_id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    owner_id UUID NOT NULL,
    upload_key UUID NOT NULL,
    blob_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    read_groups UUID[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (tenant_id, owner_id, upload_key)
);

CREATE TABLE IF NOT EXISTS scanned_documents (
    document_id UUID PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    blob_url TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    scan_status VARCHAR(20) NOT NULL,
    malware_found BOOLEAN NOT NULL DEFAULT FALSE,
    extracted_text TEXT,
    processed_at TIMESTAMPTZ,
    blob_version TEXT,
    source_sequence NUMERIC(78, 0) NOT NULL DEFAULT -1,
    content_sha256 CHAR(64),
    engine_results JSONB,
    extraction_pages JSONB,
    signature_provenance JSONB,
    revision_id CHAR(64),
    UNIQUE (tenant_id, blob_url)
);

CREATE TABLE IF NOT EXISTS document_revisions (
    revision_id CHAR(64) PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES scanned_documents(document_id),
    outcome_hash CHAR(64) NOT NULL,
    source_sequence NUMERIC(78, 0) NOT NULL,
    outcome JSONB NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_outbox (
    event_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id UUID NOT NULL REFERENCES scanned_documents(document_id),
    revision_id CHAR(64) NOT NULL REFERENCES document_revisions(revision_id),
    operation TEXT NOT NULL CHECK (operation IN ('upload', 'delete')),
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered_at TIMESTAMPTZ,
    delivery_state TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending', 'delivered', 'superseded')),
    attempts INTEGER NOT NULL DEFAULT 0,
    UNIQUE (revision_id)
);

CREATE INDEX IF NOT EXISTS document_outbox_pending ON document_outbox (event_id) WHERE delivery_state = 'pending';
