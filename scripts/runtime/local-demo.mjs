import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { localIdentity } from '../../packages/azure-control-plane/src/server-support.mjs';

const externalEndpoint = process.env.GLOBALSTACK_ENDPOINT;
const server = externalEndpoint ? null : createArmServer();
if (server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}
const endpoint = externalEndpoint ?? `http://127.0.0.1:${server.address().port}`;
const target = new URL(endpoint);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw new Error('The demo accepts only a loopback endpoint.');
}
const group = `/subscriptions/${localIdentity.subscriptionId}/resourceGroups/gs-demo-${process.pid}-${Date.now()}`;
let created = false;

async function request(method, path, body) {
  const response = await fetch(`${endpoint}${path}`, {
    method,
    redirect: 'error',
    headers: { authorization: `Bearer ${localIdentity.accessToken}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

try {
  assert.equal((await request('GET', '/_globalstack/health')).status, 200);
  assert.equal((await request('PUT', `${group}?api-version=2021-04-01`, { location: 'eastus' })).status, 201);
  created = true;
  const template = JSON.parse(await readFile(new URL('../../examples/managed-identity/main.json', import.meta.url), 'utf8'));
  const deploymentPath = `${group}/providers/Microsoft.Resources/deployments/demo?api-version=2021-04-01`;
  const deployment = await request('PUT', deploymentPath, {
    properties: { mode: 'Incremental', template, parameters: { identityName: { value: 'demo-identity' } } },
  });
  assert.ok([200, 201, 202].includes(deployment.status), JSON.stringify(deployment.body));
  const deployed = await request('GET', deploymentPath);
  assert.equal(deployed.status, 200);
  assert.equal(deployed.body.properties.provisioningState, 'Succeeded');
  assert.equal(deployed.body.properties.outputs.identityId.value, `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/demo-identity`);
  const resource = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/demo-identity?api-version=2023-01-31`;
  const readback = await request('GET', resource);
  assert.equal(readback.status, 200);
  assert.equal(readback.body.tags.purpose, 'local-demo');
  assert.equal((await request('PUT', `${group}/providers/Unsupported.Provider/widgets/demo?api-version=2024-01-01`, { location: 'eastus' })).status, 501);
  console.log('PASS: health, ARM template deployment, output resolution, identity readback, and unsupported resource rejection.');
} finally {
  try {
    if (created) {
      const deletion = await request('DELETE', `${group}?api-version=2021-04-01`);
      assert.ok([200, 202, 204].includes(deletion.status));
      assert.equal((await request('GET', `${group}?api-version=2021-04-01`)).status, 404);
      console.log('PASS: demo resources deleted and absence verified.');
    }
  } finally {
    server?.closeAllConnections?.();
    if (server) await new Promise(resolve => server.close(resolve));
  }
}
