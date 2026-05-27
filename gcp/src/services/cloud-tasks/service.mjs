import { createUnsupportedService } from '../unsupported-service.mjs';

export function createService() {
  return createUnsupportedService({
    key: 'cloud-tasks',
    name: 'Cloud Tasks',
    engineStrategy: 'executable scheduler and HTTP dispatcher with retry semantics',
  });
}
