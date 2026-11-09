import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { httpExchange } from './http-exchange.mjs';

test('PostgreSQL role pilot fixture deploys server and both identities locally', async () => {
  const source = await readFile(new URL('./document-infra/document-postgres-roles.bicep', import.meta.url));
  const compiled = await readFile(new URL('./document-infra/compiled/document-postgres-roles.json', import.meta.url));
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  assert.equal(digest(source), '18315f60f9567ca4a1ee84f0fe9d7e20503c002762a9ae97aef85d3495963382');
  assert.equal(digest(compiled), '0e761f0f028aff6903bfa93899f5b95781d5a70f54af28fa5b61f5c84804cbc1');
  const subscription = '00000000-0000-0000-0000-000000000000';
  const runId = 'a1b2c3d4e5f6';
  const group = `/subscriptions/${subscription}/resourceGroups/gs-conformance-pilot`;
  process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID = subscription;
  const arm = createArmServer({ store: new ResourceStore() });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  const request = (method, path, body) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  try {
    assert.ok([200, 201].includes((await request('PUT', `${group}?api-version=2022-09-01`, { location: 'westus2' })).status));
    const parameters = Object.fromEntries(Object.entries({ serviceName: `gs${runId}`, location: 'westus2', runId,
      tenantId: subscription, administratorObjectId: '11111111-1111-1111-1111-111111111111',
      administratorName: 'globalstack-conformance-pilot' }).map(([name, value]) => [name, { value }]));
    const deployment = await request('PUT', `${group}/providers/Microsoft.Resources/deployments/gs-document-postgres-${runId}?api-version=2025-04-01`,
      { properties: { mode: 'Incremental', template: JSON.parse(compiled), parameters } });
    assert.ok([200, 201, 202].includes(deployment.status));
    assert.equal(deployment.body?.properties?.provisioningState, 'Succeeded');
    for (const name of [`gs${runId}-worker`, `gs${runId}-ingress`]) {
      const identity = await request('GET', `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${name}?api-version=2023-01-31`);
      assert.equal(identity.status, 200);
      assert.equal(identity.body.tags?.run, runId);
      assert.match(identity.body.properties?.principalId ?? '', /^[a-f0-9-]{36}$/i);
    }
  } finally {
    await request('DELETE', `${group}?api-version=2022-09-01`).catch(() => {});
    arm.closeAllConnections();
    await new Promise(done => arm.close(done));
  }
});
