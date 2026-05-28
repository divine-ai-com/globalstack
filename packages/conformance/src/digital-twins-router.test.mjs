import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { createDigitalTwinsRouter, createDigitalTwinsRouterServer } from '../../azure-data-plane/src/digital-twins-router.mjs';

function httpJson(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host: 'adtlocal.api.eastus.digitaltwins.azure.net',
        authorization: 'Bearer globalstack-local-token',
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

async function withDigitalTwinsServer(fn) {
  const router = createDigitalTwinsRouter();
  router.registerInstance({
    instanceName: 'adtlocal',
    hostName: 'adtlocal.api.eastus.digitaltwins.azure.net',
  });
  const server = createDigitalTwinsRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn({ port, router });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('digital twins data-plane enforces bearer auth and api-version shape', async () => {
  await withDigitalTwinsServer(async ({ port }) => {
    const missingAuth = await httpJson(
      port,
      'GET',
      '/models?api-version=2023-10-31',
      undefined,
      { authorization: '' },
    );
    assert.equal(missingAuth.status, 401);
    assert.equal(missingAuth.body.error.code, 'Unauthorized');

    const missingVersion = await httpJson(port, 'GET', '/models');
    assert.equal(missingVersion.status, 400);
    assert.equal(missingVersion.body.error.code, 'ApiVersionParameterRequired');

    const badVersion = await httpJson(port, 'GET', '/models?api-version=1900-01-01');
    assert.equal(badVersion.status, 400);
    assert.equal(badVersion.body.error.code, 'UnsupportedApiVersion');
  });
});

test('digital twins graph runtime supports model, twin, relationship, query, and delete semantics', async () => {
  await withDigitalTwinsServer(async ({ port }) => {
    const siteModelId = 'dtmi:globalstack:Site;1';
    const lineModelId = 'dtmi:globalstack:Line;1';

    const uploadModels = await httpJson(port, 'POST', '/models?api-version=2023-10-31', [
      {
        '@id': siteModelId,
        '@type': 'Interface',
        '@context': 'dtmi:dtdl:context;3',
        displayName: 'Site',
        contents: [{ '@type': 'Property', name: 'status', schema: 'string' }],
      },
      {
        '@id': lineModelId,
        '@type': 'Interface',
        '@context': 'dtmi:dtdl:context;3',
        displayName: 'Line',
        contents: [{ '@type': 'Property', name: 'temperature', schema: 'double' }],
      },
    ]);
    assert.equal(uploadModels.status, 201);
    assert.equal(uploadModels.body.value.length, 2);

    const duplicateModel = await httpJson(port, 'POST', '/models?api-version=2023-10-31', [
      { '@id': siteModelId, '@type': 'Interface', '@context': 'dtmi:dtdl:context;3' },
    ]);
    assert.equal(duplicateModel.status, 409);
    assert.equal(duplicateModel.body.error.code, 'ModelAlreadyExists');

    const createSite = await httpJson(port, 'PUT', '/digitaltwins/site-01?api-version=2023-10-31', {
      $metadata: { $model: siteModelId },
      status: 'open',
    });
    assert.equal(createSite.status, 200);
    assert.equal(createSite.body.$dtId, 'site-01');
    assert.equal(createSite.body.status, 'open');

    const createLine = await httpJson(port, 'PUT', '/digitaltwins/line-01?api-version=2023-10-31', {
      $metadata: { $model: lineModelId },
      temperature: 72.5,
    });
    assert.equal(createLine.status, 200);
    assert.equal(createLine.body.$dtId, 'line-01');

    const patchSite = await httpJson(port, 'PATCH', '/digitaltwins/site-01?api-version=2023-10-31', [
      { op: 'replace', path: '/status', value: 'closed' },
      { op: 'add', path: '/region', value: 'eastus' },
    ]);
    assert.equal(patchSite.status, 204);

    const readSite = await httpJson(port, 'GET', '/digitaltwins/site-01?api-version=2023-10-31');
    assert.equal(readSite.status, 200);
    assert.equal(readSite.body.status, 'closed');
    assert.equal(readSite.body.region, 'eastus');

    const relationship = await httpJson(
      port,
      'PUT',
      '/digitaltwins/site-01/relationships/contains-line-01?api-version=2023-10-31',
      {
        $relationshipName: 'contains',
        $targetId: 'line-01',
        confidence: 0.98,
      },
    );
    assert.equal(relationship.status, 200);
    assert.equal(relationship.body.$sourceId, 'site-01');
    assert.equal(relationship.body.$targetId, 'line-01');

    const filteredRelationships = await httpJson(
      port,
      'GET',
      '/digitaltwins/site-01/relationships?api-version=2023-10-31&relationshipName=contains',
    );
    assert.equal(filteredRelationships.status, 200);
    assert.equal(filteredRelationships.body.value.length, 1);

    const query = await httpJson(port, 'POST', '/query?api-version=2023-10-31', {
      query: 'SELECT * FROM DIGITALTWINS',
    });
    assert.equal(query.status, 200);
    assert.equal(query.body.value.length, 2);

    const blockedDelete = await httpJson(port, 'DELETE', '/digitaltwins/line-01?api-version=2023-10-31');
    assert.equal(blockedDelete.status, 400);
    assert.equal(blockedDelete.body.error.code, 'RelationshipsNotDeleted');

    const deleteRelationship = await httpJson(
      port,
      'DELETE',
      '/digitaltwins/site-01/relationships/contains-line-01?api-version=2023-10-31',
    );
    assert.equal(deleteRelationship.status, 204);

    const deleteLine = await httpJson(port, 'DELETE', '/digitaltwins/line-01?api-version=2023-10-31');
    assert.equal(deleteLine.status, 204);

    const missingLine = await httpJson(port, 'GET', '/digitaltwins/line-01?api-version=2023-10-31');
    assert.equal(missingLine.status, 404);
    assert.equal(missingLine.body.error.code, 'DigitalTwinNotFound');
  });
});
