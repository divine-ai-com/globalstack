import { createUnsupportedService } from '../unsupported-service.mjs';

export function createService() {
  return createUnsupportedService({
    key: 'cloud-key-management',
    name: 'Cloud KMS',
    engineStrategy: 'executable local key engine for encrypt/decrypt/sign/verify subset',
  });
}
