import { createUnsupportedService } from '../unsupported-service.mjs';

export function createService() {
  return createUnsupportedService({
    key: 'pub-sub',
    name: 'Pub/Sub',
    engineStrategy: 'official Pub/Sub emulator first, broker-backed behavior where the official emulator is insufficient',
  });
}
