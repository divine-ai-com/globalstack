import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { statfs } from 'node:fs/promises';
import { ResourceStore } from '../../packages/core/src/resource-store.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { createEmulatorRuntime } from '../../packages/azure-data-plane/src/emulator-runtime.mjs';
import { httpExchange } from './http-exchange.mjs';

const subscription = '00000000-0000-0000-0000-000000000000', groupName = 'gs-document-replay';
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'The local replay needs a clean source revision');
const disk = await statfs(process.cwd());
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, 'At least 40 GiB free is required');
const group = `/subscriptions/${subscription}/resourceGroups/${groupName}`, runId = 'a1b2c3d4e5f6';
const service = `gs${runId}`, accountName = `${service}docs`, workerName = `${service}-worker`, topicName = `${service}-documents`;
const workerIdentity = `${group}/providers/Microsoft.ManagedIdentity/userAssignedIdentities/${workerName}`;
const worker = `${group}/providers/Microsoft.Web/sites/${workerName}`;
const eventFunction = `${worker}/functions/documentUploaded`;
const expectedHashes = { 'document-data': 'ab8308b2532861e533eea99718cba24971346f3b50587e4a6a9940390f9a706e',
  'document-events': 'd5c3938d5eb0d6f00f2dd88ba0cb7b44c199b27f6d815aae13103e6b6a5abc09' };
const store = new ResourceStore(), runtime = createEmulatorRuntime({ store });
// This probe isolates ARM template acceptance. The actual native Functions
// discovery and event delivery are measured by separate tests and paired runs.
const functionsRouter = { hasNativeWorker: id => id.toLowerCase() === worker.toLowerCase(),
  hasNativeEventGridFunction: id => id.toLowerCase() === eventFunction.toLowerCase() };
const arm = createArmServer({ store, onResourcePut: runtime.syncResource, onResourceDelete: runtime.unsyncResource, functionsRouter });
await new Promise(done => arm.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${arm.address().port}`;
const request = (method, path, body) => httpExchange(origin + path, { method, body, headers: { authorization: 'Bearer globalstack-local-token' } });
const result = { sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'Local ARM deployment of the exact frozen document data and Event Grid templates with a synthetic Function discovery adapter. No native worker, event delivery, Azure rerun or full workflow.',
  templates: [], deployments: [], cleanup: false };
try {
  assert.equal((await request('PUT', `${group}?api-version=2022-09-01`, { location: 'westus2' })).status, 201);
  const principal = '11111111-1111-4111-8111-111111111111';
  store.resources.set(workerIdentity.toLowerCase(), { id: workerIdentity, name: workerName, type: 'Microsoft.ManagedIdentity/userAssignedIdentities',
    location: 'westus2', properties: { principalId: principal } });
  store.resources.set(worker.toLowerCase(), { id: worker, name: workerName, type: 'Microsoft.Web/sites',
    location: 'westus2', properties: { state: 'Running' } });
  for (const [name, values] of [
    ['document-data', { accountName, workerIdentityName: workerName, publisherPrincipalId: '22222222-2222-4222-8222-222222222222',
      roleAssignmentNames: [randomUUID(), randomUUID()], location: 'westus2' }],
    ['document-events', { accountName, workerName, topicName, deadLetterRoleName: randomUUID(), location: 'westus2' }],
  ]) {
    const text = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${process.cwd()}/experiments/production-scenarios/document-infra:/fixture:ro`,
      '--entrypoint', '/root/.azure/bin/bicep', 'globalstack/validation-runner:cli-pinned', 'build', `/fixture/${name}.bicep`, '--stdout'],
    { encoding: 'utf8', timeout: 60000 });
    const sha256 = createHash('sha256').update(text).digest('hex');
    assert.equal(sha256, expectedHashes[name], 'Bicep source or compiler changed since the Azure capture');
    result.templates.push({ name, sha256 });
    const deployment = `${group}/providers/Microsoft.Resources/deployments/gs-${name}-local`;
    const body = { properties: { mode: 'Incremental', template: JSON.parse(text), parameters: Object.fromEntries(
      Object.entries({ ...values, runId }).map(([key, value]) => [key, { value }])) } };
    const response = await request('PUT', `${deployment}?api-version=2025-04-01`, body);
    result.deployments.push({ name, status: response.status, state: response.body?.properties?.provisioningState,
      error: response.body?.error?.code });
    assert.equal(response.body?.properties?.provisioningState, 'Succeeded', `${name} local deployment failed: ${JSON.stringify(response.body?.error)}`);
  }
  const topic = store.resources.get(`${group}/providers/Microsoft.EventGrid/systemTopics/${topicName}`.toLowerCase());
  const subscriptionResource = store.resources.get(`${group}/providers/Microsoft.EventGrid/systemTopics/${topicName}/eventSubscriptions/document-revisions`.toLowerCase());
  assert.ok(topic?.identity?.principalId && subscriptionResource);
  result.eventSubscriptionPresent = true;
} catch (error) {
  result.error = error.message;
} finally {
  await runtime.dispose();
  arm.closeAllConnections();
  await new Promise(done => arm.close(done));
  result.cleanup = true;
}
console.log(JSON.stringify(result, null, 2));
if (result.error) process.exitCode = 1;
