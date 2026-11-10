import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDatabaseDiagnostic } from './database-diagnostic.mjs';

test('database diagnostic closes its pool and omits SQL errors from responses', async () => {
  let closed = false;
  const diagnostic = createDatabaseDiagnostic({ openPool: async () => ({
    query: async () => { throw new Error('private database hostname and credential'); },
    end: async () => { closed = true; },
  }) });
  assert.deepEqual(await diagnostic(), { status: 502, jsonBody: { database: 'unavailable' } });
  assert.equal(closed, true);
});
