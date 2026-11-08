import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

test('Azure-captured invalid log destination fails deployment preflight without creating resources', async t => {
  const store = new ResourceStore(), server = createArmServer({ store });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => { server.closeAllConnections(); server.close(done); }));
  const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/scanner-validation';
  const put = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}?api-version=2025-04-01`, { method: 'PUT',
      headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  await put(group, { location: 'westus2' });
  const template = { $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#', contentVersion: '1.0.0.0', resources: [
    { type: 'Microsoft.ManagedIdentity/userAssignedIdentities', apiVersion: '2023-01-31', name: 'must-not-exist', location: 'westus2' },
    { type: 'Microsoft.App/managedEnvironments', apiVersion: '2025-01-01', name: 'invalid-logs', location: 'westus2', properties: { appLogsConfiguration: { destination: 'none' } } },
  ] };
  const failed = await put(`${group}/providers/Microsoft.Resources/deployments/invalid`, { properties: { mode: 'Incremental', template } });
  assert.equal(failed.status, 400); assert.equal(failed.body.error.code, 'InvalidTemplateDeployment');
  assert.equal(failed.body.error.details[0].details[0].code, 'InvalidRequestParameterWithDetails');
  assert.equal([...store.resources.values()].filter(item => item.type !== 'Microsoft.Resources/deployments').length, 0);
  delete template.resources[1].properties.appLogsConfiguration;
  const accepted = await put(`${group}/providers/Microsoft.Resources/deployments/corrected`, { properties: { mode: 'Incremental', template } });
  assert.equal(accepted.status, 201); assert.equal(accepted.body.properties.provisioningState, 'Succeeded');
});
