import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProjectRegistry } from '../../src/project-registry/store.mjs';

test('project registry validates project ids and tracks services/resources', () => {
  const registry = new ProjectRegistry({ projectId: 'globalstack-test' });
  registry.enableService('globalstack-test', 'storage.googleapis.com');
  registry.putResource('globalstack-test', {
    name: 'projects/globalstack-test/buckets/b1',
    type: 'storage.googleapis.com/Bucket',
  });

  const project = registry.getProject('globalstack-test');
  assert.deepEqual(project.services, ['storage.googleapis.com']);
  assert.equal(project.resources[0].name, 'projects/globalstack-test/buckets/b1');
  assert.throws(() => registry.ensureProject('Invalid_Project'), /Invalid GCP project id/);
});
