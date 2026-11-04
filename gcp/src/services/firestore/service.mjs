import { startFirestoreEmulator } from './emulator-engine.mjs';

export function createService() {
  return {
    key: 'firestore',
    name: 'Firestore / Datastore mode',
    engineStrategy: 'official Firestore emulator, including Datastore mode where required',
    routes() {
      return [];
    },
    startEmulator: startFirestoreEmulator,
  };
}
