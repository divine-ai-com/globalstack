import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';

async function readBody(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __invalidJson: true, raw: text.slice(0, 500) };
  }
}

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...(payload ? { 'content-type': 'application/vnd.microsoft.appconfig.kv+json; charset=utf-8' } : {}),
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message) {
  sendJson(res, status, {
    type: 'https://azconfig.io/errors',
    title: code,
    name: code,
    status,
    detail: message,
  }, { 'content-type': 'application/problem+json; charset=utf-8' });
}

function requireAuth(req) {
  const auth = String(req.headers.authorization ?? '');
  if (!auth.match(/^Bearer\s+.+/i)) {
    return { status: 401, code: 'Unauthorized', message: 'Request is missing a Bearer authorization token.' };
  }
  return null;
}

function requireApiVersion(url) {
  const apiVersion = url.searchParams.get('api-version');
  if (!apiVersion) return { status: 400, code: 'ApiVersionParameterRequired', message: 'The api-version query parameter is required.' };
  if (!['1.0', '2023-11-01'].includes(apiVersion)) {
    return { status: 400, code: 'UnsupportedApiVersion', message: `The api-version '${apiVersion}' is not supported by this local App Configuration surface.` };
  }
  return null;
}

function storeFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.azconfig.io')) return null;
  return hostname.split('.')[0] ?? null;
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function etagFor(record) {
  return `"${createHash('sha256').update(`${record.key}:${record.label ?? ''}:${record.value}:${record.revision}`).digest('hex').slice(0, 32)}"`;
}

function recordBody(record) {
  return {
    key: record.key,
    label: record.label,
    content_type: record.contentType,
    value: record.value,
    tags: record.tags,
    locked: record.locked,
    last_modified: record.lastModified,
    etag: record.etag,
  };
}

export class AppConfigurationRouter {
  constructor() {
    this.stores = new Map();
  }

  registerStore({ storeName, endpoint }) {
    const name = String(storeName);
    this.stores.set(name.toLowerCase(), {
      storeName: name,
      endpoint: endpoint ?? `https://${name}.azconfig.io`,
      keyValues: new Map(),
    });
  }

  unregisterStore(storeName) {
    this.stores.delete(String(storeName).toLowerCase());
  }

  key(store, key, label = null) {
    return `${store.storeName.toLowerCase()}\0${String(key)}\0${label ?? ''}`;
  }

  upsertKeyValue({ storeName, key, label = null, value, contentType = null, tags = {} }) {
    const store = this.stores.get(String(storeName).toLowerCase());
    if (!store) throw new Error(`App Configuration store ${storeName} is not registered in the local router.`);
    const now = new Date().toISOString();
    const mapKey = this.key(store, key, label);
    const existing = store.keyValues.get(mapKey);
    const record = {
      key,
      label,
      value,
      contentType,
      tags,
      locked: existing?.locked ?? false,
      revision: randomUUID(),
      lastModified: now,
    };
    record.etag = etagFor(record);
    store.keyValues.set(mapKey, record);
    return record;
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();

      if (method === 'GET' && url.pathname.startsWith('/_globalstack/app-configuration/stores/')) {
        const [, , , , storeName, collection] = url.pathname.split('/');
        const store = this.stores.get(decodeURIComponent(storeName ?? '').toLowerCase());
        if (!store) return sendError(res, 404, 'StoreNotFound', `The configuration store '${storeName}' was not found.`);
        if (collection === 'kv') return sendJson(res, 200, { items: [...store.keyValues.values()].map(recordBody) });
        return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No App Configuration inspection route handles ${url.pathname}.`);
      }

      const authError = requireAuth(req);
      if (authError) return sendError(res, authError.status, authError.code, authError.message);

      const versionError = requireApiVersion(url);
      if (versionError) return sendError(res, versionError.status, versionError.code, versionError.message);

      const storeName = storeFromHost(req.headers.host);
      if (!storeName) return sendError(res, 404, 'StoreNotFound', 'The App Configuration host was not found.');
      const store = this.stores.get(storeName.toLowerCase());
      if (!store) return sendError(res, 404, 'StoreNotFound', `The configuration store '${storeName}' was not found.`);

      const parts = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
      const [collection, key] = parts;
      if (collection !== 'kv') {
        return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No App Configuration data-plane route handles ${url.pathname}.`);
      }

      if (!key) {
        if (method !== 'GET') return sendError(res, 405, 'MethodNotAllowed', 'Key-value collection supports GET.');
        const selector = url.searchParams.get('key');
        const label = url.searchParams.get('label');
        const values = [...store.keyValues.values()]
          .filter(record => !selector || selector === '*' || record.key === selector)
          .filter(record => label === null || record.label === label);
        return sendJson(res, 200, { items: values.map(recordBody) });
      }

      const label = url.searchParams.get('label');
      const mapKey = this.key(store, key, label);

      if (method === 'GET') {
        const record = store.keyValues.get(mapKey);
        if (!record) return sendError(res, 404, 'KeyValueNotFound', `The key-value '${key}' was not found.`);
        return sendJson(res, 200, recordBody(record), { etag: record.etag });
      }

      if (method === 'PUT') {
        const ifMatch = req.headers['if-match'];
        const existing = store.keyValues.get(mapKey);
        if (ifMatch && ifMatch !== '*' && existing?.etag !== ifMatch) {
          return sendError(res, 412, 'PreconditionFailed', 'The provided If-Match value does not match the current ETag.');
        }
        const body = await readBody(req);
        if (body?.__invalidJson || typeof body?.value !== 'string') {
          return sendError(res, 400, 'BadRequest', 'Key-value value must be a string.');
        }
        if (Object.hasOwn(body, 'content_type') && body.content_type !== null && typeof body.content_type !== 'string') {
          return sendError(res, 400, 'BadRequest', 'content_type must be a string or null.');
        }
        if (Object.hasOwn(body, 'tags') && !isObject(body.tags)) {
          return sendError(res, 400, 'BadRequest', 'tags must be an object when provided.');
        }
        const record = this.upsertKeyValue({
          storeName: store.storeName,
          key,
          label,
          value: body.value,
          contentType: body.content_type ?? null,
          tags: body.tags ?? {},
        });
        return sendJson(res, existing ? 200 : 201, recordBody(record), { etag: record.etag });
      }

      if (method === 'DELETE') {
        const record = store.keyValues.get(mapKey);
        if (!record) return sendError(res, 404, 'KeyValueNotFound', `The key-value '${key}' was not found.`);
        store.keyValues.delete(mapKey);
        return sendJson(res, 200, recordBody(record), { etag: record.etag });
      }

      return sendError(res, 405, 'MethodNotAllowed', `Method ${method} is not supported for App Configuration key-values.`);
    };
  }
}

export function createAppConfigurationRouter() {
  return new AppConfigurationRouter();
}

export function createAppConfigurationRouterServer(router = createAppConfigurationRouter()) {
  return createServer(router.handler());
}
