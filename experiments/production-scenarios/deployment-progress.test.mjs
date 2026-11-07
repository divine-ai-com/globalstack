import assert from 'node:assert/strict';
import { test } from 'node:test';
import { throttledDeploymentOperation } from './deployment-progress.mjs';

test('provider throttling is detected even when ARM still reports Running', () => {
  const operation = { properties: { provisioningState: 'Running', targetResource: { resourceType: 'Microsoft.Web/serverfarms' },
    statusMessage: { status: 'Failed', error: { code: '429', message: 'Plan creation is throttled.' } } } };
  assert.equal(throttledDeploymentOperation({ value: [operation] }), operation);
  assert.equal(throttledDeploymentOperation({ value: [{ properties: { statusMessage: JSON.stringify(operation.properties.statusMessage) } }] }).properties.statusMessage, JSON.stringify(operation.properties.statusMessage));
  assert.equal(throttledDeploymentOperation({ value: [{ properties: { statusMessage: { error: { code: 'TooManyRequests' } } } }] }).properties.statusMessage.error.code, 'TooManyRequests');
});

test('ordinary progress and unrelated errors are not classified as a throttle', () => {
  for (const statusMessage of [undefined, null, 'Not JSON', { status: 'Running' }, { status: 'Failed', error: { code: 'InvalidTemplate' } }]) {
    assert.equal(throttledDeploymentOperation({ value: [{ properties: { statusMessage } }] }), null);
  }
  assert.equal(throttledDeploymentOperation(), null);
});

test('retained live provider failure is classified without claiming a successful paired rerun', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const base = new URL('./evidence/web-hosting-throttled-4cabc7d/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const cancellation = JSON.parse(await readFile(new URL('operator-cancellation.json', base), 'utf8'));
  const provider = cancellation.events.find(e => e.path.includes('/operations?'));
  const operation = throttledDeploymentOperation(provider.body);
  assert.ok(operation);
  assert.equal(operation.properties.provisioningState, 'Running');
  assert.equal(operation.properties.statusMessage.error.code, '429');
  assert.equal(cancellation.events.at(-1).method, 'POST');
  assert.equal(cancellation.events.at(-1).status, 204);
  const report = JSON.parse(await readFile(new URL('result.json', base), 'utf8'));
  assert.notEqual(report.observationsComplete, true);
  assert.equal(report.error, 'Azure hosting deployment failed');
  assert.deepEqual(report.cleanup, { groupAbsent: true, plansAbsent: true, deploymentAbsent: true });
  assert.ok(report.localCleanup.every(code => code === 404));
});

test('live provider-validation guard rejects the run before allocation or provisioning', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const base = new URL('./evidence/web-preflight-guard-af998e5/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base), 'utf8'));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = JSON.parse(await readFile(new URL('result.json', base), 'utf8'));
  assert.equal(report.cleanup.provisioningNotStarted, true);
  assert.ok(report.preflightAbsence.every(code => code === 404));
  assert.equal(report.budget.ledger, undefined);
  assert.equal(report.exchanges.some(e => e.target === 'azure' && ['PUT', 'DELETE'].includes(e.method)), false);
  const validation = report.exchanges.filter(e => e.phase === 'provider-validation');
  assert.deepEqual(validation.map(e => e.status), [400, 200]);
  assert.deepEqual(validation[0].request, validation[1].request);
  assert.equal(report.observationsComplete, undefined);
});

test('live nested throttle automatically cancels the owned deployment and verifies teardown', async () => {
  const { readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const base = new URL('./evidence/web-throttle-guard-7638f46/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
    assert.equal(bytes.length, metadata.bytes);
  }
  const report = JSON.parse(await readFile(new URL('result.json', base)));
  assert.equal(report.sourceDirty, false);
  assert.equal(report.error, 'Azure hosting creation is throttled; cancel this attempt and clean up');
  assert.notEqual(report.observationsComplete, true);
  const provider = report.exchanges.find(e => e.target === 'azure' && e.phase === 'azure-deploy' && throttledDeploymentOperation(e.body));
  assert.ok(provider);
  assert.ok(report.exchanges.some(e => e.target === 'azure' && e.phase === 'cleanup' && e.method === 'POST' && e.path.includes('/cancel?') && e.status === 204));
  assert.deepEqual(report.cleanup, { groupAbsent: true, plansAbsent: true, deploymentAbsent: true });
  assert.deepEqual(report.localCleanup, [404, 404, 404]);
  assert.equal(report.budget.ledger.allocatedUsd, 22);
});
