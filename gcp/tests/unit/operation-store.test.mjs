import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OperationStore } from '../../src/operations/store.mjs';

test('operation store creates and completes Google-shaped long-running operations', () => {
  const store = new OperationStore();
  const created = store.create({
    projectId: 'globalstack-test',
    location: 'us-central1',
    target: 'projects/globalstack-test/buckets/b1',
    verb: 'create',
  });

  assert.match(created.name, /^projects\/globalstack-test\/locations\/us-central1\/operations\//);
  assert.equal(created.done, false);
  assert.equal(created.metadata.verb, 'create');

  const completed = store.complete(created.name, { name: 'b1' });
  assert.equal(completed.done, true);
  assert.deepEqual(completed.response, { name: 'b1' });
  assert.equal(store.get(created.name).done, true);
});
