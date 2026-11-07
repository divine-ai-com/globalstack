import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createSearchRouter, createSearchRouterServer } from '../../packages/azure-data-plane/src/search-router.mjs';
import { httpExchange } from './http-exchange.mjs';

test('captured Search requests reproduce corrected errors, vector defaults and query identities', async t => {
  const base = new URL('./evidence/search-queries-e934e7b/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = JSON.parse(await readFile(new URL('result.json', base), 'utf8'));
  assert.equal(report.sourceDirty, false);
  assert.equal(report.probesComplete, true);
  assert.deepEqual(report.cleanup, { groupAbsent: true, serviceAbsent: true, deploymentAbsent: true });
  assert.equal(report.fullProtocolParityEvaluated, false);
  const router = createSearchRouter();
  router.registerService({ serviceName: 'captured-search' });
  const server = createSearchRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const phases = ['invalid-index-keys', 'corrected-index', 'index-documents', 'search-fuzzy', 'search-invalid-vector', 'search-valid-vector', 'delete-index', 'deleted-index-read'];
  for (const phase of phases) {
    const azure = report.exchanges.find(item => item.target === 'azure' && item.phase === phase);
    const originalLocal = report.exchanges.find(item => item.target === 'local' && item.phase === phase);
    assert.deepEqual(azure.request, originalLocal.request);
    const local = await httpExchange(`http://127.0.0.1:${server.address().port}${azure.path}`, {
      method: azure.method, body: azure.request, headers: { host: 'captured-search.search.windows.net', 'api-key': 'synthetic' },
    });
    assert.equal(local.status, azure.status, phase);
    if (['invalid-index-keys', 'search-invalid-vector'].includes(phase)) assert.deepEqual(local.body.error, azure.body.error, phase);
    if (phase === 'corrected-index') assert.equal(local.body.fields.find(field => field.name === 'embedding').retrievable, false);
    if (phase === 'search-valid-vector') assert.deepEqual(local.body.value, azure.body.value);
    if (phase === 'search-fuzzy') {
      assert.deepEqual(local.body.value.map(item => item.id), azure.body.value.map(item => item.id));
      // Preserve the known ranking gap until implemented and re-evaluated.
      assert.notEqual(local.body.value[0]['@search.score'], azure.body.value[0]['@search.score']);
    }
  }
});
