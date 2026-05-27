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

  async listClusterCredentials(resource, role = 'user', options = {}) {
    return this.clusterManager.listClusterCredentials(resource, role, options);
  }

  async runCommand(resource, body = {}, apiVersion = '2024-02-01') {
    return this.clusterManager.runCommand(resource, body, apiVersion);
  }

  async getCommandResult(resource, commandId) {
    return this.clusterManager.getCommandResult(resource, commandId);
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
