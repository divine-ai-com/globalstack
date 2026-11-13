import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { promisify } from 'node:util';
import pg from 'pg';
import { registerDocumentAccess } from './access.mjs';
import { grantDocumentAccess } from './database-bootstrap.mjs';
import { commitRevision, migrate } from './repository.mjs';

const exec = promisify(execFile);

test('document worker and ingress have only their required SQL permissions', { timeout: 60000 }, async t => {
  const name = `gs-document-grants-${randomBytes(5).toString('hex')}`;
  const password = randomBytes(24).toString('hex');
  let pool, workerPool, ingressPool;
  t.after(async () => {
    await workerPool?.end();
    await ingressPool?.end();
    await pool?.end();
    await exec('docker', ['rm', '-f', name]).catch(() => {});
  });
  await exec('docker', ['run', '-d', '--rm', '--name', name, '--label', 'globalstack.experiment=document-grants',
    '--memory', '512m', '--cpus', '2', '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot', '-e', 'POSTGRES_DB=documents',
    'postgres:16-alpine'], { env: { ...process.env, POSTGRES_PASSWORD: password } });
  const inspected = JSON.parse((await exec('docker', ['inspect', name])).stdout)[0];
  const port = Number(inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort);
  pool = new pg.Pool({ host: '127.0.0.1', port, user: 'pilot', password, database: 'documents', connectionTimeoutMillis: 2000 });
  const deadline = Date.now() + 30000;
  while (true) {
    try { await pool.query('SELECT 1'); break; } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }
  await migrate(pool);
  const workerPassword = randomBytes(24).toString('hex'), ingressPassword = randomBytes(24).toString('hex');
  await pool.query(`CREATE ROLE "worker-pilot" LOGIN PASSWORD '${workerPassword}';
    CREATE ROLE "ingress-pilot" LOGIN PASSWORD '${ingressPassword}'; CREATE ROLE outsider NOLOGIN`);
  await grantDocumentAccess(pool, { workerRole: 'worker-pilot', ingressRole: 'ingress-pilot' });
  await grantDocumentAccess(pool, { workerRole: 'worker-pilot', ingressRole: 'ingress-pilot' });
  workerPool = new pg.Pool({ host: '127.0.0.1', port, user: 'worker-pilot', password: workerPassword, database: 'documents' });
  ingressPool = new pg.Pool({ host: '127.0.0.1', port, user: 'ingress-pilot', password: ingressPassword, database: 'documents' });
  const input = { tenant: 'pilot', blobUrl: 'https://example.blob.core.windows.net/landing/pilot/report.txt',
    fileName: 'report.txt', version: 'version-1', sequence: '01', status: 'pending' };
  const principal = { tenant: 'pilot', subject: '11111111-1111-4111-8111-111111111111', groups: [] };
  const access = await registerDocumentAccess(ingressPool, principal,
    { ...input, uploadKey: '22222222-2222-4222-8222-222222222222', readGroups: [] });
  const committed = await commitRevision(workerPool, input);
  assert.equal(committed.documentId, access.document_id);
  assert.equal((await ingressPool.query('SELECT scan_status FROM scanned_documents WHERE document_id=$1', [access.document_id])).rows[0].scan_status, 'PENDING');
  assert.equal((await workerPool.query('SELECT count(*)::integer AS count FROM document_outbox')).rows[0].count, 1);
  const check = async (role, sql, permitted) => {
    const client = await pool.connect();
    try {
      await client.query(`SET ROLE "${role}"`);
      if (permitted) await client.query(sql);
      else await assert.rejects(client.query(sql), /permission denied|does not exist/);
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  };
  await check('worker-pilot', 'SELECT * FROM document_access LIMIT 0', true);
  await check('worker-pilot', 'UPDATE scanned_documents SET scan_status=\'CLEAN\' WHERE false', true);
  await check('worker-pilot', 'CREATE TABLE unexpected(id integer)', false);
  await check('ingress-pilot', 'SELECT * FROM scanned_documents LIMIT 0', true);
  await check('ingress-pilot', 'SELECT * FROM document_outbox LIMIT 0', false);
  await check('ingress-pilot', 'UPDATE scanned_documents SET scan_status=\'CLEAN\' WHERE false', false);
  await check('outsider', 'SELECT * FROM document_access LIMIT 0', false);
  assert.equal((await pool.query("SELECT has_sequence_privilege('worker-pilot', 'document_outbox_event_id_seq', 'USAGE') AS allowed")).rows[0].allowed, true);
  assert.equal((await pool.query("SELECT has_sequence_privilege('ingress-pilot', 'document_outbox_event_id_seq', 'USAGE') AS allowed")).rows[0].allowed, false);
  assert.equal((await pool.query("SELECT has_table_privilege('ingress-pilot', 'document_access', 'INSERT') AS allowed")).rows[0].allowed, true);
  await assert.rejects(grantDocumentAccess(pool, { workerRole: 'worker-pilot;DROP ROLE pilot', ingressRole: 'ingress-pilot' }),
    /Database role name/);
});
