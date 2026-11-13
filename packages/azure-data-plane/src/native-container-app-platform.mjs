import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resolveNativeBlobEndpoints, resolveNativeSearchEndpoints } from './native-functions-platform.mjs';
import { createPostgresArmConnectionResolver } from './postgres-arm-connection.mjs';
import { createPostgresWireGateway } from './postgres-wire-gateway.mjs';

const exec = promisify(execFile);
const subscription = id => /^\/subscriptions\/([^/]+)\//i.exec(id ?? '')?.[1]?.toLowerCase();

// Container Apps use the same workload code and declared Azure origins on both
// targets. This local platform maps only deployed services in the app's subscription.
export function createNativeContainerAppPlatform({ identityService, storageRouter, searchRouter, store,
  blobEndpoints = [], searchEndpoints = [], postgresBackend = null, entraJwks = null, observe = () => {} }) {
  if (entraJwks) {
    assert.match(entraJwks.tenantId ?? '', /^[a-f0-9-]{36}$/i);
    assert.ok(Array.isArray(entraJwks.keys) && entraJwks.keys.length > 0 && entraJwks.keys.length <= 32
      && entraJwks.keys.every(key => key.kty === 'RSA' && typeof key.kid === 'string'
        && typeof key.n === 'string' && typeof key.e === 'string' && !key.d),
    'Only bounded public Microsoft RSA signing keys may be mirrored');
  }
  return async ({ resource, signal, directory, gateway }) => {
    assert.equal(resource.type?.toLowerCase(), 'microsoft.app/containerapps');
    assert.ok(subscription(resource.id));
    assert.match(resource.name ?? '', /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/);
    assert.match(gateway, /^(?:\d{1,3}\.){3}\d{1,3}$/);
    const settings = Object.fromEntries((resource.properties?.template?.containers?.[0]?.env ?? [])
      .filter(item => typeof item.name === 'string' && typeof item.value === 'string')
      .map(item => [item.name, item.value]));
    const blobs = resolveNativeBlobEndpoints({ settings, names: blobEndpoints,
      router: storageRouter(), subscriptionId: subscription(resource.id) });
    const searches = resolveNativeSearchEndpoints({ settings, names: searchEndpoints,
      router: searchRouter?.(), store, subscriptionId: subscription(resource.id) });
    const postgresHost = settings.DB_HOST;
    const backend = postgresHost && typeof postgresBackend === 'function' ? postgresBackend() : postgresBackend;
    if (postgresHost !== undefined) {
      assert.match(postgresHost, /^[a-z0-9][a-z0-9-]{2,62}\.postgres\.database\.azure\.com$/);
      assert.ok(backend?.host && backend?.port && backend?.user,
        'PostgreSQL transport requires an operator-configured local backend');
      assert.ok(settings.DB_PORT === undefined || settings.DB_PORT === '5432');
    }
    const hostnames = [...new Set([...blobs.map(item => item.hostname), ...searches.map(item => item.hostname),
      ...(postgresHost ? [postgresHost] : []), ...(entraJwks ? ['login.microsoftonline.com'] : [])])];
    const servers = [];
    let binding;
    async function dispose() {
      binding?.revoke();
      for (const server of servers) if (server.listening) {
        server.closeAllConnections();
        await new Promise(done => server.close(done));
      }
    }
    async function listen(server) {
      servers.push(server);
      await new Promise((done, fail) => { server.once('error', fail); server.listen(0, gateway, done); });
      return server.address().port;
    }
    try {
      signal.throwIfAborted();
      binding = identityService.bind(resource.id);
      const identityPort = await listen(createServer(binding.handler));
      const certificate = join(directory, `container-${resource.name}-ca.pem`);
      const keyFile = join(directory, `container-${resource.name}-key.pem`);
      if (hostnames.length) await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
        '-keyout', keyFile, '-out', certificate, '-days', '1', '-subj', '/CN=GlobalStack local workload',
        '-addext', `subjectAltName=${hostnames.map(hostname => `DNS:${hostname}`).join(',')}`],
      { signal, timeout: 10000 });
      const tls = hostnames.length ? { key: await readFile(keyFile), cert: await readFile(certificate) } : null;
      const env = { IDENTITY_ENDPOINT: `http://${gateway}:${identityPort}/MSI/token`,
        IDENTITY_HEADER: binding.identityHeader };
      if (tls) {
        env.SSL_CERT_FILE = '/globalstack-platform-ca.pem';
        env.NODE_EXTRA_CA_CERTS = '/globalstack-platform-ca.pem';
      }
      for (const item of blobs) {
        const handler = storageRouter().blobHandler();
        const port = await listen(createTlsServer(tls, (req, res) => {
          if (String(req.headers.host ?? '').split(':')[0].toLowerCase() !== item.hostname) { res.writeHead(404); res.end(); return; }
          res.once('finish', () => observe({ surface: 'blob-app', method: req.method,
            path: new URL(req.url, 'https://localhost').pathname,
            bearer: /^Bearer /i.test(req.headers.authorization ?? ''), status: res.statusCode }));
          Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
        }));
        env[item.setting] = `https://${item.hostname}:${port}`;
      }
      for (const item of searches) {
        const handler = searchRouter().handler();
        const port = await listen(createTlsServer(tls, (req, res) => {
          if (String(req.headers.host ?? '').split(':')[0].toLowerCase() !== item.hostname) { res.writeHead(404); res.end(); return; }
          res.once('finish', () => observe({ surface: 'search', method: req.method,
            path: new URL(req.url, 'https://localhost').pathname,
            bearer: /^Bearer /i.test(req.headers.authorization ?? ''), status: res.statusCode }));
          Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
        }));
        env[item.setting] = `https://${item.hostname}:${port}`;
      }
      if (entraJwks) {
        const path = `/${entraJwks.tenantId}/discovery/v2.0/keys`;
        const payload = Buffer.from(JSON.stringify({ keys: entraJwks.keys }));
        const port = await listen(createTlsServer(tls, (req, res) => {
          if (String(req.headers.host ?? '').split(':')[0].toLowerCase() !== 'login.microsoftonline.com'
            || req.method !== 'GET' || req.url !== path) { res.writeHead(404); res.end(); return; }
          res.writeHead(200, { 'content-type': 'application/json', 'content-length': payload.length,
            'cache-control': 'public, max-age=300' });
          res.end(payload);
          observe({ surface: 'entra-public-keys', method: 'GET', path, status: 200 });
        }));
        env.ENTRA_JWKS_URI = `https://login.microsoftonline.com:${port}${path}`;
      }
      if (postgresHost) {
        const server = createPostgresWireGateway({ tls, trust: identityService.trust,
          resolveConnection: createPostgresArmConnectionResolver({ store, backend,
            serverHost: postgresHost,
            ...(backend.mapDatabase ? { mapDatabase: backend.mapDatabase } : {}),
            resolvePrincipal: backend.resolvePrincipal ?? null }),
          observe: event => observe({ surface: 'postgres', ...event }) });
        env.DB_PORT = String(await listen(server));
        env.PGSSLROOTCERT = '/globalstack-platform-ca.pem';
      }
      signal.throwIfAborted();
      return { env, extraHosts: hostnames.map(hostname => `${hostname}:${gateway}`),
        mounts: tls ? [`${certificate}:/globalstack-platform-ca.pem:ro`] : [], dispose };
    } catch (error) {
      try { await dispose(); } catch { throw Object.assign(new Error('Container App platform cleanup failed'), { cause: error }); }
      throw error;
    }
  };
}
