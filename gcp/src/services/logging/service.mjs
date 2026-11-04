import { createLoggingRoutes } from './routes.mjs';
import { LoggingStore } from './store.mjs';

export function createService({ store = new LoggingStore() } = {}) {
  return {
    key: 'cloud-logging',
    name: 'Cloud Logging',
    engineStrategy: 'local log store with write/list/query subset',
    routes() {
      return createLoggingRoutes({ store });
    },
  };
}
