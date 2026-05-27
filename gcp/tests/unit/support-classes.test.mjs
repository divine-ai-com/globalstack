import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countsTowardSeriousParity, supportClasses } from '../../src/services/support-classes.mjs';
import { listServices } from '../../src/services/catalog.mjs';

test('first GCP service bucket starts with no GlobalStack support claims', () => {
  const services = listServices();
  assert.equal(services.length, 8);
  for (const service of services) {
    assert.equal(service.supportClass, supportClasses.unsupported);
    assert.equal(countsTowardSeriousParity(service.supportClass), false);
    assert.match(service.engineStrategy, /\S/);
    assert.match(service.supportClaim, /Not implemented/);
  }
});
