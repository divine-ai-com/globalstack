import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { httpExchange } from './http-exchange.mjs';

test('PostgreSQL firewall rule follows the captured ARM lifecycle without claiming SQL enforcement', async t => {
  const arm = createArmServer({ store: new ResourceStore() });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => { arm.closeAllConnections(); arm.close(done); }));
  const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/postgres-firewall';
  const server = `${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/gs-firewall-test`;
  const rule = `${server}/firewallRules/pilot-egress`;
  const request = (method, path, body) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}?api-version=2024-08-01`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  const body = { properties: { startIpAddress: '192.0.2.10', endIpAddress: '192.0.2.10' } };

  assert.equal((await request('PUT', group, { location: 'westus2' })).status, 201);
  assert.equal((await request('PUT', rule, body)).status, 404, 'A rule cannot precede its server');
  assert.ok([201, 202].includes((await request('PUT', server, {
    location: 'westus2', sku: { name: 'Standard_B1ms', tier: 'Burstable' },
    properties: { version: '16', authConfig: { activeDirectoryAuth: 'Enabled', passwordAuth: 'Disabled' } },
  })).status));

  const created = await request('PUT', rule, body);
  assert.equal(created.status, 202);
  assert.equal(created.body.operation, 'UpsertServerFirewallRulesManagementOperation');
  assert.ok(created.headers['azure-asyncoperation']);
  const expected = { ...body, id: rule, name: 'pilot-egress', type: 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules' };
  assert.deepEqual((await request('GET', rule)).body, expected);
  assert.deepEqual((await request('GET', `${server}/firewallRules`)).body, { value: [expected] });

  for (const invalid of [
    { properties: { startIpAddress: '192.0.2.20', endIpAddress: '192.0.2.10' } },
    { properties: { startIpAddress: 'not-an-ip', endIpAddress: '192.0.2.10' } },
    { properties: { startIpAddress: '192.0.2.10' } },
  ]) {
    assert.equal((await request('PUT', rule, invalid)).status, 400);
    assert.deepEqual((await request('GET', rule)).body, expected, 'Invalid writes must preserve the rule');
  }
  assert.equal((await request('PUT', `${server}/unsupportedChild/other`, {})).status, 501);
  const removed = await request('DELETE', rule);
  assert.equal(removed.status, 202);
  assert.equal(removed.body.operation, 'DropServerFirewallRulesManagementOperation');
  assert.equal((await request('GET', rule)).status, 404);
  assert.deepEqual((await request('GET', `${server}/firewallRules`)).body, { value: [] });
});
