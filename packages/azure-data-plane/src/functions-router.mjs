import { createHash } from 'node:crypto';
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

function appFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.azurewebsites.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function normalizeRoute(route) {
  return String(route ?? '')
    .split('/')
    .filter(Boolean)
    .map(segment => decodeURIComponent(segment))
    .join('/')
    .replace(/^api\//i, '');
}

function functionKey(appName, functionName) {
  return createHash('sha256')
    .update(`globalstack:functions:${String(appName).toLowerCase()}:${String(functionName).toLowerCase()}`)
    .digest('base64url')
    .slice(0, 44);
}

function hostKey(appName, slot = 'default') {
  return createHash('sha256')
    .update(`globalstack:functions:host:${String(appName).toLowerCase()}:${String(slot).toLowerCase()}`)
    .digest('base64url')
    .slice(0, 44);
}

function requestKey(req, url) {
  return req.headers['x-functions-key'] ?? url.searchParams.get('code') ?? null;
}

function matchFunction(app, route) {
  const exact = app.functions.get(route.toLowerCase());
  if (exact) return { fn: exact, params: {} };
  const routeSegments = route.split('/').filter(Boolean);
  for (const fn of app.functions.values()) {
    const patternSegments = fn.route.split('/').filter(Boolean);
    if (patternSegments.length !== routeSegments.length) continue;
    const params = {};
    let matches = true;
    for (let index = 0; index < patternSegments.length; index += 1) {
      const pattern = patternSegments[index];
      const value = routeSegments[index];
      const paramMatch = pattern.match(/^\{([^}]+)\}$/);
      if (paramMatch) {
        params[paramMatch[1]] = value;
        continue;
      }
      if (pattern.toLowerCase() !== value.toLowerCase()) {
        matches = false;
        break;
      }
    }
    if (matches) return { fn, params };
  }
  return { fn: null, params: {} };
}

export class FunctionsRouter {
  constructor() {
    this.apps = new Map();
  }

  registerApp({ appName, defaultHostName }) {
    const name = String(appName);
    this.apps.set(name.toLowerCase(), {
      appName: name,
      defaultHostName: defaultHostName ?? `${name}.azurewebsites.net`,
      functions: new Map(),
    });
  }

  unregisterApp(appName) {
    this.apps.delete(String(appName).toLowerCase());
  }

  registerHttpFunction({ appName, functionName, route, methods = ['GET', 'POST'], authLevel = 'function', key }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) throw new Error(`Function App ${appName} is not registered in the local router.`);
    const normalizedRoute = normalizeRoute(route || functionName);
    const normalizedMethods = methods.map(method => String(method).toUpperCase());
    app.functions.set(normalizedRoute.toLowerCase(), {
      functionName,
      route: normalizedRoute,
      methods: normalizedMethods,
      authLevel,
      key: key ?? functionKey(app.appName, functionName),
    });
  }

  unregisterHttpFunction({ appName, route }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (app) app.functions.delete(normalizeRoute(route).toLowerCase());
  }

  registerFunctionResource({ appName, functionName, config = {} }) {
    const bindings = Array.isArray(config.bindings) ? config.bindings : [];
    const httpTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'httptrigger');
    if (!httpTrigger) return null;
    const route = httpTrigger.route ?? functionName;
    const methods = Array.isArray(httpTrigger.methods) && httpTrigger.methods.length > 0
      ? httpTrigger.methods
      : ['GET', 'POST'];
    const authLevel = String(httpTrigger.authLevel ?? 'function').toLowerCase();
    this.registerHttpFunction({
      appName,
      functionName,
      route,
      methods,
      authLevel,
    });
    return {
      route: normalizeRoute(route),
      key: functionKey(appName, functionName),
    };
  }

  unregisterFunctionResource({ appName, config = {}, functionName }) {
    const bindings = Array.isArray(config.bindings) ? config.bindings : [];
    const httpTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'httptrigger');
    this.unregisterHttpFunction({
      appName,
      route: httpTrigger?.route ?? functionName,
    });
  }

  listFunctionKeys({ appName, functionName }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) return null;
    const fn = [...app.functions.values()].find(item => item.functionName.toLowerCase() === String(functionName).toLowerCase());
    if (!fn) return null;
    return {
      keys: {
        default: fn.key,
      },
    };
  }

  listHostKeys({ appName }) {
    const app = this.apps.get(String(appName).toLowerCase());
    if (!app) return null;
    return {
      masterKey: hostKey(app.appName, 'master'),
      functionKeys: {
        default: hostKey(app.appName, 'function-default'),
      },
      systemKeys: {},
    };
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();

      if (method === 'GET' && url.pathname.startsWith('/_globalstack/functions/apps/')) {
        const [, , , , appName, collection] = url.pathname.split('/');
        const app = this.apps.get(decodeURIComponent(appName ?? '').toLowerCase());
        if (!app) return sendError(res, 404, 'ResourceNotFound', `Function App '${appName}' was not found.`);
        if (collection !== 'functions') return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Functions inspection route handles ${url.pathname}.`);
        return sendJson(res, 200, {
          value: [...app.functions.values()].map(item => ({
            functionName: item.functionName,
            route: item.route,
            methods: item.methods,
            authLevel: item.authLevel,
          })),
        });
      }

      const appName = appFromHost(req.headers.host);
      if (!appName) {
        return sendError(res, 404, 'ResourceNotFound', 'The Function App host was not found.');
      }
      const app = this.apps.get(appName.toLowerCase());
      if (!app) {
        return sendError(res, 404, 'ResourceNotFound', `Function App '${appName}' was not found.`);
      }

      const route = normalizeRoute(url.pathname);
      const { fn, params } = matchFunction(app, route);
      if (!fn) {
        return sendError(res, 404, 'FunctionNotFound', `No HTTP trigger matched route '${url.pathname}'.`);
      }
      if (!fn.methods.includes(method)) {
        return sendError(res, 405, 'MethodNotAllowed', `HTTP method ${method} is not allowed for function '${fn.functionName}'.`);
      }
      if (fn.authLevel !== 'anonymous' && requestKey(req, url) !== fn.key) {
        return sendError(res, 401, 'Unauthorized', 'The function key is missing or invalid.');
      }

      return sendJson(res, 200, {
        appName: app.appName,
        functionName: fn.functionName,
        route: fn.route,
        method,
        requestPath: url.pathname,
        params,
        query: Object.fromEntries(url.searchParams.entries()),
        body: method === 'GET' || method === 'HEAD' ? null : await readBody(req),
      }, {
        'x-globalstack-functions-route': `${app.appName}/${fn.functionName}`,
      });
    };
  }
}

export function createFunctionsRouter() {
  return new FunctionsRouter();
}

export function createFunctionsRouterServer(router = createFunctionsRouter()) {
  return createServer(router.handler());
}

export function deterministicFunctionKey(appName, functionName) {
  return functionKey(appName, functionName);
}

export function deterministicHostKey(appName, slot = 'default') {
  return hostKey(appName, slot);
}
