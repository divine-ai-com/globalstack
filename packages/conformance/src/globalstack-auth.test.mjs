import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startArmServer } from '../../azure-control-plane/src/server.mjs';
import { localIdentity } from '../../azure-control-plane/src/server-support.mjs';

test('default daemon startup retains Azure request authentication', async () => {
  const server = startArmServer({ port: 0, host: '127.0.0.1' });
  await new Promise(resolve => server.once('listening', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const path = `/subscriptions/${localIdentity.subscriptionId}/resourceGroups?api-version=2021-04-01`;
  try {
    assert.equal((await fetch(`${endpoint}/_globalstack/health`)).status, 200);
    assert.equal((await fetch(`${endpoint}${path}`)).status, 401);
    assert.equal((await fetch(`${endpoint}${path}`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
    assert.equal((await fetch(`${endpoint}${path}`, { headers: { Authorization: `Bearer ${localIdentity.accessToken}` } })).status, 200);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
