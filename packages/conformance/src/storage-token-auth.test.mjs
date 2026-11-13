import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { storageTokenAuthorizer, blobDataRoles, queueDataContributor, tableDataContributor } from '../../azure-data-plane/src/storage-token-auth.mjs';
import { storageExchange } from '../../../experiments/production-scenarios/storage-http.mjs';
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
  const endpoints = {};
  for (const service of ['blob', 'queue', 'table']) endpoints[service] = await listen(createServer(runtime.storageRouter[`${service}Handler`]()));
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
  async function send(method, path, credential, body = '', account = 'tokenaccount', service = 'blob') {
    return new Promise((resolve, reject) => {
      const req = request(endpoints[service] + path, { method, headers: { host: `${account}.${service}.core.windows.net`,
        accept: 'application/json;odata=nometadata', 'content-type': service === 'table' ? 'application/json' : 'application/xml', authorization: `Bearer ${credential}`, 'x-ms-version': '2023-11-03', 'x-ms-blob-type': 'BlockBlob', 'content-length': Buffer.byteLength(body) } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, code: res.headers['x-ms-error-code'], body: Buffer.concat(chunks).toString() }));
      });
      req.on('error', reject); req.end(body);
    });
  }
  return { runtime, store, role, management, send, endpoints };
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

for (const [service, dataRole, path, body] of [
  ['queue', queueDataContributor, '/work-items', ''],
  ['table', tableDataContributor, '/Tables', JSON.stringify({ TableName: 'WorkItems' })],
]) test(`${service} bearer operations enforce service roles, account isolation and revocation`, async t => {
  const f = await fixture(t), signed = await token();
  const method = service === 'queue' ? 'PUT' : 'POST';
  const send = (verb, route, credential = signed, payload = '', account = 'tokenaccount') => f.send(verb, route, credential, payload, account, service);
  await f.role('33333333-3333-4333-8333-333333333333', accountId('tokenaccount'), blobDataRoles.owner);
  assert.equal((await send(method, path, signed, body)).status, 403);
  const role = await f.role('44444444-4444-4444-8444-444444444444', accountId('tokenaccount'), dataRole);
  assert.equal((await send(method, path, 'forged', body)).status, 401);
  assert.equal((await send(method, path, await token({ aud: 'https://vault.azure.net' }), body)).status, 401);
  assert.equal((await send(method, path, signed, body, 'otheraccount')).status, 403);
  assert.equal((await send(method, path, signed, body)).status, 201);
  const readPath = service === 'queue' ? '/work-items/messages?peekonly=true' : '/WorkItems';
  if (service === 'queue') {
    assert.equal((await send('POST', '/work-items/messages', signed, '<QueueMessage><MessageText>payload</MessageText></QueueMessage>')).status, 201);
    assert.match((await send('GET', readPath)).body, /payload/);
  } else {
    assert.equal((await send('POST', '/WorkItems', signed, JSON.stringify({ PartitionKey: 'p', RowKey: 'r', Value: 'payload' }))).status, 201);
    assert.match((await send('GET', readPath)).body, /payload/);
  }
  await f.management('DELETE', `${role}?api-version=2022-04-01`);
  assert.equal((await send('GET', readPath)).status, 403);
  await f.role('55555555-5555-4555-8555-555555555555', accountId('tokenaccount'), dataRole, { condition: 'unsupported', conditionVersion: '2.0' });
  assert.equal((await send('GET', readPath)).status, 403);
});

test('queue grants cannot reach sibling queues and table-scoped grants cannot authorize unparsed batch bodies', async t => {
  const f = await fixture(t), signed = await token();
  for (const path of ['queueServices/default/queues/work-items', 'tableServices/default/tables/WorkItems']) {
    assert.ok([200, 201].includes((await f.management('PUT', `${accountId('tokenaccount')}/${path}?api-version=2023-05-01`, { properties: {} })).status));
  }
  await f.role('33333333-3333-4333-8333-333333333333', `${accountId('tokenaccount')}/queueServices/default/queues/work-items`, queueDataContributor);
  assert.equal((await f.send('PUT', '/work-items', signed, '', 'tokenaccount', 'queue')).status, 204);
  assert.equal((await f.send('PUT', '/other-items', signed, '', 'tokenaccount', 'queue')).status, 403);
  await f.role('44444444-4444-4444-8444-444444444444', `${accountId('tokenaccount')}/tableServices/default/tables/WorkItems`, tableDataContributor);
  assert.equal((await f.send('POST', '/$batch', signed, '', 'tokenaccount', 'table')).status, 403);
});

