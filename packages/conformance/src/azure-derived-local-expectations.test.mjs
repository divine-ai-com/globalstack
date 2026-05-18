import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request } from 'node:http';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';

const expectationsPath = new URL('../../../fixtures/local-expectations/azure-derived-local-expectations.json', import.meta.url);

function httpJson(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        authorization: 'Bearer local-expectation-test-token',
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

function interpolate(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value
      .replaceAll('{location}', 'eastus')
      .replaceAll('{tenantId}', '00000000-0000-0000-0000-000000000000')
      .replaceAll('{serverFarmId}', '/subscriptions/sub-local/resourceGroups/rg-local/providers/Microsoft.Web/serverfarms/plan-local');
  }
  if (Array.isArray(value)) return value.map(interpolate);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, interpolate(nested)]));
  }
  return value;
}

function localPath(path) {
  return path.replaceAll('<subscription-id>', 'sub-local').replaceAll('<tenant-id>', 'tenant-local');
}

function resourceGroupFromPath(path) {
  return /\/resourceGroups\/([^/?]+)/i.exec(path)?.[1] ?? null;
}

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
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

test('local ARM facade matches Azure-derived local expectations', async () => {
  const expectationDoc = JSON.parse(await readFile(expectationsPath, 'utf8'));
  assert.equal(expectationDoc.expectationCount, expectationDoc.expectations.length);
  assert.ok(expectationDoc.allowedDepths.includes('provider-validation'));

  await withServer(async (port) => {
    for (const expectation of expectationDoc.expectations) {
      const path = localPath(expectation.request.path);
      const rg = resourceGroupFromPath(path);
      if (rg) {
        await httpJson(port, 'PUT', `/subscriptions/sub-local/resourceGroups/${rg}?api-version=2021-04-01`, { location: 'eastus' });
      }

      const response = await httpJson(
        port,
        expectation.request.method,
        path,
        interpolate(expectation.request.body),
      );

      assert.equal(response.status, expectation.expected.status, `${expectation.id} status`);
      assert.equal(errorCode(response.body), expectation.expected.errorCode, `${expectation.id} error code`);
    }
  });
});
