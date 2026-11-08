import test from 'node:test';
import assert from 'node:assert/strict';
import { documentPaths, documentClient, cleanupDocument } from './document-cleanup.mjs';
import { documentPairedClient, cleanupDocumentPaired } from './document-paired-cleanup.mjs';
import { workerPaths } from './worker-cleanup.mjs';

const m = { subscription: '00000000-0000-0000-0000-000000000000', group: 'gs-paired-test', runId: '123456abcdef',
  publisher: '11111111-1111-4111-8111-111111111111', token: 'synthetic-token',
  roles: Array.from({ length: 7 }, (_, i) => `22222222-2222-4222-8222-22222222222${i}`),
  documentRoles: Array.from({ length: 3 }, (_, i) => `33333333-3333-4333-8333-33333333333${i}`) };

test('document client confines mutations to the owned account, topic and deployments', async () => {
  const d = documentPaths(m), w = workerPaths({ ...m, roles: m.roles.slice(0, 6) });
  const observed = [];
  const exchange = async url => { observed.push(new URL(url).pathname); return { status: 404 }; };
  const request = documentClient(m, () => {}, exchange);
  await request('GET', `${d.account}?api-version=2023-05-01`);
  await request('GET', `${w.identity}?api-version=2023-01-31`);
  for (const [method, path] of [['DELETE', d.group], ['PUT', w.storage], ['POST', `${d.account}/listKeys`],
    ['DELETE', `${d.account}-foreign`]]) await assert.rejects(request(method, path), /allowlist/);
  assert.deepEqual(observed, [d.account, w.identity]);
  const combined = documentPairedClient(m, () => {}, exchange);
  await combined('GET', `${d.topic}?api-version=2025-02-15`);
  await combined('GET', `${w.identity}?api-version=2023-01-31`);
});

test('document client refreshes an expired token once', async () => {
  const d = documentPaths(m), headers = [];
  const request = documentClient({ ...m, token: 'old-token', config: '/synthetic-config' }, () => {},
    async (_url, options) => {
      headers.push(options.headers.authorization);
      return headers.length === 1 ? { status: 401, body: { error: { code: 'ExpiredAuthenticationToken' } } } : { status: 200, body: {} };
    }, () => 'new-token');
  assert.equal((await request('GET', `${d.account}?api-version=2023-05-01`)).status, 200);
  assert.deepEqual(headers, ['Bearer old-token', 'Bearer new-token']);
});

test('foreign document resource prevents any cleanup mutation', async () => {
  const d = documentPaths(m), mutations = [];
  const request = async (method, path) => {
    if (method !== 'GET') mutations.push(path);
    const id = path.split('?')[0];
    if (id === d.account) return { status: 200, body: { tags: { run: 'foreign', project: 'globalstack-production-scenarios' } } };
    return { status: 404 };
  };
  await assert.rejects(cleanupDocument(m, request));
  assert.deepEqual(mutations, []);
});

test('paired cleanup checks document ownership before touching worker resources', async () => {
  const d = documentPaths(m), mutations = [];
  const request = async (method, path) => {
    if (method !== 'GET') mutations.push(path);
    if (path.split('?')[0] === d.account) return { status: 200, body: { tags: { run: 'foreign', project: 'globalstack-production-scenarios' } } };
    return { status: 404 };
  };
  await assert.rejects(cleanupDocumentPaired(m, request));
  assert.deepEqual(mutations, []);
});

test('document cleanup retries a transient ownership read without submitting a mutation', async () => {
  const d = documentPaths(m), mutations = [];
  let accountReads = 0;
  const request = async (method, path) => {
    if (method !== 'GET') mutations.push(path);
    if (path.split('?')[0] === `${d.group}/resources`) return { status: 200, body: { value: [] } };
    if (path.split('?')[0] === d.group) return { status: 200 };
    if (path.split('?')[0] === d.account && accountReads++ === 0) return { status: 429, headers: { 'retry-after': '0' } };
    return { status: 404 };
  };
  const result = await cleanupDocument(m, request, { sleep: async () => {} });
  assert.equal(result.resourcesAbsent, true);
  assert.equal(accountReads, 3);
  assert.deepEqual(mutations, []);
});

test('document cleanup removes only owned resources and retains the group', async () => {
  const d = documentPaths(m), w = workerPaths({ ...m, roles: m.roles.slice(0, 6) });
  const live = new Set([...d.resources, ...d.deployments]);
  let inventoryReads = 0;
  const workerPrincipal = '44444444-4444-4444-8444-444444444444';
  const topicPrincipal = '55555555-5555-4555-8555-555555555555';
  const deleted = [];
  const request = async (method, path) => {
    const id = path.split('?')[0];
    if (id === d.group) return { status: 200 };
    if (id === `${d.group}/resources`) return { status: 200, body: { value: inventoryReads++ === 0
      ? [{ id: d.account, tags: { run: m.runId, project: 'globalstack-production-scenarios' } }] : [] } };
    if (id === w.identity) return { status: 200, body: { properties: { principalId: workerPrincipal } } };
    if (method === 'DELETE') {
      deleted.push(id);
      live.delete(id);
      if (id === d.account) for (const child of [d.blobService, ...d.containers]) live.delete(child);
      return { status: 202 };
    }
    if (method === 'POST') return { status: 202 };
    if (!live.has(id)) return { status: 404 };
    if (d.deployments.includes(id)) return { status: 200, body: { properties: { provisioningState: 'Succeeded', parameters: { runId: { value: m.runId } } } } };
    const roleIndex = d.roles.indexOf(id);
    if (roleIndex >= 0) return { status: 200, body: { properties: { description: `globalstack-production-scenarios:${m.runId}`,
      scope: d.account, principalId: [m.publisher, workerPrincipal, topicPrincipal][roleIndex],
      roleDefinitionId: `/subscriptions/${m.subscription}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe` } } };
    if (id === d.topic) return { status: 200, body: { identity: { principalId: topicPrincipal },
      tags: { run: m.runId, project: 'globalstack-production-scenarios' }, properties: { source: d.account } } };
    if (id === d.eventSubscription) return { status: 200, body: { properties: { destination: { properties: {
      resourceId: `${d.group}/providers/Microsoft.Web/sites/${d.service}-worker/functions/documentUploaded` } } } } };
    return { status: 200, body: { tags: { run: m.runId, project: 'globalstack-production-scenarios' } } };
  };
  const result = await cleanupDocument(m, request, { sleep: async () => {} });
  assert.equal(result.resourcesAbsent, true);
  assert.equal(live.size, 0);
  assert.ok(deleted.indexOf(d.eventSubscription) < deleted.indexOf(d.topic));
  assert.ok(deleted.indexOf(d.topic) < deleted.indexOf(d.account));
  assert.equal(inventoryReads, 2);
  assert.ok(!deleted.includes(d.group));
});
