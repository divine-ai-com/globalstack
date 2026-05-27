import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { listen } from '../../src/server/server.mjs';

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

test('GCP router fails closed for unsupported APIs with Google-shaped errors', async () => {
  const runtime = await listen({ port: 0 });
  try {
    const response = await getJson(`${runtime.url}/v1/projects/globalstack-test/unsupported`);
    assert.equal(response.statusCode, 501);
    assert.equal(response.body.error.code, 501);
    assert.equal(response.body.error.status, 'UNIMPLEMENTED');
    assert.match(response.body.error.message, /real local engine/);
  } finally {
    await runtime.close();
  }
});
