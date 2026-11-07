import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { validateDeployment } from '../../packages/azure-control-plane/src/deployment-validation.mjs';
import { httpExchange } from './http-exchange.mjs';

const base = new URL('./evidence/web-hosting-abf979f/', import.meta.url);
const report = JSON.parse(await readFile(new URL('result.json', base), 'utf8'));
const azure = phase => report.exchanges.find(row => row.target === 'azure' && row.phase === phase);

test('hosting evidence preserves the Azure success, local rejection and verified teardown', async () => {
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  assert.equal(report.observationsComplete, true);
  assert.equal(report.sourceDirty, false);
  assert.deepEqual(report.cleanup, { groupAbsent: true, plansAbsent: true, deploymentAbsent: true });
  assert.ok(report.localCleanup.every(code => code === 404));
  assert.equal(report.fullProtocolParityEvaluated, false);
  assert.equal(report.exchanges.find(row => row.phase === 'local-deploy').status, 501);
});

test('independent hosting names reproduce captured SKU defaults and preserve state after invalid PUT', async t => {
  const arm = createArmServer({ store: new ResourceStore() });
  await new Promise(done => arm.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => { arm.closeAllConnections(); arm.close(done); }));
  const group = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/independent-hosting';
  const api = (method, path, body) => httpExchange(`http://127.0.0.1:${arm.address().port}${path}?api-version=2024-11-01`, {
    method, body, headers: { authorization: 'Bearer globalstack-local-token' },
  });
  assert.equal((await api('PUT', group, { location: 'westus2' })).status, 201);
  for (const [sku, name] of [['P0v3', 'independent-ingress'], ['EP1', 'independent-processor']]) {
    const path = `${group}/providers/Microsoft.Web/serverfarms/${name}`;
    const body = structuredClone(azure(`${sku}-unchanged-put`).request);
    assert.equal((await api('PUT', path, body)).status, 201);
    const read = await api('GET', path);
    assert.equal(read.status, 200);
    assert.equal(read.body.globalstack.emulationDepth, 'metadata-only-control-plane');
    assert.deepEqual(read.body.globalstack.backingEngines, []);
    assert.deepEqual(read.body.sku, azure(`${sku}-read`).body.sku);
    for (const key of ['reserved', 'numberOfWorkers', 'currentNumberOfWorkers', 'perSiteScaling', 'elasticScaleEnabled', 'maximumElasticWorkerCount', 'zoneRedundant']) {
      assert.equal(read.body.properties[key], azure(`${sku}-read`).body.properties[key], key);
    }
    for (const phase of [`${sku}-unchanged-put`, `${sku}-tag-update`]) {
      const captured = azure(phase);
      assert.equal((await api('PUT', path, captured.request)).status, captured.status);
    }
    // Settle the existing local read-driven lifecycle before testing failed writes.
    for (let i = 0; i < 3; i++) await api('GET', path);
    const state = result => { const { globalstack: diagnostics, ...resource } = result.body; return resource; };
    const before = state(await api('GET', path));
    const invalid = azure(`${sku}-invalid-sku`);
    const rejected = await api('PUT', path, invalid.request);
    assert.equal(rejected.status, invalid.status);
    assert.deepEqual(rejected.body, invalid.body);
    assert.deepEqual(state(await api('GET', path)), before);
    const unrelatedBadSku = await api('PUT', path, { ...body, sku: { ...body.sku, name: 'DifferentInvalidSku' } });
    assert.equal(unrelatedBadSku.status, 400, 'Validation must not special-case the capture name');
    assert.deepEqual(state(await api('GET', path)), before);
    for (const unsupported of [{ ...body, sku: { ...body.sku, capacity: 2 } }, { ...body, properties: { ...body.properties, zoneRedundant: true } }]) {
      assert.equal((await api('PUT', path, unsupported)).status, 501);
      assert.deepEqual(state(await api('GET', path)), before);
    }
  }
  assert.ok([200, 202, 204].includes((await api('DELETE', group)).status));
  for (const name of ['independent-ingress', 'independent-processor']) assert.equal((await api('GET', `${group}/providers/Microsoft.Web/serverfarms/${name}`)).status, 404);
});

test('bounded provider validation accepts the captured plan shapes without resource mutation', async () => {
  const captured = report.exchanges.find(row => row.phase === 'azure-deploy' && row.method === 'PUT');
  const body = JSON.parse(JSON.stringify(captured.request).replaceAll('<group>', 'validation-only-group').replaceAll('<service>', 'validation-only-service'));
  const result = validateDeployment({ subscriptionId: '00000000-0000-0000-0000-000000000000', deploymentName: 'hosting-check', body });
  assert.equal(result.status, 200);
  assert.equal(result.body.properties.validatedResources.length, 3);
  const nested = body.properties.template.resources.find(r => r.type === 'Microsoft.Resources/deployments');
  nested.properties.template.resources[0].sku.capacity = 2;
  assert.equal(validateDeployment({ subscriptionId: '00000000-0000-0000-0000-000000000000', deploymentName: 'hosting-check', body }).status, 501);
});
