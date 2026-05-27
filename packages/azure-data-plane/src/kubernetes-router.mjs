import { createServer } from 'node:http';
import { createAksClusterManager } from './aks-cluster-manager.mjs';

export class KubernetesRouter {
  constructor(options = {}) {
    this.clusterManager = options.clusterManager ?? createAksClusterManager(options);
  }

  registerCluster(resource) {
    this.clusterManager.registerCluster(resource);
  }

  unregisterCluster(resource) {
    this.clusterManager.unregisterCluster(resource);
  }

  cluster(host) {
    return this.clusterManager.cluster(host);
  }

  async dispose() {
    await this.clusterManager.dispose();
  }

  handler() {
    return this.clusterManager.handler();
  }
}

export function createKubernetesRouter(options = {}) {
  return new KubernetesRouter(options);
}

export function createKubernetesRouterServer(router = createKubernetesRouter()) {
  return createServer(router.handler());
}
