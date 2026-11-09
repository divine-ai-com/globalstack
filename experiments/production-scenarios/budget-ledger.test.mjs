import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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

test('authorized USD 200 ceiling accepts the next run while retaining earlier allocations', async t => {
  const path = await ledger(t);
  await writeFile(path, JSON.stringify({ schemaVersion: 1, totalAuthorizedUsd: 200, priorAllowanceUsd: 20,
    allocations: [{ runId: 'aa1111111111', envelopeUsd: 125, purpose: 'earlier runs', cleanupVerified: true }] }));
  assert.deepEqual(await reserveBudget(path, { runId: 'bb2222222222', envelopeUsd: 12, purpose: 'paired run' }),
    { totalAuthorizedUsd: 200, allocatedUsd: 157, remainingUnallocatedUsd: 43 });
  await confirmBudgetCleanup(path, 'bb2222222222');
  assert.equal(JSON.parse(await readFile(path)).allocations.length, 2);
});

test('authorized USD 225 ceiling retains earlier allowances and permits a USD 12 Search run', async t => {
  const path = await ledger(t);
  await writeFile(path, JSON.stringify({ schemaVersion: 1, totalAuthorizedUsd: 225, priorAllowanceUsd: 20,
    allocations: [{ runId: 'aa1111111111', envelopeUsd: 173, purpose: 'earlier runs', cleanupVerified: true }] }));
  assert.deepEqual(await reserveBudget(path, { runId: 'bb2222222222', envelopeUsd: 12, purpose: 'Search replay' }),
    { totalAuthorizedUsd: 225, allocatedUsd: 205, remainingUnallocatedUsd: 20 });
  await confirmBudgetCleanup(path, 'bb2222222222');
});

test('repeated recovery preserves the first cleanup verification time', async t => {
  const path = await ledger(t);
  await reserveBudget(path, { runId: 'aa1111111111', envelopeUsd: 12, purpose: 'paired run' });
  await confirmBudgetCleanup(path, 'aa1111111111');
  const first = JSON.parse(await readFile(path)).allocations[0].cleanupVerifiedAt;
  await confirmBudgetCleanup(path, 'aa1111111111');
  assert.equal(JSON.parse(await readFile(path)).allocations[0].cleanupVerifiedAt, first);
});

test('Search, Storage and hosting retain their combined allowances across runs', async t => {
  const path = await ledger(t);
  for (const [index, purpose, envelopeUsd] of [[1, 'Search', 2], [2, 'Storage', 1], [3, 'Hosting', 1]]) {
    const runId = String(index).padStart(12, '0');
    await reserveBudget(path, { runId, purpose, envelopeUsd });
    await assert.rejects(reserveBudget(path, { runId: '999999999999', purpose: 'Other component', envelopeUsd: 1 }), /previous allocation/);
    await confirmBudgetCleanup(path, runId);
  }
  const state = JSON.parse(await readFile(path));
  assert.equal(state.priorAllowanceUsd + state.allocations.reduce((sum, item) => sum + item.envelopeUsd, 0), 24);
  assert.deepEqual(state.allocations.map(item => item.purpose), ['Search', 'Storage', 'Hosting']);
  await assert.rejects(reserveBudget(path, { runId: '999999999999', envelopeUsd: 127 }), /exceeds/);
  assert.deepEqual(JSON.parse(await readFile(path)), state);
});
