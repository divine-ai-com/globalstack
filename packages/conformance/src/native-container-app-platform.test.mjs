import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createNativeContainerAppPlatform } from '../../azure-data-plane/src/native-container-app-platform.mjs';

const subscription = '11111111-1111-4111-8111-111111111111';
const group = `/subscriptions/${subscription}/resourceGroups/fixture`;
const storageId = `${group}/providers/Microsoft.Storage/storageAccounts/pilotdocs`;
const searchId = `${group}/providers/Microsoft.Search/searchServices/pilot-search`;

test('native Container App platform routes deployed Blob and Search origins over TLS', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'globalstack-container-platform-'));
  const observed = [], resources = new Map([[searchId.toLowerCase(), { type: 'Microsoft.Search/searchServices' }]]);
  let revoked = false, platform;
  const prepare = createNativeContainerAppPlatform({
    identityService: { trust: {}, bind() { return { identityHeader: 'local-header',
      handler: (_req, res) => { res.writeHead(403); res.end(); }, revoke() { revoked = true; } }; } },
    storageRouter: () => ({ account: name => name === 'pilotdocs' ? { resourceId: storageId } : null,
      blobHandler: () => (req, res) => { res.writeHead(200); res.end(`blob ${req.headers.host}`); } }),
    searchRouter: () => ({ services: new Map([['pilot-search', { resourceId: searchId }]]),
      handler: () => (req, res) => { res.writeHead(200); res.end(`search ${req.headers.host}`); } }),
    store: { resources }, blobEndpoints: ['STORAGE_ENDPOINT'], searchEndpoints: ['SEARCH_ENDPOINT'],
    observe: event => observed.push(event),
  });
  const resource = { id: `${group}/providers/Microsoft.App/containerApps/pilot-ingress`,
    type: 'Microsoft.App/containerApps', name: 'pilot-ingress', properties: { template: { containers: [{ env: [
      { name: 'STORAGE_ENDPOINT', value: 'https://pilotdocs.blob.core.windows.net/' },
      { name: 'SEARCH_ENDPOINT', value: 'https://pilot-search.search.windows.net/' },
    ] }] } } };
  try {
    platform = await prepare({ resource, signal: new AbortController().signal, directory, gateway: '127.0.0.1' });
    assert.equal(platform.env.IDENTITY_HEADER, 'local-header');
    assert.equal(platform.extraHosts.length, 2);
    const ca = await readFile(join(directory, 'container-pilot-ingress-ca.pem'));
    for (const [setting, expected] of [['STORAGE_ENDPOINT', 'blob'], ['SEARCH_ENDPOINT', 'search']]) {
      const endpoint = new URL(platform.env[setting]);
      const result = await new Promise((done, fail) => {
        const req = request(endpoint, { ca, lookup: (_hostname, options, callback) => options.all
          ? callback(null, [{ address: '127.0.0.1', family: 4 }]) : callback(null, '127.0.0.1', 4) }, res => {
          let body = ''; res.setEncoding('utf8'); res.on('data', chunk => { body += chunk; });
          res.on('end', () => done({ status: res.statusCode, body }));
        });
        req.on('error', fail); req.end();
      });
      assert.equal(result.status, 200);
      assert.equal(result.body, `${expected} ${endpoint.host}`);
    }
    assert.deepEqual(observed.map(event => event.surface), ['blob-app', 'search']);
    await assert.rejects(prepare({ resource: { ...resource, properties: { template: { containers: [{ env: [
      { name: 'STORAGE_ENDPOINT', value: 'https://attacker.invalid/' },
    ] }] } } }, signal: new AbortController().signal, directory, gateway: '127.0.0.1' }));
  } finally {
    await platform?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
  assert.equal(revoked, true);
});
