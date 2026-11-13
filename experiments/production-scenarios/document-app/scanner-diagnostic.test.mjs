import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createScannerDiagnostic } from './scanner-diagnostic.mjs';
const env = { SCANNER_ENDPOINT: 'https://scanner.example', SCANNER_SCOPE: 'api://11111111-1111-4111-8111-111111111111/.default',
  AZURE_CLIENT_ID: '22222222-2222-4222-8222-222222222222' };

test('scanner diagnostic preserves upstream outcomes without returning the workload token', async () => {
  for (const status of [200, 403]) {
    const handler = createScannerDiagnostic({ env, credential: { async getToken(scope) { assert.equal(scope, env.SCANNER_SCOPE); return { token: 'synthetic-private-token' }; } },
      fetchImpl: async (url, options) => {
        assert.equal(url.href, 'https://scanner.example/scan'); assert.equal(options.redirect, 'error');
        assert.equal(options.headers.authorization, 'Bearer synthetic-private-token');
        assert.equal(options.body.toString(), 'document text');
        return new Response(status === 200 ? JSON.stringify({ status: 'clean' }) : null, { status });
      } });
    const result = await handler({ json: async () => ({ text: 'document text' }) });
    assert.equal(result.status, status); assert.equal(result.jsonBody.upstreamStatus, status);
    assert.equal(result.jsonBody.inputSha256, createHash('sha256').update('document text').digest('hex'));
    assert.ok(!JSON.stringify(result).includes('synthetic-private-token'));
  }
});

test('scanner diagnostic bounds inputs and sanitizes transport failures', async () => {
  let calls = 0;
  const handler = createScannerDiagnostic({ env, credential: { async getToken() { calls++; throw new Error('private credential detail'); } } });
  assert.equal((await handler({ json: async () => ({ text: 'x'.repeat(4097) }) })).status, 413);
  assert.equal((await handler({ json: async () => ({ text: null }) })).status, 400);
  assert.equal(calls, 0);
  const failure = await handler({ json: async () => ({ text: 'document' }) });
  assert.equal(failure.status, 502); assert.ok(!JSON.stringify(failure).includes('private credential detail'));
  assert.throws(() => createScannerDiagnostic({ env: { ...env, SCANNER_ENDPOINT: 'http://scanner.example' } }));
});
