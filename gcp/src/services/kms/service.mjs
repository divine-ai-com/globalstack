import { createKmsRoutes } from './routes.mjs';
import { KmsStore } from './store.mjs';

export function createService({ store = new KmsStore() } = {}) {
  return {
    key: 'cloud-key-management',
    name: 'Cloud KMS',
    engineStrategy: 'executable local key engine for encrypt/decrypt/sign/verify subset',
    routes() {
      return createKmsRoutes({ store });
    },
  };
}
