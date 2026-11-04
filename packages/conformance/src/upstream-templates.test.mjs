import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { localIdentity } from '../../azure-control-plane/src/server-support.mjs';

const fixtures = new URL('../../../fixtures/upstream/azure-quickstarts/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('provenance.json', fixtures), 'utf8'));
const cases = [
  { file: 'storage-account-create.json', parameters: { storageAccountName: 'gsupstreamstorage' }, resources: [
    { path: 'Microsoft.Storage/storageAccounts/gsupstreamstorage', api: '2023-01-01', check: body => assert.equal(body.sku.name, 'Standard_LRS') },
  ] },
  { file: 'key-vault-create.json', parameters: { keyVaultName: 'gs-upstream-vault', secretName: 'example', secretValue: 'public-test-value', tenantId: localIdentity.tenantId }, resources: [
    { path: 'Microsoft.KeyVault/vaults/gs-upstream-vault', api: '2023-07-01', check: body => assert.equal(body.properties.tenantId, localIdentity.tenantId) },
    { path: 'Microsoft.KeyVault/vaults/gs-upstream-vault/secrets/example', api: '2023-07-01', check: body => assert.equal(body.name, 'gs-upstream-vault/example') },
  ] },
  { file: 'event-grid.json', parameters: { eventGridTopicName: 'gs-upstream-topic', eventGridSubscriptionName: 'gs-upstream-subscription', eventGridSubscriptionUrl: 'http://127.0.0.1:1/events' }, resources: [
    { path: 'Microsoft.EventGrid/topics/gs-upstream-topic', api: '2020-06-01', check: body => assert.equal(body.name, 'gs-upstream-topic') },
    { path: 'Microsoft.EventGrid/topics/gs-upstream-topic/providers/Microsoft.EventGrid/eventSubscriptions/gs-upstream-subscription', api: '2020-06-01', check: body => assert.equal(body.properties.destination.properties.endpointUrl, 'http://127.0.0.1:1/events') },
  ] },
];

for (const scenario of cases) {
  test(`unmodified upstream template: ${scenario.file}`, async () => {
    const bytes = await readFile(new URL(scenario.file, fixtures));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.templates.find(entry => entry.file === scenario.file).sha256);
    const server = createArmServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const group = `/subscriptions/${localIdentity.subscriptionId}/resourceGroups/upstream-test`;
    async function request(method, path, body) {
      const response = await fetch(`${endpoint}${path}`, {
        method, headers: { authorization: `Bearer ${localIdentity.accessToken}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    }
    try {
      assert.equal((await request('PUT', `${group}?api-version=2021-04-01`, { location: 'eastus' })).status, 201);
      const deployment = `${group}/providers/Microsoft.Resources/deployments/upstream?api-version=2021-04-01`;
      const parameters = Object.fromEntries(Object.entries(scenario.parameters).map(([key, value]) => [key, { value }]));
      if (scenario.file === 'event-grid.json') {
        const template = JSON.parse(bytes);
        template.resources = [template.resources[1]];
        const missingScope = await request('PUT', deployment, { properties: { mode: 'Incremental', template, parameters } });
        assert.equal(missingScope.status, 404);
        assert.equal(missingScope.body.error.code, 'ResourceNotFound');
        template.resources[0].scope = `/subscriptions/${localIdentity.subscriptionId}/resourceGroups/another-group/providers/Microsoft.EventGrid/topics/missing`;
        const outsideGroup = await request('PUT', deployment, { properties: { mode: 'Incremental', template, parameters } });
        assert.equal(outsideGroup.status, 501);
        assert.equal(outsideGroup.body.error.code, 'GlobalStackUnsupportedResourceScope');
      }
      const result = await request('PUT', deployment, { properties: { mode: 'Incremental', template: JSON.parse(bytes), parameters } });
      assert.ok([200, 201, 202].includes(result.status), JSON.stringify(result.body));
      assert.equal((await request('GET', deployment)).body.properties.provisioningState, 'Succeeded');
      if (scenario.file === 'event-grid.json') {
        const template = JSON.parse(bytes);
        template.resources.reverse();
        assert.ok([200, 201, 202].includes((await request('PUT', deployment, { properties: { mode: 'Incremental', template, parameters } })).status));
      }
      for (const resource of scenario.resources) {
        const result = await request('GET', `${group}/providers/${resource.path}?api-version=${resource.api}`);
        assert.equal(result.status, 200, JSON.stringify(result.body));
        resource.check(result.body);
      }
    } finally {
      try {
        assert.ok([200, 202, 204].includes((await request('DELETE', `${group}?api-version=2021-04-01`)).status));
        assert.equal((await request('GET', `${group}?api-version=2021-04-01`)).status, 404);
        for (const resource of scenario.resources) {
          assert.equal((await request('GET', `${group}/providers/${resource.path}?api-version=${resource.api}`)).status, 404);
        }
      } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    }
  });
}
