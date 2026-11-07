import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function documentIdentity(tenant, blobUrl) {
  // A deterministic UUIDv8 avoids a fresh document identity on redelivery.
  const bytes = Buffer.from(digest([tenant, blobUrl]).slice(0, 32), 'hex');
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export async function migrate(pool) {
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
}

export async function processingContext(pool, input) {
  const access = (await pool.query('SELECT upload_key FROM document_access WHERE document_id=$1 AND tenant_id=$2',
    [documentIdentity(input.tenant, input.blobUrl), input.tenant])).rows[0];
  assert.ok(access, 'Document must have a registered ingress owner');
  return { ...input, rootCorrelationId: access.upload_key };
}

function normalize(input) {
  assert.match(input.tenant, /^[a-zA-Z0-9_-]{1,80}$/);
  assert.equal(typeof input.blobUrl, 'string');
  const url = new URL(input.blobUrl);
  assert.ok(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash, 'Store a credential-free blob URL');
  assert.ok(input.fileName?.length > 0 && input.fileName.length <= 255);
  assert.ok(typeof input.version === 'string' && input.version.length > 0 && input.version.length <= 256);
  assert.match(input.sequence, /^[a-fA-F0-9]{1,64}$/);
  assert.ok(['pending', 'unresolved', 'clean', 'detected', 'deleted'].includes(input.status));
  if (['clean', 'detected'].includes(input.status)) {
    assert.match(input.scan?.sha256, /^[a-f0-9]{64}$/);
    assert.equal(input.scan?.status, input.status);
  }
  let text = null;
  if (input.status === 'clean') {
    assert.deepEqual(input.scan.engines.map(item => item.engine).sort(), ['clamav', 'yara']);
    assert.ok(input.scan.engines.every(item => item.status === 'clean'));
    assert.equal(input.scan.extractionStatus, 'completed');
    assert.ok(input.scan.provenance?.clamavDatabases?.length && input.scan.provenance?.yaraRulesSha256);
    text = input.scan.pages.map(page => page.text).join('\n');
    assert.ok(text.trim().length > 0 && Buffer.byteLength(text) <= 2 * 1024 * 1024);
  }
  const documentId = documentIdentity(input.tenant, input.blobUrl);
  const phase = ['pending', 'unresolved', 'deleted'].includes(input.status) ? input.status : 'content';
  const revisionId = digest([documentId, input.version, phase]);
  const outcome = { tenant: input.tenant, blobUrl: input.blobUrl, fileName: input.fileName, version: input.version,
    rootCorrelationId: input.rootCorrelationId ?? null,
    status: input.status, contentHash: input.scan?.sha256 ?? null, text,
    pages: input.scan?.pages ?? null, provenance: input.scan?.provenance ?? null,
    engines: input.scan?.engines?.map(({ engine, status, findings }) => ({ engine, status, findings: findings ?? [] })) ?? null };
  return { documentId, revisionId, sequence: BigInt(`0x${input.sequence}`).toString(), outcome, outcomeHash: digest(outcome) };
}

export async function commitRevision(pool, input) {
  const value = normalize(input);
  const { documentId, revisionId, sequence, outcome, outcomeHash } = value;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO scanned_documents(document_id, tenant_id, blob_url, file_name, scan_status)
      VALUES ($1, $2, $3, $4, 'PENDING') ON CONFLICT (document_id) DO NOTHING`, [documentId, input.tenant, input.blobUrl, input.fileName]);
    const current = (await client.query('SELECT source_sequence, scan_status, blob_version FROM scanned_documents WHERE document_id=$1 FOR UPDATE', [documentId])).rows[0];
    const previous = (await client.query('SELECT outcome_hash, source_sequence FROM document_revisions WHERE revision_id=$1', [revisionId])).rows[0];
    if (previous) {
      assert.equal(previous.outcome_hash.trim(), outcomeHash, 'A blob revision cannot have conflicting committed outcomes');
      assert.equal(previous.source_sequence, sequence, 'A blob revision cannot change sequence');
      await client.query('COMMIT');
      return { documentId, revisionId, state: 'duplicate',
        needsProcessing: current.blob_version === input.version && ['PENDING', 'UNRESOLVED'].includes(current.scan_status) };
    }
    await client.query(`INSERT INTO document_revisions(revision_id, document_id, outcome_hash, source_sequence, outcome)
      VALUES ($1,$2,$3,$4,$5)`, [revisionId, documentId, outcomeHash, sequence, outcome]);
    const sameSequence = BigInt(sequence) === BigInt(current.source_sequence);
    const canResolveCurrent = sameSequence && current.blob_version === input.version && ['PENDING', 'UNRESOLVED'].includes(current.scan_status);
    if (BigInt(sequence) < BigInt(current.source_sequence) || (sameSequence && !canResolveCurrent)) {
      await client.query('COMMIT');
      return { documentId, revisionId, state: 'stale' };
    }
    await client.query(`UPDATE scanned_documents SET file_name=$2, scan_status=$3, malware_found=$4,
      extracted_text=$5, processed_at=CURRENT_TIMESTAMP, blob_version=$6, source_sequence=$7,
      content_sha256=$8, engine_results=$9, extraction_pages=$10, signature_provenance=$11, revision_id=$12
      WHERE document_id=$1`, [documentId, input.fileName, input.status.toUpperCase(), input.status === 'detected',
      outcome.text, input.version, sequence, outcome.contentHash, JSON.stringify(outcome.engines), JSON.stringify(outcome.pages), outcome.provenance, revisionId]);
    const access = (await client.query('SELECT owner_id, read_groups, upload_key FROM document_access WHERE document_id=$1 AND tenant_id=$2', [documentId, input.tenant])).rows[0];
    const payload = { document_id: documentId, tenant_id: input.tenant, owner_id: access?.owner_id ?? '', read_groups: access?.read_groups ?? [], root_correlation_id: access?.upload_key ?? '', file_name: input.fileName,
      scan_status: input.status.toUpperCase(), extracted_text: outcome.text, revision_id: revisionId };
    await client.query('INSERT INTO document_outbox(document_id,revision_id,operation,payload) VALUES($1,$2,$3,$4)',
      [documentId, revisionId, input.status === 'clean' ? 'upload' : 'delete', payload]);
    await client.query('COMMIT');
    return { documentId, revisionId, state: 'committed' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function deliverNext(pool, deliver, { timeoutMs = 5000 } = {}) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30000);
  const client = await pool.connect();
  let event;
  try {
    await client.query('BEGIN');
    event = (await client.query(`SELECT * FROM document_outbox WHERE delivery_state='pending'
      ORDER BY event_id FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
    if (!event) { await client.query('COMMIT'); return { state: 'idle' }; }
    const current = (await client.query('SELECT revision_id FROM scanned_documents WHERE document_id=$1 FOR UPDATE', [event.document_id])).rows[0];
    const superseded = current.revision_id.trim() !== event.revision_id.trim();
    if (!superseded) {
      // A short, bounded remote request runs under the document lock. A crash
      // after delivery leaves the event pending; upload/delete must be idempotent.
      const controller = new AbortController();
      let timer;
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('Search delivery deadline exceeded')); }, timeoutMs);
      });
      let response;
      try {
        response = await Promise.race([
          Promise.resolve().then(() => deliver({ operation: event.operation, document: event.payload, signal: controller.signal })), deadline,
        ]);
      } finally { clearTimeout(timer); }
      assert.ok(response?.status === true && response.key === event.document_id, 'Search did not acknowledge the expected document');
    }
    await client.query(`UPDATE document_outbox SET delivery_state=$2, delivered_at=CASE WHEN $2='delivered' THEN CURRENT_TIMESTAMP ELSE NULL END,
      attempts=attempts+1 WHERE event_id=$1`, [event.event_id, superseded ? 'superseded' : 'delivered']);
    await client.query('COMMIT');
    return { eventId: event.event_id, state: superseded ? 'superseded' : 'delivered' };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (event) await client.query('UPDATE document_outbox SET attempts=attempts+1 WHERE event_id=$1', [event.event_id]).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function currentSearchResults(pool, principal, hits) {
  assert.match(principal.tenant, /^[a-zA-Z0-9_-]{1,80}$/);
  assert.match(principal.subject, /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);
  assert.ok(Array.isArray(principal.groups) && principal.groups.length <= 200);
  assert.ok(Array.isArray(hits) && hits.length <= 1000);
  const ids = hits.map(hit => hit.document_id).filter(id => typeof id === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id));
  if (!ids.length) return [];
  const rows = (await pool.query(`SELECT d.document_id, d.file_name, d.scan_status, d.extracted_text, d.revision_id, d.extraction_pages
    FROM scanned_documents d JOIN document_access a ON a.document_id=d.document_id AND a.tenant_id=d.tenant_id
    WHERE d.tenant_id=$1 AND d.scan_status='CLEAN' AND d.document_id=ANY($2::uuid[])
    AND (a.owner_id=$3 OR a.read_groups && $4::uuid[])`, [principal.tenant, ids, principal.subject, principal.groups])).rows;
  const current = new Map(rows.map(row => [row.document_id, row]));
  // Search can be stale after an uncertain write outcome. PostgreSQL remains
  // authoritative for tenant, clean state, current revision and returned content.
  return hits.flatMap(hit => {
    const row = current.get(hit.document_id);
    return row && row.revision_id.trim() === hit.revision_id ? [{ ...row, score: hit['@search.score'] }] : [];
  });
}