test('ARM PATCH changes only named storage settings and keeps account data', async t => {
  const f = await fixture(t), account = 'tokenaccount', signed = await token();
  const path = `${accountId(account)}?api-version=2023-05-01`;
  const key = () => f.runtime.storageRouter.account(account).accountKey;
  const blob = { surface: 'blob', method: 'PUT', path: '/landing/kept.txt', body: 'kept bytes', headers: { 'x-ms-blob-type': 'BlockBlob' } };
  const read = { surface: 'blob', method: 'GET', path: '/landing/kept.txt' };
  const exchange = (operation, name = account) => storageExchange({ account: name, key: f.runtime.storageRouter.account(name).accountKey,
    origin: f.endpoints[operation.surface], ...operation });
  // GET responses count reads in GlobalStack metadata; compare Azure fields only.
  const visible = resource => { const copy = structuredClone(resource); delete copy.globalstack; return copy; };
  assert.equal((await exchange(blob)).status, 201);
  const before = (await f.management('GET', path)).body;
  const unchangedKey = key();

  const missing = await f.management('PATCH', `${accountId('absentaccount')}?api-version=2023-05-01`, { properties: { allowSharedKeyAccess: false } });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'ResourceNotFound');
  assert.equal((await f.management('GET', `${accountId('absentaccount')}?api-version=2023-05-01`)).status, 404);

  const disabled = await f.management('PATCH', path, { properties: { allowSharedKeyAccess: false } });
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  const expected = visible(before);
  expected.properties.allowSharedKeyAccess = false;
  assert.deepEqual(visible(disabled.body), expected);
  assert.deepEqual(visible((await f.management('GET', path)).body), expected);
  assert.equal(key(), unchangedKey);
  const denied = await exchange(read);
  assert.equal(denied.status, 403);
  assert.match(denied.body, /KeyBasedAuthenticationNotPermitted/);
  assert.equal((await exchange(blob, 'otheraccount')).status, 201, 'other accounts keep shared-key access');
  await f.role('44444444-4444-4444-8444-444444444444', accountId(account), blobDataRoles.reader);
  const bearerRead = await f.send('GET', '/landing/kept.txt', signed);
  assert.equal(bearerRead.status, 200);
  assert.equal(bearerRead.body, 'kept bytes');

  const tagged = await f.management('PATCH', path, { tags: { owner: 'documents' } });
  assert.equal(tagged.status, 200);
  assert.deepEqual(tagged.body.tags, { owner: 'documents' });
  assert.equal(tagged.body.properties.allowSharedKeyAccess, false, 'omitted properties keep their values');
  assert.equal((await exchange(read)).status, 403);

  const before501 = visible((await f.management('GET', path)).body);
  for (const body of [{ location: 'eastus2' }, { sku: { name: 'Standard_GRS' } }, { kind: 'BlobStorage' }, { identity: { type: 'SystemAssigned' } },
    { properties: { allowSharedKeyAccess: 'true' } }, { properties: { networkAcls: { defaultAction: 'Deny' } } }, { tags: { count: 1 } }, []]) {
    const rejected = await f.management('PATCH', path, body);
    assert.equal(rejected.status, 501, JSON.stringify(body));
    assert.equal(rejected.body.error.code, 'GlobalStackRouteNotImplemented');
  }
  assert.deepEqual(visible((await f.management('GET', path)).body), before501);
  assert.equal((await f.management('PATCH', `${accountId(account)}`, { tags: {} })).status, 400);

  assert.equal((await f.management('PATCH', path, { properties: { allowSharedKeyAccess: true } })).status, 200);
  const restored = await exchange(read);
  assert.equal(restored.status, 200);
  assert.equal(restored.body, 'kept bytes');
});

test('ARM shared-key setting blocks signed storage requests without disabling bearer access', async t => {
  const f = await fixture(t), account = 'tokenaccount', signed = await token();
  const operations = [
    { surface: 'blob', method: 'PUT', path: '/landing/key.txt', body: 'key bytes', headers: { 'x-ms-blob-type': 'BlockBlob' } },
    { surface: 'queue', method: 'PUT', path: '/key-items' },
    { surface: 'table', method: 'POST', path: '/Tables', body: JSON.stringify({ TableName: 'KeyItems' }), headers: { accept: 'application/json', 'content-type': 'application/json' } },
  ];
  for (const allowed of [false, true]) {
    const update = await f.management('PUT', `${accountId(account)}?api-version=2023-05-01`, { location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: { allowSharedKeyAccess: allowed } });
    assert.ok([200, 201, 202].includes(update.status), JSON.stringify(update));
    const key = f.runtime.storageRouter.account(account).accountKey;
    for (const operation of operations) {
      const result = await storageExchange({ account, key, origin: f.endpoints[operation.surface], ...operation });
      assert.equal(result.status, allowed ? 201 : 403, JSON.stringify(result));
      if (!allowed) assert.match(result.body, /KeyBasedAuthenticationNotPermitted/);
    }
    if (!allowed) {
      await f.role('33333333-3333-4333-8333-333333333333', accountId(account), blobDataRoles.contributor);
      assert.equal((await f.send('PUT', '/landing/identity.txt', signed, 'identity bytes')).status, 201);
    }
  }
});
