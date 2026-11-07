import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createManagedIdentityService } from '../../azure-data-plane/src/managed-identity-service.mjs';
import { keyVaultSecretsUserRole } from '../../azure-data-plane/src/key-vault-token-auth.mjs';

const sub = '00000000-0000-0000-0000-000000000000', group = `/subscriptions/${sub}/resourceGroups/vault-identity`;
const vaultId = `${group}/providers/Microsoft.KeyVault/vaults/tokenvault`;

async function fixture(t) {
  const store = new ResourceStore();
  const identity = await createManagedIdentityService({ store, tenantId: sub, subscriptionIds: [sub],
    audiences: ['https://vault.azure.net', 'https://storage.azure.com'] });
  const runtime = createEmulatorRuntime({ store, keyVaultTokenTrusts: [identity.trust] });
  t.after(() => { identity.dispose(); return runtime.dispose(); });
  async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
    return `http://127.0.0.1:${server.address().port}`;
  }
  const arm = await listen(createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource }));
  async function management(method, id, body, version = '2023-07-01') {
    const response = await fetch(`${arm}${id}?api-version=${version}`, { method,
      headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    assert.ok([200, 201, 202, 204].includes(response.status), `${method} ${id} ${response.status}`);
    return text ? JSON.parse(text) : null;
  }
  await management('PUT', group, { location: 'westus2' });
  const plan = `${group}/providers/Microsoft.Web/serverfarms/worker`, site = `${group}/providers/Microsoft.Web/sites/worker`;
  await management('PUT', plan, { location: 'westus2', sku: { name: 'Y1', tier: 'Dynamic' }, properties: {} }, '2023-12-01');
  const app = await management('PUT', site, { location: 'westus2', kind: 'functionapp', identity: { type: 'SystemAssigned' }, properties: { serverFarmId: plan } }, '2023-12-01');
  const binding = identity.bind(site), identityEndpoint = await listen(createServer(binding.handler));
  async function token(resource = 'https://vault.azure.net') {
    const response = await fetch(`${identityEndpoint}/MSI/token?api-version=2019-08-01&resource=${encodeURIComponent(resource)}`, {
      headers: { 'x-identity-header': binding.identityHeader } });
    assert.equal(response.status, 200);
    return (await response.json()).access_token;
  }
  for (const id of [vaultId, vaultId + 'other']) {
    await management('PUT', id, { location: 'westus2', properties: { tenantId: sub, sku: { name: 'standard', family: 'A' }, enableRbacAuthorization: true } });
    for (const name of ['database-password', 'unrelated']) await management('PUT', `${id}/secrets/${name}`, { properties: { value: 'synthetic-test-value' } });
  }
  const endpoint = await listen(createServer(runtime.keyVaultRouter.handler()));
  async function send(path, signed, { method = 'GET', host = 'tokenvault.vault.azure.net' } = {}) {
    return new Promise((resolve, reject) => {
      const req = request(`${endpoint}${path}`, { method, headers: { host, authorization: `Bearer ${signed}` } }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()), headers: res.headers }));
      });
      req.on('error', reject); req.end();
    });
  }
  let roleCounter = 0;
  async function role(scope = `${vaultId}/secrets/database-password`, extra = {}) {
    const id = `${scope}/providers/Microsoft.Authorization/roleAssignments/11111111-1111-4111-8111-${String(++roleCounter).padStart(12, '0')}`;
    await management('PUT', id, { properties: { principalId: app.identity.principalId,
      roleDefinitionId: `/subscriptions/${sub}/providers/Microsoft.Authorization/roleDefinitions/${keyVaultSecretsUserRole}`, ...extra } }, '2022-04-01');
    return id;
  }
  return { store, runtime, token, role, send, management };
}

test('signed Key Vault secret reads follow deployed scopes and role removal', async t => {
  const f = await fixture(t), token = await f.token(), path = '/secrets/database-password?api-version=7.4';
  assert.equal((await f.send(path, token)).status, 403);
  const role = await f.role();
  const response = await f.send(path, token);
  assert.equal(response.status, 200); assert.equal(response.body.value, 'synthetic-test-value');
  const versionPath = new URL(response.body.id).pathname + '?api-version=7.4';
  assert.equal((await f.send(versionPath, token)).status, 200);
  assert.equal((await f.send('/secrets/unrelated?api-version=7.4', token)).status, 403);
  assert.equal((await f.send(path, token, { host: 'tokenvaultother.vault.azure.net' })).status, 403);
  await f.management('DELETE', role, undefined, '2022-04-01');
  assert.equal((await f.send(path, token)).status, 403);
  await f.role(vaultId);
  assert.equal((await f.send('/secrets/unrelated?api-version=7.4', token)).status, 200);
  assert.equal((await f.send(path, token, { host: 'tokenvaultother.vault.azure.net' })).status, 403);
});

test('wrong credentials, conditions and unsupported operations cannot return secrets', async t => {
  const f = await fixture(t), token = await f.token(), path = '/secrets/database-password?api-version=7.4';
  await f.role(undefined, { condition: 'unsupported', conditionVersion: '2.0' });
  assert.equal((await f.send(path, token)).status, 403);
  await f.role();
  for (const credential of ['globalstack-local-token', 'invalid', await f.token('https://storage.azure.com')]) {
    const response = await f.send(path, credential);
    assert.equal(response.status, 401); assert.equal(response.body.value, undefined);
    assert.match(response.headers['www-authenticate'], /vault.azure.net/);
  }
  for (const [url, method] of [[path, 'PUT'], ['/secrets?api-version=7.4', 'GET'], ['/keys/key?api-version=7.4', 'GET'],
    ['/secrets/database-password/versions?api-version=7.4', 'GET']]) {
    assert.equal((await f.send(url, token, { method })).status, 501);
  }
  assert.equal((await f.send('/_globalstack/key-vault/vaults/tokenvault/secrets', token)).status, 403);
  assert.equal((await f.send('/secrets/database-password?api-version=7.4', token)).status, 200);
});

test('private-network and legacy-policy vaults stay unsupported and tenant mismatch is denied', async t => {
  const f = await fixture(t), token = await f.token(), path = '/secrets/database-password?api-version=7.4';
  await f.role();
  const vault = f.store.resources.get(vaultId.toLowerCase());
  vault.properties.publicNetworkAccess = 'Disabled';
  assert.equal((await f.send(path, token)).status, 501);
  vault.properties.publicNetworkAccess = 'Enabled';
  vault.properties.networkAcls = { defaultAction: 'Deny' };
  assert.equal((await f.send(path, token)).status, 501);
  delete vault.properties.networkAcls;
  vault.properties.enableRbacAuthorization = false;
  assert.equal((await f.send(path, token)).status, 501);
  vault.properties.enableRbacAuthorization = true;
  vault.properties.tenantId = '11111111-1111-4111-8111-111111111111';
  assert.equal((await f.send(path, token)).status, 401);
});
