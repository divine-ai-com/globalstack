import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existingOrchestrationStatus } from './durable-status.mjs';

test('a missing durable instance can be started after the client reports HTTP 404', async () => {
  const instanceId = 'pilot-instance';
  const client = { async getStatus() {
    throw new Error(`DurableClient error: Durable Functions extension replied with HTTP 404 response. This usually means we could not find any data associated with the instanceId provided: ${instanceId}.`);
  } };
  assert.equal(await existingOrchestrationStatus(client, instanceId), null);
});

test('an existing instance is retained and unrelated failures are not hidden', async () => {
  const status = { runtimeStatus: 'Running' };
  assert.equal(await existingOrchestrationStatus({ getStatus: async () => status }, 'pilot-instance'), status);
  await assert.rejects(existingOrchestrationStatus({ getStatus: async () => {
    throw new Error('DurableClient error: Durable Functions extension replied with HTTP 404 response. instanceId provided: another-instance.');
  } }, 'pilot-instance'), /another-instance/);
});
