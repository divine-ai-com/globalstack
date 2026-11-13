import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createManagedIdentityService } from '../../azure-data-plane/src/managed-identity-service.mjs';

const sub = '00000000-0000-0000-0000-000000000000', tenant = sub;
const group = `/subscriptions/${sub}/resourceGroups/identity-tests`;
const siteId = `${group}/providers/Microsoft.Web/sites/worker`;
const userId = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/worker-identity`;
const query = 'resource=https%3A%2F%2Fstorage.azure.com&api-version=2019-08-01';

async function fixture(t, options = {}) {
  const store = new ResourceStore();
  async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const arm = await listen(createArmServer({ store }));
  async function management(method, id, body, version = '2023-12-01') {
    const response = await fetch(`${arm}${id}?api-version=${version}`, { method,
      headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    assert.ok([200, 201, 202, 204].includes(response.status), text);
    return text ? JSON.parse(text) : null;
  }
  await management('PUT', group, { location: 'westus2' });
  const planId = `${group}/providers/Microsoft.Web/serverfarms/worker`;
  await management('PUT', planId, { location: 'westus2', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} });
  const site = await management('PUT', siteId, { location: 'westus2', kind: 'functionapp', identity: { type: 'SystemAssigned' }, properties: { serverFarmId: planId } });
  const service = await createManagedIdentityService({ store, tenantId: tenant, subscriptionIds: [sub], ...options });
  t.after(() => service.dispose());
  let binding = service.bind(siteId);
  const endpoint = await listen(createServer((req, res) => binding.handler(req, res)));
  async function request({ params = query, header = binding.identityHeader, path = '/MSI/token', method = 'GET' } = {}) {
    const response = await fetch(`${endpoint}${path}?${params}`, { method, headers: { 'x-identity-header': header } });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  return { store, site, service, management, request, binding: () => binding, rotate: () => { binding = service.bind(siteId); } };
}

test('local identity broker signs the live ARM principal and disables issuance on identity removal', async t => {
  const f = await fixture(t);
  const first = await f.request();
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(first.body.token_type, 'Bearer');
  const { payload } = await jwtVerify(first.body.access_token, createLocalJWKSet(f.service.trust.jwks), {
    issuer: f.service.trust.issuer, audience: 'https://storage.azure.com', algorithms: ['RS256'],
  });
  assert.equal(payload.oid, f.site.identity.principalId);
  assert.equal(payload.tid, f.site.identity.tenantId);
  assert.equal(payload.xms_mirid, siteId);
  assert.equal(payload.appid, first.body.client_id);
  assert.equal(payload.exp - payload.iat, 300);
  assert.equal(first.body.expires_on, String(payload.exp));
  assert.equal((await f.request()).body.client_id, first.body.client_id);
  assert.ok(!('d' in f.service.trust.jwks.keys[0]));
  await f.management('PUT', siteId, { location: 'westus2', kind: 'functionapp', identity: { type: 'None' }, properties: { serverFarmId: `${group}/providers/Microsoft.Web/serverfarms/worker` } });
  assert.equal((await f.request()).status, 400);
  await f.management('DELETE', siteId);
  assert.equal((await f.request()).status, 403);
});

test('identity headers rotate and disposed or malformed requests cannot obtain a token', async t => {
  const f = await fixture(t), old = f.binding();
  for (const options of [{ header: '' }, { header: 'wrong' }, { method: 'POST' }, { path: '/other' },
    { params: query + '&resource=https://vault.azure.net' }, { params: query.replace('2019-08-01', 'invalid') },
    { params: query + '&client_id=x&object_id=y' }, { params: query + '&unexpected=value' },
    { params: query.replace('storage.azure.com', 'vault.azure.net') }, { params: query + '&mi_res_id=' + encodeURIComponent(userId) }]) {
    const response = await f.request(options);
    assert.ok(response.status >= 400);
    assert.equal(response.body.access_token, undefined);
  }
  f.rotate();
  assert.equal((await f.request({ header: old.identityHeader })).status, 403);
  assert.equal((await f.request()).status, 200);
  f.binding().revoke();
  assert.equal((await f.request()).status, 403);
  f.rotate();
  f.service.dispose();
  assert.equal((await f.request()).status, 403);
  assert.throws(() => f.service.bind(siteId));
});

test('user identity selection follows live attachments and never falls back to another principal', async t => {
  const f = await fixture(t);
  const user = await f.management('PUT', userId, { location: 'westus2' }, '2023-01-31');
  const params = selector => query + '&' + selector;
  assert.equal((await f.request({ params: params('client_id=' + user.properties.clientId) })).status, 400);
  await f.management('PUT', siteId, { location: 'westus2', kind: 'functionapp', identity: { type: 'SystemAssigned, UserAssigned', userAssignedIdentities: { [userId]: {} } }, properties: { serverFarmId: `${group}/providers/Microsoft.Web/serverfarms/worker` } });
  for (const selection of ['client_id=' + user.properties.clientId, 'principal_id=' + user.properties.principalId,
    'object_id=' + user.properties.principalId, 'mi_res_id=' + encodeURIComponent(userId)]) {
    const response = await f.request({ params: params(selection) });
    assert.equal(response.status, 200);
    assert.equal(response.body.client_id, user.properties.clientId);
    const { payload } = await jwtVerify(response.body.access_token, createLocalJWKSet(f.service.trust.jwks));
    assert.equal(payload.oid, user.properties.principalId);
    assert.equal(payload.xms_mirid, userId);
  }
  assert.equal((await f.request()).status, 200);
  await f.management('PUT', siteId, { location: 'westus2', kind: 'functionapp', identity: { type: 'UserAssigned', userAssignedIdentities: { [userId]: {} } }, properties: { serverFarmId: `${group}/providers/Microsoft.Web/serverfarms/worker` } });
  assert.equal((await f.request()).status, 400);
  assert.equal((await f.request({ params: params('client_id=' + user.properties.clientId) })).status, 200);
  await f.management('DELETE', userId, undefined, '2023-01-31');
  assert.equal((await f.request({ params: params('client_id=' + user.properties.clientId) })).status, 400);
});

test('identity broker rejects unsafe operator configuration and workload bindings', async t => {
  const f = await fixture(t);
  for (const override of [{ issuer: 'http://identity.test' }, { audiences: [] }, { audiences: ['https://user:secret@host'] },
    { tenantId: 'invalid' }, { subscriptionIds: [] }, { tokenLifetimeSeconds: 0 }, { tokenLifetimeSeconds: 99999 }]) {
    await assert.rejects(createManagedIdentityService({ store: f.store, tenantId: tenant, subscriptionIds: [sub], ...override }));
  }
  for (const id of [userId, siteId + '/slots/other', siteId.replace(sub, '11111111-1111-4111-8111-111111111111'), siteId + '-missing']) {
    assert.throws(() => f.service.bind(id));
  }
});

test('explicit application audiences issue app-only v2 audience claims without opening arbitrary resources', async t => {
  const audience = '11111111-1111-4111-8111-111111111111';
  const f = await fixture(t, { applicationAudiences: [audience] });
  const response = await f.request({ params: `resource=${encodeURIComponent(`api://${audience}`)}&api-version=2019-08-01` });
  assert.equal(response.status, 200);
  const { payload } = await jwtVerify(response.body.access_token, createLocalJWKSet(f.service.trust.jwks), {
    issuer: f.service.trust.issuer, audience, algorithms: ['RS256'],
  });
  assert.equal(payload.ver, '2.0'); assert.equal(payload.idtyp, 'app');
  assert.equal(payload.azp, response.body.client_id);
  assert.equal((await f.request({ params: 'resource=api%3A%2F%2Funlisted&api-version=2019-08-01' })).status, 501);
});
