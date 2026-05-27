import { createUnsupportedService } from '../unsupported-service.mjs';

export function createService() {
  return createUnsupportedService({
    key: 'secret-manager',
    name: 'Secret Manager',
    engineStrategy: 'executable versioned local secret store',
  });
}
