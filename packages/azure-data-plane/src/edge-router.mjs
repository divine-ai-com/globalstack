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

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
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

function normalizePatterns(patterns) {
  if (!Array.isArray(patterns)) return [];
  return patterns
    .map(pattern => String(pattern ?? '').trim())
    .filter(Boolean);
}

function escapeRegex(text) {
  return String(text).replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function routeMatches(pattern, path) {
  const candidate = String(path ?? '/');
  const source = String(pattern ?? '')
    .split('*')
    .map(part => escapeRegex(part))
    .join('.*');
  const regex = new RegExp(`^${source}$`, 'i');
  return regex.test(candidate);
}

export class EdgeRouter {
  constructor({ wafEvaluator = null } = {}) {
    this.endpointsByHost = new Map();
    this.wafEvaluator = wafEvaluator;
  }

  registerEndpoint({
    endpointName,
    hostName,
    kind = 'cdn',
    enabledState = 'Enabled',
    origins = [],
    isHttpAllowed = true,
    isHttpsAllowed = true,
    routePatterns = [],
    wafPolicyId,
    wafPolicyName = null,
  }) {
    const normalizedHost = hostNameFromHeader(hostName);
    const existing = this.endpointsByHost.get(normalizedHost) ?? {};
    const normalizedOrigins = normalizeOrigins(origins);
    const normalizedPatterns = normalizePatterns(routePatterns);
    const hasWafPolicyId = Object.hasOwn(arguments[0] ?? {}, 'wafPolicyId');
    const hasWafPolicyName = Object.hasOwn(arguments[0] ?? {}, 'wafPolicyName');
    this.endpointsByHost.set(normalizedHost, {
      endpointName: String(endpointName ?? existing.endpointName ?? normalizedHost),
      hostName: normalizedHost,
      kind: kind ?? existing.kind ?? 'cdn',
      enabledState: enabledState ?? existing.enabledState ?? 'Enabled',
      origins: normalizedOrigins.length > 0 ? normalizedOrigins : (existing.origins ?? []),
      isHttpAllowed: isHttpAllowed ?? existing.isHttpAllowed ?? true,
      isHttpsAllowed: isHttpsAllowed ?? existing.isHttpsAllowed ?? true,
      routePatterns: normalizedPatterns.length > 0 ? normalizedPatterns : (existing.routePatterns ?? []),
      wafPolicyId: hasWafPolicyId ? (wafPolicyId ?? null) : (existing.wafPolicyId ?? null),
      wafPolicyName: hasWafPolicyName ? (wafPolicyName ?? null) : (existing.wafPolicyName ?? null),
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

      const routePatterns = endpoint.routePatterns ?? [];
      if (routePatterns.length > 0 && !routePatterns.some(pattern => routeMatches(pattern, url.pathname))) {
        return sendError(res, 404, 'RouteNotFound', `No Front Door/CDN route matched '${url.pathname}' for endpoint '${endpoint.endpointName}'.`);
      }

      const body = await readRequestBody(req);

      if ((endpoint.wafPolicyId || endpoint.wafPolicyName) && this.wafEvaluator) {
        const wafVerdict = this.wafEvaluator.evaluate({
          policyRef: endpoint.wafPolicyId ?? null,
          policyName: endpoint.wafPolicyName,
          request: {
            headers: req.headers,
            method,
            uri: url.pathname,
            path: url.pathname,
            queryString: url.search,
            body,
            remoteAddress: req.socket?.remoteAddress ?? null,
          },
        });
        if (wafVerdict.action === 'Redirect') {
          return sendJson(res, wafVerdict.statusCode ?? 302, {
            waf: wafVerdict,
          }, {
            ...Object.fromEntries(Object.entries(wafVerdict.headers ?? {})),
            ...(wafVerdict.policyName ? { 'x-globalstack-waf-policy': wafVerdict.policyName } : {}),
            'x-globalstack-waf-action': wafVerdict.action,
          });
        }
        if (['Block', 'CAPTCHA', 'JSChallenge'].includes(wafVerdict.action)) {
          return sendJson(res, wafVerdict.statusCode ?? 403, {
            error: {
              code: wafVerdict.errorCode ?? 'WebApplicationFirewallRequestBlocked',
              message: `The WAF policy '${wafVerdict.policyName ?? endpoint.wafPolicyName ?? endpoint.wafPolicyId}' blocked this request.`,
            },
            waf: wafVerdict,
          }, {
            ...(wafVerdict.policyName ? { 'x-globalstack-waf-policy': wafVerdict.policyName } : {}),
            'x-globalstack-waf-action': wafVerdict.action,
          });
        }
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
        routePatterns: endpoint.routePatterns ?? [],
        wafPolicyId: endpoint.wafPolicyId ?? null,
        wafPolicyName: endpoint.wafPolicyName ?? null,
      }, {
        'x-globalstack-edge-route': `${endpoint.kind}/${endpoint.endpointName}`,
        ...(endpoint.wafPolicyName ? { 'x-globalstack-waf-policy': endpoint.wafPolicyName } : {}),
        ...(origin?.hostName ? { 'x-globalstack-origin-host': origin.hostName } : {}),
      });
    };
  }
}

export function createEdgeRouter(options = {}) {
  return new EdgeRouter(options);
}

export function createEdgeRouterServer(router = createEdgeRouter()) {
  return createServer(router.handler());
}
