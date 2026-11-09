import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createSecureContext, TLSSocket } from 'node:tls';
import pg from 'pg';
import { createLocalJWKSet, jwtVerify } from 'jose';

const sslRequest = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]);
const maxStartupBytes = 16 * 1024;

class Reader {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.pending = null;
    this.error = null;
    this.onData = bytes => {
      if (this.buffer.length + bytes.length > maxStartupBytes) return socket.destroy(new Error('PostgreSQL startup exceeds limit'));
      this.buffer = Buffer.concat([this.buffer, bytes]);
      this.flush();
    };
    this.onEnd = () => { this.error = new Error('PostgreSQL startup ended'); this.flush(); };
    socket.on('data', this.onData);
    socket.on('end', this.onEnd);
    socket.on('error', this.onEnd);
    socket.on('close', this.onEnd);
  }

  flush() {
    if (!this.pending) return;
    const { length, resolve, reject } = this.pending;
    if (this.buffer.length < length && !this.error) return;
    this.pending = null;
    if (this.error) return reject(this.error);
    const value = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    resolve(value);
  }

  read(length) {
    assert.ok(Number.isInteger(length) && length > 0 && length <= maxStartupBytes);
    assert.equal(this.pending, null);
    return new Promise((resolve, reject) => { this.pending = { length, resolve, reject }; this.flush(); });
  }

  detach() {
    this.socket.off('data', this.onData);
    this.socket.off('end', this.onEnd);
    this.socket.off('error', this.onEnd);
    this.socket.off('close', this.onEnd);
    return this.buffer;
  }
}

function message(type, payload) {
  const header = Buffer.alloc(5);
  header.writeUInt8(type.charCodeAt(0), 0);
  header.writeUInt32BE(payload.length + 4, 1);
  return Buffer.concat([header, payload]);
}

function authentication(code) {
  const payload = Buffer.alloc(4);
  payload.writeUInt32BE(code);
  return message('R', payload);
}

function parameter(name, value) {
  return message('S', Buffer.from(`${name}\0${value}\0`));
}

function errorResponse() {
  return message('E', Buffer.from('SFATAL\0C28P01\0MPostgreSQL authentication failed\0\0'));
}

function parseStartup(bytes) {
  assert.equal(bytes.readUInt32BE(0), 196608, 'PostgreSQL protocol version 3 is required');
  assert.equal(bytes.at(-1), 0);
  const fields = bytes.subarray(4).toString('utf8').split('\0');
  assert.equal(fields.at(-1), '');
  fields.pop();
  assert.equal(fields.at(-1), '');
  fields.pop();
  assert.equal(fields.length % 2, 0);
  const values = Object.create(null);
  for (let index = 0; index < fields.length; index += 2) {
    assert.ok(fields[index] && !Object.hasOwn(values, fields[index]));
    values[fields[index]] = fields[index + 1];
  }
  assert.match(values.user ?? '', /^[A-Za-z][A-Za-z0-9_-]{0,62}$/);
  assert.match(values.database ?? '', /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/);
  return values;
}

async function frame(reader) {
  const header = await reader.read(5);
  const length = header.readUInt32BE(1);
  assert.ok(length >= 5 && length <= maxStartupBytes);
  return { type: String.fromCharCode(header[0]), body: await reader.read(length - 4) };
}

// The gateway authenticates the Azure-shaped frontend before handing its SQL
// messages to an isolated local PostgreSQL session. It does not claim Azure's
// full SQL protocol, cancellation, or networking behavior.
export function createPostgresWireGateway({ tls, trust, resolveConnection, observe = () => {} }) {
  assert.ok(tls?.key && tls?.cert && trust?.jwks && typeof resolveConnection === 'function');
  const secureContext = createSecureContext(tls);
  const jwks = createLocalJWKSet(trust.jwks);
  const sockets = new Set();
  const server = createServer(raw => {
    sockets.add(raw);
    raw.once('close', () => sockets.delete(raw));
    raw.setNoDelay(true);
    raw.setTimeout(10000, () => raw.destroy());
    let frontend = raw, backend;
    async function run() {
      const initial = new Reader(raw);
      const request = await initial.read(8);
      if (!request.equals(sslRequest) || initial.buffer.length) throw new Error('PostgreSQL TLS is required');
      initial.detach();
      raw.write('S');
      frontend = new TLSSocket(raw, { isServer: true, secureContext });
      await new Promise((resolve, reject) => {
        frontend.once('secure', resolve);
        frontend.once('error', reject);
        frontend.once('close', () => reject(new Error('PostgreSQL TLS handshake ended')));
      });
      const reader = new Reader(frontend);
      const size = (await reader.read(4)).readUInt32BE(0);
      assert.ok(size >= 8 && size <= maxStartupBytes);
      const startup = parseStartup(await reader.read(size - 4));
      frontend.write(authentication(3));
      const password = await frame(reader);
      assert.equal(password.type, 'p');
      assert.ok(password.body.length > 1 && password.body.at(-1) === 0);
      const token = password.body.subarray(0, -1).toString('utf8');
      const { payload } = await jwtVerify(token, jwks, {
        issuer: trust.issuer, audience: 'https://ossrdbms-aad.database.windows.net', algorithms: ['RS256'],
      });
      assert.equal(payload.tid?.toLowerCase(), trust.tenantId.toLowerCase());
      assert.match(payload.oid ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i);
      const connection = await resolveConnection({ user: startup.user, database: startup.database,
        serverName: frontend.servername, sourceIp: raw.remoteAddress,
        principalId: payload.oid, tenantId: payload.tid });
      assert.ok(connection && connection.host && connection.port && connection.user && connection.database);
      backend = new pg.Client({ host: connection.host, port: connection.port, user: connection.user,
        password: connection.password, database: connection.database, ssl: connection.ssl ?? false,
        connectionTimeoutMillis: 5000 });
      backend.on('error', () => frontend.destroy());
      await backend.connect();
      if (connection.role) {
        assert.match(connection.role, /^[A-Za-z][A-Za-z0-9_-]{0,62}$/);
        await backend.query(`SET ROLE "${connection.role}"`);
      }
      frontend.write(Buffer.concat([
        authentication(0),
        parameter('server_version', '16.0'),
        parameter('client_encoding', 'UTF8'),
        parameter('DateStyle', 'ISO, MDY'),
        parameter('integer_datetimes', 'on'),
        parameter('standard_conforming_strings', 'on'),
        parameter('TimeZone', 'UTC'),
        message('K', Buffer.alloc(8)),
        message('Z', Buffer.from('I')),
      ]));
      raw.setTimeout(0);
      const backendStream = backend.connection.stream;
      backendStream.removeAllListeners('data');
      const pending = reader.detach();
      if (pending.length) backendStream.write(pending);
      frontend.pipe(backendStream);
      backendStream.pipe(frontend);
      frontend.on('error', () => backendStream.destroy());
      frontend.on('close', () => backendStream.destroy());
      backendStream.on('close', () => frontend.destroy());
      observe({ outcome: 'connected', database: startup.database, user: startup.user });
    }
    run().catch(() => {
      observe({ outcome: 'rejected' });
      if (frontend !== raw && frontend.writable && frontend.encrypted) frontend.end(errorResponse());
      else raw.destroy();
      backend?.connection?.stream?.destroy();
    });
  });
  server.maxConnections = 8;
  server.closeAllConnections = () => { for (const socket of sockets) socket.destroy(); };
  return server;
}
