import { createUnsupportedService } from '../unsupported-service.mjs';

export function createService() {
  return createUnsupportedService({
    key: 'cloud-storage',
    name: 'Cloud Storage',
    engineStrategy: 'real object-store backend with Google Cloud Storage JSON/XML API compatibility',
  });
}
