import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { prepareDatabaseProbe } from './functions-database-probe.mjs';
import { prepareSearchProbe } from './functions-search-probe.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createManagedIdentityService } from '../../packages/azure-data-plane/src/managed-identity-service.mjs';
import { createStorageDataPlaneRouter } from '../../packages/azure-data-plane/src/storage-router.mjs';

const exec = promisify(execFile);

// This diagnostic uses the existing application image and adapter. Platform
// setup is external to that image; it is not automatic IaC worker provisioning.
export async function prepareWorkerIdentity({ store, gateway, name, suffix, out, servers, secrets, registerCleanup, hostStorageIdentity = false }) {
  const sub = '00000000-0000-0000-0000-000000000000';
  const group = `/subscriptions/${sub}/resourceGroups/${name}`;
  const siteId = `${group}/providers/Microsoft.Web/sites/${name}`;
  const planId = `${group}/providers/Microsoft.Web/serverfarms/${name}`;
  const account = `gsidentity${suffix}`, accountId = `${group}/providers/Microsoft.Storage/storageAccounts/${account}`;
  const directory = resolve(out, 'identity.private');
  const service = await createManagedIdentityService({ store, tenantId: sub, subscriptionIds: [sub],
    audiences: ['https://storage.azure.com', 'https://storage.azure.com/', 'https://vault.azure.net', 'https://search.azure.com'] });
  const report = { scope: 'Native image SDK and unchanged source adapter; local identity and TLS transport only. No paired Azure identity or completed document workflow.',
    requests: [], sdk: [], cleanup: false };
  let binding;
  registerCleanup(async () => {
    binding?.revoke(); service.dispose();
    await rm(directory, { recursive: true, force: true });
    report.cleanup = true;
  });
  async function listen(server, address = gateway) {
    servers.push(server);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, address, resolve); });
    return server.address().port;
  }
  const armPort = await listen(createArmServer({ store }), '127.0.0.1');
  async function arm(method, id, body, version = '2023-12-01') {
    const response = await fetch(`http://127.0.0.1:${armPort}${id}?api-version=${version}`, { method,
      headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
    const text = await response.text();
    assert.ok([200, 201, 202, 204].includes(response.status), `Identity setup ARM request failed (${response.status})`);
    return text ? JSON.parse(text) : null;
  }
  await arm('PUT', group, { location: 'westus2' });
  await arm('PUT', planId, { location: 'westus2', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} });
  const site = await arm('PUT', siteId, { location: 'westus2', kind: 'functionapp,linux', identity: { type: 'SystemAssigned' }, properties: { serverFarmId: planId } });
  await arm('PUT', accountId, { location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: {} }, '2023-05-01');
  const roleId = `${accountId}/providers/Microsoft.Authorization/roleAssignments/11111111-1111-4111-8111-111111111111`;
  await arm('PUT', roleId, { properties: { principalId: site.identity.principalId,
    roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe` } }, '2022-04-01');
  if (hostStorageIdentity) {
    for (const [index, role] of ['974c5e8b-45b9-4653-ba55-5f855dd0fb88', '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'].entries()) {
      await arm('PUT', `${accountId}/providers/Microsoft.Authorization/roleAssignments/22222222-2222-4222-8222-22222222222${index}`, {
        properties: { principalId: site.identity.principalId, roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/${role}` },
      }, '2022-04-01');
    }
  }
  binding = service.bind(siteId); secrets.push(binding.identityHeader);
  const identityPort = await listen(createServer(binding.handler));
  const router = createStorageDataPlaneRouter({ store, tokenTrusts: [service.trust] });
  router.registerStorageAccount({ accountName: account, accountKey: randomBytes(64).toString('base64'), resourceId: accountId, allowSharedKeyAccess: !hostStorageIdentity });
  router.configureBlobService({ accountName: account, isVersioningEnabled: true });
  await mkdir(directory, { mode: 0o700 });
  const certificate = resolve(directory, 'ca.pem'), privateKey = resolve(directory, 'key.pem');
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', privateKey, '-out', certificate,
    '-days', '1', '-subj', `/CN=${account}.blob.core.windows.net`, '-addext', `subjectAltName=${['blob', 'queue', 'table'].map(surface => `DNS:${account}.${surface}.core.windows.net`).join(',')}`]);
  const endpoints = {};
  for (const surface of hostStorageIdentity ? ['blob', 'queue', 'table'] : ['blob']) {
    const handler = router[`${surface}Handler`]();
    const port = await listen(httpsServer({ key: await readFile(privateKey), cert: await readFile(certificate) }, (req, res) => {
      res.once('finish', () => report.requests.push({ surface, method: req.method, path: new URL(req.url, 'https://localhost').pathname,
        bearer: /^Bearer /.test(req.headers.authorization ?? ''), status: res.statusCode }));
      Promise.resolve(handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
    }));
    endpoints[surface] = `https://${account}.${surface}.core.windows.net:${port}`;
  }
  const env = { IDENTITY_ENDPOINT: `http://${gateway}:${identityPort}/MSI/token`, IDENTITY_HEADER: binding.identityHeader,
    AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential', NODE_EXTRA_CA_CERTS: '/globalstack-platform-ca.pem',
    STORAGE_ENDPOINT: endpoints.blob };
  if (hostStorageIdentity) Object.assign(env, {
    AzureWebJobsStorage__credential: 'managedidentity',
    AzureWebJobsStorage__blobServiceUri: endpoints.blob,
    AzureWebJobsStorage__queueServiceUri: endpoints.queue,
    AzureWebJobsStorage__tableServiceUri: endpoints.table,
    SSL_CERT_FILE: '/globalstack-platform-ca.pem',
  });
  report.hostStorageIdentity = hostStorageIdentity;
  const database = process.env.FUNCTIONS_PROBE_DATABASE === '1'
    ? await prepareDatabaseProbe({ store, trust: service.trust, arm, listen, name, suffix, gateway, directory,
      certificateBundle: certificate, group, principalId: site.identity.principalId, registerCleanup, secrets }) : null;
  if (database) report.database = database.report;
  const search = process.env.FUNCTIONS_PROBE_SEARCH === '1'
    ? await prepareSearchProbe({ store, trust: service.trust, arm, listen, suffix, gateway, directory, certificateBundle: certificate, group, principalId: site.identity.principalId }) : null;
  if (search) report.search = search.report;
  const script = `
    import assert from 'node:assert/strict';
    import { DefaultAzureCredential } from '@azure/identity';
    import { BlobServiceClient } from '@azure/storage-blob';
    import { sourceRevision } from './adapters.mjs';
    const client = new BlobServiceClient(process.env.STORAGE_ENDPOINT, new DefaultAzureCredential(), { retryOptions: { maxTries: 1 } });
    const container = client.getContainerClient('identity-source'), blob = container.getBlockBlobClient('tenant/document.txt');
    if (process.argv[1] === 'denied') {
      await assert.rejects(blob.downloadToBuffer(), { statusCode: 403 });
      await assert.rejects(blob.upload('denied', 6), { statusCode: 403 });
      console.log(JSON.stringify({ phase: 'role-removed', readStatus: 403, writeStatus: 403 }));
    } else {
      await container.create();
      const original = await blob.upload('original document bytes', 23);
      await blob.upload('replacement', 11);
      assert.equal((await blob.downloadToBuffer(2, 4)).toString(), 'plac');
      const input = { container: 'identity-source', blobName: 'tenant/document.txt', etag: original.etag.replaceAll('"', '') };
      assert.equal((await sourceRevision(client, input)).bytes.toString(), 'original document bytes');
      await blob.delete();
      assert.equal((await sourceRevision(client, input)).bytes.toString(), 'original document bytes');
      console.log(JSON.stringify({ phase: 'authorized', historicalRead: true, rangeRead: true, deletedCurrentRead: true }));
    }
  `;
  return { report, env, dockerArgs: [...(database?.dockerArgs ?? []), ...(search?.dockerArgs ?? []), ...['blob', 'queue', 'table'].flatMap(surface => ['--add-host', `${account}.${surface}.core.windows.net:${gateway}`]),
    '-v', `${certificate}:/globalstack-platform-ca.pem:ro`, ...Object.keys(env).flatMap(key => ['-e', key])],
    async exercise(containerName) {
      for (const phase of ['authorized', 'denied']) {
        if (phase === 'denied') await arm('DELETE', roleId, undefined, '2022-04-01');
        let stdout;
        try {
          ({ stdout } = await exec('docker', ['exec', '-w', '/home/site/wwwroot', containerName,
            'node', '--input-type=module', '-e', script, phase], { timeout: 45000, maxBuffer: 65536 }));
        } catch { throw new Error(`Native image identity SDK diagnostic failed during ${phase}; credentials and raw SDK diagnostics were not retained`); }
        report.sdk.push(JSON.parse(stdout.trim()));
      }
      if (database) await database.exercise(containerName);
      if (search) await search.exercise(containerName);
      assert.ok(report.requests.length > 0 && report.requests.every(item => item.bearer));
    },
  };
}
