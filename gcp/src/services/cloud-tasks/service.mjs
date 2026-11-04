import { createCloudTasksRoutes } from './routes.mjs';
import { CloudTasksStore } from './store.mjs';

export function createService({ store = new CloudTasksStore() } = {}) {
  return {
    key: 'cloud-tasks',
    name: 'Cloud Tasks',
    engineStrategy: 'executable scheduler and HTTP dispatcher with retry semantics',
    routes() {
      return createCloudTasksRoutes({ store });
    },
  };
}
