import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createSearchRouterServer } from '../../packages/azure-data-plane/src/search-router.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { httpExchange } from './http-exchange.mjs';
import { cleanupDocumentSearch } from './document-search-cleanup.mjs';
import { provisionDocumentSearch } from './document-app/search-provision.mjs';
import { projectionDataSource, projectionIndexer } from './document-app/search-projection.mjs';

const subscription = '00000000-0000-0000-0000-000000000000';
const group = `/subscriptions/${subscription}/resourceGroups/gs-document-services-test`;
const fixture = new URL('./document-infra/', import.meta.url);
const templateHashes = {
  'document-search-identities': { source: '2f8b61af0f0e7dde9dc34c9aa2ba31e0f0cb557c1131598ae37562b7932dc613', compiled: '09748ab6c6c9cae0c76720b43bd7b3703bc62350b9b18e42064156448f327dac' },
  'document-data': { source: '0ed505824dbfabf628ab9366cdca245afc0658c65e309fe7e19f1580e51af063', compiled: 'ab8308b2532861e533eea99718cba24971346f3b50587e4a6a9940390f9a706e' },
  'document-search': { source: '2a0785b1e12fcc3edbe9fcffff550d9ba44fc0fed0ffb1c8b3c14a3fd4148ef1', compiled: '73885b9cf242d15eadb0e2eb891869e1612381d9af011b81c6f258ea2b412aa8' },
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
  const tenant = '11111111-1111-4111-8111-111111111111';
  const issuer = `https://sts.windows.net/${tenant}/`;
  const pair = await generateKeyPair('RS256', { extractable: true });
  const publicKey = { ...await exportJWK(pair.publicKey), kid: 'paired-local', alg: 'RS256', use: 'sig' };
  const trust = { issuer, tenantId: tenant, subscriptionIds: [subscription], jwks: { keys: [publicKey] } };
  const runtime = createEmulatorRuntime({ store, searchTokenTrusts: [trust], storageTokenTrusts: [trust] });
  const arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  const search = createSearchRouterServer(runtime.searchRouter);
  const blob = createServer(runtime.storageRouter.blobHandler());
  await new Promise(resolve => arm.listen(0, '127.0.0.1', resolve));
  for (const server of [search, blob]) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const server of [blob, search, arm]) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await runtime.dispose();
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
  const searchRoles = Array.from({ length: 5 }, randomUUID);
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
  const token = async audience => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: issuer, tid: tenant, oid: publisherPrincipalId, aud: audience,
      iat: now, nbf: now - 1, exp: now + 300 }).setProtectedHeader({ alg: 'RS256', kid: 'paired-local' }).sign(pair.privateKey);
  };
  const searchToken = await token('https://search.azure.com/');
  const storageToken = await token('https://storage.azure.com/');
  const searchHost = `${serviceName}-search.search.windows.net`;
  const searchCall = (method, path, body) => httpExchange(`http://127.0.0.1:${search.address().port}${path}?api-version=2025-09-01`, {
    method, body, headers: { host: searchHost, authorization: `Bearer ${searchToken}` },
  });
  const steps = await provisionDocumentSearch({ endpoint: `https://${searchHost}`, storageResourceId: `${pilotGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}`,
    credential: { async getToken() { return { token: searchToken }; } },
    request: async (url, options) => {
      const parsed = new URL(url);
      const response = await httpExchange(`http://127.0.0.1:${search.address().port}${parsed.pathname}${parsed.search}`, {
        method: options.method, body: JSON.parse(options.body), headers: { host: searchHost, authorization: options.headers.authorization },
      });
      return { status: response.status, json: async () => response.body };
    },
  });
  assert.equal(steps.length, 4);
  const accountHost = `${storageAccountName}.blob.core.windows.net`;
  const upload = (container, id, body, deleted) => httpExchange(`http://127.0.0.1:${blob.address().port}/${container}/${id}.json`, {
    method: 'PUT', body: Buffer.from(JSON.stringify(body)), headers: { host: accountHost, authorization: `Bearer ${storageToken}`,
      'x-ms-version': '2023-11-03', 'x-ms-blob-type': 'BlockBlob', 'x-ms-meta-isdeleted': deleted ? 'true' : 'false',
      'content-type': 'application/json' },
  });
  const query = id => searchCall('POST', "/indexes('document-projection')/docs/search", {
    search: '*', filter: `document_id eq '${id}'`, select: 'document_id,revision_id', top: 2,
  });
  assert.equal((await upload('clean-projection', 'doc-1', { document_id: 'doc-1', revision_id: 'r1', extracted_text: 'clean' }, false)).status, 201);
  assert.equal((await upload('quarantine', 'bad-1', { document_id: 'bad-1', extracted_text: 'excluded' }, false)).status, 201);
  assert.equal((await searchCall('POST', "/indexers('document-projection-indexer')/search.run")).status, 202);
  assert.equal((await query('doc-1')).body.value[0].revision_id, 'r1');
  assert.equal((await query('bad-1')).body.value.length, 0);
  const wrongSource = { ...projectionDataSource(`${pilotGroup}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}`),
    name: 'quarantine-probe-source', container: { name: 'quarantine' } };
  assert.equal((await searchCall('PUT', "/datasources('quarantine-probe-source')", wrongSource)).status, 201);
  const wrongIndexer = await searchCall('PUT', "/indexers('quarantine-probe-indexer')", {
    ...projectionIndexer, name: 'quarantine-probe-indexer', dataSourceName: wrongSource.name,
  });
  assert.equal(wrongIndexer.status, 401);
  assert.equal(wrongIndexer.body.error.code, '');
  assert.match(wrongIndexer.body.error.message, /managed identity.*Storage Blob Data Reader/);
  assert.match(wrongIndexer.body.error.message, /linkid=2193521 for detailed documentation/);
  assert.equal((await searchCall('GET', "/indexers('quarantine-probe-indexer')")).status, 404);
  assert.equal((await query('bad-1')).body.value.length, 0);
  assert.equal((await upload('clean-projection', 'doc-1', { document_id: 'doc-1', revision_id: 'r2', deleted: 'true' }, true)).status, 201);
  assert.equal((await searchCall('POST', "/indexers('document-projection-indexer')/search.run")).status, 202);
  assert.equal((await query('doc-1')).body.value.length, 0);
  const readGrantPath = `${projectionId}/providers/Microsoft.Authorization/roleAssignments/${searchRoles[3]}?api-version=2022-04-01`;
  assert.ok([200, 204].includes((await request('DELETE', readGrantPath)).status));
  assert.equal((await upload('clean-projection', 'doc-2', { document_id: 'doc-2', revision_id: 'r1' }, false)).status, 201);
  assert.equal((await searchCall('POST', "/indexers('document-projection-indexer')/search.run")).status, 202);
  const denied = await searchCall('GET', "/indexers('document-projection-indexer')/search.status");
  assert.equal(denied.body.lastResult.status, 'transientFailure');
  assert.equal((await query('doc-2')).body.value.length, 0);
  const restored = await request('PUT', readGrantPath, { properties: {
    principalId: service.body.identity.principalId, principalType: 'ServicePrincipal',
    roleDefinitionId: `/subscriptions/${subscription}/providers/Microsoft.Authorization/roleDefinitions/2a2b9908-6ea1-4ae2-8e65-a410df84e7d1`,
    description: `globalstack-production-scenarios:${runId}`,
  } });
  assert.ok([200, 201].includes(restored.status));
  assert.equal((await searchCall('POST', "/indexers('document-projection-indexer')/search.run")).status, 202);
  assert.equal((await query('doc-2')).body.value[0].document_id, 'doc-2');
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
      workerIdentityName: 'gsdoc-worker', ingressIdentityName: 'gsdoc-ingress', roleAssignmentNames: Array.from({ length: 5 }, randomUUID) }],
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
