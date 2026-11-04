import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createServer, request as httpRequest } from 'node:http';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { createKeyVaultRouterServer } from '../../azure-data-plane/src/key-vault-router.mjs';
import { createEventGridRouterServer } from '../../azure-data-plane/src/event-grid-router.mjs';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { localIdentity } from '../../azure-control-plane/src/server-support.mjs';

const fixtures = new URL('../../../fixtures/upstream/azure-quickstarts/', import.meta.url);
const provenance = JSON.parse(await readFile(new URL('provenance.json', fixtures), 'utf8'));
const cases = [
  { file: 'storage-account-create.json', parameters: { storageAccountName: 'gsupstreamstorage' }, resources: [
    { path: 'Microsoft.Storage/storageAccounts/gsupstreamstorage', api: '2023-01-01', check: body => assert.equal(body.sku.name, 'Standard_LRS') },
  ] },
  { file: 'key-vault-create.json', parameters: { keyVaultName: 'gs-upstream-vault', secretName: 'example', secretValue: 'public-test-value' }, resources: [
    { path: 'Microsoft.KeyVault/vaults/gs-upstream-vault', api: '2023-07-01', check: body => assert.equal(body.properties.tenantId, localIdentity.tenantId) },
    { path: 'Microsoft.KeyVault/vaults/gs-upstream-vault/secrets/example', api: '2023-07-01', check: body => assert.equal(body.name, 'gs-upstream-vault/example') },
  ] },
  { file: 'event-grid.json', parameters: { eventGridTopicName: 'gs-upstream-topic', eventGridSubscriptionName: 'gs-upstream-subscription', eventGridSubscriptionUrl: 'http://127.0.0.1:1/events' }, resources: [
    { path: 'Microsoft.EventGrid/topics/gs-upstream-topic', api: '2020-06-01', check: body => assert.equal(body.name, 'gs-upstream-topic') },
    { path: 'Microsoft.EventGrid/topics/gs-upstream-topic/providers/Microsoft.EventGrid/eventSubscriptions/gs-upstream-subscription', api: '2020-06-01', check: body => assert.match(body.properties.destination.properties.endpointUrl, /^http:\/\/127\.0\.0\.1:/) },
  ] },
];

for (const scenario of cases) {
  test(`unmodified upstream template: ${scenario.file}`, async () => {
    const bytes = await readFile(new URL(scenario.file, fixtures));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.templates.find(entry => entry.file === scenario.file).sha256);
    const store = new ResourceStore();
    const runtime = createEmulatorRuntime({ store });
    const received = [];
    const misrouted = [];
    const webhook = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      (req.url === '/events' ? received : misrouted).push(JSON.parse(body));
      res.writeHead(200).end('{}');
    });
    const vaultServer = createKeyVaultRouterServer(runtime.keyVaultRouter);
    const eventServer = createEventGridRouterServer(runtime.eventGridRouter);
    const services = [webhook, vaultServer, eventServer];
    for (const service of services) await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
    const server = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const endpoint = `http://127.0.0.1:${server.address().port}`;
    const group = `/subscriptions/${localIdentity.subscriptionId}/resourceGroups/upstream-test`;
    async function request(method, path, body) {
      // Only digest-checked public fixtures are sent to this test-owned loopback server.
      const response = await fetch(`${endpoint}${path}`, {
        redirect: 'error',
        method, headers: { authorization: `Bearer ${localIdentity.accessToken}`, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : null };
    }
    try {
      assert.equal((await request('PUT', `${group}?api-version=2021-04-01`, { location: 'eastus' })).status, 201);
      const deployment = `${group}/providers/Microsoft.Resources/deployments/upstream?api-version=2021-04-01`;
      const values = { ...scenario.parameters };
      if (scenario.file === 'event-grid.json') values.eventGridSubscriptionUrl = `http://127.0.0.1:${webhook.address().port}/events`;
      const parameters = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
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
        if (resource.path.split('/').length === 3) assert.equal(result.body.location, 'eastus');
      }
      if (scenario.file === 'key-vault-create.json') {
        const result = await dataRequest(vaultServer, 'GET', '/secrets/example?api-version=7.4', {
          host: 'gs-upstream-vault.vault.azure.net', authorization: `Bearer ${localIdentity.accessToken}`,
        });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal(result.body.value, 'public-test-value');
      }
      if (scenario.file === 'event-grid.json') {
        const keys = await request('POST', `${group}/providers/Microsoft.EventGrid/topics/gs-upstream-topic/listKeys?api-version=2020-06-01`, {});
        assert.equal(keys.status, 200);
        const headers = { host: 'gs-upstream-topic.eastus-1.eventgrid.azure.net', 'aeg-sas-key': keys.body.key1 };
        const makeEvents = () => [{ id: randomUUID(), eventType: 'Preview.Test', subject: 'example', eventTime: new Date().toISOString(), dataVersion: '1.0', data: { value: 'delivered' } }];
        const publish = events => dataRequest(eventServer, 'POST', '/api/events?api-version=2018-01-01', headers, events);
        const events = makeEvents();
        assert.equal((await publish(events)).status, 200);
        assert.deepEqual(received, [events]);

        // A successful publish alone must not count as successful delivery.
        const subscription = scenario.resources[1];
        const subscriptionPath = `${group}/providers/${subscription.path}?api-version=${subscription.api}`;
        const subscriptionBody = (await request('GET', subscriptionPath)).body;
        assert.equal((await request('DELETE', subscriptionPath)).status, 200);
        assert.equal((await request('GET', subscriptionPath)).status, 404);
        const disconnected = makeEvents();
        assert.equal((await publish(disconnected)).status, 200);
        assert.ok(runtime.eventGridRouter.publishedEvents('gs-upstream-topic').some(event => event.id === disconnected[0].id));
        // Local delivery is awaited before the publish response, so this is not a timed sleep.
        assert.deepEqual(received, [events], 'A deleted subscription must stop webhook delivery');

        const wrongDestination = structuredClone(subscriptionBody);
        wrongDestination.properties.destination.properties.endpointUrl = `http://127.0.0.1:${webhook.address().port}/wrong-destination`;
        assert.equal((await request('PUT', subscriptionPath, wrongDestination)).status, 201);
        const miswired = makeEvents();
        assert.equal((await publish(miswired)).status, 200);
        assert.deepEqual(misrouted, [miswired]);
        assert.deepEqual(received, [events], 'Existing resources with a wrong destination must not satisfy delivery');

        assert.equal((await request('PUT', subscriptionPath, subscriptionBody)).status, 200);
        const restored = makeEvents();
        assert.equal((await publish(restored)).status, 200);
        assert.deepEqual(received, [events, restored], 'Restoring the subscription must restore delivery');
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
        for (const service of services) {
          service.closeAllConnections();
          await new Promise(resolve => service.close(resolve));
        }
        await runtime.dispose();
      }
    }
  });
}

function dataRequest(server, method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: server.address().port, method, path, headers: { ...headers, 'content-type': 'application/json' } }, res => {
      let text = '';
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: text ? JSON.parse(text) : null }));
    });
    req.setTimeout(10000, () => req.destroy(new Error('Local data-plane request timed out')));
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
