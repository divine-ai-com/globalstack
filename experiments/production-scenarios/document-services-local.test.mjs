import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { httpExchange } from './http-exchange.mjs';

const subscription = '00000000-0000-0000-0000-000000000000';
const group = `/subscriptions/${subscription}/resourceGroups/gs-document-services-test`;
const fixture = new URL('./document-infra/', import.meta.url);
const templateHashes = {
  'document-search': { source: '67035e06c5030979672447319395b5a23c81ef7d790ceab0388013e6f5693d8d', compiled: '3183d0eeda00b77fc2f121eb16e7c493e410429326ab690a95110cbd38f8285a' },
  'document-failures': { source: '625a9049cf275bd6a299ac8a157064e57abe3bc69b2f5cf1428107bf41f57eb3', compiled: '3219de7e24875bea97bf758567ea5b23ff1bff25217ec9c49e0a1d60f5f255d6' },
};

async function compiled(name) {
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const [source, output] = await Promise.all([
    readFile(new URL(`${name}.bicep`, fixture)),
    readFile(new URL(`compiled/${name}.json`, fixture)),
  ]);
  assert.equal(hash(source), templateHashes[name].source, 'Bicep source changed without recompiling the local fixture');
  assert.equal(hash(output), templateHashes[name].compiled, 'Compiled ARM fixture changed without review');
  return JSON.parse(output);
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
      mode: 'Incremental', template: await compiled(name), parameters: Object.fromEntries(
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
