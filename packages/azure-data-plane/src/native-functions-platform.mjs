import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { resolveNativeContainerAppEndpoints } from './native-container-app-endpoints.mjs';
import { createPostgresArmConnectionResolver } from './postgres-arm-connection.mjs';
import { createPostgresWireGateway } from './postgres-wire-gateway.mjs';

const exec = promisify(execFile);

export function blobHostMasterKeys(account) {
  const keys = [];
  for (const [name, blob] of account.blobs) {
    if (!name.startsWith('azure-webjobs-secrets\0') || !name.endsWith('/host.json')
      || !Buffer.isBuffer(blob.body) || blob.body.length > 65536) continue;
    try {
      const data = JSON.parse(blob.body.toString('utf8').replace(/^\uFEFF/, ''));
      if (data.masterKey?.encrypted === false && /^[A-Za-z0-9_+/=-]{16,256}$/.test(data.masterKey.value)) {
        keys.push(data.masterKey.value);
      }
    } catch { /* A partially written or unrelated blob is not a usable host key. */ }
  }
  return keys;
}

export function resolveNativeBlobEndpoints({ settings, names, router, subscriptionId }) {
  assert.ok(Array.isArray(names) && names.length <= 8 && new Set(names).size === names.length);
  return names.flatMap(setting => {
    assert.match(setting, /^[A-Z][A-Z0-9_]{0,79}$/);
    if (settings[setting] === undefined) return [];
    const endpoint = new URL(settings[setting]);
    assert.ok(endpoint.protocol === 'https:' && !endpoint.username && !endpoint.password
      && !endpoint.port && !endpoint.search && !endpoint.hash && endpoint.pathname === '/');
    const match = /^([a-z0-9]{3,24})\.blob\.core\.windows\.net$/.exec(endpoint.hostname);
    assert.ok(match, `${setting} must name an Azure Blob account endpoint`);
    const deployed = router.account(match[1]);
    assert.ok(deployed && /^\/subscriptions\/([^/]+)\//i.exec(deployed.resourceId)?.[1]?.toLowerCase() === subscriptionId,
      `${setting} must refer to a deployed account in the workload subscription`);
    return [{ setting, hostname: endpoint.hostname }];
  });
}

