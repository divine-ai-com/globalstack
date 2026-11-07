import assert from 'node:assert/strict';
import { mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// All paid component runners share this path regardless of their output folder.
export const productionBudgetPath = fileURLToPath(new URL('../../reports/production-scenarios/budget-ledger.json', import.meta.url));

async function update(path, change) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lock = await open(`${path}.lock`, 'wx', 0o600);
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    let state;
    try { state = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { schemaVersion: 1, totalAuthorizedUsd: 150, priorAllowanceUsd: 20, allocations: [] };
    }
    assert.equal(state.schemaVersion, 1);
    assert.equal(state.totalAuthorizedUsd, 150);
    assert.ok(Number.isFinite(state.priorAllowanceUsd) && state.priorAllowanceUsd >= 20);
    assert.ok(Array.isArray(state.allocations));
    assert.ok(state.allocations.every(item => Number.isFinite(item.envelopeUsd) && item.envelopeUsd > 0 && typeof item.cleanupVerified === 'boolean'));
    const result = change(state);
    await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
    return result;
  } finally {
    await rm(temporary, { force: true });
    await lock.close();
    await rm(`${path}.lock`);
  }
}

export async function reserveBudget(path, { runId, envelopeUsd, purpose }) {
  assert.match(runId, /^[a-f0-9]{12}$/);
  assert.ok(Number.isFinite(envelopeUsd) && envelopeUsd > 0);
  return update(path, state => {
    assert.ok(state.allocations.every(item => item.cleanupVerified), 'Reconcile the previous allocation and verified cleanup before another paid run');
    assert.ok(!state.allocations.some(item => item.runId === runId), 'Run already has an allocation');
    const allocatedUsd = state.priorAllowanceUsd + state.allocations.reduce((sum, item) => sum + item.envelopeUsd, 0) + envelopeUsd;
    assert.ok(allocatedUsd <= state.totalAuthorizedUsd, 'Experiment allocation exceeds the authorized total');
    state.allocations.push({ runId, envelopeUsd, purpose, reservedAt: new Date().toISOString(), cleanupVerified: false });
    return { totalAuthorizedUsd: state.totalAuthorizedUsd, allocatedUsd, remainingUnallocatedUsd: state.totalAuthorizedUsd - allocatedUsd };
  });
}

export async function confirmBudgetCleanup(path, runId) {
  return update(path, state => {
    const allocation = state.allocations.find(item => item.runId === runId);
    assert.ok(allocation, 'Unknown run allocation');
    allocation.cleanupVerified = true;
    allocation.cleanupVerifiedAt = new Date().toISOString();
    // Keep the complete envelope charged against the experiment allowance.
    // Delayed Azure billing is not grounds to refund a reservation automatically.
  });
}
