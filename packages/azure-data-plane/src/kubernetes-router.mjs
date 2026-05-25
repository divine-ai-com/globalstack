import { createServer } from 'node:http';
import { URL } from 'node:url';

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...(payload ? { 'content-type': 'application/json' } : {}),
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendText(res, status, body, headers = {}) {
  const payload = String(body ?? '');
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendStatusError(res, status, reason, message) {
  sendJson(res, status, {
    kind: 'Status',
    apiVersion: 'v1',
    metadata: {},
    status: status >= 400 ? 'Failure' : 'Success',
    message,
    reason,
    code: status,
  });
}

function requestHostName(headers) {
  return String(headers['x-forwarded-host'] ?? headers['x-globalstack-kubernetes-host'] ?? headers.host ?? '')
    .split(':')[0]
    .toLowerCase();
}

function authorized(headers) {
  const auth = String(headers.authorization ?? '');
  return auth === 'Bearer globalstack-aks-user-token' || auth === 'Bearer globalstack-aks-admin-token';
}

function labelValue(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return normalized || fallback;
}

function clusterFromResource(resource) {
  const fqdn = resource?.properties?.fqdn;
  if (!fqdn) return null;
  const clusterName = resource.name;
  const location = resource.location ?? 'eastus';
  const version = resource.properties?.currentKubernetesVersion ?? resource.properties?.kubernetesVersion ?? '1.29.2';
  const nodeResourceGroup = resource.properties?.nodeResourceGroup ?? '';
  const agentPools = Array.isArray(resource.properties?.agentPoolProfiles) ? resource.properties.agentPoolProfiles : [];
  const nodes = [];
  for (const pool of agentPools) {
    const count = Number(pool?.count ?? 0);
    const poolName = String(pool?.name ?? 'pool');
    for (let index = 1; index <= count; index += 1) {
      nodes.push({
        kind: 'Node',
        apiVersion: 'v1',
        metadata: {
          name: `${clusterName}-${poolName}-${index}`.slice(0, 63),
          labels: {
            'kubernetes.azure.com/agentpool': labelValue(poolName, 'pool'),
            'kubernetes.azure.com/cluster': labelValue(clusterName, 'cluster'),
            'kubernetes.io/os': String(pool?.osType ?? 'Linux').toLowerCase(),
            'node.kubernetes.io/instance-type': String(pool?.vmSize ?? 'Standard_DS2_v2'),
          },
        },
        spec: {
          providerID: `azure:///subscriptions/local/resourceGroups/${nodeResourceGroup}/providers/Microsoft.Compute/virtualMachineScaleSets/${clusterName}-${poolName}/virtualMachines/${index}`,
        },
        status: {
          phase: 'Running',
          capacity: {
            cpu: '2',
            memory: '8Gi',
            pods: '30',
          },
          allocatable: {
            cpu: '1900m',
            memory: '7168Mi',
            pods: '30',
          },
          conditions: [
            { type: 'Ready', status: 'True', reason: 'KubeletReady', message: 'globalstack local node is ready' },
          ],
          addresses: [
            { type: 'Hostname', address: `${clusterName}-${poolName}-${index}`.slice(0, 63) },
            { type: 'InternalIP', address: `10.240.${Math.min(index, 254)}.${Math.min(index + 10, 254)}` },
          ],
          nodeInfo: {
            kubeletVersion: `v${version}`,
            kubeProxyVersion: `v${version}`,
            osImage: 'GlobalStack Linux',
            architecture: 'amd64',
            operatingSystem: 'linux',
          },
        },
      });
    }
  }

  return {
    name: clusterName,
    fqdn: String(fqdn).toLowerCase(),
    location,
    version,
    nodeResourceGroup,
    nodes,
    namespaces: ['default', 'kube-system', 'kube-public'].map(name => ({
      kind: 'Namespace',
      apiVersion: 'v1',
      metadata: { name },
      status: { phase: 'Active' },
    })),
  };
}

export class KubernetesRouter {
  constructor() {
    this.clustersByHost = new Map();
  }

  registerCluster(resource) {
    const cluster = clusterFromResource(resource);
    if (!cluster) return;
    this.clustersByHost.set(cluster.fqdn, cluster);
  }

  unregisterCluster(resource) {
    const cluster = clusterFromResource(resource);
    const fqdn = cluster?.fqdn ?? String(resource?.properties?.fqdn ?? resource ?? '').toLowerCase();
    if (!fqdn) return;
    this.clustersByHost.delete(fqdn);
  }

  cluster(host) {
    const fqdn = String(host ?? '').toLowerCase();
    const cluster = this.clustersByHost.get(fqdn);
    return cluster ? JSON.parse(JSON.stringify(cluster)) : null;
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = String(req.method ?? 'GET').toUpperCase();
      const host = requestHostName(req.headers);

      if (method === 'GET' && url.pathname === '/_globalstack/kubernetes/clusters') {
        return sendJson(res, 200, {
          value: [...this.clustersByHost.values()].map(cluster => ({
            name: cluster.name,
            fqdn: cluster.fqdn,
            version: cluster.version,
            nodeCount: cluster.nodes.length,
          })),
        });
      }

      const cluster = this.clustersByHost.get(host);
      if (!cluster) {
        return sendStatusError(res, 404, 'NotFound', `Kubernetes API host '${host}' was not found.`);
      }
      if (!authorized(req.headers)) {
        return sendStatusError(res, 401, 'Unauthorized', 'A valid AKS kubeconfig bearer token is required.');
      }
      if (method !== 'GET') {
        return sendStatusError(res, 405, 'MethodNotAllowed', 'This bounded local Kubernetes API surface currently supports GET only.');
      }

      if (url.pathname === '/healthz' || url.pathname === '/readyz') {
        return sendText(res, 200, 'ok');
      }
      if (url.pathname === '/version') {
        return sendJson(res, 200, {
          major: cluster.version.split('.')[0],
          minor: cluster.version.split('.')[1] ?? '29',
          gitVersion: `v${cluster.version}`,
          gitCommit: 'globalstack-local',
          gitTreeState: 'clean',
          buildDate: '2026-01-01T00:00:00Z',
          goVersion: 'go1.22.0',
          compiler: 'gc',
          platform: 'linux/amd64',
        });
      }
      if (url.pathname === '/api') {
        return sendJson(res, 200, {
          kind: 'APIVersions',
          versions: ['v1'],
          serverAddressByClientCIDRs: [],
        });
      }
      if (url.pathname === '/apis') {
        return sendJson(res, 200, {
          kind: 'APIGroupList',
          apiVersion: 'v1',
          groups: [],
        });
      }
      if (url.pathname === '/api/v1') {
        return sendJson(res, 200, {
          kind: 'APIResourceList',
          groupVersion: 'v1',
          resources: [
            { name: 'namespaces', singularName: '', namespaced: false, kind: 'Namespace', verbs: ['get', 'list'] },
            { name: 'nodes', singularName: '', namespaced: false, kind: 'Node', verbs: ['get', 'list'] },
          ],
        });
      }
      if (url.pathname === '/api/v1/nodes') {
        return sendJson(res, 200, {
          kind: 'NodeList',
          apiVersion: 'v1',
          metadata: {},
          items: cluster.nodes,
        });
      }
      if (url.pathname.startsWith('/api/v1/nodes/')) {
        const nodeName = decodeURIComponent(url.pathname.split('/').at(-1));
        const node = cluster.nodes.find(item => item.metadata.name === nodeName);
        if (!node) return sendStatusError(res, 404, 'NotFound', `nodes '${nodeName}' not found`);
        return sendJson(res, 200, node);
      }
      if (url.pathname === '/api/v1/namespaces') {
        return sendJson(res, 200, {
          kind: 'NamespaceList',
          apiVersion: 'v1',
          metadata: {},
          items: cluster.namespaces,
        });
      }
      if (url.pathname.startsWith('/api/v1/namespaces/')) {
        const namespaceName = decodeURIComponent(url.pathname.split('/').at(-1));
        const namespace = cluster.namespaces.find(item => item.metadata.name === namespaceName);
        if (!namespace) return sendStatusError(res, 404, 'NotFound', `namespaces '${namespaceName}' not found`);
        return sendJson(res, 200, namespace);
      }

      return sendStatusError(res, 404, 'NotFound', `No bounded local Kubernetes route handles '${url.pathname}'.`);
    };
  }
}

export function createKubernetesRouter() {
  return new KubernetesRouter();
}

export function createKubernetesRouterServer(router = createKubernetesRouter()) {
  return createServer(router.handler());
}
