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

function safeClusterName(name) {
  return String(name ?? '').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '');
}

function clusterContainerName(resource) {
  const digest = createHash('sha256')
    .update(String(resource.id ?? resource.name ?? '').toLowerCase())
    .digest('hex')
    .slice(0, 10);
  return `gs-aks-${safeClusterName(resource.name).slice(0, 24)}-${digest}`;
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

async function proxyRequest(entry, req, res) {
  const body = await readRequestBody(req);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.authorization;
  headers.host = entry.fqdn;
  headers['content-length'] = String(body.length);

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
  });

  upstream.on('error', (error) => {
    sendStatusError(res, 502, 'BadGateway', `AKS backend request failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  if (body.length > 0) upstream.write(body);
  upstream.end();
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

function overlayNode(entry, node, index) {
  const pool = entry.agentPools?.[Math.min(index, Math.max((entry.agentPools?.length ?? 1) - 1, 0))] ?? {};
  const vmSize = String(pool.vmSize ?? node?.metadata?.labels?.['node.kubernetes.io/instance-type'] ?? 'Standard_DS2_v2');
  const osType = String(pool.osType ?? node?.metadata?.labels?.['kubernetes.io/os'] ?? 'Linux').toLowerCase();
  return {
    ...node,
    metadata: {
      ...(node?.metadata ?? {}),
      labels: {
        ...(node?.metadata?.labels ?? {}),
        'kubernetes.azure.com/agentpool': String(pool.name ?? 'systempool'),
        'kubernetes.azure.com/cluster': String(entry.name ?? '').toLowerCase(),
        'kubernetes.io/os': osType,
        'node.kubernetes.io/instance-type': vmSize,
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
  } = {}) {
    this.dockerSocketPath = dockerSocketPath;
    this.docker = new Docker({ socketPath: dockerSocketPath });
    this.mode = null;
    this.networkName = null;
    this.ready = false;
    this.clustersByHost = new Map();
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
    return [...this.clustersByHost.values()].map(entry => ({
      name: entry.name,
      fqdn: entry.fqdn,
      version: entry.version,
      ready: entry.ready === true,
      failed: Boolean(entry.error),
      backendHost: entry.endpointHost ?? null,
      backendPort: entry.endpointPort ?? null,
      containerName: entry.containerName,
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

  async execText(container, cmd) {
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
    return output.toString('utf8');
  }

  async removeContainer(name) {
    try {
      const container = this.docker.getContainer(name);
      await container.remove({ force: true });
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
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

  async createBackend(resource) {
    await this.initialize();
    const image = clusterImageFor(resource);
    const containerName = clusterContainerName(resource);
    await this.removeContainer(containerName);
    await this.pullImage(image);

    const createBody = {
      name: containerName,
      Image: image,
      Hostname: containerName,
      Env: [
        'K3S_KUBECONFIG_MODE=644',
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
        safeClusterName(resource.name).slice(0, 40) || 'aks-node',
        '--tls-san',
        resource.properties.fqdn,
      ],
      Labels: {
        'io.globalstack.owner': 'globalstack',
        'io.globalstack.product': 'azure-runtime-backend',
        'io.globalstack.scope': 'platform-runtime',
        'io.globalstack.cloud': 'azure',
        'io.globalstack.backend': 'aks-k3s',
        'io.globalstack.resource-id': resource.id,
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
        ...(this.mode === 'container-network'
          ? { NetworkMode: this.networkName }
          : {
              PortBindings: {
                '6443/tcp': [{ HostIp: '127.0.0.1', HostPort: '' }],
              },
            }),
      },
    };

    const container = await this.docker.createContainer(createBody);
    await container.start();
    const backend = await this.waitForBackend(containerName, resource.properties.fqdn);
    return {
      containerId: container.id,
      containerName,
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
      void this.removeContainer(existing.containerName).catch(() => {});
    }

    const entry = {
      signature,
      name: resource.name,
      id: resource.id,
      fqdn,
      version: resource.properties?.currentKubernetesVersion ?? resource.properties?.kubernetesVersion ?? '1.29.2',
      nodeResourceGroup: resource.properties?.nodeResourceGroup ?? '',
      agentPools: Array.isArray(resource.properties?.agentPoolProfiles) ? resource.properties.agentPoolProfiles : [],
      userToken: aksKubeToken(resource.id, 'user'),
      adminToken: aksKubeToken(resource.id, 'admin'),
      containerName: clusterContainerName(resource),
      ready: false,
      error: null,
      disposed: false,
    };
    entry.readyPromise = this.createBackend(resource)
      .then((backend) => {
        if (entry.disposed) {
          return this.removeContainer(backend.containerName);
        }
        Object.assign(entry, backend, { ready: true });
      })
      .catch((error) => {
        entry.error = error;
      });

    this.clustersByHost.set(fqdn, entry);
  }

  unregisterCluster(resource) {
    const fqdn = String(resource?.properties?.fqdn ?? resource ?? '').toLowerCase();
    if (!fqdn) return;
    const entry = this.clustersByHost.get(fqdn);
    if (!entry) return;
    entry.disposed = true;
    this.clustersByHost.delete(fqdn);
    void Promise.resolve(entry.readyPromise)
      .catch(() => {})
      .finally(() => this.removeContainer(entry.containerName).catch(() => {}));
  }

  async dispose() {
    const entries = [...this.clustersByHost.values()];
    this.clustersByHost.clear();
    await Promise.all(entries.map(async (entry) => {
      entry.disposed = true;
      await Promise.resolve(entry.readyPromise).catch(() => {});
      await this.removeContainer(entry.containerName).catch(() => {});
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
        sendJson(res, 200, aksVersionBody(entry));
        return;
      }
      if (method === 'GET' && url.pathname === '/api/v1/nodes') {
        const backend = await backendJsonRequest(entry, { path: url.pathname });
        if (backend.status !== 200 || !Array.isArray(backend.body?.items)) {
          sendJson(res, backend.status, backend.body);
          return;
        }
        sendJson(res, 200, {
          ...backend.body,
          items: backend.body.items.map((node, index) => overlayNode(entry, node, index)),
        });
        return;
      }
      if (method === 'GET' && url.pathname.startsWith('/api/v1/nodes/')) {
        const backend = await backendJsonRequest(entry, { path: url.pathname });
        if (backend.status !== 200 || !backend.body) {
          sendJson(res, backend.status, backend.body);
          return;
        }
        sendJson(res, 200, overlayNode(entry, backend.body, 0));
        return;
      }

      await proxyRequest(entry, req, res);
    };
  }
}

export function createAksClusterManager(options = {}) {
  return new AksClusterManager(options);
}
