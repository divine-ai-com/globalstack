import { createServer } from 'node:http';
import { URL } from 'node:url';

async function readBody(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

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

function serviceFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.azure-api.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function normalizeApiPath(path) {
  return String(path ?? '').replace(/^\/+|\/+$/g, '');
}

export class ApiManagementRouter {
  constructor() {
    this.services = new Map();
  }

  registerService({ serviceName, gatewayUrl }) {
    const name = String(serviceName);
    this.services.set(name.toLowerCase(), {
      serviceName: name,
      gatewayUrl: gatewayUrl ?? `https://${name}.azure-api.net`,
      apis: new Map(),
    });
  }

  unregisterService(serviceName) {
    this.services.delete(String(serviceName).toLowerCase());
  }

  registerApi({ serviceName, apiId, properties = {} }) {
    const service = this.services.get(String(serviceName).toLowerCase());
    if (!service) throw new Error(`API Management service ${serviceName} is not registered in the local router.`);
    const path = normalizeApiPath(properties.path);
    service.apis.set(path.toLowerCase(), {
      apiId,
      path,
      properties: {
        displayName: properties.displayName,
        serviceUrl: properties.serviceUrl,
        protocols: properties.protocols ?? ['https'],
        subscriptionRequired: Boolean(properties.subscriptionRequired),
      },
    });
  }

  unregisterApi({ serviceName, path }) {
    const service = this.services.get(String(serviceName).toLowerCase());
    if (service) service.apis.delete(normalizeApiPath(path).toLowerCase());
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();

      if (method === 'GET' && url.pathname.startsWith('/_globalstack/apim/services/')) {
        const [, , , , serviceName, collection] = url.pathname.split('/');
        const service = this.services.get(decodeURIComponent(serviceName ?? '').toLowerCase());
        if (!service) return sendError(res, 404, 'ResourceNotFound', `API Management service '${serviceName}' was not found.`);
        if (collection !== 'apis') return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No API Management inspection route handles ${url.pathname}.`);
        return sendJson(res, 200, {
          value: [...service.apis.values()],
        });
      }

      const serviceName = serviceFromHost(req.headers.host);
      if (!serviceName) {
        return sendError(res, 404, 'ResourceNotFound', 'The API Management gateway host was not found.');
      }
      const service = this.services.get(serviceName.toLowerCase());
      if (!service) {
        return sendError(res, 404, 'ResourceNotFound', `API Management service '${serviceName}' was not found.`);
      }

      const [apiPath] = url.pathname.split('/').filter(Boolean);
      const api = service.apis.get(normalizeApiPath(apiPath).toLowerCase());
      if (!api) {
        return sendError(res, 404, 'OperationNotFound', `Unable to match incoming request to an API path for '${url.pathname}'.`);
      }

      if (api.properties.subscriptionRequired && !req.headers['ocp-apim-subscription-key']) {
        return sendError(res, 401, 'AccessDenied', 'Access denied due to missing subscription key.');
      }

      return sendJson(res, 200, {
        serviceName: service.serviceName,
        apiId: api.apiId,
        path: api.path,
        method,
        requestPath: url.pathname,
        backendUrl: api.properties.serviceUrl ?? null,
        body: method === 'GET' || method === 'HEAD' ? null : await readBody(req),
      }, {
        'x-globalstack-apim-route': `${service.serviceName}/${api.apiId}`,
      });
    };
  }
}

export function createApiManagementRouter() {
  return new ApiManagementRouter();
}

export function createApiManagementRouterServer(router = createApiManagementRouter()) {
  return createServer(router.handler());
}
