import { createService as createStorageService } from './storage/service.mjs';

export function createDefaultServices(options = {}) {
  return [
    createStorageService(options.storage),
  ];
}
