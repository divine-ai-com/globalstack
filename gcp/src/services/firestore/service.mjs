import { createUnsupportedService } from '../unsupported-service.mjs';

export function createService() {
  return createUnsupportedService({
    key: 'firestore',
    name: 'Firestore / Datastore mode',
    engineStrategy: 'official Firestore emulator, including Datastore mode where required',
  });
}
