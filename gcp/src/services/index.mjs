import { createService as createComputeService } from './compute/service.mjs';
import { createService as createKmsService } from './kms/service.mjs';
import { createService as createLoggingService } from './logging/service.mjs';
import { createService as createPubSubService } from './pubsub/service.mjs';
import { createService as createSecretManagerService } from './secret-manager/service.mjs';
import { createService as createStorageService } from './storage/service.mjs';

export function createDefaultServices(options = {}) {
  return [
    createComputeService(options.compute),
    createKmsService(options.kms),
    createLoggingService(options.logging),
    createPubSubService(options.pubsub),
    createSecretManagerService(options.secretManager),
    createStorageService(options.storage),
  ];
}
