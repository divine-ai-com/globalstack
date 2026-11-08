import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

// Resolve transport from deployed resources. Application code and the declared
// identity credential remain unchanged; endpoint and CA wiring belongs to the
// local platform. This currently supports Blob/Queue/Table host storage only.
export function createNativeFunctionsPlatform({ identityService, storageRouter, observe = () => {} }) {
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
      await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile, '-out', certificate,
        '-days', '1', '-subj', '/CN=GlobalStack local storage', '-addext', `subjectAltName=${['blob', 'queue', 'table'].map(surface => `DNS:${account}.${surface}.core.windows.net`).join(',')}`], { signal, timeout: 10000 });
      const tls = { key: await readFile(keyFile), cert: await readFile(certificate) };
      const env = { IDENTITY_ENDPOINT: `http://${gateway}:${identityPort}/MSI/token`, IDENTITY_HEADER: binding.identityHeader,
        SSL_CERT_FILE: '/globalstack-platform-ca.pem', NODE_EXTRA_CA_CERTS: '/globalstack-platform-ca.pem',
        WEBSITE_HOSTNAME: resource.properties.defaultHostName ?? `${resource.name}.azurewebsites.net` };
      for (const surface of ['blob', 'queue', 'table']) {
        const handler = router[`${surface}Handler`]();
        const port = await listen(createTlsServer(tls, (req, res) => {
          res.once('finish', () => observe({ surface, method: req.method, path: new URL(req.url, 'https://localhost').pathname,
            bearer: /^Bearer /i.test(req.headers.authorization ?? ''), status: res.statusCode }));
          Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
        }), gateway);
        env[`AzureWebJobsStorage__${surface}ServiceUri`] = `https://${account}.${surface}.core.windows.net:${port}`;
      }
      signal.throwIfAborted();
      return { network: name, env, extraHosts: ['blob', 'queue', 'table'].map(surface => `${account}.${surface}.core.windows.net:${gateway}`),
        mounts: [`${certificate}:/globalstack-platform-ca.pem:ro`], dispose };
    } catch {
      try { await dispose(); } catch { throw Object.assign(new Error('Native platform cleanup failed'), { cleanup: dispose }); }
      throw new Error('Native platform preparation failed');
    }
  };
}
