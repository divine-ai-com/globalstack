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

  const firestore = services.find(service => service.key === 'firestore');
  assert.equal(firestore.supportClass, supportClasses.officialEmulatorBacked);
  assert.equal(countsTowardSeriousParity(firestore.supportClass), true);
  assert.match(firestore.supportClaim, /Official Google Firestore emulator-backed runtime/);

  const datastore = services.find(service => service.key === 'datastore-mode');
  assert.equal(datastore.supportClass, supportClasses.officialEmulatorBacked);
  assert.equal(countsTowardSeriousParity(datastore.supportClass), true);
  assert.match(datastore.supportClaim, /Official Google Firestore emulator-backed Datastore mode runtime/);

  const secretManager = services.find(service => service.key === 'secret-manager');
  assert.equal(secretManager.supportClass, supportClasses.boundedRuntime);
  assert.equal(countsTowardSeriousParity(secretManager.supportClass), false);
  assert.match(secretManager.supportClaim, /Bounded executable local Secret Manager runtime/);

  const kms = services.find(service => service.key === 'cloud-key-management');
  assert.equal(kms.supportClass, supportClasses.boundedRuntime);
  assert.equal(countsTowardSeriousParity(kms.supportClass), false);
  assert.match(kms.supportClaim, /Bounded executable local Cloud KMS runtime/);

  const logging = services.find(service => service.key === 'cloud-logging');
  assert.equal(logging.supportClass, supportClasses.boundedRuntime);
  assert.equal(countsTowardSeriousParity(logging.supportClass), false);
  assert.match(logging.supportClaim, /Bounded executable local Cloud Logging runtime/);

  const tasks = services.find(service => service.key === 'cloud-tasks');
  assert.equal(tasks.supportClass, supportClasses.boundedRuntime);
  assert.equal(countsTowardSeriousParity(tasks.supportClass), false);
  assert.match(tasks.supportClaim, /Bounded executable local Cloud Tasks runtime/);

  for (const service of services) {
    assert.match(service.engineStrategy, /\S/);
    if ([
      'cloud-storage',
      'pub-sub',
      'firestore',
      'datastore-mode',
      'secret-manager',
      'cloud-key-management',
      'cloud-logging',
      'cloud-tasks',
    ].includes(service.key)) continue;
    assert.equal(service.supportClass, supportClasses.unsupported);
    assert.equal(countsTowardSeriousParity(service.supportClass), false);
    assert.match(service.supportClaim, /Not implemented/);
  }
});
