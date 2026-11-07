import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { compareBlobEvents } from './compare-blob-events.mjs';

const base = new URL('./evidence/blob-events-after-2ee7731/', import.meta.url);
const load = async name => JSON.parse(await readFile(new URL(name, base)));

test('fresh paired event comparison is reproducible from retained HTTP evidence', async () => {
  const index = await load('index.json');
  for (const [file, expected] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(file, base));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256);
    assert.equal(bytes.length, expected.bytes);
  }
  assert.deepEqual(compareBlobEvents(await load('result.json')), await load('comparison.json'));
});

test('reported success cannot hide missing events, wrong bytes, different templates or incomplete cleanup', async () => {
  for (const mutation of ['missing-event', 'wrong-bytes', 'wrong-template', 'wrong-identity', 'cleanup', 'state']) {
    const result = await load('result.json');
    const local = result.exchanges.filter(exchange => exchange.target === 'local');
    if (mutation === 'missing-event') for (const exchange of local.filter(item => item.phase === 'event-delivery')) exchange.body = '<QueueMessagesList />';
    if (mutation === 'wrong-bytes') local.find(item => item.phase === 'event-upload').request.body = 'different source bytes';
    if (mutation === 'wrong-template') local.find(item => item.phase === 'event-deploy' && item.method === 'PUT').request.properties.template.resources.pop();
    if (mutation === 'wrong-identity') local.find(item => item.phase === 'event-configuration' && item.body.type === 'Microsoft.Authorization/roleAssignments').body.properties.principalId = 'foreign';
    if (mutation === 'cleanup') result.cleanup.roleAbsent = false;
    if (mutation === 'state') local.find(item => item.phase === 'event-deploy' && item.method === 'GET').body.properties.provisioningState = 'Running';
    assert.throws(() => compareBlobEvents(result), undefined, mutation);
  }
});
