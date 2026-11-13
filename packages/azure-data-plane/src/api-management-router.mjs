import { createServer } from 'node:http';
import { URL } from 'node:url';
import { backendTarget, forwardBackend } from './backend-proxy.mjs';

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
  const hostname = String(host ?? '').split(':')[0].toLowerCase();
  if (!hostname.endsWith('.azure-api.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function normalizeApiPath(path) {
  return String(path ?? '').replace(/^\/+|\/+$/g, '');
}

export class ApiManagementRouter {
  constructor(options = {}) {
    this.services = new Map();
    this.proxyOptions = options;
  }

  registerService({ serviceName, gatewayUrl }) {
    const name = String(serviceName);
    this.services.set(name.toLowerCase(), {
      serviceName: name,
      gatewayUrl: gatewayUrl ?? `https://${name}.azure-api.net`,
      apis: this.services.get(name.toLowerCase())?.apis ?? new Map(),
    });
  }

  unregisterService(serviceName) {
    this.services.delete(String(serviceName).toLowerCase());
  }

  registerApi({ serviceName, apiId, properties = {} }) {
    const service = this.services.get(String(serviceName).toLowerCase());
    if (!service) throw new Error(`API Management service ${serviceName} is not registered in the local router.`);
    const path = normalizeApiPath(properties.path);
    let operations = new Map();
    for (const [previousPath, api] of service.apis) {
      if (api.apiId === apiId) { operations = api.operations; service.apis.delete(previousPath); }
    }
    service.apis.set(path.toLowerCase(), {
      apiId,
      path,
      operations,
      properties: {
        displayName: properties.displayName,
        serviceUrl: properties.serviceUrl,
        protocols: properties.protocols ?? ['https'],
        subscriptionRequired: Boolean(properties.subscriptionRequired),
      },
    });
  }

  unregisterApi({ serviceName, path, apiId }) {
    const service = this.services.get(String(serviceName).toLowerCase());
    if (!service) return;
    if (apiId !== undefined) {
      for (const [key, api] of service.apis) if (api.apiId === apiId) service.apis.delete(key);
    } else service.apis.delete(normalizeApiPath(path).toLowerCase());
  }

  registerOperation({ serviceName, apiId, operationId, properties }) {
    const service = this.services.get(String(serviceName).toLowerCase());
    const api = [...(service?.apis.values() ?? [])].find(item => item.apiId === apiId);
    if (!api) throw new Error('The API must exist before its operations.');
    api.operations.set(operationId, { method: properties.method.toUpperCase(), urlTemplate: properties.urlTemplate });
  }

  unregisterOperation({ serviceName, apiId, operationId }) {
    const service = this.services.get(String(serviceName).toLowerCase());
    const api = [...(service?.apis.values() ?? [])].find(item => item.apiId === apiId);
    api?.operations.delete(operationId);
  }

  handler() {
    return (req, res) => this.handle(req, res).catch(error => {
      if (res.headersSent) { res.destroy(); return; }
      const invalidUrl = error instanceof URIError || error.code === 'ERR_INVALID_URL';
      sendError(res, invalidUrl ? 400 : 500, invalidUrl ? 'InvalidRequestUrl' : 'GlobalStackInternalError',
        invalidUrl ? 'The request URL is malformed.' : 'The gateway could not process the request.');
    });
  }

  async handle(req, res) {
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

    const path = url.pathname.toLowerCase();
    const api = [...service.apis.values()].filter(candidate => {
      const prefix = `/${candidate.path.toLowerCase()}`;
      return !candidate.path || path === prefix || path.startsWith(`${prefix}/`);
    }).sort((left, right) => right.path.length - left.path.length)[0];
    if (!api) {
      return sendError(res, 404, 'OperationNotFound', `Unable to match incoming request to an API path for '${url.pathname}'.`);
    }

    const operationPath = url.pathname.slice(api.path ? api.path.length + 1 : 0) || '/';
    const operation = [...api.operations.values()].find(candidate => {
      if (candidate.method !== method && candidate.method !== '*') return false;
      const [templatePath, query] = candidate.urlTemplate.split('?');
      const pattern = templatePath.split('/').map(segment => segment === '*' ? '.*'
        : /^\{[^{}]+\}$/.test(segment) ? '[^/]+'
          : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('/');
      if (!new RegExp(`^${pattern}$`).test(operationPath)) return false;
      return !query || [...new URLSearchParams(query)].every(([key, value]) => {
        const actual = url.searchParams.get(key);
        return actual !== null && (/^\{[^{}]+\}$/.test(value) || actual === value);
      });
    });
    if (!operation) return sendError(res, 404, 'OperationNotFound', 'Unable to match incoming request to a configured operation.');

    if (api.properties.subscriptionRequired && !req.headers['ocp-apim-subscription-key']) {
      return sendError(res, 401, 'AccessDenied', 'Access denied due to missing subscription key.');
    }

    let target;
    try { target = backendTarget(api.properties.serviceUrl, api.path, url); }
    catch { return sendError(res, 502, 'BackendNotConfigured', 'A valid HTTP or HTTPS backend URL is required.'); }
    return forwardBackend(req, res, target, this.proxyOptions);
  }
}

export function createApiManagementRouter(options) {
  return new ApiManagementRouter(options);
}

export function createApiManagementRouterServer(router = createApiManagementRouter()) {
  return createServer({ requestTimeout: 30000, headersTimeout: 10000 }, router.handler());
}
