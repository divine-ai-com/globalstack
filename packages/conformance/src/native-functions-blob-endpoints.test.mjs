import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { blobHostMasterKeys, createNativeFunctionsPlatform, resolveNativeBlobEndpoints } from '../../azure-data-plane/src/native-functions-platform.mjs';

const subscriptionId = '11111111-1111-4111-8111-111111111111';
const resourceId = `/subscriptions/${subscriptionId}/resourceGroups/fixture/providers/Microsoft.Storage/storageAccounts/pilotdocs`;
const router = { account(name) { return name === 'pilotdocs' ? { resourceId } : null; } };
const valid = { settings: { STORAGE_ENDPOINT: 'https://pilotdocs.blob.core.windows.net/' },
  names: ['STORAGE_ENDPOINT'], router, subscriptionId };

test('native host reads only valid Blob-backed master keys from host secret blobs', () => {
  const key = 'testHostKeyValue1234567890';
  const account = { blobs: new Map([
    ['azure-webjobs-secrets\0app-host/host.json', { body: Buffer.from(JSON.stringify({ masterKey: { value: key, encrypted: false } })) }],
    ['azure-webjobs-secrets\0app-host/functions.json', { body: Buffer.from(JSON.stringify({ masterKey: { value: 'otherHostKeyValue123456789', encrypted: false } })) }],
    ['other-container\0app-host/host.json', { body: Buffer.from(JSON.stringify({ masterKey: { value: 'otherHostKeyValue123456789', encrypted: false } })) }],
    ['azure-webjobs-secrets\0bad-host/host.json', { body: Buffer.from('{') }],
  ]) };
  assert.deepEqual(blobHostMasterKeys(account), [key]);
});

test('native Function platform maps only a deployed Blob account in its subscription', () => {
  assert.deepEqual(resolveNativeBlobEndpoints(valid), [{ setting: 'STORAGE_ENDPOINT', hostname: 'pilotdocs.blob.core.windows.net' }]);
  assert.deepEqual(resolveNativeBlobEndpoints({ ...valid, names: [] }), []);
  assert.deepEqual(resolveNativeBlobEndpoints({ ...valid, settings: {} }), []);
  for (const endpoint of [
    'http://pilotdocs.blob.core.windows.net/', 'https://pilotdocs.blob.core.windows.net:8443/',
    'https://pilotdocs.blob.core.windows.net/other', 'https://pilotdocs.blob.core.windows.net/?sig=private',
    'https://pilotdocs.blob.core.windows.net.evil.example/', 'https://otherdocs.blob.core.windows.net/',
  ]) {
    assert.throws(() => resolveNativeBlobEndpoints({ ...valid, settings: { STORAGE_ENDPOINT: endpoint } }), endpoint);
  }
  assert.throws(() => resolveNativeBlobEndpoints({ ...valid,
    router: { account() { return { resourceId: resourceId.replace(subscriptionId, '22222222-2222-4222-8222-222222222222') }; } } }));
  assert.throws(() => resolveNativeBlobEndpoints({ ...valid, names: ['STORAGE_ENDPOINT', 'STORAGE_ENDPOINT'] }));
});

test('native platform routes a second deployed Blob endpoint over verified TLS', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'globalstack-blob-platform-'));
  const hostAccount = 'pilotworkerhost';
  const appId = `/subscriptions/${subscriptionId}/resourceGroups/fixture/providers/Microsoft.Web/sites/pilot-worker`;
  const resources = new Map([[hostAccount, { resourceId: resourceId.replace('pilotdocs', hostAccount) }],
    ['pilotdocs', { resourceId }]]);
  const storageRouter = { account: name => resources.get(name), blobHandler: () => (req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' }); res.end(req.headers.host);
  }, queueHandler: () => (_req, res) => { res.writeHead(200); res.end(); },
  tableHandler: () => (_req, res) => { res.writeHead(200); res.end(); } };
  const identityService = { bind: () => ({ identityHeader: 'private-test-header',
    handler: (_req, res) => { res.writeHead(403); res.end(); }, revoke() {} }) };
  const prepare = createNativeFunctionsPlatform({ identityService, storageRouter: () => storageRouter,
    blobEndpoints: ['STORAGE_ENDPOINT'] });
  let platform;
  try {
    platform = await prepare({ resource: { id: appId, name: 'pilot-worker', properties: {
      siteConfig: { appSettings: [
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' },
        { name: 'AzureWebJobsStorage__accountName', value: hostAccount },
        { name: 'STORAGE_ENDPOINT', value: 'https://pilotdocs.blob.core.windows.net/' },
      ] },
    } }, signal: new AbortController().signal, directory });
    const endpoint = new URL(platform.env.STORAGE_ENDPOINT);
    assert.equal(endpoint.hostname, 'pilotdocs.blob.core.windows.net');
    assert.ok(Number(endpoint.port) > 0);
    const mapping = platform.extraHosts.find(item => item.startsWith(`${endpoint.hostname}:`));
    assert.ok(mapping);
    const gateway = mapping.slice(endpoint.hostname.length + 1);
    const ca = await readFile(join(directory, 'platform-ca.pem'));
    const response = await new Promise((done, fail) => {
      const req = request(endpoint, { ca, lookup: (_name, options, callback) => options.all
        ? callback(null, [{ address: gateway, family: 4 }]) : callback(null, gateway, 4) }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
        res.on('end', () => done({ status: res.statusCode, body: text }));
      });
      req.on('error', fail); req.end();
    });
    assert.equal(response.status, 200);
    assert.equal(response.body, `${endpoint.hostname}:${endpoint.port}`);
  } finally {
    await platform?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
