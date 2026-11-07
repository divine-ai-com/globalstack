import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function queueEvents(body) {
  const messages = [...body.matchAll(/<MessageText>([\s\S]*?)<\/MessageText>/g)].map(match => match[1]
    .replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&'));
  return messages.flatMap(message => {
    let value;
    try { value = JSON.parse(message); }
    catch { value = JSON.parse(Buffer.from(message, 'base64').toString('utf8')); }
    const events = Array.isArray(value) ? value : [value];
    assert.ok(events.every(event => typeof event?.id === 'string' && typeof event?.eventType === 'string'), 'Unexpected queue event schema');
    return events;
  });
}

export async function deployEventTemplate({ request, scope, body, deadline, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const attempts = [];
  for (let number = 1; number <= 3; number++) {
    assert.ok(Date.now() < deadline, 'Eventing deployment deadline exceeded before submission');
    const attempt = { number, startedAt: new Date().toISOString() };
    attempts.push(attempt);
    const response = await request('PUT', `${scope.deployment}?api-version=2025-04-01`, body);
    attempt.initialStatus = response.status;
    if (![200, 201, 202].includes(response.status)) return { complete: false, attempts };
    while (true) {
      assert.ok(Date.now() < deadline, 'Eventing deployment deadline exceeded');
      const current = await request('GET', `${scope.deployment}?api-version=2025-04-01`);
      assert.equal(current.status, 200);
      attempt.terminalState = current.body?.properties?.provisioningState;
      if (['Succeeded', 'Failed', 'Canceled'].includes(attempt.terminalState)) break;
      await sleep(3000);
    }
    attempt.completedAt = new Date().toISOString();
    if (attempt.terminalState === 'Succeeded') return { complete: true, attempts };
    const operations = await request('GET', `${scope.deployment}/operations?api-version=2025-04-01`);
    assert.equal(operations.status, 200, 'Deployment operation evidence unavailable');
    assert.ok(!operations.body?.nextLink, 'Incomplete deployment operation evidence');
    const codes = [];
    function inspect(value) {
      if (!value || typeof value !== 'object') return;
      for (const [name, child] of Object.entries(value)) {
        if (name === 'code' && typeof child === 'string') codes.push(child);
        else inspect(child);
      }
    }
    inspect(operations.body);
    attempt.errorCodes = [...new Set(codes)];
    if (!codes.includes('Managed Identity Authorization Error') || codes.some(code => !['Managed Identity Authorization Error', 'DeploymentFailed', 'ResourceDeploymentFailure'].includes(code)) || number === 3) return { complete: false, attempts };
    const topic = await request('GET', `${scope.topic}?api-version=2025-02-15`);
    const role = await request('GET', `${scope.role}?api-version=2022-04-01`);
    attempt.identityMatchesRole = topic.status === 200 && role.status === 200
      && typeof topic.body?.identity?.principalId === 'string'
      && topic.body.identity.principalId === role.body?.properties?.principalId
      && role.body.properties.roleDefinitionId?.toLowerCase().endsWith('/c6a89b2d-59bc-44d0-9896-0f6e12d7b80a')
      && role.body.properties.scope?.toLowerCase() === (scope.roleScope ?? scope.queue).toLowerCase();
    if (!attempt.identityMatchesRole || Date.now() + 120000 >= deadline) return { complete: false, attempts };
    attempt.retryReason = 'Role exists for the same principal at the declared scope. Retry the unchanged deployment after a bounded delay; propagation is not yet established.';
    await sleep(120000);
  }
  return { complete: false, attempts };
}

export async function runBlobEventComponent({ manifest, scope, out, arm, exchange, phase, emit, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  const image = execFileSync('docker', ['image', 'inspect', 'globalstack/validation-runner:cli-pinned', '--format', '{{.Id}}'], { encoding: 'utf8' }).trim();
  phase('event-compile');
  emit('command-start', { target: 'azure', phase: 'event-compile', command: ['bicep', 'build', 'blob-events.bicep', '--stdout'] });
  const compiled = execFileSync('docker', ['run', '--rm', '--network', 'none', '-v', `${resolve('experiments/production-scenarios/fixtures')}:/fixture:ro`,
    '--entrypoint', '/root/.azure/bin/bicep', image, 'build', '/fixture/blob-events.bicep', '--stdout'], { encoding: 'utf8', timeout: 60000 });
  emit('command-end', { target: 'azure', phase: 'event-compile', exitCode: 0 });
  await writeFile(resolve(out, 'blob-events-template.json'), compiled, { mode: 0o600 });
  const body = { properties: { mode: 'Incremental', template: JSON.parse(compiled), parameters: Object.fromEntries(Object.entries({
    accountName: manifest.account, topicName: `gs-events-${manifest.runId}`, roleName: manifest.roleName, runId: manifest.runId, location: 'westus2',
  }).map(([name, value]) => [name, { value }])) } };
  const report = { image, templateSha256: createHash('sha256').update(compiled).digest('hex'),
    deploymentBodySha256: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
    scope: 'Blob creation through Event Grid with managed-identity delivery to a Storage Queue. This is not the complete document Functions path.', targets: {} };
  for (const target of ['azure', 'local']) {
    const result = report.targets[target] = { deploymentComplete: false, deliveryObserved: false, events: [] };
    const request = arm[target];
    try {
      phase('event-deploy');
      result.deployment = await deployEventTemplate({ request, scope, body, deadline: Math.min(Date.now() + 660000, manifest.deadline - 180000), sleep });
      assert.ok(result.deployment.complete, 'Eventing deployment did not complete');
      result.deploymentComplete = true;
      phase('event-configuration');
      for (const [id, version] of [[scope.topic, '2025-02-15'], [scope.subscription, '2025-02-15'], [scope.role, '2022-04-01']]) {
        assert.equal((await request('GET', `${id}?api-version=${version}`)).status, 200);
      }
      for (const name of ['event-landing', 'event-ignored']) {
        phase('event-container');
        assert.equal((await exchange(target, { surface: 'blob', method: 'PUT', path: `/${name}?restype=container` })).status, 201);
      }
      const subject = '/blobServices/default/containers/event-landing/blobs/tenant/document.txt';
      phase('event-upload');
      const upload = await exchange(target, { surface: 'blob', method: 'PUT', path: '/event-landing/tenant/document.txt',
        headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'text/plain' }, body: 'synthetic correlated event bytes' });
      assert.equal(upload.status, 201);
      phase('event-filtered-upload');
      assert.equal((await exchange(target, { surface: 'blob', method: 'PUT', path: '/event-ignored/tenant/document.txt',
        headers: { 'x-ms-blob-type': 'BlockBlob', 'content-type': 'text/plain' }, body: 'must be filtered' })).status, 201);
      const began = Date.now(), deliveries = new Map();
      phase('event-delivery');
      for (let attempt = 0; attempt < 60; attempt++) {
        assert.ok(Date.now() < manifest.deadline - 120000, 'Event delivery runtime exhausted');
        const response = await exchange(target, { surface: 'queue', method: 'GET', path: '/event-arrivals/messages?peekonly=true&numofmessages=32' });
        assert.equal(response.status, 200);
        for (const event of queueEvents(response.body)) deliveries.set(event.id, event);
        result.events = [...deliveries.values()];
        result.polls = attempt + 1;
        if (result.events.length) break;
        if (attempt < 59) await sleep(3000);
      }
      result.elapsedMs = Date.now() - began;
      assert.ok(result.events.length > 0, 'No Blob event reached the queue within the bounded observation');
      assert.ok(result.events.every(event => event.subject === subject), 'An event outside the subscribed container reached the queue');
      for (const event of result.events) {
        assert.equal(event.eventType, 'Microsoft.Storage.BlobCreated');
        assert.equal(event.topic.toLowerCase(), scope.account.toLowerCase());
        assert.equal(event.data.api, 'PutBlob');
        assert.equal(event.data.eTag.replaceAll('"', ''), upload.headers.etag.replaceAll('"', ''));
        assert.equal(event.data.contentLength, Buffer.byteLength('synthetic correlated event bytes'));
        assert.equal(event.data.url, `https://${manifest.account}.blob.core.windows.net/event-landing/tenant/document.txt`);
      }
      result.deliveryObserved = true;
      result.limitations = 'First delivery observed. The short filter observation is not exhaustive, and retries, denied identity, removal and Functions delivery are not evaluated.';
    } catch (error) { result.error = error.message; }
  }
  return report;
}
