import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { hostname as localHostname } from 'node:os';
import { checkServerIdentity } from 'node:tls';
import { once } from 'node:events';
import Docker from 'dockerode';
import YAML from 'yaml';
import { aksKubeToken } from '../../core/src/resource-store.mjs';

const DEFAULT_K3S_IMAGE = process.env.GLOBALSTACK_AKS_K3S_IMAGE ?? 'rancher/k3s:v1.29.2-k3s1';
const DEFAULT_DOCKER_SOCKET = process.env.GLOBALSTACK_DOCKER_SOCKET ?? '/var/run/docker.sock';
const AKS_CLUSTER_USER = 'globalstack-cluster-user';
const AKS_CLUSTER_ADMIN = 'globalstack-cluster-admin';

function sendStatusError(res, status, reason, message, headers = {}) {
  const payload = JSON.stringify({
    kind: 'Status',
    apiVersion: 'v1',
    metadata: {},
    status: status >= 400 ? 'Failure' : 'Success',
    message,
    reason,
    code: status,
  });
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function requestHostName(headers) {
  return String(headers['x-forwarded-host'] ?? headers['x-globalstack-kubernetes-host'] ?? headers.host ?? '')
    .split(':')[0]
    .toLowerCase();
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function streamToBuffer(stream) {
  const chunks = [];
  stream.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
  await once(stream, 'end');
  return Buffer.concat(chunks);
}

function stripDockerExecHeader(text) {
  const value = String(text ?? '');
  if (value.length >= 8 && value.charCodeAt(0) <= 2 && value.charCodeAt(1) === 0 && value.charCodeAt(2) === 0 && value.charCodeAt(3) === 0) {
    return value.slice(8);
  }
  return value;
}

function safeClusterName(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
}

function clusterDigest(resource) {
  return createHash('sha256')
    .update(String(resource.id ?? resource.name ?? '').toLowerCase())
    .digest('hex')
    .slice(0, 10);
}

function clusterContainerName(resource) {
  return `gs-aks-${safeClusterName(resource.name).slice(0, 24)}-${clusterDigest(resource)}`;
}

function clusterNetworkName(resource) {
  return `gs-aks-net-${clusterDigest(resource)}`;
}

function clusterJoinToken(resource) {
  return createHash('sha256')
    .update(`globalstack:aks:join:${String(resource.id ?? '').toLowerCase()}`)
    .digest('hex');
}

function poolNodeName(resource, poolName, ordinal) {
  const pool = safeClusterName(poolName).replace(/[^a-z0-9]/g, '').slice(0, 12) || 'nodepool1';
  const cluster = clusterDigest(resource).slice(0, 8);
  return `aks-${pool}-${cluster}-vmss${String(ordinal).padStart(6, '0')}`.slice(0, 63);
}

function clusterAgentContainerName(resource, poolName, ordinal) {
  return [
    clusterContainerName(resource),
    safeClusterName(poolName).slice(0, 12),
    String(ordinal).padStart(2, '0'),
  ]
    .filter(Boolean)
    .join('-')
    .slice(0, 63);
}

function serviceExposureHash(entry, service) {
  return createHash('sha256')
    .update(`${String(entry?.id ?? '').toLowerCase()}:${String(service?.metadata?.namespace ?? 'default').toLowerCase()}:${String(service?.metadata?.name ?? '').toLowerCase()}`)
    .digest('hex');
}

function aksPublicServiceIp(entry, service) {
  const digest = serviceExposureHash(entry, service);
  const octet3 = (parseInt(digest.slice(0, 2), 16) % 250) + 1;
  const octet4 = (parseInt(digest.slice(2, 4), 16) % 250) + 1;
  return `203.0.${octet3}.${octet4}`;
}

function aksInternalServiceIp(entry, service) {
  const digest = serviceExposureHash(entry, service);
  const octet3 = (parseInt(digest.slice(4, 6), 16) % 250) + 1;
  const octet4 = (parseInt(digest.slice(6, 8), 16) % 250) + 1;
  return `10.224.${octet3}.${octet4}`;
}

function serviceAnnotation(service, key) {
  return service?.metadata?.annotations?.[key] ?? null;
}

function clusterImageFor(resource) {
  const version = String(resource?.properties?.kubernetesVersion ?? resource?.properties?.currentKubernetesVersion ?? '').trim();
  if (!version) return DEFAULT_K3S_IMAGE;
  return `rancher/k3s:v${version}-k3s1`;
}

function clusterSignature(resource) {
  return createHash('sha256')
    .update(JSON.stringify({
      id: resource.id,
      fqdn: resource.properties?.fqdn,
      version: resource.properties?.kubernetesVersion ?? resource.properties?.currentKubernetesVersion ?? null,
      pools: (resource.properties?.agentPoolProfiles ?? []).map(pool => ({
        name: pool?.name ?? null,
        count: pool?.count ?? null,
        vmSize: pool?.vmSize ?? null,
        mode: pool?.mode ?? null,
        osType: pool?.osType ?? null,
      })),
    }))
    .digest('hex');
}

function totalAgentPoolCount(agentPools = []) {
  return agentPools.reduce((sum, pool) => sum + Math.max(0, Number(pool?.count ?? 0)), 0);
}

function isNotFoundError(error) {
  return error?.statusCode === 404 || error?.reason === 'no such container' || /404|No such container/i.test(String(error?.message ?? error));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseKubeconfig(kubeconfigText) {
  const kubeconfig = YAML.parse(String(kubeconfigText ?? '')) ?? {};
  const cluster = kubeconfig.clusters?.[0]?.cluster ?? {};
  const user = kubeconfig.users?.[0]?.user ?? {};
  return {
    ca: Buffer.from(cluster['certificate-authority-data'] ?? '', 'base64'),
    cert: Buffer.from(user['client-certificate-data'] ?? '', 'base64'),
    key: Buffer.from(user['client-key-data'] ?? '', 'base64'),
  };
}

async function proxyRequest(entry, req, res, { upstreamHeaders = {} } = {}) {
  const body = await readRequestBody(req);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.authorization;
  headers.host = entry.fqdn;
  headers['content-length'] = String(body.length);
  Object.assign(headers, upstreamHeaders);

  return await new Promise((resolve) => {
    const requestFn = entry.endpointTls ? httpsRequest : httpRequest;
    const upstream = requestFn({
      method: req.method,
      hostname: entry.endpointHost,
      port: entry.endpointPort,
      path: req.url,
      headers,
      ...(entry.endpointTls
        ? {
            ca: entry.backendCa,
            cert: entry.backendClientCert,
            key: entry.backendClientKey,
            servername: entry.fqdn,
            checkServerIdentity: (_ignored, cert) => checkServerIdentity(entry.fqdn, cert),
          }
        : {}),
    }, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode ?? 502, Object.fromEntries(
        Object.entries(upstreamRes.headers).filter(([key]) => !['connection', 'content-length', 'transfer-encoding'].includes(String(key).toLowerCase())),
      ));
      upstreamRes.pipe(res);
      upstreamRes.on('end', () => resolve({ status: upstreamRes.statusCode ?? 502 }));
    });

    upstream.on('error', (error) => {
      sendStatusError(res, 502, 'BadGateway', `AKS backend request failed: ${error instanceof Error ? error.message : String(error)}`);
      resolve({ status: 502 });
    });

    if (body.length > 0) upstream.write(body);
    upstream.end();
  });
}

async function backendJsonRequest(entry, { method = 'GET', path = '/', body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined || body === null
      ? null
      : Buffer.isBuffer(body)
        ? body
        : Buffer.from(JSON.stringify(body));
    const requestFn = entry.endpointTls ? httpsRequest : httpRequest;
    const req = requestFn({
      method,
      hostname: entry.endpointHost,
      port: entry.endpointPort,
      path,
      headers: {
        host: entry.fqdn,
        ...(payload ? { 'content-length': String(payload.length) } : {}),
        ...headers,
      },
      ...(entry.endpointTls
        ? {
            ca: entry.backendCa,
            cert: entry.backendClientCert,
            key: entry.backendClientKey,
            servername: entry.fqdn,
            checkServerIdentity: (_ignored, cert) => checkServerIdentity(entry.fqdn, cert),
          }
        : {}),
    }, async (res) => {
      const raw = await streamToBuffer(res);
      let parsed = null;
      try {
        parsed = raw.length ? JSON.parse(raw.toString('utf8')) : null;
      } catch {
        parsed = raw.toString('utf8');
      }
      resolve({
        status: res.statusCode ?? 502,
        headers: res.headers,
        raw,
        body: parsed,
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function aksVersionBody(entry) {
  const version = String(entry.version ?? '1.29.2');
  const [major = '1', minor = '29'] = version.split('.');
  return {
    major,
    minor,
    gitVersion: `v${version}`,
    gitCommit: 'globalstack-aks-runtime',
    gitTreeState: 'clean',
    buildDate: '2026-01-01T00:00:00Z',
    goVersion: 'go1.22.0',
    compiler: 'gc',
    platform: 'linux/amd64',
  };
}

function overlayNode(entry, node) {
  const assignment = entry.nodeAssignments?.[node?.metadata?.name ?? ''] ?? {};
  const vmSize = String(assignment.vmSize ?? node?.metadata?.labels?.['node.kubernetes.io/instance-type'] ?? 'Standard_DS2_v2');
  const osType = String(assignment.osType ?? node?.metadata?.labels?.['kubernetes.io/os'] ?? 'Linux').toLowerCase();
  const availabilityZone = assignment.availabilityZones?.[0] ?? node?.metadata?.labels?.['topology.kubernetes.io/zone'] ?? null;
  return {
    ...node,
    metadata: {
      ...(node?.metadata ?? {}),
      labels: {
        ...(node?.metadata?.labels ?? {}),
        'kubernetes.azure.com/agentpool': String(assignment.name ?? node?.metadata?.labels?.['kubernetes.azure.com/agentpool'] ?? 'systempool'),
        'kubernetes.azure.com/cluster': String(entry.name ?? '').toLowerCase(),
        ...(assignment.mode ? { 'kubernetes.azure.com/mode': String(assignment.mode) } : {}),
        'kubernetes.azure.com/nodepool-type': String(assignment.type ?? 'VirtualMachineScaleSets'),
        'kubernetes.io/os': osType,
        'node.kubernetes.io/instance-type': vmSize,
        ...(availabilityZone ? { 'topology.kubernetes.io/zone': String(availabilityZone) } : {}),
      },
    },
    status: {
      ...(node?.status ?? {}),
      nodeInfo: {
        ...(node?.status?.nodeInfo ?? {}),
        kubeletVersion: `v${entry.version}`,
        kubeProxyVersion: `v${entry.version}`,
      },
    },
  };
}

export class AksClusterManager {
  constructor({
    dockerSocketPath = DEFAULT_DOCKER_SOCKET,
    edgeRouter = null,
  } = {}) {
    this.dockerSocketPath = dockerSocketPath;
    this.docker = new Docker({ socketPath: dockerSocketPath });
    this.mode = null;
    this.networkName = null;
    this.ready = false;
    this.edgeRouter = edgeRouter;
    this.clustersByHost = new Map();
    this.clustersById = new Map();
  }

  async initialize() {
    if (this.ready) return;
    await this.docker.ping();
    const selfName = localHostname();
    try {
      const self = await this.docker.getContainer(selfName).inspect();
      const networks = Object.keys(self?.NetworkSettings?.Networks ?? {});
      if (networks.length > 0) {
        this.mode = 'container-network';
        this.networkName = networks[0];
      } else {
        this.mode = 'host';
      }
    } catch {
      this.mode = 'host';
    }
    this.ready = true;
  }

  summary() {
    return [...this.clustersById.values()].map(entry => ({
      name: entry.name,
      fqdn: entry.fqdn,
      version: entry.version,
      ready: entry.ready === true,
      failed: Boolean(entry.error),
      error: entry.error instanceof Error ? entry.error.message : (entry.error ? String(entry.error) : null),
      backendHost: entry.endpointHost ?? null,
      backendPort: entry.endpointPort ?? null,
      containerName: entry.serverContainerName,
      nodeCount: Object.keys(entry.nodeAssignments ?? {}).length,
    }));
  }

  cluster(host) {
    const entry = this.clustersByHost.get(String(host ?? '').toLowerCase());
    if (!entry) return null;
    return {
      name: entry.name,
      fqdn: entry.fqdn,
      version: entry.version,
      ready: entry.ready === true,
      failed: Boolean(entry.error),
      error: entry.error instanceof Error ? entry.error.message : (entry.error ? String(entry.error) : null),
      endpointHost: entry.endpointHost ?? null,
      endpointPort: entry.endpointPort ?? null,
    };
  }

  async pullImage(image) {
    return new Promise((resolve, reject) => {
      this.docker.pull(image, (error, stream) => {
        if (error) {
          reject(error);
          return;
        }
        this.docker.modem.followProgress(stream, (progressError) => {
          if (progressError) reject(progressError);
          else resolve();
        });
      });
    });
  }

  async ensureImage(image) {
    try {
      await this.docker.getImage(image).inspect();
      return;
    } catch (error) {
      if (!isNotFoundError(error)) {
        const message = String(error?.message ?? error);
        if (!/No such image|404/i.test(message)) throw error;
      }
    }
    await this.pullImage(image);
  }

  async execText(container, cmd) {
    const result = await this.execCommand(container, cmd);
    return result.output;
  }

  async execCommand(container, cmd) {
    const exec = await container.exec({
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: cmd,
    });
    const stream = await new Promise((resolve, reject) => {
      exec.start({ hijack: false, stdin: false }, (error, startedStream) => {
        if (error) reject(error);
        else resolve(startedStream);
      });
    });
    const output = await streamToBuffer(stream);
    const inspect = await exec.inspect();
    return {
      output: stripDockerExecHeader(output.toString('utf8')),
      exitCode: Number(inspect?.ExitCode ?? 1),
    };
  }

  async removeContainer(name) {
    try {
      const container = this.docker.getContainer(name);
      await container.remove({ force: true });
    } catch (error) {
      if (/already in progress/i.test(String(error?.message ?? error))) {
        await this.waitForContainerGone(name);
        return;
      }
      if (!isNotFoundError(error)) throw error;
    }
  }

  async waitForContainerGone(name) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        await this.docker.getContainer(name).inspect();
      } catch (error) {
        if (isNotFoundError(error)) return;
      }
      await delay(1000);
    }
    throw new Error(`Timed out waiting for container '${name}' to be removed.`);
  }

  async removeContainersForResource(resourceId) {
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: [`io.globalstack.resource-id=${resourceId}`] },
    });
    containers.sort((left, right) => {
      const leftRole = left.Labels?.['io.globalstack.aks.role'] === 'server' ? 1 : 0;
      const rightRole = right.Labels?.['io.globalstack.aks.role'] === 'server' ? 1 : 0;
      return leftRole - rightRole;
    });
    for (const container of containers) {
      await this.removeContainer(container.Names?.[0]?.replace(/^\//, '') ?? container.Id);
    }
  }

  async ensureNetwork(resource) {
    if (this.mode === 'container-network') {
      return {
        networkName: this.networkName,
        owned: false,
      };
    }
    const name = clusterNetworkName(resource);
    try {
      await this.docker.getNetwork(name).inspect();
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      await this.docker.createNetwork({
        Name: name,
        Driver: 'bridge',
        Labels: {
          'io.globalstack.owner': 'globalstack',
          'io.globalstack.product': 'azure-runtime-backend',
          'io.globalstack.scope': 'platform-runtime',
          'io.globalstack.cloud': 'azure',
          'io.globalstack.backend': 'aks-k3s-network',
          'io.globalstack.resource-id': resource.id,
        },
      });
    }
    return {
      networkName: name,
      owned: true,
    };
  }

  async removeNetwork(name, { owned = true } = {}) {
    if (!owned || !name) return;
    try {
      await this.docker.getNetwork(name).remove();
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  async cleanupEntry(entry) {
    if (!entry) return;
    if (entry.disposed !== true) {
      await Promise.resolve(entry.readyPromise).catch(() => {});
    }
    await this.removeContainersForResource(entry.id).catch(() => {});
    await this.removeNetwork(entry.networkName, { owned: entry.ownedNetwork }).catch(() => {});
  }

  async inspectHostEndpoint(containerName) {
    const container = this.docker.getContainer(containerName);
    const inspect = await container.inspect();
    const binding = inspect?.NetworkSettings?.Ports?.['6443/tcp']?.[0];
    return {
      endpointHost: '127.0.0.1',
      endpointPort: Number(binding?.HostPort ?? 0),
      endpointTls: true,
    };
  }

  async inspectNetworkEndpoint(containerName) {
    return {
      endpointHost: containerName,
      endpointPort: 6443,
      endpointTls: true,
    };
  }

  async waitForBackend(containerName, fqdn) {
    const container = this.docker.getContainer(containerName);
    let backendAuth = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const inspect = await container.inspect();
      if (!inspect?.State?.Running) {
        throw new Error(`AKS backend container '${containerName}' is not running.`);
      }
      try {
        const kubeconfigText = await this.execText(container, ['cat', '/etc/rancher/k3s/k3s.yaml']);
        const parsed = parseKubeconfig(kubeconfigText);
        if (!parsed.ca?.length || !parsed.cert?.length || !parsed.key?.length) {
          throw new Error('kubeconfig credentials are not ready yet');
        }
        const endpoint = this.mode === 'container-network'
          ? await this.inspectNetworkEndpoint(containerName)
          : await this.inspectHostEndpoint(containerName);
        if (!endpoint.endpointPort) {
          throw new Error('AKS backend endpoint is not published yet');
        }
        backendAuth = {
          ...parsed,
          ...endpoint,
        };
        const ready = await this.backendReady({ fqdn, ...backendAuth });
        if (ready) return backendAuth;
      } catch {
        // retry until backend settles
      }
      await delay(1000);
    }
    throw new Error(`AKS backend '${containerName}' did not become ready within 120s.`);
  }

  async backendReady(entry) {
    return new Promise((resolve) => {
      const req = httpsRequest({
        method: 'GET',
        hostname: entry.endpointHost,
        port: entry.endpointPort,
        path: '/readyz',
        ca: entry.ca,
        cert: entry.cert,
        key: entry.key,
        servername: entry.fqdn,
        checkServerIdentity: (_ignored, cert) => checkServerIdentity(entry.fqdn, cert),
      }, (res) => {
        res.resume();
        resolve((res.statusCode ?? 0) < 500);
      });
      req.on('error', () => resolve(false));
      req.end();
    });
  }

  async waitForNodeCount(entry, expectedNodeCount) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const backend = await backendJsonRequest(entry, { path: '/api/v1/nodes' });
      const items = Array.isArray(backend.body?.items) ? backend.body.items : [];
      const readyCount = items.filter(node =>
        Array.isArray(node?.status?.conditions)
        && node.status.conditions.some(condition => condition.type === 'Ready' && condition.status === 'True'),
      ).length;
      if (readyCount >= expectedNodeCount) {
        return items;
      }
      await delay(1000);
    }
    throw new Error(`AKS backend '${entry.serverContainerName}' did not reach ${expectedNodeCount} ready nodes within 180s.`);
  }

  async inspectContainerIp(containerName, networkName) {
    const inspect = await this.docker.getContainer(containerName).inspect();
    const networks = inspect?.NetworkSettings?.Networks ?? {};
    if (networkName && networks[networkName]?.IPAddress) return networks[networkName].IPAddress;
    const fallback = Object.values(networks).find(network => network?.IPAddress);
    return fallback?.IPAddress ?? null;
  }

  async bootstrapRbacBindings(container) {
    const manifest = [
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRole',
      'metadata:',
      `  name: ${AKS_CLUSTER_USER}`,
      'rules:',
      '- apiGroups: [""]',
      '  resources: ["namespaces", "nodes", "pods", "services", "configmaps", "endpoints"]',
      '  verbs: ["get", "list", "watch"]',
      '- apiGroups: ["apps"]',
      '  resources: ["deployments", "replicasets"]',
      '  verbs: ["get", "list", "watch"]',
      '- nonResourceURLs: ["/version", "/api", "/api/*", "/apis", "/apis/*"]',
      '  verbs: ["get"]',
      '---',
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRoleBinding',
      'metadata:',
      `  name: ${AKS_CLUSTER_USER}-binding`,
      'subjects:',
      '- kind: User',
      `  name: ${AKS_CLUSTER_USER}`,
      '  apiGroup: rbac.authorization.k8s.io',
      'roleRef:',
      '  apiGroup: rbac.authorization.k8s.io',
      '  kind: ClusterRole',
      `  name: ${AKS_CLUSTER_USER}`,
      '---',
      'apiVersion: rbac.authorization.k8s.io/v1',
      'kind: ClusterRoleBinding',
      'metadata:',
      `  name: ${AKS_CLUSTER_ADMIN}-binding`,
      'subjects:',
      '- kind: User',
      `  name: ${AKS_CLUSTER_ADMIN}`,
      '  apiGroup: rbac.authorization.k8s.io',
      'roleRef:',
      '  apiGroup: rbac.authorization.k8s.io',
      '  kind: ClusterRole',
      '  name: cluster-admin',
      '',
    ].join('\n');
    const escaped = manifest.replace(/'/g, `'\"'\"'`);
    const execution = await this.execCommand(container, [
      'sh',
      '-lc',
      `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; cat <<'YAML' | kubectl apply -f -\n${escaped}\nYAML\nkubectl taint nodes --all node-role.kubernetes.io/control-plane- node-role.kubernetes.io/master- >/dev/null 2>&1 || true`,
    ]);
    if (execution.exitCode !== 0) {
      throw new Error(`AKS RBAC bootstrap failed: ${execution.output.trim() || `exit ${execution.exitCode}`}`);
    }
  }

  serviceExposureAuthHeaders(entry, role) {
    if (role === 'admin') {
      return { 'Impersonate-User': AKS_CLUSTER_ADMIN };
    }
    if (role === 'user') {
      return { 'Impersonate-User': AKS_CLUSTER_USER };
    }
    return {};
  }

  serviceExposureDetails(entry, service) {
    const annotations = service?.metadata?.annotations ?? {};
    const internal = String(annotations['service.beta.kubernetes.io/azure-load-balancer-internal'] ?? 'false').toLowerCase() === 'true';
    const configuredIp = String(
      annotations['service.beta.kubernetes.io/azure-load-balancer-ipv4']
      ?? service?.spec?.loadBalancerIP
      ?? '',
    ).trim();
    const ip = configuredIp || (internal ? aksInternalServiceIp(entry, service) : aksPublicServiceIp(entry, service));
    const dnsLabel = String(annotations['service.beta.kubernetes.io/azure-dns-label-name'] ?? '').trim().toLowerCase();
    const hostname = !internal && dnsLabel ? `${dnsLabel}.${String(entry.location ?? 'eastus').toLowerCase()}.cloudapp.azure.com` : null;
    const exposureHosts = internal ? [] : [ip, ...(hostname ? [hostname] : [])];
    return {
      internal,
      ip,
      hostname,
      exposureHosts,
    };
  }

  async patchServiceExposureStatus(entry, service, exposure) {
    const namespace = service?.metadata?.namespace;
    const serviceName = service?.metadata?.name;
    if (!namespace || !serviceName || !exposure?.ip) return;
    const currentIngress = service?.status?.loadBalancer?.ingress?.[0] ?? {};
    if (currentIngress.ip === exposure.ip) return;
    await backendJsonRequest(entry, {
      method: 'PATCH',
      path: `/api/v1/namespaces/${namespace}/services/${serviceName}/status`,
      body: {
        status: {
          loadBalancer: {
            ingress: [{
              ip: exposure.ip,
            }],
          },
        },
      },
      headers: {
        'content-type': 'application/merge-patch+json',
      },
    });
  }

  async syncServiceExposureEndpoints(entry) {
    if (!this.edgeRouter || !entry?.ready) return;
    const previousHosts = entry.serviceExposureHosts ?? new Set();
    const nextHosts = new Set();
    const listed = await backendJsonRequest(entry, { path: '/api/v1/services' });
    const services = Array.isArray(listed.body?.items) ? listed.body.items : [];
    const nodeOrigins = [];
    for (const containerName of [entry.serverContainerName, ...(entry.agentContainerNames ?? [])]) {
      const ipAddress = await this.inspectContainerIp(containerName, entry.networkName);
      if (!ipAddress) continue;
      nodeOrigins.push(ipAddress);
    }
    for (const service of services) {
      const serviceType = String(service?.spec?.type ?? 'ClusterIP');
      if (serviceType !== 'LoadBalancer') continue;
      const nodePort = Number(service?.spec?.ports?.[0]?.nodePort ?? 0);
      if (!nodePort || nodeOrigins.length === 0) continue;
      const exposure = this.serviceExposureDetails(entry, service);
      await this.patchServiceExposureStatus(entry, service, exposure);
      for (const hostName of exposure.exposureHosts) {
        this.edgeRouter.registerEndpoint({
          endpointName: `${service.metadata.namespace}-${service.metadata.name}`,
          hostName,
          kind: 'aks-service',
          enabledState: 'Enabled',
          proxyMode: 'http-forward',
          origins: nodeOrigins.map((originHost, index) => ({
            name: `node-${index + 1}`,
            hostName: originHost,
            httpPort: nodePort,
            httpsPort: nodePort,
          })),
          routePatterns: ['/*'],
        });
        nextHosts.add(hostName.toLowerCase());
      }
    }
    for (const hostName of previousHosts) {
      if (!nextHosts.has(String(hostName).toLowerCase())) {
        this.edgeRouter.unregisterEndpoint(hostName);
      }
    }
    entry.serviceExposureHosts = nextHosts;
  }

  kubeconfig(entry, role = 'user', { serverFqdn = null } = {}) {
    const userName = role === 'admin' ? 'clusterAdmin' : 'clusterUser';
    const token = role === 'admin' ? entry.adminToken : entry.userToken;
    const caData = Buffer.from(entry.backendCa ?? '').toString('base64');
    const server = `https://${serverFqdn || entry.fqdn}`;
    return [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      `- name: ${entry.name}`,
      '  cluster:',
      `    server: ${server}`,
      `    certificate-authority-data: ${caData}`,
      'contexts:',
      `- name: ${userName}`,
      '  context:',
      `    cluster: ${entry.name}`,
      `    user: ${userName}`,
      `current-context: ${userName}`,
      'users:',
      `- name: ${userName}`,
      '  user:',
      `    token: ${token}`,
      '',
    ].join('\n');
  }

  aadExecKubeconfig(entry, { serverFqdn = null } = {}) {
    const server = `https://${serverFqdn || entry.fqdn}`;
    const caData = Buffer.from(entry.backendCa ?? '').toString('base64');
    const tenantId = entry.aadProfile?.tenantID ?? '00000000-0000-0000-0000-000000000000';
    const clientId = entry.aadProfile?.clientAppID ?? '80faf920-1908-4b52-b5ef-a8e7bedfc67a';
    const serverId = entry.aadProfile?.serverAppID ?? '6dae42f8-4368-4678-94ff-3960e28e3630';
    return [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      `- name: ${entry.name}`,
      '  cluster:',
      `    server: ${server}`,
      `    certificate-authority-data: ${caData}`,
      'contexts:',
      `- name: clusterUser_${entry.name}`,
      '  context:',
      `    cluster: ${entry.name}`,
      `    user: clusterUser_${entry.name}`,
      `current-context: clusterUser_${entry.name}`,
      'users:',
      `- name: clusterUser_${entry.name}`,
      '  user:',
      '    exec:',
      '      apiVersion: client.authentication.k8s.io/v1beta1',
      '      command: kubelogin',
      '      args:',
      '      - get-token',
      '      - --login',
      '      - azurecli',
      '      - --environment',
      '      - AzurePublicCloud',
      '      - --tenant-id',
      `      - ${tenantId}`,
      '      - --server-id',
      `      - ${serverId}`,
      '      - --client-id',
      `      - ${clientId}`,
      '',
    ].join('\n');
  }

  aadAzureAuthProviderKubeconfig(entry, { serverFqdn = null } = {}) {
    const server = `https://${serverFqdn || entry.fqdn}`;
    const caData = Buffer.from(entry.backendCa ?? '').toString('base64');
    const tenantId = entry.aadProfile?.tenantID ?? '00000000-0000-0000-0000-000000000000';
    const clientId = entry.aadProfile?.clientAppID ?? '80faf920-1908-4b52-b5ef-a8e7bedfc67a';
    const serverId = entry.aadProfile?.serverAppID ?? '6dae42f8-4368-4678-94ff-3960e28e3630';
    return [
      'apiVersion: v1',
      'kind: Config',
      'clusters:',
      `- name: ${entry.name}`,
      '  cluster:',
      `    server: ${server}`,
      `    certificate-authority-data: ${caData}`,
      'contexts:',
      `- name: clusterUser_${entry.name}`,
      '  context:',
      `    cluster: ${entry.name}`,
      `    user: clusterUser_${entry.name}`,
      `current-context: clusterUser_${entry.name}`,
      'users:',
      `- name: clusterUser_${entry.name}`,
      '  user:',
      '    auth-provider:',
      '      name: azure',
      '      config:',
      `        apiserver-id: ${serverId}`,
      `        client-id: ${clientId}`,
      `        tenant-id: ${tenantId}`,
      '        environment: AzurePublicCloud',
      '',
    ].join('\n');
  }

  async listClusterCredentials(resource, role = 'user', options = {}) {
    const entry = this.clustersById.get(String(resource?.id ?? '').toLowerCase());
    if (!entry) return null;
    await Promise.resolve(entry.readyPromise);
    if (entry.error) throw entry.error;
    if (!entry.ready) return null;
    const aadManaged = entry.aadProfile?.managed === true;
    const disableLocalAccounts = entry.disableLocalAccounts === true;
    if (disableLocalAccounts && (!aadManaged || role === 'admin')) {
      return {
        error: {
          status: 400,
          code: 'BadRequest',
          message: "Getting static credential isn't allowed because this cluster is set to disable local accounts.",
        },
      };
    }
    if (aadManaged && role === 'user') {
      const requestedFormat = String(options.format ?? 'exec').toLowerCase();
      if (!['exec', 'azure'].includes(requestedFormat)) {
        return {
          error: {
            status: 400,
            code: 'InvalidParameter',
            message: "AKS listClusterUserCredential format must be 'exec' or 'azure' for Microsoft Entra clusters.",
          },
        };
      }
      const kubeconfig = requestedFormat === 'azure'
        ? this.aadAzureAuthProviderKubeconfig(entry, options)
        : this.aadExecKubeconfig(entry, options);
      return {
        kubeconfigs: [
          {
            name: 'clusterUser',
            value: Buffer.from(kubeconfig).toString('base64'),
          },
        ],
      };
    }
    const userName = role === 'admin' ? 'clusterAdmin' : 'clusterUser';
    return {
      kubeconfigs: [
        {
          name: userName,
          value: Buffer.from(this.kubeconfig(entry, role, options)).toString('base64'),
        },
      ],
    };
  }

  async runCommand(resource, body = {}, apiVersion = '2024-02-01') {
    const entry = this.clustersById.get(String(resource?.id ?? '').toLowerCase());
    if (!entry) {
      return {
        error: {
          status: 404,
          code: 'ResourceNotFound',
          message: `The Resource 'managedClusters/${resource?.name ?? ''}' was not found.`,
        },
      };
    }
    const command = String(body?.command ?? '').trim();
    if (!command) {
      return {
        error: {
          status: 400,
          code: 'InvalidParameter',
          message: 'AKS runCommand requires properties.command.',
        },
      };
    }
    if (body?.context && String(body.context).trim() !== '') {
      return {
        error: {
          status: 400,
          code: 'InvalidParameter',
          message: 'AKS runCommand context archives are not yet supported on this runtime-backed surface.',
        },
      };
    }
    await Promise.resolve(entry.readyPromise);
    if (entry.error) throw entry.error;
    const commandId = createHash('sha256')
      .update(`${resource.id}:${command}:${Date.now()}:${Math.random()}`)
      .digest('hex')
      .slice(0, 32);
    const result = {
      id: commandId,
      properties: {
        provisioningState: 'running',
        startedAt: new Date().toISOString(),
      },
    };
    entry.commandResults ??= new Map();
    entry.commandResults.set(commandId, result);
    void this.executeRunCommand(entry, commandId, command);
    return {
      accepted: true,
      headers: {
        location: `https://management.azure.com${resource.id}/commandResults/${commandId}?api-version=${apiVersion}`,
        'retry-after': '1',
      },
    };
  }

  async executeRunCommand(entry, commandId, command) {
    const container = this.docker.getContainer(entry.serverContainerName);
    const commandResult = entry.commandResults.get(commandId);
    if (!commandResult) return;
    try {
      const execution = await this.execCommand(container, [
        'sh',
        '-lc',
        `export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; ${command}`,
      ]);
      commandResult.properties.exitCode = execution.exitCode;
      commandResult.properties.logs = execution.output.trim();
      commandResult.properties.finishedAt = new Date().toISOString();
      if (execution.exitCode === 0) {
        commandResult.properties.provisioningState = 'succeeded';
      } else {
        commandResult.properties.provisioningState = 'failed';
        commandResult.properties.reason = execution.output.trim() || `Command exited with code ${execution.exitCode}`;
      }
    } catch (error) {
      commandResult.properties.exitCode = 1;
      commandResult.properties.finishedAt = new Date().toISOString();
      commandResult.properties.logs = error instanceof Error ? error.message : String(error);
      commandResult.properties.provisioningState = 'failed';
      commandResult.properties.reason = error instanceof Error ? error.message : String(error);
    }
  }

  async getCommandResult(resource, commandId) {
    const entry = this.clustersById.get(String(resource?.id ?? '').toLowerCase());
    if (!entry) return null;
    await Promise.resolve(entry.readyPromise);
    if (entry.error) throw entry.error;
    return entry.commandResults?.get(commandId) ?? null;
  }

  sanitizeResourceForCreate(resource) {
    const clone = JSON.parse(JSON.stringify(resource));
    delete clone.status;
    delete clone.metadata?.uid;
    delete clone.metadata?.resourceVersion;
    delete clone.metadata?.creationTimestamp;
    delete clone.metadata?.generation;
    delete clone.metadata?.managedFields;
    delete clone.metadata?.selfLink;
    if (clone.kind === 'Namespace') {
      delete clone.metadata?.namespace;
    }
    if (clone.kind === 'Service') {
      delete clone.spec?.clusterIP;
      delete clone.spec?.clusterIPs;
      delete clone.spec?.healthCheckNodePort;
      delete clone.spec?.ipFamilies;
      delete clone.spec?.ipFamilyPolicy;
      delete clone.spec?.internalTrafficPolicy;
    }
    return clone;
  }

  async captureWorkloadState(entry) {
    if (!entry?.ready) return null;
    const namespaces = await backendJsonRequest(entry, { path: '/api/v1/namespaces' });
    const items = Array.isArray(namespaces.body?.items) ? namespaces.body.items : [];
    const userNamespaces = items
      .filter(item => !['default', 'kube-system', 'kube-public', 'kube-node-lease'].includes(String(item?.metadata?.name ?? '')))
      .map(item => this.sanitizeResourceForCreate(item));
    const snapshot = {
      namespaces: userNamespaces,
      configMaps: [],
      deployments: [],
      services: [],
    };
    for (const namespace of userNamespaces) {
      const namespaceName = namespace.metadata?.name;
      if (!namespaceName) continue;
      const [configMaps, deployments, services] = await Promise.all([
        backendJsonRequest(entry, { path: `/api/v1/namespaces/${namespaceName}/configmaps` }),
        backendJsonRequest(entry, { path: `/apis/apps/v1/namespaces/${namespaceName}/deployments` }),
        backendJsonRequest(entry, { path: `/api/v1/namespaces/${namespaceName}/services` }),
      ]);
      snapshot.configMaps.push(
        ...(Array.isArray(configMaps.body?.items) ? configMaps.body.items : [])
          .filter(item => item?.metadata?.name)
          .map(item => this.sanitizeResourceForCreate(item)),
      );
      snapshot.deployments.push(
        ...(Array.isArray(deployments.body?.items) ? deployments.body.items : [])
          .filter(item => item?.metadata?.name)
          .map(item => this.sanitizeResourceForCreate(item)),
      );
      snapshot.services.push(
        ...(Array.isArray(services.body?.items) ? services.body.items : [])
          .filter(item => item?.metadata?.name)
          .map(item => this.sanitizeResourceForCreate(item)),
      );
    }
    return snapshot;
  }

  async restoreWorkloadState(entry, snapshot) {
    if (!snapshot) return;
    const applyObjects = async (objects, collectionPathFor) => {
      for (const object of objects) {
        const path = collectionPathFor(object);
        const result = await backendJsonRequest(entry, {
          method: 'POST',
          path,
          body: object,
        });
        if (![200, 201, 202, 409].includes(result.status)) {
          throw new Error(`AKS workload restore failed for ${object.kind}/${object.metadata?.name ?? 'unknown'}: ${result.status}`);
        }
      }
    };

    await applyObjects(snapshot.namespaces ?? [], object => '/api/v1/namespaces');
    await applyObjects(snapshot.configMaps ?? [], object => `/api/v1/namespaces/${object.metadata?.namespace ?? 'default'}/configmaps`);
    await applyObjects(snapshot.deployments ?? [], object => `/apis/apps/v1/namespaces/${object.metadata?.namespace ?? 'default'}/deployments`);
    await applyObjects(snapshot.services ?? [], object => `/api/v1/namespaces/${object.metadata?.namespace ?? 'default'}/services`);
  }

  async createBackend(resource) {
    await this.initialize();
    const image = clusterImageFor(resource);
    const serverContainerName = clusterContainerName(resource);
    const joinToken = clusterJoinToken(resource);
    const { networkName, owned: ownedNetwork } = await this.ensureNetwork(resource);
    await this.removeContainersForResource(resource.id);
    await this.ensureImage(image);
    const agentPools = Array.isArray(resource.properties?.agentPoolProfiles) ? resource.properties.agentPoolProfiles : [];
    const systemPool = agentPools[0] ?? {
      name: 'systempool',
      count: 1,
      vmSize: 'Standard_DS2_v2',
      mode: 'System',
      osType: 'Linux',
    };
    const serverNodeName = poolNodeName(resource, systemPool.name ?? 'systempool', 0);
    const nodeAssignments = {
      [serverNodeName]: {
        name: systemPool.name ?? 'systempool',
        vmSize: systemPool.vmSize ?? 'Standard_DS2_v2',
        osType: systemPool.osType ?? 'Linux',
        mode: systemPool.mode ?? 'System',
        type: systemPool.type ?? 'VirtualMachineScaleSets',
        availabilityZones: Array.isArray(systemPool.availabilityZones) ? [...systemPool.availabilityZones] : [],
      },
    };
    const commonLabels = {
      'io.globalstack.owner': 'globalstack',
      'io.globalstack.product': 'azure-runtime-backend',
      'io.globalstack.scope': 'platform-runtime',
      'io.globalstack.cloud': 'azure',
      'io.globalstack.backend': 'aks-k3s',
      'io.globalstack.resource-id': resource.id,
    };
    const serverLabels = [
      `kubernetes.azure.com/agentpool=${systemPool.name ?? 'systempool'}`,
      `kubernetes.azure.com/mode=${systemPool.mode ?? 'System'}`,
      `kubernetes.azure.com/nodepool-type=${systemPool.type ?? 'VirtualMachineScaleSets'}`,
      `node.kubernetes.io/instance-type=${systemPool.vmSize ?? 'Standard_DS2_v2'}`,
      `kubernetes.io/os=${String(systemPool.osType ?? 'Linux').toLowerCase()}`,
      `topology.kubernetes.io/region=${String(resource.location ?? 'eastus').toLowerCase()}`,
      ...(Array.isArray(systemPool.availabilityZones) && systemPool.availabilityZones[0]
        ? [`topology.kubernetes.io/zone=${String(systemPool.availabilityZones[0])}`]
        : []),
    ];

    const createBody = {
      name: serverContainerName,
      Image: image,
      Hostname: serverContainerName,
      Env: [
        'K3S_KUBECONFIG_MODE=644',
        `K3S_TOKEN=${joinToken}`,
      ],
      Cmd: [
        'server',
        '--disable',
        'traefik',
        '--disable',
        'servicelb',
        '--write-kubeconfig-mode',
        '644',
        '--node-name',
        serverNodeName,
        '--tls-san',
        resource.properties.fqdn,
        '--tls-san',
        serverContainerName,
        ...serverLabels.flatMap(label => ['--node-label', label]),
      ],
      Labels: {
        ...commonLabels,
        'io.globalstack.aks.role': 'server',
      },
      ExposedPorts: {
        '6443/tcp': {},
      },
      HostConfig: {
        Privileged: true,
        Tmpfs: {
          '/run': 'rw',
          '/var/run': 'rw',
        },
        RestartPolicy: {
          Name: 'unless-stopped',
        },
        ...(this.mode === 'container-network' || this.mode === 'host'
          ? { NetworkMode: networkName }
          : {
              PortBindings: {
                '6443/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }],
              },
            }),
      },
    };
    if (this.mode === 'host') {
      createBody.HostConfig.PortBindings = {
        '6443/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }],
      };
    }

    const container = await this.docker.createContainer(createBody);
    await container.start();
    const backend = await this.waitForBackend(serverContainerName, resource.properties.fqdn);
    const agentContainerNames = [];
    const agentContainers = [];
    for (const [poolIndex, pool] of agentPools.entries()) {
      const poolCount = Math.max(0, Number(pool?.count ?? 0));
      const startOrdinal = poolIndex === 0 ? 1 : 0;
      for (let ordinal = startOrdinal; ordinal < poolCount; ordinal += 1) {
        const nodeName = poolNodeName(resource, pool.name ?? `pool${poolIndex}`, ordinal);
        const agentContainerName = clusterAgentContainerName(resource, pool.name ?? `pool${poolIndex}`, ordinal);
        nodeAssignments[nodeName] = {
          name: pool.name ?? `pool${poolIndex}`,
          vmSize: pool.vmSize ?? 'Standard_DS2_v2',
          osType: pool.osType ?? 'Linux',
          mode: pool.mode ?? 'User',
          type: pool.type ?? 'VirtualMachineScaleSets',
          availabilityZones: Array.isArray(pool.availabilityZones) ? [...pool.availabilityZones] : [],
        };
        const agentBody = {
          name: agentContainerName,
          Image: image,
          Hostname: agentContainerName,
          Cmd: [
            'agent',
            '--server',
            `https://${serverContainerName}:6443`,
            '--token',
            joinToken,
            '--node-name',
            nodeName,
            '--node-label',
            `kubernetes.azure.com/agentpool=${pool.name ?? `pool${poolIndex}`}`,
            '--node-label',
            `kubernetes.azure.com/mode=${pool.mode ?? 'User'}`,
            '--node-label',
            `kubernetes.azure.com/nodepool-type=${pool.type ?? 'VirtualMachineScaleSets'}`,
            '--node-label',
            `node.kubernetes.io/instance-type=${pool.vmSize ?? 'Standard_DS2_v2'}`,
            '--node-label',
            `kubernetes.io/os=${String(pool.osType ?? 'Linux').toLowerCase()}`,
            '--node-label',
            `topology.kubernetes.io/region=${String(resource.location ?? 'eastus').toLowerCase()}`,
            ...(Array.isArray(pool.availabilityZones) && pool.availabilityZones[0]
              ? ['--node-label', `topology.kubernetes.io/zone=${String(pool.availabilityZones[0])}`]
              : []),
          ],
          Labels: {
            ...commonLabels,
            'io.globalstack.aks.role': 'agent',
          },
          HostConfig: {
            Privileged: true,
            Tmpfs: {
              '/run': 'rw',
              '/var/run': 'rw',
            },
            RestartPolicy: {
              Name: 'unless-stopped',
            },
            NetworkMode: networkName,
          },
        };
        const agentContainer = await this.docker.createContainer(agentBody);
        await agentContainer.start();
        agentContainerNames.push(agentContainerName);
        agentContainers.push(agentContainer.id);
      }
    }
    const totalNodes = Math.max(totalAgentPoolCount(agentPools), 1);
    await this.waitForNodeCount({
      fqdn: resource.properties.fqdn,
      serverContainerName,
      endpointHost: backend.endpointHost,
      endpointPort: backend.endpointPort,
      endpointTls: backend.endpointTls,
      backendCa: backend.ca,
      backendClientCert: backend.cert,
      backendClientKey: backend.key,
    }, totalNodes);
    await this.bootstrapRbacBindings(container);
    return {
      containerId: container.id,
      serverContainerName,
      containerName: serverContainerName,
      agentContainerNames,
      agentContainerIds: agentContainers,
      networkName,
      ownedNetwork,
      nodeAssignments,
      backendCa: backend.ca,
      backendClientCert: backend.cert,
      backendClientKey: backend.key,
      endpointHost: backend.endpointHost,
      endpointPort: backend.endpointPort,
      endpointTls: backend.endpointTls,
    };
  }

  registerCluster(resource) {
    const fqdn = String(resource?.properties?.fqdn ?? '').toLowerCase();
    if (!fqdn) return;
    const signature = clusterSignature(resource);
    const existing = this.clustersByHost.get(fqdn);
    if (existing && existing.signature === signature && !existing.disposed) {
      return;
    }

    if (existing) {
      existing.disposed = true;
    }
    const existingSnapshot = existing
      ? (async () => {
          try {
            await Promise.resolve(existing.readyPromise);
            const sameResource = String(existing.id ?? '').toLowerCase() === String(resource.id ?? '').toLowerCase();
            if (!sameResource || existing.error || !existing.ready) return null;
            return await this.captureWorkloadState(existing);
          } catch (error) {
            console.error('[globalstack:aks-runtime] failed to capture workload state before cluster update', {
              cluster: existing.name,
              resourceId: existing.id,
              message: error instanceof Error ? error.message : String(error),
            });
            return null;
          }
        })()
      : Promise.resolve(null);
    const existingCleanup = existing
      ? existingSnapshot.then(async (snapshot) => {
          await this.cleanupEntry({ ...existing, disposed: true });
          return snapshot;
        })
      : Promise.resolve(null);

    const entry = {
      signature,
      name: resource.name,
      id: resource.id,
      fqdn,
      location: String(resource.location ?? 'eastus').toLowerCase(),
      version: resource.properties?.currentKubernetesVersion ?? resource.properties?.kubernetesVersion ?? '1.29.2',
      nodeResourceGroup: resource.properties?.nodeResourceGroup ?? '',
      aadProfile: resource.properties?.aadProfile ? JSON.parse(JSON.stringify(resource.properties.aadProfile)) : null,
      disableLocalAccounts: resource.properties?.disableLocalAccounts === true,
      agentPools: Array.isArray(resource.properties?.agentPoolProfiles) ? resource.properties.agentPoolProfiles : [],
      userToken: aksKubeToken(resource.id, 'user'),
      adminToken: aksKubeToken(resource.id, 'admin'),
      serverContainerName: clusterContainerName(resource),
      networkName: clusterNetworkName(resource),
      ownedNetwork: this.mode !== 'container-network',
      ready: false,
      error: null,
      disposed: false,
      commandResults: new Map(),
    };
    entry.readyPromise = existingCleanup
      .then(snapshot => this.createBackend(resource).then(async (backend) => {
        if (entry.disposed) {
          return this.cleanupEntry({
            ...entry,
            ...backend,
          });
        }
        Object.assign(entry, backend, { ready: false });
        if (snapshot) {
          await this.restoreWorkloadState(entry, snapshot);
        }
        entry.ready = true;
        await this.syncServiceExposureEndpoints(entry);
      }))
      .catch((error) => {
        entry.error = error;
        entry.disposed = true;
        console.error('[globalstack:aks-runtime] backend initialization failed', {
          cluster: entry.name,
          resourceId: entry.id,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        void this.cleanupEntry(entry);
      });

    this.clustersByHost.set(fqdn, entry);
    this.clustersById.set(String(resource.id ?? '').toLowerCase(), entry);
  }

  unregisterCluster(resource) {
    const fqdn = String(resource?.properties?.fqdn ?? resource ?? '').toLowerCase();
    if (!fqdn) return;
    const entry = this.clustersByHost.get(fqdn);
    if (!entry) return;
    entry.disposed = true;
    this.clustersByHost.delete(fqdn);
    this.clustersById.delete(String(entry.id ?? '').toLowerCase());
    for (const hostName of entry.serviceExposureHosts ?? []) {
      this.edgeRouter?.unregisterEndpoint(hostName);
    }
    void this.cleanupEntry(entry);
  }

  async dispose() {
    const entries = [...this.clustersById.values()];
    this.clustersByHost.clear();
    this.clustersById.clear();
    await Promise.all(entries.map(async (entry) => {
      entry.disposed = true;
      for (const hostName of entry.serviceExposureHosts ?? []) {
        this.edgeRouter?.unregisterEndpoint(hostName);
      }
      await this.cleanupEntry(entry);
    }));
  }

  authRole(entry, headers) {
    const auth = String(headers.authorization ?? '');
    if (auth === `Bearer ${entry.adminToken}`) return 'admin';
    if (auth === `Bearer ${entry.userToken}`) return 'user';
    return null;
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = String(req.method ?? 'GET').toUpperCase();
      const host = requestHostName(req.headers);

      if (method === 'GET' && url.pathname === '/_globalstack/kubernetes/clusters') {
        const payload = JSON.stringify({ value: this.summary() }, null, 2);
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        });
        res.end(payload);
        return;
      }

      const entry = this.clustersByHost.get(host);
      if (!entry) {
        sendStatusError(res, 404, 'NotFound', `Kubernetes API host '${host}' was not found.`);
        return;
      }

      const role = this.authRole(entry, req.headers);
      if (!role) {
        sendStatusError(res, 401, 'Unauthorized', 'A valid AKS kubeconfig bearer token is required.');
        return;
      }
      if (role === 'user' && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        sendStatusError(res, 403, 'Forbidden', 'Cluster user credentials are read-only on this bounded AKS surface.');
        return;
      }

      await Promise.resolve(entry.readyPromise);
      if (entry.error) {
        sendStatusError(res, 503, 'ServiceUnavailable', `AKS backend '${entry.name}' failed to initialize: ${entry.error instanceof Error ? entry.error.message : String(entry.error)}`);
        return;
      }
      if (!entry.ready) {
        sendStatusError(res, 503, 'ServiceUnavailable', `AKS backend '${entry.name}' is still initializing.`);
        return;
      }

      if (method === 'GET' && url.pathname === '/version') {
        const backend = await backendJsonRequest(entry, {
          path: url.pathname,
          headers: this.serviceExposureAuthHeaders(entry, role),
        });
        if (backend.status !== 200) {
          sendJson(res, backend.status, backend.body);
          return;
        }
        sendJson(res, 200, aksVersionBody(entry));
        return;
      }
      if (method === 'GET' && url.pathname === '/api/v1/nodes') {
        const backend = await backendJsonRequest(entry, {
          path: url.pathname,
          headers: this.serviceExposureAuthHeaders(entry, role),
        });
        if (backend.status !== 200 || !Array.isArray(backend.body?.items)) {
          sendJson(res, backend.status, backend.body);
          return;
        }
        sendJson(res, 200, {
          ...backend.body,
          items: backend.body.items.map(node => overlayNode(entry, node)),
        });
        return;
      }
      if (method === 'GET' && url.pathname.startsWith('/api/v1/nodes/')) {
        const backend = await backendJsonRequest(entry, {
          path: url.pathname,
          headers: this.serviceExposureAuthHeaders(entry, role),
        });
        if (backend.status !== 200 || !backend.body) {
          sendJson(res, backend.status, backend.body);
          return;
        }
        sendJson(res, 200, overlayNode(entry, backend.body));
        return;
      }

      const proxied = await proxyRequest(entry, req, res, {
        upstreamHeaders: this.serviceExposureAuthHeaders(entry, role),
      });
      if (
        proxied.status < 500
        && method !== 'GET'
        && (
          /\/services(?:\/|$)/.test(url.pathname)
          || /\/namespaces\/[^/]+$/.test(url.pathname)
        )
      ) {
        void this.syncServiceExposureEndpoints(entry).catch(error => {
          console.error('[globalstack:aks-runtime] failed to reconcile service exposure', {
            cluster: entry.name,
            resourceId: entry.id,
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }
    };
  }
}

export function createAksClusterManager(options = {}) {
  return new AksClusterManager(options);
}
