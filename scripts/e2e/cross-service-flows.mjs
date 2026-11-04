import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { localIdentity } from '../../packages/azure-control-plane/src/server-support.mjs';

export async function runCrossServiceFlow(kind) {
  assert.ok(['vault-enrichment', 'event-routing'].includes(kind));
  const servers = [];
  const boundaries = [];
  const deliveries = [];
  const episodes = [];
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store });
  async function listen(handler) {
    const server = createServer(handler);
    servers.push(server);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    return `http://127.0.0.1:${server.address().port}`;
  }
  function observe(service, host, handler) {
    return (req, res) => {
      const entry = { service, method: req.method, path: req.url, requestId: req.headers['x-correlation-id'] ?? null };
      res.once('finish', () => boundaries.push({ ...entry, status: res.statusCode }));
      // Each test-owned port represents one Azure hostname. Only transport routing is rewritten.
      req.headers.host = host;
      return handler(req, res);
    };
  }
  const receiver = await listen(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    deliveries.push({ path: req.url, body: JSON.parse(text) });
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"accepted":true}');
  });
  const vault = await listen(observe('key-vault', 'feed-config.vault.azure.net', runtime.keyVaultRouter.handler()));
  const events = await listen(observe('event-grid', 'feed-events.eastus-1.eventgrid.azure.net', runtime.eventGridRouter.handler()));
  const arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, workflowRunner: runtime.workflowRunner });
  servers.push(arm);
  await new Promise(resolve => arm.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${arm.address().port}`;
  const group = `/subscriptions/${localIdentity.subscriptionId}/resourceGroups/flow-${kind}`;
  const workflowPath = `${group}/providers/Microsoft.Logic/workflows/process-feed?api-version=2019-05-01`;
  const topicPath = `${group}/providers/Microsoft.EventGrid/topics/feed-events`;
  const subscriptionPath = `${topicPath}/providers/Microsoft.EventGrid/eventSubscriptions/deliver-feed?api-version=2020-06-01`;
  async function request(method, path, body) {
    const response = await fetch(`${endpoint}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${localIdentity.accessToken}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  function workflow(actions) {
    return { location: 'eastus', properties: { state: 'Enabled', definition: {
      $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
      contentVersion: '1.0.0.0', triggers: { manual: { type: 'Request', kind: 'Http', inputs: { schema: { type: 'object' } } } }, actions,
    } } };
  }
  function vaultWorkflow(secret = 'office') {
    return workflow({
      readConfig: { type: 'Http', inputs: { method: 'GET', uri: `${vault}/secrets/${secret}?api-version=7.4`, headers: {
        authorization: `Bearer ${localIdentity.accessToken}`, 'x-correlation-id': "@triggerBody()?['requestId']",
      } } },
      deliver: { type: 'Http', runAfter: { readConfig: ['Succeeded'] }, inputs: { method: 'POST', uri: `${receiver}/accepted`,
        headers: { 'content-type': 'application/json' }, body: { requestId: "@triggerBody()?['requestId']", course: "@triggerBody()?['course']", office: "@actions('readConfig').outputs.body.value" } } },
    });
  }
  function destination(path) { return { properties: { destination: { endpointType: 'WebHook', properties: { endpointUrl: `${receiver}${path}` } } } }; }
  async function configure(path, body) {
    const result = await request('PUT', path, body);
    assert.ok([200, 201, 202].includes(result.status), JSON.stringify(result));
    return result;
  }
  function expected(input) {
    const record = { requestId: input.requestId, course: input.course };
    return kind === 'vault-enrichment' ? { ...record, office: 'curriculum-office' } : [{
      id: input.requestId, subject: 'course-feed', eventType: 'Course.Ready', eventTime: input.eventTime, dataVersion: '1.0', data: record,
    }];
  }
  function assertOutcome(input) {
    const matched = deliveries.filter(d => d.path === '/accepted' && (kind === 'vault-enrichment' ? d.body.requestId : d.body[0]?.id) === input.requestId);
    assert.equal(matched.length, 1, 'Expected exactly one delivery at the intended receiver');
    assert.deepEqual(matched[0].body, expected(input));
  }
  async function invoke(label, expectedStatus, outcome) {
    const input = { requestId: randomUUID(), course: 'CS-101', eventTime: new Date().toISOString() };
    assert.equal((await request('GET', workflowPath)).status, 200);
    const result = await request('POST', `${workflowPath.split('?')[0]}/triggers/manual/run?api-version=2019-05-01`, input);
    assert.equal(result.status, 202, JSON.stringify(result));
    assert.equal(result.body.status, expectedStatus, JSON.stringify(result.body));
    const hop = boundaries.find(item => item.requestId === input.requestId);
    assert.ok(hop, 'The correlated request must reach the downstream service over HTTP');
    if (outcome) assertOutcome(input);
    else assert.throws(() => assertOutcome(input), assert.AssertionError);
    episodes.push({ label, input, requestId: input.requestId, workflowStatus: result.body.status,
      observedBoundaries: boundaries.filter(item => item.requestId === input.requestId),
      deliveries: deliveries.filter(item => (kind === 'vault-enrichment' ? item.body.requestId : item.body[0]?.id) === input.requestId),
      expectedOutcomeObserved: outcome, outcomeAssertionRejected: !outcome });
    return input;
  }
  let created = false;
  let cleanupVerified = false;
  try {
    await configure(`${group}?api-version=2021-04-01`, { location: 'eastus' });
    created = true;
    const resources = kind === 'vault-enrichment' ? [{ type: 'Microsoft.KeyVault/vaults', apiVersion: '2023-07-01', name: 'feed-config', location: 'eastus', properties: {
      tenantId: localIdentity.tenantId, sku: { family: 'A', name: 'standard' }, enableRbacAuthorization: true,
    } }, ...['office', 'wrong-office'].map(name => ({ type: 'Microsoft.KeyVault/vaults/secrets', apiVersion: '2023-07-01', name: `feed-config/${name}`,
      dependsOn: ["[resourceId('Microsoft.KeyVault/vaults', 'feed-config')]"], properties: { value: name === 'office' ? 'curriculum-office' : 'unrelated-office' } }))]
      : [{ type: 'Microsoft.EventGrid/topics', apiVersion: '2020-06-01', name: 'feed-events', location: 'eastus', properties: {} }];
    const deployment = `${group}/providers/Microsoft.Resources/deployments/flow?api-version=2021-04-01`;
    await configure(deployment, { properties: { mode: 'Incremental', template: { $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#', contentVersion: '1.0.0.0', resources } } });
    assert.equal((await request('GET', deployment)).body.properties.provisioningState, 'Succeeded');
    for (const resource of resources) {
      const types = resource.type.split('/'); const names = resource.name.split('/');
      const path = `${types[0]}/${types.slice(1).map((type, index) => `${type}/${names[index]}`).join('/')}`;
      assert.equal((await request('GET', `${group}/providers/${path}?api-version=${resource.apiVersion}`)).status, 200);
    }
    if (kind === 'vault-enrichment') {
      await configure(workflowPath, vaultWorkflow());
      await invoke('connected', 'Succeeded', true);
      await configure(workflowPath, vaultWorkflow('wrong-office'));
      const wrong = await invoke('wrong-config-reference', 'Succeeded', false);
      assert.equal(deliveries.find(d => d.body.requestId === wrong.requestId).body.office, 'unrelated-office');
      await configure(workflowPath, vaultWorkflow('missing'));
      const missing = await invoke('missing-config-reference', 'Failed', false);
      assert.equal(boundaries.find(b => b.requestId === missing.requestId).status, 404);
      await configure(workflowPath, vaultWorkflow());
      await invoke('restored', 'Succeeded', true);
    } else {
      const keys = await request('POST', `${topicPath}/listKeys?api-version=2020-06-01`, {});
      assert.equal(keys.status, 200);
      await configure(subscriptionPath, destination('/accepted'));
      await configure(workflowPath, workflow({ publish: { type: 'Http', inputs: { method: 'POST', uri: `${events}/api/events?api-version=2018-01-01`,
        headers: { 'aeg-sas-key': keys.body.key1, 'content-type': 'application/json', 'x-correlation-id': "@triggerBody()?['requestId']" },
        body: [{ id: "@triggerBody()?['requestId']", subject: 'course-feed', eventType: 'Course.Ready', eventTime: "@triggerBody()?['eventTime']", dataVersion: '1.0', data: { requestId: "@triggerBody()?['requestId']", course: "@triggerBody()?['course']" } }],
      } } }));
      await invoke('connected', 'Succeeded', true);
      assert.ok([200, 202, 204].includes((await request('DELETE', subscriptionPath)).status));
      await invoke('deleted-subscription', 'Succeeded', false);
      await configure(subscriptionPath, destination('/wrong'));
      const wrong = await invoke('wrong-destination', 'Succeeded', false);
      assert.ok(deliveries.some(d => d.path === '/wrong' && d.body[0]?.id === wrong.requestId));
      await configure(subscriptionPath, destination('/accepted'));
      await invoke('restored', 'Succeeded', true);
    }
    assert.equal((await request('GET', workflowPath)).status, 200);
  } finally {
    try {
      if (created) {
        assert.ok([200, 202, 204].includes((await request('DELETE', `${group}?api-version=2021-04-01`)).status));
        assert.equal((await request('GET', `${group}?api-version=2021-04-01`)).status, 404);
        assert.equal((await request('GET', workflowPath)).status, 404);
        const dataPlane = await fetch(kind === 'vault-enrichment' ? `${vault}/secrets/office?api-version=7.4` : `${events}/api/events?api-version=2018-01-01`, {
          method: kind === 'vault-enrichment' ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
          headers: { authorization: `Bearer ${localIdentity.accessToken}` },
        });
        await dataPlane.arrayBuffer();
        assert.equal(dataPlane.status, 404, 'Deleted resources must disappear from the data plane');
        cleanupVerified = true;
      }
    } finally {
      for (const server of servers.reverse()) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
      }
    }
  }
  return { scenario: kind, provenance: 'first-party', transport: 'real loopback HTTP; default workflow transport; test-owned ports route to fixed Azure hostnames', episodes, cleanupVerified,
    limits: ['No live Azure comparison', 'Local synchronous completion; no retry, ordering or eventual-delivery claim', 'Receiver is a test-owned HTTP application'] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const scenarios = [];
  for (const kind of ['vault-enrichment', 'event-routing']) scenarios.push(await runCrossServiceFlow(kind));
  await mkdir('dist/cross-service-flows', { recursive: true });
  let sourceRevision = null;
  try { sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { /* Source archives have no Git metadata. */ }
  await writeFile('dist/cross-service-flows/results.json', JSON.stringify({ sourceRevision, recordedAt: new Date().toISOString(), scenarios }, null, 2) + '\n');
  console.log('PASS: two cross-service flows, eight episodes, exact payload assertions and cleanup.');
}
