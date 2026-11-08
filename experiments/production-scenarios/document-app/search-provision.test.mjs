import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearchRouter, createSearchRouterServer } from '../../../packages/azure-data-plane/src/search-router.mjs';
import { httpExchange } from '../http-exchange.mjs';
import { provisionDocumentSearch } from './search-provision.mjs';

const storageResourceId = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/gs-pilot/providers/Microsoft.Storage/storageAccounts/gsdocstorage';
const endpoint = 'https://gsdoc-search.search.windows.net';
const credential = { async getToken(scope) {
  assert.equal(scope, 'https://search.azure.com/.default');
  return { token: 'synthetic-token' };
} };

test('document Search provisioner installs the deletion policy before the scheduled indexer', async () => {
  const calls = [];
  const steps = await provisionDocumentSearch({ endpoint, storageResourceId, credential, async request(url, options) {
    const body = JSON.parse(options.body);
    calls.push({ path: new URL(url).pathname, body });
    assert.equal(options.headers.authorization, 'Bearer synthetic-token');
    assert.equal(options.redirect, 'error');
    return Response.json({ name: body.name }, { status: 201 });
  } });
  assert.deepEqual(calls.map(call => call.path), [
    "/indexes('documents')", "/indexes('document-projection')",
    "/datasources('document-projection-source')", "/indexers('document-projection-indexer')",
  ]);
  assert.equal(calls[2].body.dataDeletionDetectionPolicy.softDeleteMarkerValue, 'true');
  assert.equal(calls[2].body.credentials.connectionString, `ResourceId=${storageResourceId};`);
  assert.equal(calls[3].body.targetIndexName, calls[1].body.name);
  assert.deepEqual(steps.map(step => step.status), [201, 201, 201, 201]);
});

test('document Search provisioner exposes the local data-source gap', async t => {
  const router = createSearchRouter();
  router.registerService({ serviceName: 'gsdoc-search' });
  const server = createSearchRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const calls = [];
  await assert.rejects(provisionDocumentSearch({ endpoint, storageResourceId, credential, async request(url, options) {
    const path = new URL(url).pathname;
    calls.push(path);
    const result = await httpExchange(`http://127.0.0.1:${server.address().port}${path}?api-version=2025-09-01`, {
      method: options.method, body: JSON.parse(options.body),
      headers: { host: 'gsdoc-search.search.windows.net', authorization: options.headers.authorization },
    });
    return { status: result.status, json: async () => result.body };
  } }), /projection-data-source returned HTTP 501 \(NotImplemented\)/);
  assert.equal(calls.length, 3);
  assert.equal(router.services.get('gsdoc-search').indexes.size, 2);
  await assert.rejects(provisionDocumentSearch({ endpoint: 'https://attacker.invalid', storageResourceId, credential, request: async () => {
    throw new Error('Network request must not occur');
  } }));
});
