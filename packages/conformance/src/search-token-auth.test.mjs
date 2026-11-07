import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createManagedIdentityService } from '../../azure-data-plane/src/managed-identity-service.mjs';
import { searchRoles } from '../../azure-data-plane/src/search-token-auth.mjs';

const sub = '00000000-0000-0000-0000-000000000000', group = `/subscriptions/${sub}/resourceGroups/search-identity`;
const serviceId = `${group}/providers/Microsoft.Search/searchServices/workload-search`;
const definition = name => ({ name, fields: [{ name: 'id', type: 'Edm.String', key: true }, { name: 'content', type: 'Edm.String', searchable: true }] });
async function fixture(t) {
  const store = new ResourceStore();
  const identity = await createManagedIdentityService({ store, tenantId: sub, subscriptionIds: [sub], audiences: ['https://search.azure.com', 'https://storage.azure.com'] });
  const runtime = createEmulatorRuntime({ store, searchTokenTrusts: [identity.trust] });
  t.after(() => { identity.dispose(); return runtime.dispose(); });
  async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const arm = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, searchRouter: runtime.searchRouter }));
  async function management(method, id, body, version = '2025-05-01') {
    const response = await fetch(`${arm}${id}?api-version=${version}`, { method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); assert.ok([200, 201, 202, 204].includes(response.status), `${response.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }
  await management('PUT', group, { location: 'westus2' });
  const plan = `${group}/providers/Microsoft.Web/serverfarms/worker`, site = `${group}/providers/Microsoft.Web/sites/worker`;
  await management('PUT', plan, { location: 'westus2', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} }, '2023-12-01');
  const app = await management('PUT', site, { location: 'westus2', kind: 'functionapp', identity: { type: 'SystemAssigned' }, properties: { serverFarmId: plan } }, '2023-12-01');
  const binding = identity.bind(site), identityEndpoint = await listen(createServer(binding.handler));
  async function token(resource = 'https://search.azure.com') {
    const response = await fetch(`${identityEndpoint}/MSI/token?api-version=2019-08-01&resource=${encodeURIComponent(resource)}`, { headers: { 'x-identity-header': binding.identityHeader } });
    assert.equal(response.status, 200); return (await response.json()).access_token;
  }
  for (const id of [serviceId, serviceId + '-other']) await management('PUT', id, { location: 'westus2', sku: { name: 'basic' }, properties: { replicaCount: 1, partitionCount: 1, disableLocalAuth: true } });
  const endpoint = await listen(createServer(runtime.searchRouter.handler()));
  async function send(method, path, signed, body, host = 'workload-search.search.windows.net') {
    return new Promise((resolve, reject) => {
      const req = request(`${endpoint}${path}?api-version=2024-07-01`, { method, headers: { host, authorization: `Bearer ${signed}`, 'api-key': 'synthetic-legacy-key', 'content-type': 'application/json' } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => { const text = Buffer.concat(chunks).toString(); resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }); });
      }); req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
  }
  let count = 0;
  async function role(kind, scope = serviceId, extra = {}) {
    const id = `${scope}/providers/Microsoft.Authorization/roleAssignments/11111111-1111-4111-8111-${String(++count).padStart(12, '0')}`;
    await management('PUT', id, { properties: { principalId: app.identity.principalId, roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/${searchRoles[kind]}`, ...extra } }, '2022-04-01'); return id;
  }
  return { store, runtime, token, management, send, role };
}

test('Search schema and document roles remain distinct and follow live assignment removal', async t => {
  const f = await fixture(t), token = await f.token();
  assert.equal((await f.send('GET', '/indexes', token)).status, 403);
  const admin = await f.role('service');
  for (const name of ['documents', 'unrelated']) assert.equal((await f.send('PUT', `/indexes('${name}')`, token, definition(name))).status, 201);
  assert.equal((await f.send('GET', '/indexes', token)).status, 200);
  assert.equal((await f.send('POST', "/indexes('documents')/docs/search", token, { search: '*' })).status, 403);
  await f.management('DELETE', admin, undefined, '2022-04-01');
  const writer = await f.role('writer', serviceId + '/indexes/documents');
  assert.equal((await f.send('POST', "/indexes('documents')/docs/search.index", token, { value: [{ '@search.action': 'upload', id: 'doc-1', content: 'financial report' }] })).status, 200);
  const found = await f.send('POST', "/indexes('documents')/docs/search", token, { search: '*' });
  assert.equal(found.status, 200); assert.equal(found.body.value[0].id, 'doc-1');
  assert.equal((await f.send('POST', "/indexes('unrelated')/docs/search", token, { search: '*' })).status, 403);
  assert.equal((await f.send('GET', '/indexes', token)).status, 403);
  assert.equal((await f.send('DELETE', "/indexes('documents')", token)).status, 403);
  await f.management('DELETE', writer, undefined, '2022-04-01');
  assert.equal((await f.send('POST', "/indexes('documents')/docs/search", token, { search: '*' })).status, 403);
  await f.role('reader', serviceId + '/indexes/documents');
  assert.equal((await f.send('POST', "/indexes('documents')/docs/search", token, { search: '*' })).status, 200);
  assert.equal((await f.send('POST', "/indexes('documents')/docs/search.index", token, { value: [] })).status, 403);
  assert.equal((await f.send('POST', "/indexes('documents')/docs/search", token, { search: '*' }, 'workload-search-other.search.windows.net')).status, 403);
});

test('Search rejects invalid credentials, wrong audiences, unsupported network policies and conditioned roles', async t => {
  const f = await fixture(t), token = await f.token();
  await f.role('service', serviceId, { condition: 'unsupported', conditionVersion: '2.0' });
  assert.equal((await f.send('GET', '/indexes', token)).status, 403);
  await f.role('service');
  for (const invalid of ['invalid', 'globalstack-local-token', await f.token('https://storage.azure.com')]) {
    assert.equal((await f.send('GET', '/indexes', invalid)).status, 401);
  }
  assert.equal((await f.send('POST', '/indexers', token, {})).status, 501);
  await f.management('PUT', serviceId, { location: 'westus2', sku: { name: 'basic' }, properties: { replicaCount: 1, partitionCount: 1, disableLocalAuth: true, publicNetworkAccess: 'disabled' } });
  assert.equal((await f.send('GET', '/indexes', token)).status, 501);
  await f.management('DELETE', serviceId);
  assert.equal((await f.send('GET', '/indexes', token)).status, 404);
});
