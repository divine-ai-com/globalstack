import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { ResourceStore } from '../../../packages/core/src/resource-store.mjs';
import { createPostgresArmConnectionResolver } from '../../../packages/azure-data-plane/src/postgres-arm-connection.mjs';
import { createPostgresWireGateway } from '../../../packages/azure-data-plane/src/postgres-wire-gateway.mjs';
import { createNativeFunctionsPlatform } from '../../../packages/azure-data-plane/src/native-functions-platform.mjs';
import { installLocalPostgresPrincipalCatalog, createLocalPostgresAdministrator,
  createLocalPostgresPrincipalResolver } from
  '../../../packages/azure-data-plane/src/local-postgres-principals.mjs';
import { bootstrapDocumentDatabase } from './database-bootstrap.mjs';
import { registerDocumentAccess } from './access.mjs';
import { commitRevision, deliverNext, processingContext } from './repository.mjs';

const exec = promisify(execFile);

test('nonadmin Entra-shaped identities retain separate SQL permissions through the TLS gateway',
  { timeout: 60000 }, async t => {
    const container = `gs-pg-principal-${randomBytes(5).toString('hex')}`;
    const directory = await mkdtemp(join(tmpdir(), 'gs-pg-principal-'));
    const backendPassword = randomBytes(24).toString('hex');
    let gateway, admin, postgres;
    t.after(async () => {
      if (gateway) await new Promise(done => { gateway.closeAllConnections(); gateway.close(done); });
      await Promise.all([admin?.end(), postgres?.end()]);
      await exec('docker', ['rm', '-f', container]).catch(() => {});
      await rm(directory, { recursive: true, force: true });
    });
    await exec('docker', ['run', '-d', '--rm', '--name', container,
      '--label', 'globalstack.experiment=pg-principal', '--memory', '512m', '--cpus', '2', '--pids-limit', '128',
      '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456', '-p', '127.0.0.1::5432',
      '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot', '-e', 'POSTGRES_DB=documents', 'postgres:16-alpine'],
    { env: { ...process.env, POSTGRES_PASSWORD: backendPassword } });
    const inspected = JSON.parse((await exec('docker', ['inspect', container])).stdout)[0];
    const backend = { host: '127.0.0.1', port: Number(inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort),
      user: 'pilot', password: backendPassword };
    const deadline = Date.now() + 30000;
    while (true) {
      const check = new pg.Client({ ...backend, database: 'postgres' });
      try { await check.connect(); await check.end(); break; } catch (error) {
        await check.end().catch(() => {});
        if (Date.now() > deadline) throw error;
        await new Promise(done => setTimeout(done, 300));
      }
    }
    await installLocalPostgresPrincipalCatalog(backend);
    const delegated = await createLocalPostgresAdministrator(backend, {
      user: 'pilot-admin', password: randomBytes(32).toString('hex'), database: 'documents' });
    const tenant = randomUUID(), pilotId = randomUUID(), workerId = randomUUID(), ingressId = randomUUID();
    const store = new ResourceStore();
    const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourcegroups/pg-principal';
    const serverId = `${group}/providers/microsoft.dbforpostgresql/flexibleservers/gs-principal-db`;
    const host = 'gs-principal-db.postgres.database.azure.com';
    const put = (id, type, properties) => store.resources.set(id, { id, type, properties });
    put(serverId, 'Microsoft.DBforPostgreSQL/flexibleServers', {
      fullyQualifiedDomainName: host,
      authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Disabled' },
      network: { publicNetworkAccess: 'Enabled' } });
    put(`${serverId}/administrators/${pilotId}`, 'Microsoft.DBforPostgreSQL/flexibleServers/administrators',
      { principalName: 'pilot', principalType: 'ServicePrincipal', tenantId: tenant });
    put(`${serverId}/databases/documents`, 'Microsoft.DBforPostgreSQL/flexibleServers/databases', {});
    put(`${serverId}/firewallrules/source`, 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules',
      { startIpAddress: '127.0.0.1', endIpAddress: '127.0.0.1' });
    await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-days', '1',
      '-subj', `/CN=${host}`, '-addext', `subjectAltName=DNS:${host}`], { timeout: 10000 });
    const cert = await readFile(join(directory, 'cert.pem'));
    const key = await readFile(join(directory, 'key.pem'));
    const { publicKey, privateKey } = await generateKeyPair('RS256');
    const jwk = { ...await exportJWK(publicKey), alg: 'RS256', kid: randomUUID() };
    const issuer = 'https://identity.globalstack.test/';
    gateway = createPostgresWireGateway({ tls: { cert, key },
      trust: { jwks: { keys: [jwk] }, tenantId: tenant, issuer },
      resolveConnection: createPostgresArmConnectionResolver({ store, backend: delegated, serverHost: host,
        mapDatabase: (_, database) => database,
        resolvePrincipal: createLocalPostgresPrincipalResolver(backend) }) });
    await new Promise(done => gateway.listen(0, '127.0.0.1', done));
    const token = id => new SignJWT({ tid: tenant, oid: id, idtyp: 'app' })
      .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer)
      .setAudience('https://ossrdbms-aad.database.windows.net').setIssuedAt().setExpirationTime('5m')
      .sign(privateKey);
    const adminConnection = { host: '127.0.0.1', port: gateway.address().port,
      user: 'pilot', password: () => token(pilotId),
      ssl: { ca: cert, rejectUnauthorized: true, servername: host }, connectionTimeoutMillis: 4000 };
    admin = new pg.Pool({ ...adminConnection, database: 'documents' });
    postgres = new pg.Pool({ ...adminConnection, database: 'postgres' });
    await bootstrapDocumentDatabase({ postgresPool: postgres, databasePool: admin,
      workerRole: 'worker-pilot', workerObjectId: workerId,
      ingressRole: 'ingress-pilot', ingressObjectId: ingressId });
    const listed = (await postgres.query('SELECT * FROM pg_catalog.pgaadauth_list_principals(false)')).rows;
    assert.deepEqual(listed.map(item => item.rolename).sort(), ['ingress-pilot', 'worker-pilot']);
    await assert.rejects(postgres.query('SELECT login_password FROM globalstack_auth.principals'), /permission denied/);
    const client = (user, password) => new pg.Client({ host: '127.0.0.1', port: gateway.address().port,
      user, database: 'documents', password,
      ssl: { ca: cert, rejectUnauthorized: true, servername: host }, connectionTimeoutMillis: 4000 });
    const worker = client('worker-pilot', await token(workerId));
    await worker.connect();
    assert.equal((await worker.query('SELECT current_user AS role')).rows[0].role, 'worker-pilot');
    await worker.query('RESET ROLE');
    assert.equal((await worker.query('SELECT current_user AS role')).rows[0].role, 'worker-pilot');
    await assert.rejects(worker.query('SET ROLE "pilot-admin"'), /permission denied/);
    await worker.query('SELECT * FROM document_access LIMIT 0');
    await worker.query('SELECT * FROM document_outbox LIMIT 0');
    await assert.rejects(worker.query('CREATE TABLE unexpected(id integer)'), /permission denied/);
    await assert.rejects(worker.query('SELECT * FROM globalstack_auth.principals'), /permission denied|does not exist/);
    await worker.end();
    const ingress = client('ingress-pilot', await token(ingressId));
    await ingress.connect();
    assert.equal((await ingress.query('SELECT current_user AS role')).rows[0].role, 'ingress-pilot');
    await ingress.query('SELECT * FROM scanned_documents LIMIT 0');
    await assert.rejects(ingress.query('SELECT * FROM document_outbox LIMIT 0'), /permission denied/);
    await ingress.end();
    const workerPool = new pg.Pool({ ...adminConnection, user: 'worker-pilot', password: () => token(workerId), database: 'documents' });
    const ingressPool = new pg.Pool({ ...adminConnection, user: 'ingress-pilot', password: () => token(ingressId), database: 'documents' });
    try {
      const input = { tenant: 'pilot', blobUrl: 'https://example.blob.core.windows.net/landing/pilot/report.txt',
        fileName: 'report.txt', version: 'version-1', sequence: '01', status: 'pending' };
      const principal = { tenant: 'pilot', subject: randomUUID(), groups: [] };
      const uploadKey = randomUUID();
      const access = await registerDocumentAccess(ingressPool, principal, { ...input, uploadKey, readGroups: [] });
      assert.equal((await processingContext(workerPool, input)).rootCorrelationId, uploadKey);
      const committed = await commitRevision(workerPool, { ...input, rootCorrelationId: uploadKey });
      assert.equal(committed.documentId, access.document_id);
      assert.equal((await ingressPool.query('SELECT scan_status FROM scanned_documents WHERE document_id=$1',
        [access.document_id])).rows[0].scan_status, 'PENDING');
      assert.equal((await workerPool.query('SELECT count(*)::integer AS count FROM document_outbox')).rows[0].count, 1);
      const delivered = await deliverNext(workerPool, ({ operation, document }) => {
        assert.equal(operation, 'delete');
        assert.equal(document.document_id, access.document_id);
        return { status: true, key: access.document_id };
      });
      assert.equal(delivered.state, 'delivered');
      await assert.rejects(ingressPool.query('SELECT * FROM document_outbox LIMIT 0'), /permission denied/);
    } finally { await Promise.all([workerPool.end(), ingressPool.end()]); }
    const wrongIdentity = client('worker-pilot', await token(randomUUID()));
    await assert.rejects(wrongIdentity.connect());
    wrongIdentity.connection?.stream?.destroy();
    const wrongRole = client('ingress-pilot', await token(workerId));
    await assert.rejects(wrongRole.connect());
    wrongRole.connection?.stream?.destroy();
    const storage = `${group}/providers/Microsoft.Storage/storageAccounts/pgprincipalhost`;
    const storageRouter = { account: () => ({ resourceId: storage }),
      blobHandler: () => (_req, res) => res.end(), queueHandler: () => (_req, res) => res.end(),
      tableHandler: () => (_req, res) => res.end() };
    const identityService = { trust: { jwks: { keys: [jwk] }, tenantId: tenant, issuer },
      bind: () => ({ identityHeader: 'test-header', handler: (_req, res) => res.end(), revoke() {} }) };
    const prepare = createNativeFunctionsPlatform({ identityService, storageRouter: () => storageRouter,
      store, postgresBackend: () => ({ ...delegated, mapDatabase: (_, database) => database,
        resolvePrincipal: createLocalPostgresPrincipalResolver(backend) }) });
    const platform = await prepare({ resource: { id: `${group}/providers/Microsoft.Web/sites/pg-role-worker`,
      name: 'pg-role-worker', properties: { siteConfig: { appSettings: [
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' },
        { name: 'AzureWebJobsStorage__accountName', value: 'pgprincipalhost' },
        { name: 'DB_HOST', value: host },
        { name: 'DB_PORT', value: '5432' },
      ] } } }, signal: new AbortController().signal, directory });
    try {
      const mapping = platform.extraHosts.find(item => item.startsWith(`${host}:`));
      assert.ok(mapping);
      const gatewayAddress = mapping.split(':')[1];
      const prefix = gatewayAddress.split('.').slice(0, 2).join('.');
      put(`${serverId}/firewallrules/native-source`, 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules',
        { startIpAddress: `${prefix}.0.0`, endIpAddress: `${prefix}.255.255` });
      const native = new pg.Client({ host: gatewayAddress, port: Number(platform.env.DB_PORT),
        database: 'documents', user: 'worker-pilot', password: await token(workerId),
        ssl: { ca: await readFile(join(directory, 'platform-ca.pem')), rejectUnauthorized: true,
          servername: host }, connectionTimeoutMillis: 4000 });
      await native.connect();
      assert.equal((await native.query('SELECT current_user AS role')).rows[0].role, 'worker-pilot');
      await native.query('SELECT * FROM document_outbox LIMIT 0');
      await native.end();
    } finally { await platform.dispose(); store.resources.delete(`${serverId}/firewallrules/native-source`); }
    store.resources.delete(`${serverId}/firewallrules/source`);
    const denied = client('worker-pilot', await token(workerId));
    await assert.rejects(denied.connect());
    denied.connection?.stream?.destroy();
  });
