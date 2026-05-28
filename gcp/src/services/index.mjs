import { createService as createComputeService } from './compute/service.mjs';
import { createService as createStorageService } from './storage/service.mjs';

export function createDefaultServices(options = {}) {
  return [
    createComputeService(options.compute),
    createStorageService(options.storage),
  ];
}
