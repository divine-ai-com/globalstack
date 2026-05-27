import { createUnsupportedService } from '../unsupported-service.mjs';

export function createService() {
  return createUnsupportedService({
    key: 'cloud-logging',
    name: 'Cloud Logging',
    engineStrategy: 'local log store with write/list/query subset',
  });
}
