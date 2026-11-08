import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { armResponseReplacer } from '../../azure-control-plane/src/arm-response.mjs';

test('PostgreSQL write-only credential stays internal across resource writes, reads and inventory', async () => {
  const store = new ResourceStore(), internal = [];
  const server = createArmServer({ store, onResourcePut: ({ resource }) => internal.push(resource.properties.administratorLoginPassword) });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const origin = `http://127.0.0.1:${server.address().port}`, group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/gs-write-only';
  const id = `${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/gs-write-only`;
  const original = 'Synthetic-Original-4827!', replacement = 'Synthetic-Replacement-4827!';
  async function request(method, path, body) {
    const response = await fetch(origin + path, { method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    assert.ok(!text.includes(original) && !text.includes(replacement));
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  try {
    assert.equal((await request('PUT', group + '?api-version=2022-09-01', { location: 'westus2' })).status, 201);
    const created = await request('PUT', id + '?api-version=2024-08-01', { location: 'westus2', sku: { name: 'Standard_B1ms', tier: 'Burstable' },
      properties: { administratorLogin: 'pilot', administratorLoginPassword: original, version: '16' } });
    assert.equal(created.status, 201); assert.equal(created.body.properties.administratorLogin, 'pilot');
    assert.equal(Object.hasOwn(created.body.properties, 'administratorLoginPassword'), false);
    assert.equal(internal[0], original);
    assert.equal((await request('GET', id + '?api-version=2024-08-01')).status, 200);
    assert.equal((await request('GET', group + '/providers/Microsoft.DBforPostgreSQL/flexibleServers?api-version=2024-08-01')).status, 200);
    const patched = await request('PUT', id + '?api-version=2024-08-01', { location: 'westus2', sku: { name: 'Standard_B1ms', tier: 'Burstable' }, properties: { administratorLogin: 'pilot', administratorLoginPassword: replacement, version: '16' } });
    assert.equal(patched.status, 200);
    assert.equal(store.resources.get(id.toLowerCase()).properties.administratorLoginPassword, replacement);
    assert.equal((await request('GET', id + '?api-version=2024-08-01')).status, 200);
  } finally { server.closeAllConnections(); await new Promise(done => server.close(done)); }
});

test('write-only response filtering does not mutate stored state or unrelated action results', () => {
  const resource = { id: '/subscriptions/test/providers/Microsoft.DBforPostgreSQL/flexibleServers/db', type: 'Microsoft.DBforPostgreSQL/flexibleServers',
    properties: { administratorLoginPassword: 'synthetic-private-value', administratorLogin: 'pilot' } };
  const body = { value: [resource], actionResult: { accessToken: 'synthetic-action-result' }, ordinary: { properties: { value: 'keep' } } };
  const encoded = JSON.stringify(body, armResponseReplacer);
  assert.ok(!encoded.includes('synthetic-private-value')); assert.ok(encoded.includes('synthetic-action-result'));
  assert.equal(resource.properties.administratorLoginPassword, 'synthetic-private-value');
});
