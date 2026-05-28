import { startPubSubEmulator } from './emulator-engine.mjs';

export function createService() {
  return {
    key: 'pub-sub',
    name: 'Pub/Sub',
    engineStrategy: 'official Pub/Sub emulator first, broker-backed behavior where the official emulator is insufficient',
    routes() {
      return [];
    },
    startEmulator: startPubSubEmulator,
  };
}
