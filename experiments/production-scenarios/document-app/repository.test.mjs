import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { promisify } from 'node:util';
import pg from 'pg';
import { registerDocumentAccess, documentAccess, searchAccessFilter } from './access.mjs';
import { commitRevision, currentSearchResults, deliverNext, migrate, processingContext } from './repository.mjs';

const exec = promisify(execFile);

test('PostgreSQL commits metadata and outbox atomically across duplicates, stale events and deletes', { timeout: 60000 }, async t => {
  const name = `gs-document-sql-${randomBytes(5).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  let pool;
  t.after(async () => {
    await pool?.end();
    await exec('docker', ['rm', '-f', name]).catch(() => {});
  });
  await exec('docker', ['run', '-d', '--rm', '--name', name, '--label', 'globalstack.experiment=document-repository',
    '--memory', '512m', '--cpus', '2', '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot', '-e', 'POSTGRES_DB=documents', 'postgres:16-alpine'],
  { env: { ...process.env, POSTGRES_PASSWORD: password } });
  const inspected = JSON.parse((await exec('docker', ['inspect', name])).stdout)[0];
  const port = Number(inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'pilot', password, database: 'documents', connectionTimeoutMillis: 2000, max: 5 });
  const deadline = Date.now() + 30000;
  while (true) {
    try { await pool.query('SELECT 1'); break; } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  await migrate(pool);
  // This is a repository fixture, not scanner evidence. The separate scanner
  // tests invoke actual engines and extraction binaries.
  const input = { tenant: 'tenant_alpha', blobUrl: 'https://example.blob.core.windows.net/landing/report.txt', fileName: 'report.txt',
    version: 'version-2', sequence: '02', status: 'clean', scan: {
      status: 'clean', sha256: 'a'.repeat(64), extractionStatus: 'completed', pages: [{ page: 1, text: 'Revenue 123.45' }],
      engines: [{ engine: 'clamav', status: 'clean' }, { engine: 'yara', status: 'clean' }],
      provenance: { clamavDatabases: [{ file: 'fixture', sha256: 'b'.repeat(64) }], yaraRulesSha256: 'c'.repeat(64) },
    } };
  const principal = { tenant: input.tenant, subject: '11111111-1111-4111-8111-111111111111', groups: ['22222222-2222-4222-8222-222222222222'] };
  const access = await registerDocumentAccess(pool, principal, { ...input, uploadKey: '33333333-3333-4333-8333-333333333333', readGroups: principal.groups });
  assert.equal((await processingContext(pool, input)).rootCorrelationId, access.upload_key);
  await assert.rejects(processingContext(pool, { ...input, tenant: 'foreign' }), /registered ingress owner/);
  const outcomes = await Promise.all(Array.from({ length: 5 }, () => commitRevision(pool, input)));
  assert.equal(outcomes.filter(value => value.state === 'committed').length, 1);
  assert.equal(outcomes.filter(value => value.state === 'duplicate').length, 4);
  assert.equal((await pool.query('SELECT * FROM document_outbox')).rowCount, 1);
  assert.equal((await commitRevision(pool, { ...input, version: 'version-1', sequence: '01' })).state, 'stale');
  assert.equal((await pool.query('SELECT * FROM document_outbox')).rowCount, 1);
  const before = (await pool.query('SELECT * FROM scanned_documents')).rows[0];
  assert.equal(before.blob_version, 'version-2');
  assert.equal(before.scan_status, 'CLEAN');
  assert.equal(before.extracted_text, 'Revenue 123.45');
  assert.equal(before.engine_results.length, 2);
  const outsider = { ...principal, subject: '44444444-4444-4444-8444-444444444444', groups: [] };
  await assert.rejects(documentAccess(pool, outsider, access.document_id), { status: 404 });
  const groupReader = { ...outsider, groups: principal.groups };
  assert.equal((await documentAccess(pool, groupReader, access.document_id)).owner_id, principal.subject);
  await assert.rejects(documentAccess(pool, groupReader, access.document_id, { write: true }), { status: 404 });
  await assert.rejects(registerDocumentAccess(pool, principal, { ...input, blobUrl: input.blobUrl + '.different', uploadKey: access.upload_key }), { status: 409 });
  assert.match(searchAccessFilter(principal), /read_groups\/any/);
  const hit = { document_id: before.document_id, revision_id: before.revision_id, extracted_text: 'Untrusted search payload' };
  assert.equal((await currentSearchResults(pool, principal, [hit]))[0].extracted_text, 'Revenue 123.45');
  assert.deepEqual(await currentSearchResults(pool, { ...principal, tenant: 'tenant_beta' }, [hit]), []);
  assert.deepEqual(await currentSearchResults(pool, outsider, [hit]), []);
  assert.equal((await currentSearchResults(pool, groupReader, [hit])).length, 1);
  assert.deepEqual(await currentSearchResults(pool, principal, [{ ...hit, revision_id: 'old' }]), []);
  await assert.rejects(deliverNext(pool, async () => ({ status: false, key: before.document_id })), /did not acknowledge/);
  assert.equal((await pool.query('SELECT delivery_state FROM document_outbox')).rows[0].delivery_state, 'pending');
  let aborted = false;
  await assert.rejects(deliverNext(pool, ({ signal }) => new Promise(() => {
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
  }), { timeoutMs: 20 }), /deadline exceeded/);
  assert.equal(aborted, true);

  await assert.rejects(commitRevision(pool, { ...input, scan: { ...input.scan, sha256: 'f'.repeat(64) } }), /conflicting committed outcomes/);
  await pool.query(`CREATE FUNCTION reject_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$;
    CREATE TRIGGER reject_outbox BEFORE INSERT ON document_outbox FOR EACH ROW EXECUTE FUNCTION reject_outbox()`);
  await assert.rejects(commitRevision(pool, { ...input, version: 'version-3', sequence: '03' }), /injected outbox failure/);
  assert.equal((await pool.query('SELECT blob_version FROM scanned_documents')).rows[0].blob_version, 'version-2');
  assert.equal((await pool.query('SELECT * FROM document_revisions')).rowCount, 2);
  await pool.query('DROP TRIGGER reject_outbox ON document_outbox');
  const removed = await commitRevision(pool, { ...input, version: 'delete-4', sequence: '04', status: 'deleted', scan: undefined });
  assert.equal(removed.state, 'committed');
  const deleted = (await pool.query('SELECT * FROM scanned_documents')).rows[0];
  assert.equal(deleted.scan_status, 'DELETED');
  assert.equal(deleted.extracted_text, null);
  const events = (await pool.query('SELECT operation, delivered_at FROM document_outbox ORDER BY event_id')).rows;
  assert.deepEqual(events.map(row => row.operation), ['upload', 'delete']);
  assert.ok(events.every(row => row.delivered_at === null));
  assert.equal((await commitRevision(pool, { ...input, version: 'version-3', sequence: '03' })).state, 'stale');
  assert.equal((await pool.query('SELECT scan_status FROM scanned_documents')).rows[0].scan_status, 'DELETED');
  assert.deepEqual(await currentSearchResults(pool, principal, [hit]), []);
  const calls = [];
  const sink = async event => { calls.push(event); return { status: true, key: event.document.document_id }; };
  assert.equal((await deliverNext(pool, sink)).state, 'superseded');
  assert.equal(calls.length, 0);
  assert.equal((await deliverNext(pool, sink)).state, 'delivered');
  assert.equal(calls[0].operation, 'delete');
  assert.equal((await deliverNext(pool, sink)).state, 'idle');
  const next = { ...input, version: 'version-5', sequence: '05' };
  assert.equal((await commitRevision(pool, { ...next, status: 'pending', scan: undefined })).state, 'committed');
  assert.equal((await pool.query('SELECT scan_status FROM scanned_documents')).rows[0].scan_status, 'PENDING');
  assert.deepEqual(await currentSearchResults(pool, principal, [hit]), []);
  assert.equal((await commitRevision(pool, { ...next, status: 'unresolved', scan: undefined })).state, 'committed');
  assert.equal((await pool.query('SELECT scan_status FROM scanned_documents')).rows[0].scan_status, 'UNRESOLVED');
  assert.equal((await commitRevision(pool, next)).state, 'committed');
  const recovered = (await pool.query('SELECT * FROM scanned_documents')).rows[0];
  assert.equal(recovered.scan_status, 'CLEAN');
  assert.equal((await currentSearchResults(pool, principal, [{ document_id: recovered.document_id, revision_id: recovered.revision_id }])).length, 1);
  assert.equal((await commitRevision(pool, { ...next, status: 'pending', scan: undefined })).state, 'duplicate');
  assert.equal((await pool.query('SELECT scan_status FROM scanned_documents')).rows[0].scan_status, 'CLEAN');
});
