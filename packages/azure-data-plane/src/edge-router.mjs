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

function sendError(res, status, code, message) {
  sendJson(res, status, {
    error: {
      code,
      message,
    },
  });
}

function hostNameFromHeader(host) {
  return String(host ?? '').split(':')[0].toLowerCase();
}

function requestHostName(headers) {
  return hostNameFromHeader(headers['x-forwarded-host'] ?? headers['x-globalstack-edge-host'] ?? headers.host);
}

function normalizeOrigins(origins) {
  if (!Array.isArray(origins)) return [];
  return origins
    .map(origin => ({
      name: String(origin?.name ?? ''),
      hostName: origin?.properties?.hostName ?? origin?.hostName ?? null,
      httpPort: origin?.properties?.httpPort ?? origin?.httpPort ?? null,
      httpsPort: origin?.properties?.httpsPort ?? origin?.httpsPort ?? null,
    }))
    .filter(origin => origin.name && origin.hostName);
}

export class EdgeRouter {
  constructor() {
    this.endpointsByHost = new Map();
  }

  registerEndpoint({
    endpointName,
    hostName,
    kind = 'cdn',
    enabledState = 'Enabled',
    origins = [],
    isHttpAllowed = true,
    isHttpsAllowed = true,
  }) {
    const normalizedHost = hostNameFromHeader(hostName);
    this.endpointsByHost.set(normalizedHost, {
      endpointName: String(endpointName),
      hostName: normalizedHost,
      kind,
      enabledState,
      origins: normalizeOrigins(origins),
      isHttpAllowed,
      isHttpsAllowed,
    });
  }

  unregisterEndpoint(hostName) {
    this.endpointsByHost.delete(hostNameFromHeader(hostName));
  }

  endpoints() {
    return [...this.endpointsByHost.values()];
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();

      if (method === 'GET' && url.pathname === '/_globalstack/edge/endpoints') {
        return sendJson(res, 200, { value: this.endpoints() });
      }

      const hostName = requestHostName(req.headers);
      const endpoint = this.endpointsByHost.get(hostName);
      if (!endpoint) {
        return sendError(res, 404, 'EndpointNotFound', `The Front Door/CDN endpoint host '${hostName}' was not found.`);
      }

      if (endpoint.enabledState === 'Disabled') {
        return sendError(res, 403, 'EndpointDisabled', `The Front Door/CDN endpoint '${endpoint.endpointName}' is disabled.`);
      }

      const protocol = String(req.headers['x-forwarded-proto'] ?? 'http').toLowerCase();
      if (protocol === 'http' && endpoint.isHttpAllowed === false) {
        return sendError(res, 403, 'ProtocolNotAllowed', `HTTP is disabled for endpoint '${endpoint.endpointName}'.`);
      }
      if (protocol === 'https' && endpoint.isHttpsAllowed === false) {
        return sendError(res, 403, 'ProtocolNotAllowed', `HTTPS is disabled for endpoint '${endpoint.endpointName}'.`);
      }

      const origin = endpoint.origins[0] ?? null;
      if (endpoint.kind === 'cdn' && !origin) {
        return sendError(res, 502, 'OriginNotConfigured', `The CDN endpoint '${endpoint.endpointName}' has no configured origin.`);
      }

      return sendJson(res, 200, {
        endpointName: endpoint.endpointName,
        hostName: endpoint.hostName,
        kind: endpoint.kind,
        method,
        path: url.pathname,
        query: url.search,
        protocol,
        originHost: origin?.hostName ?? null,
        cacheStatus: 'Configured',
      }, {
        'x-globalstack-edge-route': `${endpoint.kind}/${endpoint.endpointName}`,
        ...(origin?.hostName ? { 'x-globalstack-origin-host': origin.hostName } : {}),
      });
    };
  }
}

export function createEdgeRouter() {
  return new EdgeRouter();
}

export function createEdgeRouterServer(router = createEdgeRouter()) {
  return createServer(router.handler());
}
