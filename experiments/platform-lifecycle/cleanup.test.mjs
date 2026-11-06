import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanup } from './cleanup.mjs';

const manifest = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-pair-123456abcdef', runId: '123456abcdef', token: 'synthetic-private-marker', templateDeployment: true };
const response = (status, body = null) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('cleanup verifies deployment ownership and absence without exposing credentials to observers', async t => {
  const original = globalThis.fetch, calls = [], observations = [];
  t.after(() => { globalThis.fetch = original; });
  const replies = [response(404), response(200, { properties: { parameters: { runId: { value: manifest.runId }, groupName: { value: manifest.group } } } }), response(202), response(404)];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(new URL(url).origin, 'https://management.azure.com');
    assert.equal(options.redirect, 'error');
    return replies.shift();
  };
  const result = await cleanup(manifest, event => observations.push(event));
  assert.deepEqual(result, { absent: true, fallbackDelete: false, deploymentAbsent: true });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'DELETE', 'GET']);
  assert.equal(observations.length, 4);
  assert.equal(JSON.stringify(observations).includes(manifest.token), false);
});

test('cleanup refuses a deployment owned by another run', async t => {
  const original = globalThis.fetch, calls = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (_url, options) => {
    calls.push(options.method);
    return calls.length === 1 ? response(404) : response(200, { properties: { parameters: { runId: { value: 'different-run' }, groupName: { value: manifest.group } } } });
  };
  await assert.rejects(cleanup(manifest), /ownership mismatch/);
  assert.deepEqual(calls, ['GET', 'GET']);
});
