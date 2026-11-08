import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { httpExchange } from './http-exchange.mjs';

const subscription = '00000000-0000-0000-0000-000000000000';
const group = `/subscriptions/${subscription}/resourceGroups/gs-document-services-test`;
const fixture = new URL('./document-infra/', import.meta.url).pathname;

function compile(name) {
  return JSON.parse(execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${fixture}:/fixture:ro`,
    '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned',
    'build', `/fixture/${name}.bicep`, '--stdout'], { encoding: 'utf8', timeout: 60000 }));
}

test('document Search and failure-queue ARM modules deploy locally with scoped identity roles', async t => {
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  const arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  await new Promise(resolve => arm.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    arm.closeAllConnections();
    await new Promise(resolve => arm.close(resolve));
    await runtime.dispose();
  });
  const request = (method, path, body) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  assert.equal((await request('PUT', `${group}?api-version=2022-09-01`, { location: 'westus2' })).status, 201);
  const identities = ['worker', 'ingress'];
  for (const name of identities) {
    const id = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/gsdoc-${name}`;
    store.resources.set(id.toLowerCase(), { id, name: `gsdoc-${name}`, type: 'Microsoft.ManagedIdentity/userAssignedIdentities',
      location: 'westus2', properties: { principalId: randomUUID() } });
  }
  const cases = [
    ['document-search', { serviceName: 'gsdoc', publisherPrincipalId: randomUUID(),
      workerIdentityName: 'gsdoc-worker', ingressIdentityName: 'gsdoc-ingress', roleAssignmentNames: Array.from({ length: 3 }, randomUUID) }],
    ['document-failures', { namespaceName: 'gsdoc-failures', workerIdentityName: 'gsdoc-worker',
      roleAssignmentNames: Array.from({ length: 2 }, randomUUID) }],
  ];
  for (const [name, parameters] of cases) {
    const deployment = `${group}/providers/Microsoft.Resources/deployments/${name}`;
    const result = await request('PUT', `${deployment}?api-version=2025-04-01`, { properties: {
      mode: 'Incremental', template: compile(name), parameters: Object.fromEntries(
        Object.entries({ ...parameters, location: 'westus2', runId: 'a1b2c3d4e5f6' }).map(([key, value]) => [key, { value }])
      ),
    } });
    assert.equal(result.body?.properties?.provisioningState, 'Succeeded', `${name}: ${JSON.stringify(result.body?.error ?? result.body)}`);
  }
  const search = await request('GET', `${group}/providers/Microsoft.Search/searchServices/gsdoc-search?api-version=2025-05-01`);
  assert.equal(search.status, 200);
  assert.equal(search.body.properties.disableLocalAuth, true);
  const queue = await request('GET', `${group}/providers/Microsoft.ServiceBus/namespaces/gsdoc-failures/queues/document-failures?api-version=2024-01-01`);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.properties.deadLetteringOnMessageExpiration, true);
  assert.equal((await request('DELETE', `${group}?api-version=2022-09-01`)).status, 200);
});
