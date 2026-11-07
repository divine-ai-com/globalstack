import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { reserveBudget, confirmBudgetCleanup } from './budget-ledger.mjs';

async function ledger(t) {
  const directory = await mkdtemp(join(tmpdir(), 'gs-budget-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'ledger.json');
}

test('actual ledger prevents overlapping runs, preserves allowances after cleanup and enforces the total', async t => {
  const path = await ledger(t);
  assert.deepEqual(await reserveBudget(path, { runId: 'aa1111111111', envelopeUsd: 1, purpose: 'test' }), { totalAuthorizedUsd: 150, allocatedUsd: 21, remainingUnallocatedUsd: 129 });
  await assert.rejects(reserveBudget(path, { runId: 'bb2222222222', envelopeUsd: 1 }), /previous allocation/);
  await confirmBudgetCleanup(path, 'aa1111111111');
  assert.equal((await reserveBudget(path, { runId: 'bb2222222222', envelopeUsd: 129 })).remainingUnallocatedUsd, 0);
  await confirmBudgetCleanup(path, 'bb2222222222');
  await assert.rejects(reserveBudget(path, { runId: 'cc3333333333', envelopeUsd: 1 }), /exceeds/);
  await assert.rejects(confirmBudgetCleanup(path, 'cc3333333333'), /Unknown/);
  assert.equal(JSON.parse(await readFile(path)).allocations.length, 2);
});

test('concurrent reservation requests cannot both allocate against the same balance', async t => {
  const path = await ledger(t);
  const result = await Promise.allSettled(['dd4444444444', 'ee5555555555'].map(runId => reserveBudget(path, { runId, envelopeUsd: 100 })));
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(JSON.parse(await readFile(path)).allocations.length, 1);
});
