import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateSearch } from '../../azure-data-plane/src/search-query.mjs';

function index() {
  const fields = [
    { name: 'key', type: 'Edm.String', key: true, searchable: false },
    { name: 'body', type: 'Edm.String', searchable: true },
    { name: 'privateNote', type: 'Edm.String', searchable: false, retrievable: false },
    { name: 'vec', type: 'Collection(Edm.Single)', dimensions: 3, searchable: true, vectorSearchProfile: 'v' },
  ];
  return { fields, definition: { fields, vectorSearch: { profiles: [{ name: 'v', algorithm: 'cos' }], algorithms: [{ name: 'cos', kind: 'hnsw' }] } },
    documents: new Map([
      ['orthogonal', { key: 'orthogonal', body: 'unrelated report', vec: [0, 1, 0] }],
      ['exact', { key: 'exact', body: 'financial report', vec: [1, 0, 0], privateNote: 'hidden' }],
      ['opposite', { key: 'opposite', body: 'report finances', vec: [-1, 0, 0] }],
      ['no-vector', { key: 'no-vector', body: 'financial archive' }],
    ]) };
}
const query = overrides => ({ vectorQueries: [{ kind: 'vector', fields: 'vec', vector: [1, 0, 0], k: 2, ...overrides }] });
const keys = result => result.body.value.map(item => item.key);

test('fuzzy matching handles deletion, insertion, replacement and transposition without substring matches', () => {
  const source = index();
  for (const text of ['financal~1', 'finanncial~1', 'financixl~1', 'finacnial~1', 'financial~0']) {
    assert.deepEqual(keys(evaluateSearch(source, { search: text, queryType: 'full' })), ['exact', 'no-vector']);
  }
  assert.deepEqual(keys(evaluateSearch(source, { search: 'financal~0', queryType: 'full' })), []);
  assert.deepEqual(keys(evaluateSearch(source, { search: 'financ', queryType: 'full' })), []);
  assert.deepEqual(keys(evaluateSearch(source, { search: 'financial report', searchMode: 'all' })), ['exact']);
  assert.equal(evaluateSearch(source, { search: 'financal~1' }).error.status, 501);
  assert.equal(evaluateSearch(source, { search: 'financial AND report', queryType: 'full' }).error.status, 501);
});

test('cosine query uses vector similarity, k, and Azure score transformation', () => {
  const result = evaluateSearch(index(), query({ k: 3 }));
  assert.deepEqual(keys(result), ['exact', 'orthogonal', 'opposite']);
  assert.deepEqual(result.body.value.map(item => item['@search.score']), [1, 0.5, 1 / 3]);
  assert.deepEqual(keys(evaluateSearch(index(), query({ k: 1 }))), ['exact']);
  assert.equal(result.body.value[0].privateNote, undefined);
  assert.deepEqual(keys(evaluateSearch(index(), { ...query({}), skip: 1, top: 1 })), ['orthogonal']);
});

test('invalid vectors and unsupported ranking never fall through to all documents', () => {
  for (const change of [{ fields: 'unknown' }, { fields: 'body' }, { vector: [1, 0] }, { vector: ['1', 0, 0] }, { vector: [0, 0, 0] }, { k: 0 }]) {
    const result = evaluateSearch(index(), query(change));
    assert.equal(result.error.status, 400);
    assert.equal(result.body, undefined);
  }
  for (const request of [{ ...query({}), search: 'financial' }, { ...query({}), queryType: 'semantic' }, query({ kind: 'text', text: 'financial' })]) {
    assert.equal(evaluateSearch(index(), request).error.status, 501);
  }
});

test('selection and pagination respect retrievable fields and requested count', () => {
  const result = evaluateSearch(index(), { search: '*', select: 'key', top: 1, count: true });
  assert.equal(result.body['@odata.count'], 4);
  assert.deepEqual(Object.keys(result.body.value[0]), ['@search.score', 'key']);
  assert.equal(evaluateSearch(index(), { select: 'privateNote' }).error.status, 400);
  assert.equal(evaluateSearch(index(), { top: -1 }).error.status, 400);
  assert.equal(evaluateSearch(index(), { unsupportedOption: true }).error.status, 501);
});
