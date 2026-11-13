import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createFunctionsRouterServer, deterministicHostKey } from '../../azure-data-plane/src/functions-router.mjs';

// These checks exercise the existing metadata router, not native worker execution.
test('Function App ARM updates preserve registered routes and Durable instance state until deletion', async () => {
  const store = new ResourceStore(), runtime = createEmulatorRuntime({ store });
  const arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
  const data = createFunctionsRouterServer(runtime.functionsRouter);
  for (const server of [arm, data]) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const scope = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-function-refresh';
  const appName = 'independent-workflow-app', appPath = `${scope}/providers/Microsoft.Web/sites/${appName}`;
  function exchange(server, method, path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const payload = body === undefined ? undefined : JSON.stringify(body);
      const req = request({ hostname: '127.0.0.1', port: server.address().port, method, path,
        headers: { authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers },
      }, response => {
        let text = '';
        response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => {
          try { resolve({ status: response.statusCode, body: text ? JSON.parse(text) : null }); }
          catch (error) { reject(error); }
        });
      });
      req.setTimeout(5000, () => req.destroy(new Error('Request timed out')));
      req.on('error', reject);
      req.end(payload);
    });
  }
  const api = (method, path, body) => exchange(arm, method, `${path}?api-version=${path === scope ? '2025-04-01' : '2024-11-01'}`, body);
  const invoke = (method, path, body) => exchange(data, method, path, body, {
    host: `${appName}.azurewebsites.net`, 'x-functions-key': deterministicHostKey(appName, 'master'),
  });
  try {
    assert.equal((await api('PUT', scope, { location: 'westus2' })).status, 201);
    const planPath = `${scope}/providers/Microsoft.Web/serverfarms/independent-workflow-plan`;
    assert.equal((await api('PUT', planPath, { location: 'westus2', sku: { name: 'Y1', tier: 'Dynamic' }, properties: { reserved: true } })).status, 201);
    const site = { location: 'westus2', kind: 'functionapp,linux', properties: { httpsOnly: true, serverFarmId: planPath } };
    assert.equal((await api('PUT', appPath, site)).status, 201);
    for (const [name, binding] of [
      ['health', { type: 'httpTrigger', name: 'request', route: 'health', authLevel: 'anonymous', methods: ['get'] }],
      ['process', { type: 'orchestrationTrigger', name: 'context' }],
      ['timer', { type: 'timerTrigger', name: 'timer', schedule: '0 */5 * * * *' }],
    ]) assert.equal((await api('PUT', `${appPath}/functions/${name}`, { properties: { config: { bindings: [binding] } } })).status, 201);
    const started = await invoke('POST', '/runtime/webhooks/durabletask/orchestrators/process?instanceId=persisted-workflow', { waitForExternalEvent: 'approval' });
    assert.equal(started.status, 202);
    assert.equal((await invoke('GET', '/api/health')).status, 200);
    const before = await invoke('GET', '/runtime/webhooks/durabletask/instances/persisted-workflow?showHistory=true');
    assert.equal(before.status, 200);
    assert.equal(before.body.runtimeStatus, 'Running');
    for (const [method, body] of [['PUT', site], ['PUT', { ...site, tags: { stage: 'updated' } }]]) {
      assert.equal((await api(method, appPath, body)).status, 200);
      assert.equal((await invoke('GET', '/api/health')).status, 200, `${method} must retain HTTP routes`);
      const after = await invoke('GET', '/runtime/webhooks/durabletask/instances/persisted-workflow?showHistory=true');
      assert.equal(after.status, 200, `${method} must retain Durable state`);
      assert.deepEqual(after.body, before.body);
      const app = runtime.functionsRouter.apps.get(appName);
      assert.equal(app.functionResources.size, 3);
      assert.equal(app.triggers.get('timer').type, 'timerTrigger');
    }
    assert.ok([200, 202, 204].includes((await api('DELETE', appPath)).status));
    assert.equal((await invoke('GET', '/api/health')).status, 404);
    assert.equal((await api('PUT', appPath, site)).status, 201);
    assert.equal((await invoke('GET', '/api/health')).status, 404, 'Recreated app must not revive old routes');
    assert.equal((await invoke('GET', '/runtime/webhooks/durabletask/instances/persisted-workflow')).status, 404);
  } finally {
    for (const server of [arm, data]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await runtime.dispose();
  }
});
