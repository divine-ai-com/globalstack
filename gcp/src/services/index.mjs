import { createService as createComputeService } from './compute/service.mjs';
import { createService as createPubSubService } from './pubsub/service.mjs';
import { createService as createSecretManagerService } from './secret-manager/service.mjs';
import { createService as createStorageService } from './storage/service.mjs';

export function createDefaultServices(options = {}) {
  return [
    createComputeService(options.compute),
    createPubSubService(options.pubsub),
    createSecretManagerService(options.secretManager),
    createStorageService(options.storage),
  ];
}
