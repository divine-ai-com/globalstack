import { createComputeRoutes } from './routes.mjs';

export function createService() {
  return {
    key: 'compute-metadata',
    name: 'Compute Metadata',
    engineStrategy: 'bounded provider metadata API for region discovery',
    routes() {
      return createComputeRoutes();
    },
  };
}
