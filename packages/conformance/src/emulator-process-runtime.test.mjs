import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

function json(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({ hostname: '127.0.0.1', port, method, path, headers: {
      authorization: 'Bearer globalstack-local-token', 'content-type': 'application/json',
      ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}), ...headers,
    } }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.setTimeout(5000, () => req.destroy(new Error('Process test request timed out')));
    req.on('error', reject);
    req.end(payload);
  });
}

test('documented full runtime handles ARM creation, real gateway delivery, rewiring and deletion', { timeout: 30000 }, async t => {
  const child = fork(fileURLToPath(new URL('../../../apps/emulator/server.mjs', import.meta.url)), [], {
    silent: true,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...Object.fromEntries([
      'ARM', 'BLOB', 'QUEUE', 'TABLE', 'KEY_VAULT', 'EDGE', 'APP_CONFIGURATION', 'EVENT_GRID', 'FUNCTIONS', 'KUBERNETES', 'SEARCH', 'API_MANAGEMENT',
    ].map(name => [`GLOBALSTACK_${name}_PORT`, '0'])) },
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000); });
  child.stdout.resume();
  const exited = once(child, 'exit');
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode) return;
    child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await exited; } finally { clearTimeout(force); }
  });
  const ready = await Promise.race([
    once(child, 'message').then(([message]) => message),
    exited.then(([code]) => { throw new Error(`Emulator exited before readiness (${code}): ${stderr}`); }),
  ]);
  assert.equal(ready.type, 'ready');
  const { arm, search, apiManagement } = ready.ports;
  const hits = [];
  const backend = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    hits.push({ path: req.url, body });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ received: body.correlationId, backendPath: req.url }));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  t.after(async () => { backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)); });
  const backendUrl = `http://127.0.0.1:${backend.address().port}/worker`;
  const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/rg-process';
  const armRequest = (method, path, body) => json(arm, method, `${path}?api-version=2023-05-01-preview`, body);
  assert.equal((await armRequest('PUT', group, { location: 'eastus2' })).status, 201);
  const searchPath = `${group}/providers/Microsoft.Search/searchServices/search-process`;
  assert.equal((await armRequest('PUT', searchPath, { location: 'eastus2', sku: { name: 'basic' }, properties: {} })).status, 201);
  const query = (method, path, body) => json(search, method, `${path}?api-version=2024-07-01`, body, { host: 'search-process.search.windows.net', 'api-key': 'local-synthetic-key' });
  assert.equal((await query('PUT', "/indexes('documents')", { name: 'documents', fields: [{ name: 'id', key: true, type: 'Edm.String' }] })).status, 201);
  await query('POST', "/indexes('documents')/docs/search.index", { value: [{ '@search.action': 'upload', id: 'doc-42' }] });
  await armRequest('PUT', searchPath, { location: 'eastus2', sku: { name: 'basic' }, properties: {} });
  assert.equal((await query('POST', "/indexes('documents')/docs/search", { search: '*' })).body.value[0].id, 'doc-42');

  const service = `${group}/providers/Microsoft.ApiManagement/service/gateway-process`;
  const serviceBody = { location: 'eastus2', sku: { name: 'Developer', capacity: 1 }, properties: { publisherName: 'Test', publisherEmail: 'test@example.com' } };
  assert.ok([201, 202].includes((await armRequest('PUT', service, serviceBody)).status));
  for (let i = 0; i < 4; i++) await armRequest('GET', service);
  const api = `${service}/apis/ingestion`;
  const apiBody = url => ({ properties: { displayName: 'Ingestion', path: 'documents', protocols: ['https'], serviceUrl: url, subscriptionRequired: false } });
  assert.equal((await armRequest('PUT', api, apiBody(backendUrl))).status, 201);
  const operation = `${api}/operations/upload`;
  const operationBody = { properties: { displayName: 'Upload', method: 'POST', urlTemplate: '/{id}' } };
  assert.equal((await armRequest('PUT', operation, operationBody)).status, 201);
  const gateway = id => json(apiManagement, 'POST', '/documents/file-42', { correlationId: id }, { host: 'gateway-process.azure-api.net' });
  const delivered = await gateway('process-correlation-42');
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.received, 'process-correlation-42');
  assert.equal(hits[0].path, '/worker/file-42');
  await armRequest('PUT', service, serviceBody);
  assert.equal((await gateway('after-parent-update')).status, 200);
  await armRequest('PUT', api, apiBody('http://127.0.0.1:1/unavailable'));
  assert.equal((await gateway('must-fail')).status, 502);
  assert.equal(hits.length, 2);
  await armRequest('PUT', api, apiBody(backendUrl));
  assert.equal((await gateway('recovered')).status, 200);
  assert.equal(hits.length, 3);
  await armRequest('DELETE', operation);
  assert.equal((await gateway('deleted-operation')).status, 404);
  await armRequest('PUT', operation, operationBody);
  await armRequest('DELETE', group);
  assert.equal((await gateway('deleted-group')).status, 404);
  assert.equal((await query('GET', '/indexes')).status, 404);
  assert.equal(hits.length, 3);
});
