import assert from 'node:assert/strict';
import { isIP } from 'node:net';
import { physicalDatabaseName } from './relational-backend-manager.mjs';

const lower = value => String(value ?? '').toLowerCase();

function ipv4Number(value) {
  const address = String(value ?? '').replace(/^::ffff:/i, '');
  if (isIP(address) !== 4) return null;
  return address.split('.').reduce((number, octet) => number * 256 + Number(octet), 0);
}

function allowsSource(store, serverId, sourceIp) {
  const source = ipv4Number(sourceIp);
  if (source === null) return false;
  const prefix = `${lower(serverId)}/firewallrules/`;
  return [...store.resources.values()].some(resource => {
    if (lower(resource.type) !== 'microsoft.dbforpostgresql/flexibleservers/firewallrules'
      || !lower(resource.id).startsWith(prefix)) return false;
    const start = ipv4Number(resource.properties?.startIpAddress);
    const end = ipv4Number(resource.properties?.endIpAddress);
    // Azure's 0.0.0.0 rule has special Azure-service semantics. It is not a
    // general local allow-all rule.
    if (start === 0 && end === 0) return false;
    return start !== null && end !== null && start <= source && source <= end;
  });
}

export function createPostgresArmConnectionResolver({ store, backend, serverHost }) {
  assert.ok(store?.resources instanceof Map && backend?.host && backend?.port && backend?.user);
  assert.match(serverHost ?? '', /^[a-z0-9][a-z0-9-]{2,62}\.postgres\.database\.azure\.com$/);
  const name = serverHost.split('.')[0];
  return async ({ user, database, serverName, sourceIp, principalId, tenantId }) => {
    assert.equal(lower(serverName), lower(serverHost), 'PostgreSQL TLS server name does not match the deployed server');
    const servers = [...store.resources.values()].filter(resource =>
      lower(resource.type) === 'microsoft.dbforpostgresql/flexibleservers'
      && lower(resource.properties?.fullyQualifiedDomainName) === lower(serverHost));
    assert.equal(servers.length, 1, 'The declared PostgreSQL server must be deployed exactly once');
    const server = servers[0];
    assert.equal(server.properties?.authConfig?.activeDirectoryAuth, 'Enabled');
    assert.equal(server.properties?.authConfig?.passwordAuth, 'Disabled');
    assert.equal(server.properties?.network?.publicNetworkAccess, 'Enabled');
    assert.ok(allowsSource(store, server.id, sourceIp), 'PostgreSQL firewall denies this source');
    const admin = store.resources.get(`${lower(server.id)}/administrators/${lower(principalId)}`);
    assert.ok(admin && lower(admin.properties?.principalName) === lower(user)
      && lower(admin.properties?.tenantId) === lower(tenantId)
      && admin.properties?.principalType === 'ServicePrincipal', 'PostgreSQL administrator identity does not match');
    const defaultDatabase = lower(database) === 'postgres';
    const db = defaultDatabase ? null : store.resources.get(`${lower(server.id)}/databases/${lower(database)}`);
    assert.ok(defaultDatabase || db && lower(db.type) === 'microsoft.dbforpostgresql/flexibleservers/databases',
      'PostgreSQL database is not deployed');
    return { host: backend.host, port: backend.port, user: backend.user, password: backend.password,
      database: defaultDatabase ? backend.database || 'postgres' : physicalDatabaseName('postgres', name, database), ssl: false };
  };
}
