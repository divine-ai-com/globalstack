import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { createSearchRouter, createSearchRouterServer } from '../../azure-data-plane/src/search-router.mjs';

function httpJson(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host: 'srch-local.search.windows.net',
        'api-key': 'local-search-key',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        let parsed = text;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          // keep raw text
        }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function withSearchServer(fn) {
  const router = createSearchRouter();
  router.registerService({
    serviceName: 'srch-local',
    endpoint: 'https://srch-local.search.windows.net',
  });
  const server = createSearchRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ port, router });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('azure ai search data-plane enforces auth and api-version shape', async () => {
  await withSearchServer(async ({ port }) => {
    const missingAuth = await httpJson(
      port,
      'GET',
      '/indexes?api-version=2024-07-01',
      undefined,
      { 'api-key': '' },
    );
    assert.equal(missingAuth.status, 403);
    assert.equal(missingAuth.body.error.code, 'Forbidden');

    const missingVersion = await httpJson(port, 'GET', '/indexes');
    assert.equal(missingVersion.status, 400);
    assert.equal(missingVersion.body.error.code, 'MissingApiVersionParameter');

    const badVersion = await httpJson(port, 'GET', '/indexes?api-version=1900-01-01');
    assert.equal(badVersion.status, 400);
    assert.equal(badVersion.body.error.code, 'UnsupportedApiVersion');
  });
});

test('azure ai search runtime supports index, document indexing, search, count, and delete', async () => {
  await withSearchServer(async ({ port }) => {
    const index = await httpJson(port, 'PUT', "/indexes('docs')?api-version=2024-07-01", {
      name: 'docs',
      fields: [
        { name: 'id', type: 'Edm.String', key: true, searchable: false },
        { name: 'title', type: 'Edm.String', searchable: true },
        { name: 'category', type: 'Edm.String', filterable: true },
      ],
    });
    assert.equal(index.status, 201);
    assert.equal(index.body.name, 'docs');

    const list = await httpJson(port, 'GET', '/indexes?api-version=2024-07-01');
    assert.equal(list.status, 200);
    assert.equal(list.body.value.length, 1);

    const batch = await httpJson(port, 'POST', "/indexes('docs')/docs/search.index?api-version=2024-07-01", {
      value: [
        { '@search.action': 'upload', id: '1', title: 'Industrial pump manual', category: 'manual' },
        { '@search.action': 'upload', id: '2', title: 'Warranty workflow checklist', category: 'workflow' },
      ],
    });
    assert.equal(batch.status, 200);
    assert.equal(batch.body.value.length, 2);

    const search = await httpJson(port, 'POST', "/indexes('docs')/docs/search?api-version=2024-07-01", {
      search: 'pump',
    });
    assert.equal(search.status, 200);
    assert.equal(search.body.value.length, 1);
    assert.equal(search.body.value[0].id, '1');

    const count = await httpJson(port, 'GET', "/indexes('docs')/docs/count?api-version=2024-07-01");
    assert.equal(count.status, 200);
    assert.equal(count.body, 2);

    const remove = await httpJson(port, 'DELETE', "/indexes('docs')?api-version=2024-07-01");
    assert.equal(remove.status, 204);

    const missing = await httpJson(port, 'GET', "/indexes('docs')?api-version=2024-07-01");
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'IndexNotFound');
  });
});

test('invalid index key definitions do not create or overwrite an index', async () => {
  await withSearchServer(async ({ port }) => {
    const path = "/indexes('contracts')?api-version=2024-07-01";
    const first = { name: 'contractId', type: 'Edm.String', key: true };
    const second = { name: 'revisionId', type: 'Edm.String', key: true };
    for (const fields of [[{ ...first, key: false }], [first, second]]) {
      const rejected = await httpJson(port, 'PUT', path, { name: 'contracts', fields });
      assert.equal(rejected.status, 400);
      assert.equal(rejected.body.error.code, fields.length === 2 ? 'OperationNotAllowed' : 'InvalidRequestParameter');
      if (fields.length === 2) assert.equal(rejected.body.error.details[0].code, 'CompoundKeysNotSupported');
      assert.equal((await httpJson(port, 'GET', path)).status, 404);
    }
    const definition = { name: 'contracts', fields: [first, { ...second, key: false }] };
    const created = await httpJson(port, 'PUT', path, definition);
    assert.equal(created.status, 201);
    const invalidUpdate = await httpJson(port, 'PUT', path, { ...definition, fields: [first, second] });
    assert.equal(invalidUpdate.status, 400);
    const retained = await httpJson(port, 'GET', path);
    assert.deepEqual(retained.body, created.body);
    const indexed = await httpJson(port, 'POST', "/indexes('contracts')/docs/search.index?api-version=2024-07-01", {
      value: [{ '@search.action': 'upload', contractId: 'agreement-17', revisionId: 'r2' }],
    });
    assert.equal(indexed.status, 200);
    const results = await httpJson(port, 'POST', "/indexes('contracts')/docs/search?api-version=2024-07-01", { search: '*' });
    assert.equal(results.body.value[0].contractId, 'agreement-17');
  });
});
