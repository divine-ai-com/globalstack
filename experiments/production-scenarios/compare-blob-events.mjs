import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { queueEvents } from './blob-event-component.mjs';

export function compareBlobEvents(result) {
  assert.equal(result.sourceDirty, false, 'Capture must identify a committed revision');
  assert.ok(Object.values(result.cleanup ?? {}).length === 6 && Object.values(result.cleanup).every(value => value === true), 'All cloud cleanup checks must pass');
  const observations = {}, checks = [];
  function check(name, operation) { operation(); checks.push(name); }
  for (const target of ['azure', 'local']) {
    const exchanges = result.exchanges.filter(exchange => exchange.target === target);
    const selected = phase => exchanges.filter(exchange => exchange.phase === phase);
    const submitted = selected('event-deploy').find(exchange => exchange.method === 'PUT');
    assert.ok(submitted && [200, 201, 202].includes(submitted.status), `${target}: deployment submission failed`);
    const terminal = selected('event-deploy').filter(exchange => exchange.method === 'GET' && !exchange.path.includes('/operations?')).at(-1);
    assert.equal(terminal?.body?.properties?.provisioningState, 'Succeeded', `${target}: deployment did not succeed`);
    const upload = selected('event-upload')[0];
    assert.equal(upload?.status, 201, `${target}: upload did not succeed`);
    const messages = selected('event-delivery').flatMap(exchange => {
      assert.equal(exchange.status, 200, `${target}: queue observation failed`);
      return queueEvents(exchange.body);
    });
    assert.ok(messages.length > 0, `${target}: no real queue event`);
    const events = [...new Map(messages.map(event => [event.id, event])).values()];
    const configuration = selected('event-configuration');
    assert.equal(configuration.length, 3);
    assert.ok(configuration.every(exchange => exchange.status === 200));
    const topic = configuration.find(exchange => exchange.body?.type === 'Microsoft.EventGrid/systemTopics')?.body;
    const subscription = configuration.find(exchange => exchange.body?.type === 'Microsoft.EventGrid/systemTopics/eventSubscriptions')?.body;
    const role = configuration.find(exchange => exchange.body?.type === 'Microsoft.Authorization/roleAssignments')?.body;
    check(`${target}: source, destination and identity references`, () => {
      assert.ok(topic?.identity?.principalId);
      assert.equal(role?.properties?.principalId, topic.identity.principalId);
      assert.equal(role?.properties?.scope?.toLowerCase(), topic.properties.source.toLowerCase());
      assert.equal(subscription?.properties?.deliveryWithResourceIdentity?.destination?.properties?.resourceId?.toLowerCase(), topic.properties.source.toLowerCase());
    });
    for (const event of events) {
      check(`${target}: BlobCreated event correlates with uploaded bytes`, () => {
        assert.equal(event.eventType, 'Microsoft.Storage.BlobCreated');
        assert.equal(event.data?.api, 'PutBlob');
        assert.equal(event.data.eTag, upload.headers.etag.replaceAll('"', ''));
        assert.equal(event.data.contentLength, Buffer.byteLength(upload.request.body));
        assert.equal(event.topic.toLowerCase(), topic.properties.source.toLowerCase());
        assert.equal(event.subject, '/blobServices/default/containers/event-landing/blobs/tenant/document.txt');
        assert.equal(event.data.url, 'https://<storage-account>.blob.core.windows.net/event-landing/tenant/document.txt');
        assert.ok(Number.isFinite(Date.parse(event.eventTime)));
        assert.match(event.data.sequencer, /^[a-f0-9]+$/i);
      });
    }
    observations[target] = { submitted, events, pollWindowMs: result.eventObservations.targets[target].elapsedMs };
  }
  check('identical deployed template and parameters', () => assert.deepEqual(observations.azure.submitted.request, observations.local.submitted.request));
  const stable = event => ({ subject: event.subject, eventType: event.eventType, dataVersion: event.dataVersion, metadataVersion: event.metadataVersion,
    data: Object.fromEntries(['api', 'contentType', 'contentLength', 'blobType', 'accessTier'].map(key => [key, event.data[key]])) });
  check('selected event schema and payload fields', () => assert.deepEqual(stable(observations.azure.events[0]), stable(observations.local.events[0])));
  return { scope: 'Selected Blob-to-Event-Grid-to-Queue contracts. Not full application or protocol parity.',
    selectedComparisonPassed: true, revision: result.revision, checks,
    observedUniqueEvents: Object.fromEntries(Object.entries(observations).map(([target, data]) => [target, data.events.length])),
    observedPollWindowMs: Object.fromEntries(Object.entries(observations).map(([target, data]) => [target, data.pollWindowMs])),
    initialDeploymentStates: Object.fromEntries(Object.entries(observations).map(([target, data]) => [target, data.submitted.body?.properties?.provisioningState ?? null])),
    exclusions: ['Full Functions/scanning/SQL/Search flow', 'Azure Portal screenshots', 'Exhaustive negative-filter timing',
      'Role revocation and retries on live Azure', 'Durable delivery across emulator restarts', 'Full ARM asynchronous lifecycle',
      'All response headers and messages', 'Exact event timing, random identifiers and opaque sequencer encoding'],
    cleanupVerified: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output] = process.argv.slice(2);
  const comparison = compareBlobEvents(JSON.parse(await readFile(input, 'utf8')));
  await writeFile(output, JSON.stringify(comparison, null, 2) + '\n');
  console.log(JSON.stringify({ selectedComparisonPassed: true, checks: comparison.checks.length, output }));
}
