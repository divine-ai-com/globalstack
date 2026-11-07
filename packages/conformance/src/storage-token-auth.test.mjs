import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { storageTokenAuthorizer, blobDataRoles } from '../../azure-data-plane/src/storage-token-auth.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

const sub = '00000000-0000-0000-0000-000000000000', tenant = '11111111-1111-4111-8111-111111111111';
const principal = '22222222-2222-4222-8222-222222222222';
const group = `/subscriptions/${sub}/resourceGroups/token-tests`;
const accountId = name => `${group}/providers/Microsoft.Storage/storageAccounts/${name}`;
const issuer = 'https://identity.globalstack.test/tenant';
const pair = await generateKeyPair('RS256', { extractable: true });
const publicKey = { ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
const trust = { issuer, tenantId: tenant, subscriptionIds: [sub], jwks: { keys: [publicKey] } };
async function token(claims = {}, header = {}, key = pair.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ iss: issuer, tid: tenant, oid: principal, aud: 'https://storage.azure.com/',
    iat: now, nbf: now - 1, exp: now + 300, ...claims }).setProtectedHeader({ alg: 'RS256', kid: 'test-key', ...header }).sign(key);
}

async function fixture(t) {
  const store = new ResourceStore(), runtime = createEmulatorRuntime({ store, storageTokenTrusts: [trust] });
  t.after(() => runtime.dispose());
  async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const endpoint = await listen(createServer(runtime.storageRouter.blobHandler()));
  const arm = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource }));
  async function management(method, path, body) {
    const res = await fetch(arm + path, { method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }
  await management('PUT', `${group}?api-version=2025-04-01`, { location: 'westus2' });
  for (const name of ['tokenaccount', 'otheraccount']) {
    assert.ok([200, 201, 202].includes((await management('PUT', `${accountId(name)}?api-version=2023-05-01`, {
      location: 'westus2', sku: { name: 'Standard_LRS' }, kind: 'StorageV2', properties: {},
    })).status));
    for (let i = 0; i < 6; i++) await management('GET', `${accountId(name)}?api-version=2023-05-01`);
    for (const container of ['landing', 'quarantine']) {
      assert.equal((await management('PUT', `${accountId(name)}/blobServices/default/containers/${container}?api-version=2023-05-01`, { properties: {} })).status, 201);
    }
  }
  async function role(name, scope, type = blobDataRoles.contributor, extra = {}) {
    const id = `${scope}/providers/Microsoft.Authorization/roleAssignments/${name}`;
    const result = await management('PUT', `${id}?api-version=2022-04-01`, { properties: {
      principalId: principal, roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/${type}`, ...extra,
    } });
    assert.ok([200, 201].includes(result.status), JSON.stringify(result));
    return id;
  }
  async function send(method, path, credential, body = '', account = 'tokenaccount') {
    return new Promise((resolve, reject) => {
      const req = request(endpoint + path, { method, headers: { host: `${account}.blob.core.windows.net`,
        authorization: `Bearer ${credential}`, 'x-ms-version': '2023-11-03', 'x-ms-blob-type': 'BlockBlob', 'content-length': Buffer.byteLength(body) } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, code: res.headers['x-ms-error-code'], body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject); req.end(body);
    });
  }
  return { runtime, store, role, management, send };
}

test('operator trusts reject unsafe keys and malformed configuration', async () => {
  const privateKey = { ...await exportJWK(pair.privateKey), kid: 'private', alg: 'RS256', use: 'sig' };
  for (const override of [{ issuer: 'http://identity.test' }, { issuer: 'https://user:password@identity.test' }, { tenantId: 'any' },
    { subscriptionIds: [] }, { jwks: { keys: [privateKey] } }, { jwks: { keys: [publicKey, publicKey] } },
    { jwks: { keys: [{ ...publicKey, alg: 'HS256' }] } }, { jwks: { keys: [{ ...publicKey, n: 'small' }] } }]) {
    assert.throws(() => storageTokenAuthorizer({ trusts: [{ ...trust, ...override }] }));
  }
  assert.throws(() => storageTokenAuthorizer({ trusts: {} }));
});

test('Blob bearer access follows live ARM container roles and revocation', async t => {
  const f = await fixture(t), signed = await token(), scope = `${accountId('tokenaccount')}/blobServices/default/containers/landing`;
  assert.equal((await f.send('PUT', '/landing/file.txt', signed, 'protected bytes')).status, 403);
  const role = await f.role('33333333-3333-4333-8333-333333333333', scope);
  assert.equal((await f.send('PUT', '/landing/file.txt', signed, 'protected bytes')).status, 201);
  assert.equal((await f.send('GET', '/landing/file.txt', signed)).body, 'protected bytes');
  assert.equal((await f.send('HEAD', '/landing/file.txt', signed)).status, 200);
  assert.equal((await f.send('GET', '/landing?restype=container&comp=list', signed)).status, 200);
  for (const [path, account] of [['/quarantine/file.txt', 'tokenaccount'], ['/landing/file.txt', 'otheraccount']]) {
    assert.equal((await f.send('PUT', path, signed, 'forbidden', account)).status, 403);
  }
  await f.management('DELETE', `${role}?api-version=2022-04-01`);
  assert.equal((await f.send('DELETE', '/landing/file.txt', signed)).status, 403);
  assert.equal((await f.send('GET', '/landing/file.txt', signed)).status, 403);
  await f.role('44444444-4444-4444-8444-444444444444', scope, blobDataRoles.reader);
  assert.equal((await f.send('GET', '/landing/file.txt', signed)).body, 'protected bytes');
  for (const method of ['PUT', 'DELETE']) assert.equal((await f.send(method, '/landing/file.txt', signed)).status, 403);
  assert.equal((await f.send('PUT', '/landing/file.txt?comp=block', signed)).status, 501);
});

test('invalid signatures, claims and untrusted tokens cannot read or mutate blobs', async t => {
  const f = await fixture(t);
  await f.role('33333333-3333-4333-8333-333333333333', accountId('tokenaccount'));
  const valid = await token();
  assert.equal((await f.send('PUT', '/landing/file.txt', valid, 'unchanged')).status, 201);
  const otherPair = await generateKeyPair('RS256');
  const now = Math.floor(Date.now() / 1000);
  const credentials = ['globalstack-local-token', valid.slice(0, -12) + 'AAAAAAAAAAAA',
    await token({}, {}, otherPair.privateKey), await token({}, { kid: 'unknown' }),
    await token({}, { jku: 'https://attacker.invalid/keys' }), await token({ tid: sub }),
    await token({ iss: 'https://untrusted.invalid' }), await token({ aud: 'https://vault.azure.net' }),
    await token({ exp: now - 1 }), await token({ nbf: now + 60 }), await token({ iat: now + 60 }),
    await token({ oid: 'not-a-principal' }), await token({ exp: undefined }), await token({ tid: undefined })];
  for (const credential of credentials) {
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await f.send(method, '/landing/file.txt', credential, method === 'PUT' ? 'forbidden' : '')).status, 401);
  }
  assert.equal((await f.send('GET', '/landing/file.txt', await token({ oid: sub }))).status, 403);
  assert.equal((await f.send('GET', '/landing/file.txt', valid)).body, 'unchanged');
});

test('conditional assignments fail closed and account roles permit sibling containers', async t => {
  const f = await fixture(t), signed = await token();
  const role = await f.role('33333333-3333-4333-8333-333333333333', accountId('tokenaccount'), blobDataRoles.owner,
    { condition: 'unsupported condition', conditionVersion: '2.0' });
  assert.equal((await f.send('PUT', '/landing/file.txt', signed, 'denied')).status, 403);
  await f.management('DELETE', `${role}?api-version=2022-04-01`);
  await f.role('44444444-4444-4444-8444-444444444444', accountId('tokenaccount'), blobDataRoles.contributor);
  for (const container of ['landing', 'quarantine']) {
    assert.equal((await f.send('PUT', `/${container}/file.txt`, signed, container)).status, 201);
    assert.equal((await f.send('DELETE', `/${container}/file.txt`, signed)).status, 202);
  }
});
