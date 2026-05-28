import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { listen } from '../../src/server/server.mjs';
import { createService as createComputeService } from '../../src/services/compute/service.mjs';

test('Compute metadata service lists regions for provider validation', async () => {
  const runtime = await listen({
    port: 0,
    services: [
      createComputeService(),
    ],
  });
  try {
    const response = await getJson(`${runtime.url}/compute/v1/projects/globalstack-local/regions`);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.kind, 'compute#regionList');
    assert.ok(response.body.items.some(region => region.name === 'us-central1'));
    assert.ok(response.body.items.some(region => region.name === 'europe-north2'));
  } finally {
    await runtime.close();
  }
});

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: JSON.parse(body),
        });
      });
    }).on('error', reject);
  });
}
