import { createSecretManagerRoutes } from './routes.mjs';
import { SecretManagerStore } from './store.mjs';

export function createService({ store = new SecretManagerStore() } = {}) {
  return {
    key: 'secret-manager',
    name: 'Secret Manager',
    engineStrategy: 'executable versioned local secret store',
    routes() {
      return createSecretManagerRoutes({ store });
    },
  };
}
