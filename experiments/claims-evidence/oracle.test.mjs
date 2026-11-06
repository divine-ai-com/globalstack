import assert from 'node:assert/strict';
import { test } from 'node:test';
import { claimsOutcome } from './terraform/test/claims-outcome.mjs';

test('claims outcome requires the event, queue record and ledger together', () => {
  const event = { id: 'case-1', data: { blobName: 'case-1.json' } };
  const expectedRecord = { correlationId: 'case-1', claimId: 'CLAIM-001', blobName: 'case-1.json', sha256: 'expected-hash' };
  const good = { event, expectedRecord, deliveries: [{ path: '/claims', body: [structuredClone(event)] }],
    messages: [structuredClone(expectedRecord)], ledger: { status: 200, body: { PartitionKey: 'claims', RowKey: 'case-1', ...expectedRecord, status: 'queued' } } };
  assert.equal(claimsOutcome(good), true);
  for (const mutate of [
    d => { d.deliveries = []; },
    d => { d.deliveries[0].path = '/wrong'; },
    d => { d.deliveries.push(structuredClone(d.deliveries[0])); },
    d => { d.messages.push(structuredClone(d.messages[0])); },
    d => { d.messages[0].sha256 = 'wrong'; },
    d => { d.ledger.body.status = 'incomplete'; },
    d => { d.ledger.body.RowKey = 'other'; },
    d => { d.ledger.status = 404; },
  ]) {
    const bad = structuredClone(good); mutate(bad); assert.equal(claimsOutcome(bad), false);
  }
});

test('the integration entry point cannot fall back to management-only checks', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync(process.execPath, [new URL('./terraform/test/claims-behavior.int.test.mjs', import.meta.url).pathname], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CLAIMS_CONTEXT_PATH is required/);
});
