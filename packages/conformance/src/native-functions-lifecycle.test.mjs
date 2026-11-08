import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeFunctionsLifecycle } from '../../azure-data-plane/src/native-functions-lifecycle.mjs';
import { createEmulatorRuntime } from '../../azure-data-plane/src/emulator-runtime.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';

const id = '/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/workers/providers/Microsoft.Web/sites/native-app';
const site = (image = 'image-one') => ({ id, name: 'native-app', kind: 'functionapp,linux,container', properties: {
  serverFarmId: 'plan', siteConfig: { linuxFxVersion: `DOCKER|${image}`, appSettings: [{ name: 'SETTING', value: 'one' }] },
} });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(provision) {
  const router = { nativeWorkers: new Map() };
  return { router, lifecycle: createNativeFunctionsLifecycle({ router, provision }) };
}

test('native lifecycle replaces changed configuration, ignores tags and cleans deletion', async () => {
  const events = [];
  const { router, lifecycle } = fixture(async ({ resource }) => {
    const image = resource.properties.siteConfig.linuxFxVersion;
    events.push(`start:${image}`);
    return { origin: 'http://127.0.0.1:1234', dispose: async () => { events.push(`stop:${image}`); } };
  });
  lifecycle.sync(site()); await lifecycle.settle();
  assert.equal(lifecycle.status(id), 'running'); assert.ok(router.nativeWorkers.has(id.toLowerCase()));
  lifecycle.sync({ ...site(), tags: { changed: 'yes' } }); await lifecycle.settle();
  assert.equal(events.length, 1);
  lifecycle.sync(site('image-two')); assert.equal(router.nativeWorkers.size, 0);
  await lifecycle.settle();
  assert.deepEqual(events, ['start:DOCKER|image-one', 'stop:DOCKER|image-one', 'start:DOCKER|image-two']);
  lifecycle.remove({ id }); await lifecycle.settle();
  assert.equal(lifecycle.status(id), 'stopped'); assert.equal(router.nativeWorkers.size, 0);
  assert.equal(events.at(-1), 'stop:DOCKER|image-two');
  await lifecycle.dispose();
});

test('delete while startup is pending cancels and disposes the late worker without binding it', async () => {
  const started = deferred(), release = deferred(); let stopped = 0, signal;
  const { router, lifecycle } = fixture(async input => {
    signal = input.signal; started.resolve(); await release.promise;
    return { origin: 'http://127.0.0.1:1234', dispose: async () => { stopped++; } };
  });
  lifecycle.sync(site()); await started.promise;
  lifecycle.remove({ id }); assert.equal(signal.aborted, true);
  release.resolve(); await lifecycle.settle();
  assert.equal(stopped, 1); assert.equal(router.nativeWorkers.size, 0); assert.equal(lifecycle.status(id), 'stopped');
});

test('invalid upstreams and provisioning failures fail closed and can be retried', async () => {
  let attempt = 0, stopped = 0;
  const { router, lifecycle } = fixture(async () => {
    attempt++;
    if (attempt === 1) throw new Error('private diagnostic must not become status');
    return { origin: attempt === 2 ? 'https://public.example' : 'http://127.0.0.1:1234', dispose: async () => { stopped++; } };
  });
  for (const expected of ['failed', 'failed', 'running']) {
    lifecycle.sync(site()); await lifecycle.settle(); assert.equal(lifecycle.status(id), expected);
    assert.equal(router.nativeWorkers.size, expected === 'running' ? 1 : 0);
  }
  assert.equal(stopped, 1); await lifecycle.dispose(); assert.equal(stopped, 2);
});

test('failed cleanup prevents replacement and remains visible until cleanup succeeds', async () => {
  let fail = true, started = 0;
  const { router, lifecycle } = fixture(async () => {
    started++;
    return { origin: 'http://127.0.0.1:1234', dispose: async () => { if (fail) throw new Error('cleanup'); } };
  });
  lifecycle.sync(site()); await lifecycle.settle(); lifecycle.sync(site('replacement')); await lifecycle.settle();
  assert.equal(lifecycle.status(id), 'cleanup-failed'); assert.equal(started, 1); assert.equal(router.nativeWorkers.size, 0);
  await assert.rejects(lifecycle.dispose(), /cleanup is incomplete/);
  fail = false; await lifecycle.dispose();
});

test('runtime site lifecycle invokes only the operator provisioner for container Functions', async () => {
  let started = 0, stopped = 0;
  const store = new ResourceStore();
  const runtime = createEmulatorRuntime({ store, nativeFunctionsProvisioner: async () => {
    started++; return { origin: 'http://127.0.0.1:1234', dispose: async () => { stopped++; } };
  } });
  const event = { store, providerRoute: { subscriptionId: '00000000-0000-0000-0000-000000000000', resourceGroup: 'workers', namespace: 'Microsoft.Web', typePath: 'sites/native-app' }, resourceType: 'Microsoft.Web/sites', resource: site() };
  runtime.syncResource(event); await runtime.nativeFunctionsLifecycle.settle();
  assert.equal(started, 1); assert.equal(runtime.functionsRouter.hasNativeWorker(id), true);
  runtime.unsyncResource(event); await runtime.nativeFunctionsLifecycle.settle();
  assert.equal(stopped, 1); assert.equal(runtime.functionsRouter.hasNativeWorker(id), false);
  await runtime.dispose();
});

test('partial factory cleanup remains owned until disposal succeeds', async () => {
  let cleaned = 0;
  const { lifecycle } = fixture(async () => { throw Object.assign(new Error('startup'), { cleanup: async () => { cleaned++; } }); });
  lifecycle.sync(site()); await lifecycle.settle();
  assert.equal(lifecycle.status(id), 'cleanup-failed');
  await lifecycle.dispose(); assert.equal(cleaned, 1);
});

test('worker replacement removes stale discovered Event Grid names', async () => {
  const { router, lifecycle } = fixture(async ({ resource }) => ({ origin: 'http://127.0.0.1:1234', dispose: async () => {},
    eventGridFunctions: resource.properties.siteConfig.linuxFxVersion === 'DOCKER|image-one' ? ['oldTrigger'] : ['newTrigger'] }));
  lifecycle.sync(site()); await lifecycle.settle();
  assert.deepEqual([...router.nativeWorkers.get(id.toLowerCase()).eventGridFunctions], ['oldtrigger']);
  lifecycle.sync(site('image-two')); await lifecycle.settle();
  assert.deepEqual([...router.nativeWorkers.get(id.toLowerCase()).eventGridFunctions], ['newtrigger']);
  await lifecycle.dispose();
});