// Resolve transport from deployed resources. Application code and the declared
// identity credential remain unchanged; endpoint and CA wiring belongs to the
// local platform. Additional service origins must resolve to deployed apps.
export function createNativeFunctionsPlatform({ identityService, storageRouter, store, containerAppRouter,
  containerAppEndpoints = [], blobEndpoints = [], postgresBackend = null, observe = () => {} }) {
  return async ({ resource, signal, directory }) => {
    const settings = Object.fromEntries((resource.properties?.siteConfig?.appSettings ?? []).map(item => [item.name, item.value]));
    assert.equal(settings.AzureWebJobsStorage__credential, 'managedidentity');
    assert.ok(!settings.AzureWebJobsStorage, 'Shared-key host storage is outside this platform mode');
    const account = settings.AzureWebJobsStorage__accountName;
    assert.match(account ?? '', /^[a-z0-9]{3,24}$/);
    const router = storageRouter();
    const deployed = router.account(account);
    const subscription = id => /^\/subscriptions\/([^/]+)\//i.exec(id ?? '')?.[1]?.toLowerCase();
    assert.ok(deployed && subscription(resource.id) && subscription(deployed.resourceId) === subscription(resource.id), 'Host storage must be deployed in the workload subscription');
    const applicationBlobs = resolveNativeBlobEndpoints({ settings, names: blobEndpoints, router, subscriptionId: subscription(resource.id) });
    const services = resolveNativeContainerAppEndpoints({ resource, store, settings, names: containerAppEndpoints });
    const postgresHost = settings.DB_HOST;
    const backend = postgresHost && typeof postgresBackend === 'function' ? postgresBackend() : postgresBackend;
    if (postgresHost !== undefined) {
      assert.match(postgresHost, /^[a-z0-9][a-z0-9-]{2,62}\.postgres\.database\.azure\.com$/);
      assert.ok(backend?.host && backend?.port && backend?.user,
        'PostgreSQL transport requires an operator-configured local backend');
      assert.ok(settings.DB_PORT === undefined || settings.DB_PORT === '5432', 'The declared PostgreSQL port must be the Azure default');
    }
    const appHandler = services.length ? containerAppRouter().handler() : null;
    const name = `gs-functions-net-${randomUUID()}`, servers = [];
    let binding, networkCreated = false;
    async function dispose() {
      binding?.revoke();
      for (const server of servers) if (server.listening) {
        server.closeAllConnections(); await new Promise(done => server.close(done));
      }
      if (networkCreated) {
        try { await exec('docker', ['network', 'rm', name], { timeout: 15000 }); }
        catch (error) { if (!String(error.stderr ?? '').includes(`network ${name} not found`)) throw error; }
        networkCreated = false;
      }
    }
    async function listen(server, gateway) {
      servers.push(server);
      await new Promise((done, fail) => { server.once('error', fail); server.listen(0, gateway, done); });
      return server.address().port;
    }
    try {
      signal.throwIfAborted();
      networkCreated = true;
      await exec('docker', ['network', 'create', '--internal', '--label', 'globalstack.managed=functions', name], { signal, timeout: 15000 });
      networkCreated = true;
      const network = JSON.parse((await exec('docker', ['network', 'inspect', name], { signal, timeout: 10000 })).stdout)[0];
      const gateway = network.IPAM.Config[0].Gateway;
      binding = identityService.bind(resource.id);
      const identityPort = await listen(createServer(binding.handler), gateway);
      const certificate = join(directory, 'platform-ca.pem'), keyFile = join(directory, 'platform-key.pem');
      const hostnames = [...new Set([...['blob', 'queue', 'table'].map(surface => `${account}.${surface}.core.windows.net`),
        ...applicationBlobs.map(item => item.hostname), ...services.map(service => service.hostname),
        ...(postgresHost ? [postgresHost] : [])])];
      await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certificate,
        '-days', '1', '-subj', '/CN=GlobalStack local storage', '-addext', `subjectAltName=${hostnames.map(hostname => `DNS:${hostname}`).join(',')}`], { signal, timeout: 10000 });
      const tls = { key: await readFile(keyFile), cert: await readFile(certificate) };
      const env = { IDENTITY_ENDPOINT: `http://${gateway}:${identityPort}/MSI/token`, IDENTITY_HEADER: binding.identityHeader,
        SSL_CERT_FILE: '/globalstack-platform-ca.pem', NODE_EXTRA_CA_CERTS: '/globalstack-platform-ca.pem',
        WEBSITE_HOSTNAME: resource.properties.defaultHostName ?? `${resource.name}.azurewebsites.net` };
      const blobPorts = new Map();
      for (const surface of ['blob', 'queue', 'table']) {
        const handler = router[`${surface}Handler`]();
        const port = await listen(createTlsServer(tls, (req, res) => {
          res.once('finish', () => observe({ surface, method: req.method, path: new URL(req.url, 'https://localhost').pathname,
            bearer: /^Bearer /i.test(req.headers.authorization ?? ''), status: res.statusCode }));
          Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
        }), gateway);
        env[`AzureWebJobsStorage__${surface}ServiceUri`] = `https://${account}.${surface}.core.windows.net:${port}`;
        if (surface === 'blob') blobPorts.set(`${account}.blob.core.windows.net`, port);
      }
      for (const item of applicationBlobs) {
        let port = blobPorts.get(item.hostname);
        if (!port) {
          port = await listen(createTlsServer(tls, (req, res) => {
            if (String(req.headers.host ?? '').split(':')[0].toLowerCase() !== item.hostname) { res.writeHead(404); res.end(); return; }
            res.once('finish', () => observe({ surface: 'blob-app', method: req.method,
              path: new URL(req.url, 'https://localhost').pathname,
              bearer: /^Bearer /i.test(req.headers.authorization ?? ''), status: res.statusCode }));
            Promise.resolve(router.blobHandler()(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
          }), gateway);
          blobPorts.set(item.hostname, port);
        }
        env[item.setting] = `https://${item.hostname}:${port}`;
      }
      for (const service of services) {
        const port = await listen(createTlsServer(tls, (req, res) => {
          if (String(req.headers.host ?? '').split(':')[0].toLowerCase() !== service.hostname) { res.writeHead(404); res.end(); return; }
          res.once('finish', () => observe({ surface: 'container-app', resourceId: service.resourceId,
            method: req.method, path: new URL(req.url, 'https://localhost').pathname,
            bearer: /^Bearer /i.test(req.headers.authorization ?? ''), status: res.statusCode }));
          Promise.resolve(appHandler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
        }), gateway);
        env[service.setting] = `https://${service.hostname}:${port}`;
      }
      if (postgresHost) {
        const gatewayServer = createPostgresWireGateway({ tls, trust: identityService.trust,
          resolveConnection: createPostgresArmConnectionResolver({ store, backend,
            serverHost: postgresHost,
            ...(backend.mapDatabase ? { mapDatabase: backend.mapDatabase } : {}),
            resolvePrincipal: backend.resolvePrincipal ?? null }),
          observe: event => observe({ surface: 'postgres', ...event }) });
        env.DB_PORT = String(await listen(gatewayServer, gateway));
      }
      signal.throwIfAborted();
      return { network: name, env, readHostMasterKeys: () => blobHostMasterKeys(router.account(account)),
        extraHosts: hostnames.map(hostname => `${hostname}:${gateway}`),
        mounts: [`${certificate}:/globalstack-platform-ca.pem:ro`], dispose };
    } catch {
      try { await dispose(); } catch { throw Object.assign(new Error('Native platform cleanup failed'), { cleanup: dispose }); }
      throw new Error('Native platform preparation failed');
    }
  };
}
