import { nativeWorkerBindings } from './native-functions-worker.mjs';
import { createNativeWorkloadLifecycle } from './native-workload-lifecycle.mjs';

const lower = value => String(value ?? '').toLowerCase();
export function isNativeFunction(resource) {
  return lower(resource?.kind).split(',').map(value => value.trim()).includes('functionapp')
    && /^DOCKER\|/i.test(resource?.properties?.siteConfig?.linuxFxVersion ?? '');
}

export function createNativeFunctionsLifecycle(options) {
  return createNativeWorkloadLifecycle({ ...options, accepts: isNativeFunction, bind: nativeWorkerBindings,
    configuration: resource => ({ identity: resource.identity, siteConfig: resource.properties?.siteConfig,
      serverFarmId: resource.properties?.serverFarmId }) });
}
