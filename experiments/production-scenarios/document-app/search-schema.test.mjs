import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSearchRouter, createSearchRouterServer } from '../../../packages/azure-data-plane/src/search-router.mjs';
import { httpExchange } from '../http-exchange.mjs';
import { searchAccessFilter } from './access.mjs';
import { documentIndex } from './search-schema.mjs';

test('document push index accepts the application payload and enforces tenant and group filters', async t => {
  const router = createSearchRouter();
  router.registerService({ serviceName: 'document-schema' });
  const server = createSearchRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const call = (method, path, body) => httpExchange(`http://127.0.0.1:${server.address().port}${path}?api-version=2024-07-01`, {
    method, body, headers: { host: 'document-schema.search.windows.net', 'api-key': 'synthetic' },
  });
  const created = await call('PUT', "/indexes('documents')", documentIndex);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const owner = '8f255a70-9556-42c3-8dfc-761adbb383b2';
  const reader = '6585a213-ad67-4f38-890e-2036d1125495';
  const group = 'dd282ba2-ab91-4a20-a054-b4f1557c2793';
  const base = { tenant_id: 'school', owner_id: owner, read_groups: [group], root_correlation_id: owner,
    file_name: 'school-report.pdf', scan_status: 'CLEAN', extracted_text: 'annual school report', revision_id: 'a'.repeat(64) };
  const indexed = await call('POST', "/indexes('documents')/docs/search.index", { value: [
    { '@search.action': 'upload', ...base, document_id: '6aebd853-51cb-423e-809b-5a1c3586d2c4' },
    { '@search.action': 'upload', ...base, tenant_id: 'other', document_id: 'd2a3a435-5769-43f7-ab7d-ee651521ca95' },
    { '@search.action': 'upload', ...base, scan_status: 'UNRESOLVED', document_id: '47a097a2-d02e-47d7-aa1c-10202e23c6d8' },
  ] });
  assert.equal(indexed.status, 200, JSON.stringify(indexed.body));
  const visible = await call('POST', "/indexes('documents')/docs/search", {
    search: 'school', queryType: 'full', searchMode: 'all', top: 20, select: 'document_id,revision_id',
    filter: searchAccessFilter({ tenant: 'school', subject: reader, groups: [group] }),
  });
  assert.equal(visible.status, 200, JSON.stringify(visible.body));
  assert.deepEqual(visible.body.value.map(hit => hit.document_id), ['6aebd853-51cb-423e-809b-5a1c3586d2c4']);
  const hidden = await call('POST', "/indexes('documents')/docs/search", {
    search: 'school', queryType: 'full', searchMode: 'all', top: 20, select: 'document_id,revision_id',
    filter: searchAccessFilter({ tenant: 'school', subject: reader, groups: [] }),
  });
  assert.equal(hidden.status, 200, JSON.stringify(hidden.body));
  assert.deepEqual(hidden.body.value, []);
  const unsupported = await call('POST', "/indexes('documents')/docs/search", {
    search: 'school', filter: "tenant_id eq 'school' or unknown_operation()",
  });
  assert.equal(unsupported.status, 501);
  assert.equal(unsupported.body.error.code, 'GlobalStackQueryNotImplemented');
});
