import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const lower = value => String(value ?? '').toLowerCase();
function fingerprint(resource) {
  // Tags and provider readback fields do not require replacing the process.
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return createHash('sha256').update(JSON.stringify(canonical(resource))).digest('hex');
}

// The factory is trusted operator configuration, never supplied by ARM. It must
// release partial allocations before rejecting and honor cancellation promptly.
export function createNativeWorkloadLifecycle({ router, provision, accepts, configuration, bind }) {
  assert.equal(typeof provision, 'function', 'A native worker provisioner is required');
  const entries = new Map(), staticBindings = new Set(router.nativeWorkers.keys());
  let disposed = false;

  function reconcile(resource, remove = false) {
    const id = lower(resource.id);
    if (disposed && !remove) return;
    assert.ok(!staticBindings.has(id), 'Automatic and static worker bindings cannot own the same site');
    let entry = entries.get(id);
    const wanted = !remove && accepts(resource) ? fingerprint(configuration(resource)) : null;
    if (!entry && !wanted) return;
    if (entry?.wanted === wanted && !['failed', 'cleanup-failed'].includes(entry.state)) return;
    if (!entry) { entry = { task: Promise.resolve(), worker: null }; entries.set(id, entry); }
    entry.controller?.abort();
    entry.controller = new AbortController();
    const controller = entry.controller, snapshot = structuredClone(resource);
    entry.wanted = wanted;
    entry.state = wanted ? 'pending' : 'stopping';
    // Stop forwarding immediately, including during replacement or cancellation.
    router.nativeWorkers.delete(id);
    entry.task = entry.task.then(async () => {
      if (entry.worker) {
        try { await entry.worker.dispose(); entry.worker = null; }
        catch { entry.state = 'cleanup-failed'; return; }
      }
      if (controller.signal.aborted) return;
      if (!wanted) { entry.state = 'stopped'; return; }
      entry.state = 'starting';
      let worker;
      try {
        worker = await provision({ resource: snapshot, signal: controller.signal });
        assert.equal(typeof worker?.dispose, 'function', 'Worker cleanup is required');
        const bindings = bind([{ appResourceId: resource.id, origin: worker.origin, masterKeyFile: worker.masterKeyFile }]);
        if (controller.signal.aborted || disposed) {
          await worker.dispose(); worker = null; return;
        }
        const binding = bindings.get(id);
        if (worker.ready !== undefined) { assert.equal(typeof worker.ready, 'function'); binding.ready = worker.ready; }
        if (worker.eventGridFunctions !== undefined) {
          assert.ok(Array.isArray(worker.eventGridFunctions) && worker.eventGridFunctions.length <= 1000
            && worker.eventGridFunctions.every(value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(value)));
          binding.eventGridFunctions = new Set(worker.eventGridFunctions.map(lower));
        }
        entry.worker = worker;
        router.nativeWorkers.set(id, binding);
        entry.state = 'running';
      } catch (error) {
        if (typeof error.cleanup === 'function') { entry.worker = { dispose: error.cleanup }; entry.state = 'cleanup-failed'; return; }
        if (worker?.dispose) {
          try { await worker.dispose(); }
          catch { entry.worker = worker; entry.state = 'cleanup-failed'; return; }
        }
        if (!controller.signal.aborted) entry.state = 'failed';
      }
    });
  }
  return {
    sync: resource => reconcile(resource),
    remove: resource => reconcile(resource, true),
    status: id => entries.get(lower(id))?.state ?? 'unmanaged',
    async settle() { await Promise.all([...entries.values()].map(entry => entry.task)); },
    async dispose() {
      disposed = true;
      for (const id of entries.keys()) reconcile({ id }, true);
      await this.settle();
      if ([...entries.values()].some(entry => entry.worker)) throw new Error('Native worker cleanup is incomplete');
    },
  };
}
