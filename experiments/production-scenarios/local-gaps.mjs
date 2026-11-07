import { createServer, request } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createSearchRouter, createSearchRouterServer } from '../../packages/azure-data-plane/src/search-router.mjs';
import { createApiManagementRouter, createApiManagementRouterServer } from '../../packages/azure-data-plane/src/api-management-router.mjs';

const out = resolve(process.argv[2] ?? 'reports/production-scenarios/local-gaps');
await mkdir(out, { recursive: true, mode: 0o700 });
const results = [], exchanges = [], servers = [];
const report = { scope: 'Local diagnostic probes, not Azure-paired observations or complete application tests.',
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  sourceDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
  startedAt: new Date().toISOString(), results, exchanges };
async function listen(server) {
  servers.push(server);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  return server.address().port;
}
async function json(port, host, method, path, body, extra = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  const startedAt = new Date().toISOString();
  const response = await new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method,
      headers: { host, 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...extra } }, res => {
      let raw = '';
      res.setEncoding('utf8'); res.on('data', chunk => { raw += chunk; });
      res.on('end', () => { let body; try { body = JSON.parse(raw); } catch { body = raw; } done({ status: res.statusCode, body }); });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Diagnostic request timed out')));
    req.on('error', fail); req.end(payload);
  });
  exchanges.push({ startedAt, completedAt: new Date().toISOString(), host, method, path, request: body ?? null, response });
  return response;
}
const note = (id, assertion, passed, observed) => results.push({ id, assertion, status: passed ? 'pass' : 'fail', observed, evidenceClass: 'local-observation', azurePaired: false });
try {
  const search = createSearchRouter();
  search.registerService({ serviceName: 'diagnostic-search' });
  const port = await listen(createSearchRouterServer(search));
  const query = (method, path, body, auth = { 'api-key': 'diagnostic-placeholder' }) => json(port, 'diagnostic-search.search.windows.net', method, `${path}?api-version=2024-07-01`, body, auth);
  await query('PUT', "/indexes('docs')", { name: 'docs', fields: [
    { name: 'id', type: 'Edm.String', key: true, searchable: false },
    { name: 'text', type: 'Edm.String', searchable: true },
    { name: 'tenant', type: 'Edm.String', filterable: true },
  ] });
  await query('POST', "/indexes('docs')/docs/search.index", { value: [
    { '@search.action': 'upload', id: 'a', text: 'financial report', tenant: 'alpha' },
    { '@search.action': 'upload', id: 'b', text: 'private report', tenant: 'beta' },
  ] });
  const fuzzy = await query('POST', "/indexes('docs')/docs/search", { search: 'financal~1', queryType: 'full' });
  note('search-fuzzy', 'A one-edit fuzzy term finds the known clean document.', fuzzy.status === 200 && fuzzy.body.value?.some(item => item.id === 'a'), fuzzy);
  const vector = await query('POST', "/indexes('docs')/docs/search", { vectorQueries: [{ kind: 'vector', vector: [1, 0], fields: 'missing-vector-field', k: 1 }] });
  note('search-invalid-vector', 'A vector query against an undefined field is rejected.', vector.status >= 400, vector);
  const keys = await query('PUT', "/indexes('badkeys')", { name: 'badkeys', fields: [
    { name: 'a', type: 'Edm.String', key: true }, { name: 'b', type: 'Edm.String', key: true },
  ] });
  note('search-multiple-keys', 'An index cannot have two key fields.', keys.status >= 400, keys);
  let hits = 0;
  const backendPort = await listen(createServer((_req, res) => { hits++; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ sentinel: 'actual-backend' })); }));
  const apim = createApiManagementRouter();
  apim.registerService({ serviceName: 'diagnostic-gateway' });
  apim.registerApi({ serviceName: 'diagnostic-gateway', apiId: 'research', properties: { path: 'research', serviceUrl: `http://127.0.0.1:${backendPort}`, subscriptionRequired: false } });
  apim.registerOperation({ serviceName: 'diagnostic-gateway', apiId: 'research', operationId: 'root', properties: { method: 'GET', urlTemplate: '/' } });
  const gatewayPort = await listen(createApiManagementRouterServer(apim));
  const forwarded = await json(gatewayPort, 'diagnostic-gateway.azure-api.net', 'GET', '/research');
  note('apim-backend-forwarding', 'The gateway invokes the configured backend and returns its response.', hits === 1 && forwarded.body.sentinel === 'actual-backend', { ...forwarded, backendHits: hits });
} finally {
  await Promise.all(servers.map(server => { server.closeAllConnections(); return new Promise(done => server.close(done)); }));
  report.completedAt = new Date().toISOString();
  await writeFile(resolve(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ directory: out, checks: results.length, failed: results.filter(item => item.status === 'fail').map(item => item.id) }, null, 2));
process.exitCode = results.some(item => item.status === 'fail') ? 1 : 0;
