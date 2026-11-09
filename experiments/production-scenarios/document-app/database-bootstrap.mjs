import assert from 'node:assert/strict';
import { migrate } from './repository.mjs';

function roleName(value) {
  assert.match(value, /^[a-zA-Z][a-zA-Z0-9_-]{0,62}$/, 'Database role name must be a short identifier');
  return `"${value}"`;
}

function objectId(value) {
  assert.match(value, /^[a-f0-9]{8}-[a-f0-9]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[a-f0-9]{12}$/i,
    'Database principal object ID must be a UUID');
  return value;
}

export async function grantDocumentAccess(pool, { workerRole, ingressRole, database = 'documents' }) {
  const worker = roleName(workerRole), ingress = roleName(ingressRole), db = roleName(database);
  assert.notEqual(worker, ingress, 'Worker and ingress must use separate database roles');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`REVOKE ALL ON DATABASE ${db} FROM PUBLIC`);
    await client.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC`);
    await client.query(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC`);
    await client.query(`GRANT CONNECT ON DATABASE ${db} TO ${worker}, ${ingress}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${worker}, ${ingress}`);
    await client.query(`GRANT SELECT ON document_access TO ${worker}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE ON scanned_documents, document_revisions, document_outbox TO ${worker}`);
    await client.query(`GRANT USAGE ON SEQUENCE document_outbox_event_id_seq TO ${worker}`);
    await client.query(`GRANT SELECT, INSERT ON document_access TO ${ingress}`);
    await client.query(`GRANT SELECT ON scanned_documents TO ${ingress}`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function bootstrapDocumentDatabase({ postgresPool, databasePool, workerRole, workerObjectId,
  ingressRole, ingressObjectId, database = 'documents' }) {
  const worker = roleName(workerRole), ingress = roleName(ingressRole);
  assert.notEqual(worker, ingress);
  const existing = (await postgresPool.query('SELECT * FROM pg_catalog.pgaadauth_list_principals(false)')).rows;
  for (const [name, id] of [[workerRole, workerObjectId], [ingressRole, ingressObjectId]]) {
    const checkedId = objectId(id);
    const present = existing.find(row => row.rolename === name);
    if (present) {
      assert.equal(String(present.objectid).toLowerCase(), checkedId.toLowerCase(), 'Existing role maps to another identity');
      assert.equal(present.principaltype, 'service', 'Existing role must map to a service principal');
      assert.equal(Number(present.isadmin), 0, 'Application role must not be a database administrator');
    } else {
      await postgresPool.query('SELECT * FROM pg_catalog.pgaadauth_create_principal_with_oid($1, $2, $3, $4, $5)',
        [name, checkedId, 'service', false, false]);
    }
  }
  await migrate(databasePool);
  await grantDocumentAccess(databasePool, { workerRole, ingressRole, database });
}
