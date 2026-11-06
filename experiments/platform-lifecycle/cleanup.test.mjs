import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanup } from './cleanup.mjs';

const manifest = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-pair-123456abcdef', runId: '123456abcdef', token: 'synthetic-private-marker', templateDeployment: true };
const response = (status, body = null) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const deployment = (state = 'Succeeded', runId = manifest.runId) => ({ properties: { provisioningState: state, parameters: { runId: { value: runId }, groupName: { value: manifest.group } } } });

function mockFetch(t, replies) {
  const original = globalThis.fetch, calls = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    assert.equal(new URL(url).origin, 'https://management.azure.com');
    assert.equal(options.redirect, 'error');
    assert.ok(replies.length, 'Unexpected network request');
    return replies.shift();
  };
  return calls;
}

test('cleanup verifies deployment ownership and absence without exposing credentials to observers', async t => {
  const observations = [];
  const calls = mockFetch(t, [response(200, deployment()), response(404), response(202), response(404)]);
  const result = await cleanup(manifest, event => observations.push(event));
  assert.deepEqual(result, { absent: true, fallbackDelete: false, deploymentAbsent: true });
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'DELETE', 'GET']);
  assert.match(calls[0].url, /\/deployments\//);
  assert.match(calls[1].url, /\/resourcegroups\//);
  assert.equal(observations.length, 4);
  assert.equal(JSON.stringify(observations).includes(manifest.token), false);
});

test('cleanup refuses a deployment owned by another run before touching its group', async t => {
  const calls = mockFetch(t, [response(200, deployment('Succeeded', 'different-run'))]);
  await assert.rejects(cleanup(manifest), /ownership mismatch/);
  assert.deepEqual(calls.map(call => call.method), ['GET']);
});

test('cleanup waits for the deployment to finish before deleting the empty group', async t => {
  const calls = mockFetch(t, [response(200, deployment('Running')), response(200, deployment('Failed')),
    response(200, { tags: { run: manifest.runId, project: 'globalstack-paired-lifecycle' } }),
    response(200, { value: [] }), response(202), response(404), response(202), response(404)]);
  const result = await cleanup(manifest);
  assert.equal(result.absent, true);
  assert.equal(result.deploymentAbsent, true);
  assert.deepEqual(calls.map(call => call.method), ['GET', 'GET', 'GET', 'GET', 'DELETE', 'GET', 'DELETE', 'GET']);
  assert.match(calls[0].url, /\/deployments\//);
  assert.match(calls[1].url, /\/deployments\//);
  assert.match(calls[4].url, /\/resourcegroups\//);
});

test('cleanup rejects malformed scope before making a network request', async t => {
  const calls = mockFetch(t, []);
  await assert.rejects(cleanup({ ...manifest, subscription: '../another-host' }));
  await assert.rejects(cleanup({ ...manifest, group: 'gs-pair-abcdef123456' }));
  assert.deepEqual(calls, []);
});

test('cleanup refuses group deletion when the deployment remains active past its deadline', async t => {
  const calls = mockFetch(t, [response(200, deployment('Running'))]);
  let reads = 0;
  t.mock.method(Date, 'now', () => reads++ === 0 ? 0 : 120001);
  await assert.rejects(cleanup(manifest), /still active/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/deployments\//);
  assert.equal(calls[0].method, 'GET');
});
