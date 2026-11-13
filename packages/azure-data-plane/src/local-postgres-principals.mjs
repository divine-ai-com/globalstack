import assert from 'node:assert/strict';
import pg from 'pg';

const identifier = /^[A-Za-z][A-Za-z0-9_-]{0,62}$/;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

// This catalog is installed only in an isolated, disposable PostgreSQL backend.
// Its generated login passwords never pass through the Azure-shaped SQL client.
const catalogSql = `
CREATE SCHEMA IF NOT EXISTS globalstack_auth;
CREATE TABLE IF NOT EXISTS globalstack_auth.principals (
  rolename text PRIMARY KEY,
  objectid uuid UNIQUE NOT NULL,
  principaltype text NOT NULL CHECK (principaltype = 'service'),
  isadmin integer NOT NULL CHECK (isadmin = 0),
  login_password text NOT NULL
);
REVOKE ALL ON SCHEMA globalstack_auth FROM PUBLIC;
REVOKE ALL ON globalstack_auth.principals FROM PUBLIC;
CREATE OR REPLACE FUNCTION pg_catalog.pgaadauth_list_principals(include_admin boolean)
RETURNS TABLE(rolename text, objectid uuid, principaltype text, isadmin integer)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT p.rolename, p.objectid, p.principaltype, p.isadmin
  FROM globalstack_auth.principals p WHERE include_admin OR p.isadmin = 0
$$;
REVOKE EXECUTE ON FUNCTION pg_catalog.pgaadauth_list_principals(boolean) FROM PUBLIC;
CREATE OR REPLACE FUNCTION pg_catalog.pgaadauth_create_principal_with_oid(
  role_name text, object_id text, object_type text, make_admin boolean, require_mfa boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE generated_password text;
BEGIN
  IF role_name !~ '^[A-Za-z][A-Za-z0-9_-]{0,62}$' OR object_type <> 'service'
     OR make_admin OR require_mfa THEN
    RAISE EXCEPTION 'Unsupported PostgreSQL principal request';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
    RAISE EXCEPTION 'PostgreSQL role already exists';
  END IF;
  generated_password := replace(pg_catalog.gen_random_uuid()::text, '-', '')
    || replace(pg_catalog.gen_random_uuid()::text, '-', '');
  EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', role_name, generated_password);
  INSERT INTO globalstack_auth.principals (rolename, objectid, principaltype, isadmin, login_password)
  VALUES (role_name, object_id::uuid, 'service', 0, generated_password);
END;
$$;
REVOKE EXECUTE ON FUNCTION pg_catalog.pgaadauth_create_principal_with_oid(text,text,text,boolean,boolean) FROM PUBLIC;
`;

async function withAdmin(backend, work) {
  const client = new pg.Client({ host: backend.host, port: backend.port,
    user: backend.user, password: backend.password, database: 'postgres',
    ssl: backend.ssl ?? false, connectionTimeoutMillis: 5000 });
  await client.connect();
  try { return await work(client); }
  finally { await client.end(); }
}

export async function installLocalPostgresPrincipalCatalog(backend) {
  assert.ok(backend?.host && backend?.port && backend?.user && backend?.password);
  await withAdmin(backend, client => client.query(catalogSql));
}

export async function createLocalPostgresAdministrator(backend, { user, password, database }) {
  assert.match(user ?? '', identifier);
  assert.match(database ?? '', identifier);
  assert.match(password ?? '', /^[a-f0-9]{48,128}$/);
  await withAdmin(backend, async client => {
    const role = `"${user}"`, db = `"${database}"`;
    assert.equal((await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [user])).rowCount, 0,
      'Local PostgreSQL administrator already exists');
    await client.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
    await client.query(`ALTER DATABASE ${db} OWNER TO ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pgaadauth_list_principals(boolean) TO ${role}`);
    await client.query(`GRANT EXECUTE ON FUNCTION pg_catalog.pgaadauth_create_principal_with_oid(text,text,text,boolean,boolean) TO ${role}`);
  });
  return { ...backend, user, password };
}

export function createLocalPostgresPrincipalResolver(backend) {
  assert.ok(backend?.host && backend?.port && backend?.user && backend?.password);
  return async ({ user, principalId }) => {
    assert.match(user ?? '', identifier);
    assert.match(principalId ?? '', uuid);
    return withAdmin(backend, async client => {
      const result = await client.query(`SELECT rolename, login_password
        FROM globalstack_auth.principals
        WHERE rolename = $1 AND objectid = $2 AND principaltype = 'service' AND isadmin = 0`,
      [user, principalId]);
      assert.equal(result.rowCount, 1, 'PostgreSQL principal identity does not match');
      return { user: result.rows[0].rolename, password: result.rows[0].login_password };
    });
  };
}
