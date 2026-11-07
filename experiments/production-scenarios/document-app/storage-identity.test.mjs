import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createManagedIdentityService } from '../../../packages/azure-data-plane/src/managed-identity-service.mjs';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { createDefaultHttpClient, createHttpHeaders, createPipelineRequest } from '@azure/core-rest-pipeline';
import { toCompatResponse } from '@azure/core-http-compat';
import { createStorageDataPlaneRouter } from '../../../packages/azure-data-plane/src/storage-router.mjs';
import { sourceRevision } from './adapters.mjs';

test('DefaultAzureCredential and the unchanged source adapter use signed tokens against Blob storage', async t => {
  const sub = '00000000-0000-0000-0000-000000000000', tenant = '11111111-1111-4111-8111-111111111111';
  const principal = '22222222-2222-4222-8222-222222222222', account = 'sdktokenfixture';
  const resourceId = `/subscriptions/${sub}/resourceGroups/identity-test/providers/Microsoft.Storage/storageAccounts/${account}`;
  const roleId = `${resourceId}/providers/Microsoft.Authorization/roleAssignments/33333333-3333-4333-8333-333333333333`;
  const role = { type: 'Microsoft.Authorization/roleAssignments', properties: { scope: resourceId, principalId: principal,
    roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe` } };
  const siteId = `/subscriptions/${sub}/resourceGroups/identity-test/providers/Microsoft.Web/sites/sdk-worker`;
  const site = { type: 'Microsoft.Web/sites', identity: { type: 'SystemAssigned', principalId: principal, tenantId: tenant } };
  const store = { resources: new Map([[roleId.toLowerCase(), role], [siteId.toLowerCase(), site]]) };
  const identities = await createManagedIdentityService({ store, tenantId: tenant, subscriptionIds: [sub] });
  t.after(() => identities.dispose());
  const binding = identities.bind(siteId);
  const router = createStorageDataPlaneRouter({ store, tokenTrusts: [identities.trust] });
  router.registerStorageAccount({ accountName: account, accountKey: randomBytes(64).toString('base64'), resourceId });
  router.configureBlobService({ accountName: account, isVersioningEnabled: true });
  const directory = await mkdtemp(join(tmpdir(), 'globalstack-token-sdk-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'),
    '-out', join(directory, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost', '-addext', `subjectAltName=IP:127.0.0.1,DNS:localhost,DNS:${account}.blob.core.windows.net`], { stdio: 'ignore' });
  const ca = await readFile(join(directory, 'cert.pem'), 'utf8');
  async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return server.address().port;
  }
  const requests = [], responseFinishes = [], handler = router.blobHandler();
  const port = await listen(httpsServer({ key: await readFile(join(directory, 'key.pem')), cert: ca }, (req, res) => {
    assert.match(req.headers.authorization ?? '', /^Bearer /);
    responseFinishes.push(new Promise(resolve => res.once('finish', () => {
      requests.push({ method: req.method, path: req.url, range: req.headers.range, storageRange: req.headers['x-ms-range'], status: res.statusCode });
      resolve();
    })));
    return handler(req, res);
  }));
  let identityRequests = 0;
  const identityPort = await listen(httpServer((req, res) => {
    res.once('finish', () => { if (res.statusCode === 200) identityRequests++; });
    return binding.handler(req, res);
  }));
  const settings = { AZURE_TOKEN_CREDENTIALS: 'ManagedIdentityCredential', IDENTITY_ENDPOINT: `http://127.0.0.1:${identityPort}/MSI/token`, IDENTITY_HEADER: binding.identityHeader };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const credential = new DefaultAzureCredential(), transport = createDefaultHttpClient();
  const blobs = new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential, {
    retryOptions: { maxTries: 1 }, httpClient: { async sendRequest(request) {
      const url = new URL(request.url); request.headers.set('host', url.hostname);
      url.hostname = '127.0.0.1'; url.port = String(port); request.url = url.href;
      const outgoing = createPipelineRequest({ ...request, headers: createHttpHeaders(request.headers.toJson()) });
      outgoing.tlsSettings = { ca };
      return { ...toCompatResponse(await transport.sendRequest(outgoing)), request };
    } },
  });
  const container = blobs.getContainerClient('landing'); await container.create();
  const blob = container.getBlockBlobClient('tenant/report.txt');
  const original = await blob.upload('original document bytes', 23);
  await blob.upload('replacement', 11);
  assert.equal((await blob.downloadToBuffer(2, 4)).toString(), 'plac');
  const input = { container: 'landing', blobName: 'tenant/report.txt', etag: original.etag.replaceAll('"', '') };
  assert.equal((await sourceRevision(blobs, input)).bytes.toString(), 'original document bytes');
  // The SDK consuming the response and the server's finish callback can run in
  // different event-loop turns. Await the observation before asserting it.
  await Promise.all(responseFinishes);
  assert.ok(identityRequests >= 1);
  assert.ok(requests.some(request => request.method === 'GET' && request.path.includes('versionid=') && request.status === 206), JSON.stringify(requests));
  store.resources.delete(roleId.toLowerCase());
  await assert.rejects(sourceRevision(blobs, input), { statusCode: 403 });
  await assert.rejects(blob.upload('forbidden', 9), { statusCode: 403 });
  store.resources.set(roleId.toLowerCase(), role);
  assert.equal((await blob.downloadToBuffer()).toString(), 'replacement');
  await blob.delete();
  assert.equal((await sourceRevision(blobs, input)).bytes.toString(), 'original document bytes');
});
