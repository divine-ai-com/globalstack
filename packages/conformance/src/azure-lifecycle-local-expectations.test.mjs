import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

const expectationsPath = new URL('../../../fixtures/local-expectations/azure-lifecycle-local-expectations.json', import.meta.url);

function httpJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        authorization: 'Bearer lifecycle-expectation-test-token',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
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
          // keep text
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function localPath(path) {
  return path.replaceAll('<subscription-id>', 'sub-life-local');
}

function interpolateBody(body) {
  if (body === null || body === undefined) return body;
  if (typeof body === 'string') return body.replaceAll('{location}', 'eastus');
  if (Array.isArray(body)) return body.map(interpolateBody);
  if (typeof body === 'object') {
    return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, interpolateBody(value)]));
  }
  return body;
}

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

function comparableShape(body) {
  if (body === null || body === undefined) return { kind: 'empty' };
  if (Array.isArray(body?.value)) return { kind: 'list', length: body.value.length };
  return {
    kind: 'resource',
    hasId: typeof body.id === 'string',
    type: body.type ?? null,
    provisioningState: body.properties?.provisioningState ?? null,
  };
}

async function withServer(fn) {
  const server = createArmServer({ persist: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('ready storage lifecycle sequence matches captured Azure statuses and shapes', async () => {
  const doc = JSON.parse(await readFile(expectationsPath, 'utf8'));
  const ready = doc.expectations.filter(item => item.fixtureId === 'storage-arm-lifecycle-ready');
  assert.ok(ready.length > 0);

  await withServer(async (port) => {
    for (const expectation of ready) {
      const response = await httpJson(
        port,
        expectation.request.method,
        localPath(expectation.request.path),
        interpolateBody(expectation.request.body),
      );

      assert.equal(response.status, expectation.expected.status, `${expectation.id} status`);
      assert.equal(errorCode(response.body), expectation.expected.errorCode, `${expectation.id} error code`);
      const actualShape = comparableShape(response.body);
      assert.equal(actualShape.kind, expectation.expected.bodyShape.kind, `${expectation.id} body kind`);
      if (expectation.expected.bodyShape.kind === 'list') {
        assert.equal(actualShape.length, expectation.expected.bodyShape.length, `${expectation.id} list length`);
      }
      if (expectation.expected.bodyShape.kind === 'resource') {
        assert.equal(actualShape.hasId, expectation.expected.bodyShape.hasId, `${expectation.id} resource id shape`);
        if (expectation.expected.bodyShape.type) assert.equal(actualShape.type, expectation.expected.bodyShape.type, `${expectation.id} resource type`);
      }
    }
  });
});

test('immediate storage child operations remain documented async-readiness gaps', async () => {
  const doc = JSON.parse(await readFile(expectationsPath, 'utf8'));
  const immediateGaps = doc.expectations.filter(item =>
    item.fixtureId === 'storage-arm-lifecycle-immediate'
    && item.expected.status === 409
    && item.expected.errorCode === 'StorageAccountIsNotProvisioned'
  );
  assert.equal(immediateGaps.length, 20);
});
