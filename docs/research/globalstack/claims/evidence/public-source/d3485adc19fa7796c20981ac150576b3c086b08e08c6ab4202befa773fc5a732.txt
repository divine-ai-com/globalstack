import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { claimsOutcome } from './claims-outcome.mjs';

export async function exerciseClaims({ label, shouldPass = true, names, storage, publish, observations }) {
    const id = randomUUID(); const blobName = `${id}.json`;
    const input = { correlationId: id, claimId: 'CLAIM-001', evidence: 'synthetic claims evidence' };
    const bytes = JSON.stringify(input);
    const expectedRecord = { correlationId: id, claimId: input.claimId, blobName, sha256: createHash('sha256').update(bytes).digest('hex') };
    const event = { id, subject: 'claims/evidence', eventType: 'Claims.EvidenceSubmitted', eventTime: new Date().toISOString(), dataVersion: '1.0', data: { claimId: input.claimId, blobName } };
    const before = await observations();
    assert.equal((await storage.putBlob(names.blobContainerName, blobName, bytes, 'application/json')).status, 201);
    const published = await publish([event]); assert.equal(published.status, 200);
    const after = await observations();
    const seen = after.deliveries.slice(before.deliveries.length);
    const peek = await storage.peekQueueMessages(names.queueName, { maxMessages: 32 }); assert.equal(peek.status, 200);
    const allMessages = [...peek.body.matchAll(/<MessageText>(.*?)<\/MessageText>/g)].map(m => JSON.parse(Buffer.from(m[1], 'base64').toString()));
    const messages = allMessages.filter(item => item.correlationId === id);
    const entity = await storage.getTableEntity(names.tableName, 'claims', id);
    const ledger = { status: entity.status, body: JSON.parse(entity.body) };
    const outcome = claimsOutcome({ event, expectedRecord, deliveries: seen, messages, ledger });
    const observation = { label, input, event, expectedRecord, deliveries: seen, messages, ledger, publishStatus: published.status,
      boundaries: after.boundaries.slice(before.boundaries.length), workerErrors: after.workerErrors.slice(before.workerErrors.length), outcome, expectedOutcome: shouldPass };

    assert.deepEqual(observation.workerErrors, []); assert.equal(outcome, shouldPass);
    if (label === 'wrong-destination') { assert.deepEqual(seen.map(d => d.path), ['/wrong']); assert.equal(messages.length, 0); assert.equal(ledger.status, 404); }
    if (label === 'missing-subscription') { assert.equal(seen.length, 0); assert.equal(messages.length, 0); assert.equal(ledger.status, 404); }
    if (label === 'duplicate-subscription') { assert.equal(seen.length, 2); assert.equal(messages.length, 2); }
    return observation;
  }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assert.ok(process.env.CLAIMS_CONTEXT_PATH, 'CLAIMS_CONTEXT_PATH is required; management-only checks cannot satisfy this integration stage');
  const context = JSON.parse(await readFile(process.env.CLAIMS_CONTEXT_PATH, 'utf8'));
  for (const endpoint of Object.values(context.endpoints)) {
    const url = new URL(endpoint);
    assert.equal(url.protocol, 'http:', 'The local test context requires HTTP');
    assert.equal(url.hostname, '127.0.0.1', 'This test context supports local loopback endpoints only');
    assert.ok(url.port && !url.username && !url.password && !url.hash, 'Use an explicit local port without URL credentials or fragments');
  }
  const { AzuriteClient } = await import(pathToFileURL(context.storageClientModule));
  const storage = new AzuriteClient({ account: context.account, pathStyle: false,
    blobEndpoint: context.endpoints.blob, queueEndpoint: context.endpoints.queue, tableEndpoint: context.endpoints.table });
  const observations = async () => {
    const r = await fetch(context.endpoints.observations, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    assert.equal(r.status, 200); return r.json();
  };
  const publish = async events => {
    const r = await fetch(context.endpoints.event + '/api/events?api-version=2018-01-01', {
      method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
      headers: { 'aeg-sas-key': context.eventKey, 'content-type': 'application/json' }, body: JSON.stringify(events),
    });
    await r.arrayBuffer(); return { status: r.status };
  };
  const result = await exerciseClaims({ label: context.label ?? 'connected', shouldPass: context.expectedOutcome ?? true,
    names: context.names, storage, publish, observations });
  console.log(JSON.stringify(result));
}
