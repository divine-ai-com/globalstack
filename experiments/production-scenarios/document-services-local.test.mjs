import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { httpExchange } from './http-exchange.mjs';
import { cleanupDocumentSearch } from './document-search-cleanup.mjs';

const subscription = '00000000-0000-0000-0000-000000000000';
const group = `/subscriptions/${subscription}/resourceGroups/gs-document-services-test`;
const fixture = new URL('./document-infra/', import.meta.url);
const templateHashes = {
  'document-search-identities': { source: '2f8b61af0f0e7dde9dc34c9aa2ba31e0f0cb557c1131598ae37562b7932dc613', compiled: '09748ab6c6c9cae0c76720b43bd7b3703bc62350b9b18e42064156448f327dac' },
  'document-data': { source: '0ed505824dbfabf628ab9366cdca245afc0658c65e309fe7e19f1580e51af063', compiled: 'ab8308b2532861e533eea99718cba24971346f3b50587e4a6a9940390f9a706e' },
  'document-search': { source: '490bbc2011e1557bc27221f05a92edd625f4ebe3a7c56da4354e28f56e977079', compiled: '230bd99ba0f0fc58212e8abb8fb14ef7af22029642a37d59a43c3f5f62d74045' },
  'document-failures': { source: '625a9049cf275bd6a299ac8a157064e57abe3bc69b2f5cf1428107bf41f57eb3', compiled: '3219de7e24875bea97bf758567ea5b23ff1bff25217ec9c49e0a1d60f5f255d6' },
  'document-postgres': { source: '8168db6da3382f9e442b9bf282d8972117423cead3da59d429ea18329f710280', compiled: '47281bbb75f6f4e6c91534971535928ee1dc05ffd2418ae830744f17501444a9' },
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

test('the three Search pilot modules deploy in dependency order and keep Blob access container-scoped', async t => {
  const store = new ResourceStore();
  const arm = createArmServer({ store });
  await new Promise(resolve => arm.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    arm.closeAllConnections();
    await new Promise(resolve => arm.close(resolve));
  });
  const request = (method, path, body) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  const runId = 'aabbccddeeff';
  const pilotGroup = `/subscriptions/${subscription}/resourceGroups/gs-conformance-pilot`;
  const serviceName = `gs${runId}`;
  const storageAccountName = `${serviceName}docs`;
  const workerIdentityName = `${serviceName}-worker`;
  const ingressIdentityName = `${serviceName}-ingress`;
  const publisherPrincipalId = randomUUID();
  const dataRoles = Array.from({ length: 2 }, randomUUID);
  const searchRoles = Array.from({ length: 4 }, randomUUID);
  assert.equal((await request('PUT', `${pilotGroup}?api-version=2022-09-01`, { location: 'westus2' })).status, 201);
  const stages = [
    ['document-search-identities', { serviceName }],
    ['document-data', { accountName: storageAccountName, workerIdentityName, publisherPrincipalId, roleAssignmentNames: dataRoles }],
    ['document-search', { serviceName, publisherPrincipalId, workerIdentityName, ingressIdentityName,
      storageAccountName, roleAssignmentNames: searchRoles }],
  ];
  for (const [name, parameters] of stages) {
    const deployment = `${pilotGroup}/providers/Microsoft.Resources/deployments/gs-${name}-${runId}`;
    const result = await request('PUT', `${deployment}?api-version=2025-04-01`, { properties: {
      mode: 'Incremental', template: await compiled(name), parameters: Object.fromEntries(
        Object.entries({ ...parameters, location: 'westus2', runId }).map(([key, value]) => [key, { value }])
      ),
    } });
    assert.equal(result.body?.properties?.provisioningState, 'Succeeded', `${name}: ${JSON.stringify(result.body?.error ?? result.body)}`);
  }
  const searchId = `${pilotGroup}/providers/Microsoft.Search/searchServices/${serviceName}-search`;
  const projectionId = `${pilotGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/blobServices/default/containers/clean-projection`;
  const service = await request('GET', `${searchId}?api-version=2025-05-01`);
  assert.equal(service.status, 200);
  assert.equal(service.body.properties.disableLocalAuth, true);
  const grant = await request('GET', `${projectionId}/providers/Microsoft.Authorization/roleAssignments/${searchRoles[3]}?api-version=2022-04-01`);
  assert.equal(grant.status, 200);
  assert.equal(grant.body.properties.scope.toLowerCase(), projectionId.toLowerCase());
  assert.equal(grant.body.properties.principalId, service.body.identity.principalId);
  const cleanup = await cleanupDocumentSearch({ subscription, group: 'gs-conformance-pilot', runId,
    publisher: publisherPrincipalId, dataRoles, searchRoles }, request, { sleep: async () => {} });
  assert.equal(cleanup.resourcesAbsent, true);
  assert.equal((await request('GET', `${pilotGroup}?api-version=2022-09-01`)).status, 200);
  assert.equal((await request('DELETE', `${pilotGroup}?api-version=2022-09-01`)).status, 200);
});

