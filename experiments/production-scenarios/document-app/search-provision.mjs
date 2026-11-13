import assert from 'node:assert/strict';
import { documentIndex } from './search-schema.mjs';
import { projectionDataSource, projectionIndex, projectionIndexer } from './search-projection.mjs';

const apiVersion = '2025-09-01';

function searchEndpoint(value) {
  const url = new URL(value);
  assert.equal(url.protocol, 'https:');
  assert.match(url.hostname, /^[a-z0-9][a-z0-9-]*\.search\.windows\.net$/i);
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/');
  return url.origin;
}

export async function provisionDocumentSearch({ endpoint, storageResourceId, credential, request = fetch }) {
  const origin = searchEndpoint(endpoint);
  const token = await credential.getToken('https://search.azure.com/.default');
  assert.ok(typeof token?.token === 'string' && token.token.length > 0, 'Search token unavailable');
  const steps = [
    ['push-index', `/indexes('${documentIndex.name}')`, documentIndex],
    ['projection-index', `/indexes('${projectionIndex.name}')`, projectionIndex],
    ['projection-data-source', `/datasources('${projectionDataSource(storageResourceId).name}')`, projectionDataSource(storageResourceId)],
    ['projection-indexer', `/indexers('${projectionIndexer.name}')`, projectionIndexer],
  ];
  const completed = [];
  for (const [stage, path, body] of steps) {
    const response = await request(`${origin}${path}?api-version=${apiVersion}`, {
      method: 'PUT', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify(body),
    });
    if (![200, 201].includes(response.status)) {
      let code = 'UnknownError';
      try { code = (await response.json())?.error?.code ?? code; } catch { /* A failed response may not contain JSON. */ }
      throw new Error(`${stage} returned HTTP ${response.status} (${code})`);
    }
    completed.push({ stage, status: response.status });
  }
  return completed;
}
