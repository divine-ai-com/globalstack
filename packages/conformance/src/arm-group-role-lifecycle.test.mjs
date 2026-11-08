import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';

const catalog = JSON.parse(await readFile(new URL('../../../experiments/production-scenarios/operator/document-role-catalog.json', import.meta.url)));
for (const role of catalog.roles) test(`group ${role.name} assignment remains readable and immutable until deletion`, async t => {
  const subscription = '00000000-0000-0000-0000-000000000000';
  const group = `/subscriptions/${subscription}/resourceGroups/independent-role-group`;
  const store = new ResourceStore();
  store.putResourceGroup(subscription, 'independent-role-group', { location: 'westus2' });
  const server = createArmServer({ store });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); });
  async function request(method, path, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}?api-version=2022-04-01`, {
      method, headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  const collection = `${group}/providers/Microsoft.Authorization/roleAssignments`;
  const name = '12345678-1234-4234-8234-123456789012';
  const path = `${collection}/${name}`;
  const properties = { principalId: '87654321-4321-4321-8321-210987654321', principalType: 'ServicePrincipal',
    roleDefinitionId: `/subscriptions/${subscription}/providers/Microsoft.Authorization/roleDefinitions/${role.id}` };
  const missing = await request('GET', path);
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.message, `The role assignment '${name}' is not found.`);
  assert.equal((await request('PUT', path, { properties })).status, 201);
  const read = await request('GET', path);
  assert.equal(read.status, 200); assert.equal(read.body.properties.scope, group);
  assert.equal(read.body.properties.principalId, properties.principalId);
  const listed = await request('GET', collection);
  assert.equal(listed.status, 200); assert.equal(listed.body.value.length, 1);
  const changed = await request('PUT', path, { properties: { ...properties, principalId: '99999999-9999-4999-8999-999999999999' } });
  assert.equal(changed.status, 400); assert.equal(changed.body.error.code, 'RoleAssignmentUpdateNotPermitted');
  assert.equal((await request('GET', path)).body.properties.principalId, properties.principalId);
  const deleted = await request('DELETE', path);
  assert.equal(deleted.status, 200); assert.equal(deleted.body.properties.principalId, properties.principalId);
  assert.equal((await request('GET', path)).status, 404);
  assert.deepEqual((await request('GET', collection)).body.value, []);
});