test('document Search, failure queue and Entra-only PostgreSQL modules deploy locally', async t => {
  const store = new ResourceStore();
  const arm = createArmServer({ store });
  await new Promise(resolve => arm.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    arm.closeAllConnections();
    await new Promise(resolve => arm.close(resolve));
  });
  const request = (method, path, body) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  assert.equal((await request('PUT', `${group}?api-version=2022-09-01`, { location: 'westus2' })).status, 201);
  const storageId = `${group}/providers/Microsoft.Storage/storageAccounts/gsdocstorage`;
  assert.ok([201, 202].includes((await request('PUT', `${storageId}?api-version=2023-05-01`, {
    location: 'westus2', kind: 'StorageV2', sku: { name: 'Standard_LRS' }, properties: { allowSharedKeyAccess: false },
  })).status));
  let storage;
  for (let attempt = 0; attempt < 40; attempt++) {
    storage = await request('GET', `${storageId}?api-version=2023-05-01`);
    if (storage.body?.properties?.provisioningState === 'Succeeded') break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(storage.body?.properties?.provisioningState, 'Succeeded');
  const blobServiceId = `${storageId}/blobServices/default`;
  const projectionId = `${blobServiceId}/containers/clean-projection`;
  const blobService = await request('PUT', `${blobServiceId}?api-version=2023-05-01`, { properties: {} });
  assert.ok([200, 201, 202].includes(blobService.status), JSON.stringify(blobService));
  assert.ok([200, 201, 202].includes((await request('PUT', `${projectionId}?api-version=2023-05-01`, { properties: { publicAccess: 'None' } })).status));
  const identities = ['worker', 'ingress'];
  for (const name of identities) {
    const id = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/gsdoc-${name}`;
    store.resources.set(id.toLowerCase(), { id, name: `gsdoc-${name}`, type: 'Microsoft.ManagedIdentity/userAssignedIdentities',
      location: 'westus2', properties: { principalId: randomUUID() } });
  }
  const postgresAdminId = randomUUID();
  const cases = [
    ['document-search', { serviceName: 'gsdoc', publisherPrincipalId: randomUUID(), storageAccountName: 'gsdocstorage',
      workerIdentityName: 'gsdoc-worker', ingressIdentityName: 'gsdoc-ingress', roleAssignmentNames: Array.from({ length: 4 }, randomUUID) }],
    ['document-failures', { namespaceName: 'gsdoc-failures', workerIdentityName: 'gsdoc-worker',
      roleAssignmentNames: Array.from({ length: 2 }, randomUUID) }],
    ['document-postgres', { serviceName: 'gsdoc', tenantId: '11111111-1111-4111-8111-111111111111',
      administratorObjectId: postgresAdminId, administratorName: 'pilot-service-principal' }],
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
  assert.equal(search.body.identity.type, 'SystemAssigned');
  const projectionGrant = [...store.resources.values()].find(resource => resource.type?.toLowerCase() === 'microsoft.authorization/roleassignments'
    && resource.properties?.scope?.toLowerCase() === projectionId.toLowerCase()
    && resource.properties?.roleDefinitionId?.toLowerCase().endsWith('/2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'));
  assert.equal(projectionGrant?.properties?.principalId, search.body.identity.principalId);
  const queue = await request('GET', `${group}/providers/Microsoft.ServiceBus/namespaces/gsdoc-failures/queues/document-failures?api-version=2024-01-01`);
  assert.equal(queue.status, 200);
  assert.equal(queue.body.properties.deadLetteringOnMessageExpiration, true);
  const postgres = await request('GET', `${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/gsdoc-db?api-version=2024-08-01`);
  assert.equal(postgres.status, 200);
  assert.equal(postgres.body.properties.authConfig.passwordAuth, 'Disabled');
  assert.equal((await request('GET', `${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/gsdoc-db/administrators/${postgresAdminId}?api-version=2024-08-01`)).status, 200);
  assert.equal((await request('GET', `${group}/providers/Microsoft.DBforPostgreSQL/flexibleServers/gsdoc-db/databases/documents?api-version=2024-08-01`)).status, 200);
  assert.equal((await request('DELETE', `${group}?api-version=2022-09-01`)).status, 200);
});
