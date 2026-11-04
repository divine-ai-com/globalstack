import { createStorageRoutes } from './routes.mjs';
import { StorageStore } from './store.mjs';

export function createService({ store = new StorageStore() } = {}) {
  return {
    key: 'cloud-storage',
    name: 'Cloud Storage',
    engineStrategy: 'real object-store backend with Google Cloud Storage JSON/XML API compatibility',
    routes() {
      return createStorageRoutes({ store });
    },
  };
}
