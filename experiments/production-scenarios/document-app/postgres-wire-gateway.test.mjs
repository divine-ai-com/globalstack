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
import { createArmServer } from '../../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../../packages/core/src/resource-store.mjs';
import { RelationalBackendManager, physicalDatabaseName } from '../../../packages/azure-data-plane/src/relational-backend-manager.mjs';
import { createPostgresArmConnectionResolver } from '../../../packages/azure-data-plane/src/postgres-arm-connection.mjs';
import { createPostgresWireGateway } from '../../../packages/azure-data-plane/src/postgres-wire-gateway.mjs';
import { httpExchange } from '../http-exchange.mjs';

const exec = promisify(execFile);

test('verified PostgreSQL TLS client reaches real SQL and invalid identity is denied', { timeout: 60000 }, async t => {
  const name = `gs-pg-wire-${randomBytes(5).toString('hex')}`;
  const directory = await mkdtemp(join(tmpdir(), 'gs-pg-wire-'));
  const password = randomBytes(24).toString('hex');
  let gateway, arm;
  t.after(async () => {
    if (gateway) await new Promise(done => { gateway.closeAllConnections(); gateway.close(done); });
    if (arm) await new Promise(done => { arm.closeAllConnections(); arm.close(done); });
    await exec('docker', ['rm', '-f', name]).catch(() => {});
    await rm(directory, { recursive: true, force: true });
  });
  await exec('docker', ['run', '-d', '--rm', '--name', name, '--label', 'globalstack.experiment=pg-wire',
    '--memory', '512m', '--cpus', '2', '--pids-limit', '128', '--tmpfs', '/var/lib/postgresql/data:rw,size=268435456',
    '-p', '127.0.0.1::5432', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_USER=pilot', '-e', 'POSTGRES_DB=postgres',
    'postgres:16-alpine'], { env: { ...process.env, POSTGRES_PASSWORD: password } });
  const inspected = JSON.parse((await exec('docker', ['inspect', name])).stdout)[0];
  const backendPort = Number(inspected.NetworkSettings.Ports['5432/tcp'][0].HostPort);
  const manager = new RelationalBackendManager({ postgresEndpoint: `postgres://pilot:${password}@127.0.0.1:${backendPort}/postgres` });
  const serverName = 'gs-wire-test', database = physicalDatabaseName('postgres', serverName, 'documents');
  const store = new ResourceStore();
  arm = createArmServer({ store });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/postgres-wire';
  const serverId = `${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/${serverName}`;
  const rule = `${serverId}/firewallRules/test-source`;
  const request = (method, path, body) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}?api-version=2024-08-01`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  assert.equal((await request('PUT', group, { location: 'westus2' })).status, 201);
  assert.ok([201, 202].includes((await request('PUT', serverId, { location: 'westus2',
    sku: { name: 'Standard_B1ms', tier: 'Burstable' }, properties: { version: '16',
      authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Disabled' },
      network: { publicNetworkAccess: 'Enabled' } } })).status));
  let backend;
  const deadline = Date.now() + 30000;
  while (true) {
    backend = new pg.Client({ host: '127.0.0.1', port: backendPort, user: 'pilot', password, database: 'postgres' });
    try { await backend.connect(); break; } catch (error) {
      await backend.end().catch(() => {});
      if (Date.now() > deadline) throw error;
      await new Promise(done => setTimeout(done, 300));
    }
  }
  await manager.ensureDatabase({ engine: 'postgres', serverName, databaseName: 'documents' });
  await backend.end();
  backend = new pg.Client({ host: '127.0.0.1', port: backendPort, user: 'pilot', password, database });
  await backend.connect();
  await backend.query('CREATE TABLE documents_probe (id integer primary key, content text not null)');
  await backend.end();
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'),
    '-out', join(directory, 'cert.pem'), '-days', '1', '-subj', `/CN=${serverName}.postgres.database.azure.com`,
    '-addext', `subjectAltName=DNS:${serverName}.postgres.database.azure.com`], { timeout: 10000 });
  const cert = await readFile(join(directory, 'cert.pem'));
  const key = await readFile(join(directory, 'key.pem'));
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), alg: 'RS256', kid: randomUUID() };
  const tenant = randomUUID(), principal = randomUUID(), issuer = 'https://identity.globalstack.test/';
  assert.equal((await request('PUT', `${serverId}/administrators/${principal}`, { properties: {
    principalName: 'pilot', principalType: 'ServicePrincipal', tenantId: tenant } })).status, 201);
  assert.equal((await request('PUT', `${serverId}/databases/documents`, { properties: {
    charset: 'UTF8', collation: 'en_US.utf8' } })).status, 201);
  assert.equal((await request('PUT', rule, { properties: {
    startIpAddress: '127.0.0.1', endIpAddress: '127.0.0.1' } })).status, 202);
  const trust = { jwks: { keys: [jwk] }, tenantId: tenant, issuer };
  const observed = [];
  gateway = createPostgresWireGateway({ tls: { cert, key }, trust,
    resolveConnection: createPostgresArmConnectionResolver({ store, backend: manager.postgresEndpoint,
      serverHost: `${serverName}.postgres.database.azure.com` }),
    observe: event => observed.push(event) });
  await new Promise(done => gateway.listen(0, '127.0.0.1', done));
  const token = (audience, objectId = principal) => new SignJWT({ tid: tenant, oid: objectId, idtyp: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(issuer).setAudience(audience)
    .setIssuedAt().setExpirationTime('5m').sign(privateKey);
  const client = (passwordValue, ssl = { ca: cert, rejectUnauthorized: true,
    servername: `${serverName}.postgres.database.azure.com` }) =>
    new pg.Client({ host: '127.0.0.1', port: gateway.address().port, user: 'pilot', database: 'documents',
      password: passwordValue, ssl, connectionTimeoutMillis: 4000 });
  const good = client(await token('https://ossrdbms-aad.database.windows.net'));
  await good.connect();
  await good.query('INSERT INTO documents_probe VALUES ($1, $2)', [1, 'same SQL client']);
  const row = await good.query('SELECT content FROM documents_probe WHERE id=$1', [1]);
  assert.equal(row.rows[0].content, 'same SQL client');
  await good.end();
  assert.ok(observed.some(event => event.outcome === 'connected'));

  const wrongAudience = client(await token('https://storage.azure.com'));
  await assert.rejects(wrongAudience.connect());
  wrongAudience.connection?.stream?.destroy();
  const wrongPrincipal = client(await token('https://ossrdbms-aad.database.windows.net', randomUUID()));
  await assert.rejects(wrongPrincipal.connect());
  wrongPrincipal.connection?.stream?.destroy();
  const wrongServerName = client(await token('https://ossrdbms-aad.database.windows.net'), {
    ca: cert, rejectUnauthorized: true, servername: 'other.postgres.database.azure.com' });
  await assert.rejects(wrongServerName.connect());
  wrongServerName.connection?.stream?.destroy();
  const noTls = client(await token('https://ossrdbms-aad.database.windows.net'), false);
  await assert.rejects(noTls.connect());
  noTls.connection?.stream?.destroy();
  assert.equal((await request('DELETE', rule)).status, 202);
  const denied = client(await token('https://ossrdbms-aad.database.windows.net'));
  await assert.rejects(denied.connect());
  denied.connection?.stream?.destroy();
  assert.ok(observed.filter(event => event.outcome === 'rejected').length >= 4);
});
