import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countsTowardSeriousParity, supportClasses } from '../../src/services/support-classes.mjs';
import { listServices } from '../../src/services/catalog.mjs';

test('first GCP service bucket is explicit about supported and unsupported claims', () => {
  const services = listServices();
  assert.equal(services.length, 8);
  const storage = services.find(service => service.key === 'cloud-storage');
  assert.equal(storage.supportClass, supportClasses.boundedRuntime);
  assert.equal(countsTowardSeriousParity(storage.supportClass), false);
  assert.match(storage.supportClaim, /Bounded local runtime/);

  const pubsub = services.find(service => service.key === 'pub-sub');
  assert.equal(pubsub.supportClass, supportClasses.officialEmulatorBacked);
  assert.equal(countsTowardSeriousParity(pubsub.supportClass), true);
  assert.match(pubsub.supportClaim, /Official Google Pub\/Sub emulator-backed runtime/);

  for (const service of services) {
    assert.match(service.engineStrategy, /\S/);
    if (['cloud-storage', 'pub-sub'].includes(service.key)) continue;
    assert.equal(service.supportClass, supportClasses.unsupported);
    assert.equal(countsTowardSeriousParity(service.supportClass), false);
    assert.match(service.supportClaim, /Not implemented/);
  }
});
