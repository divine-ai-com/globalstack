import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';

async function readBody(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __invalidJson: true };
  }
}

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...(payload ? { 'content-type': 'application/json' } : {}),
    'content-length': Buffer.byteLength(payload),
    'request-id': randomBytes(8).toString('hex'),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function serviceKey(serviceName) {
  return String(serviceName ?? '').toLowerCase();
}

function serviceFromHost(host) {
  const hostname = String(host ?? '').split(':')[0].toLowerCase();
  if (!hostname.endsWith('.search.windows.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function requestHost(req) {
  return req.headers['x-forwarded-host'] ?? req.headers.host;
}

function requireApiVersion(url) {
  const apiVersion = url.searchParams.get('api-version');
  if (!apiVersion) return { status: 400, code: 'MissingApiVersionParameter', message: 'The api-version query parameter is required.' };
  if (!['2024-07-01', '2025-09-01', '2026-04-01'].includes(apiVersion)) {
    return { status: 400, code: 'UnsupportedApiVersion', message: `The api-version '${apiVersion}' is not supported by this local Azure AI Search surface.` };
  }
  return null;
}

function requireAuth(req) {
  if (req.headers['api-key'] || String(req.headers.authorization ?? '').match(/^Bearer\s+.+/i)) return null;
  return { status: 403, code: 'Forbidden', message: 'Azure AI Search requests require an api-key or Bearer token.' };
}

function indexNameFromPath(pathname) {
  let match = pathname.match(/^\/indexes\('([^']+)'\)(?:\/|$)/);
  if (match) return decodeURIComponent(match[1]);
  match = pathname.match(/^\/indexes\/([^/]+)(?:\/|$)/);
  if (match) return decodeURIComponent(match[1]);
  return null;
}

function validateIndex(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.__invalidJson) {
    return 'Index payload must be a JSON object.';
  }
  if (!body.name || typeof body.name !== 'string') return 'Index payload requires a string name.';
  if (!Array.isArray(body.fields) || body.fields.length === 0) return 'Index payload requires at least one field.';
  if (body.fields.filter(field => field?.key === true).length !== 1) return 'Index payload requires exactly one key field.';
  for (const field of body.fields) {
    if (!field?.name || typeof field.name !== 'string') return 'Each index field requires a string name.';
    if (!field?.type || typeof field.type !== 'string') return `Field '${field.name}' requires a string type.`;
  }
  return null;
}

function etagFor(value) {
  return `"${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}"`;
}

function searchableFields(index) {
  return index.fields.filter(field => field.searchable !== false).map(field => field.name);
}

function keyField(index) {
  return index.fields.find(field => field.key === true)?.name ?? 'id';
}

function matchesSearch(index, document, searchText) {
  if (!searchText || searchText === '*') return true;
  const needle = String(searchText).toLowerCase();
  return searchableFields(index).some(field => String(document[field] ?? '').toLowerCase().includes(needle));
}

export class SearchRouter {
  constructor() {
    this.services = new Map();
  }

  registerService({ serviceName, endpoint }) {
    const name = String(serviceName);
    this.services.set(serviceKey(name), {
      serviceName: name,
      endpoint: endpoint ?? `https://${name}.search.windows.net`,
      indexes: this.services.get(serviceKey(name))?.indexes ?? new Map(),
    });
  }

  unregisterService(serviceName) {
    this.services.delete(serviceKey(serviceName));
  }

  serviceForHost(host) {
    const hostname = String(host ?? '').split(':')[0].toLowerCase();
    const byEndpoint = [...this.services.values()].find(service => new URL(service.endpoint).host.toLowerCase() === hostname);
    if (byEndpoint) return byEndpoint;
    return this.services.get(serviceKey(serviceFromHost(host)));
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();
      const versionError = requireApiVersion(url);
      if (versionError) return sendError(res, versionError.status, versionError.code, versionError.message);
      const authError = requireAuth(req);
      if (authError) return sendError(res, authError.status, authError.code, authError.message);

      const service = this.serviceForHost(requestHost(req));
      if (!service) return sendError(res, 404, 'SearchServiceNotFound', 'The Azure AI Search service host was not found.');
      const indexName = indexNameFromPath(url.pathname);

      if (url.pathname === '/indexes' && method === 'GET') {
        return sendJson(res, 200, { value: [...service.indexes.values()].map(index => index.definition) });
      }

      if (indexName && (method === 'PUT' || method === 'POST') && /^\/indexes\('[^']+'\)$/.test(url.pathname)) {
        const body = await readBody(req);
        const validation = validateIndex(body);
        if (validation) return sendError(res, 400, 'InvalidRequestParameter', validation);
        if (body.name !== indexName) return sendError(res, 400, 'InvalidRequestParameter', 'Index name in URI and body must match.');
        const definition = { ...structuredClone(body), '@odata.etag': etagFor(body) };
        service.indexes.set(indexName, {
          definition,
          fields: definition.fields,
          documents: service.indexes.get(indexName)?.documents ?? new Map(),
        });
        return sendJson(res, 201, definition, { etag: definition['@odata.etag'] });
      }

      const index = indexName ? service.indexes.get(indexName) : null;
      if (indexName && !index) return sendError(res, 404, 'IndexNotFound', `Index '${indexName}' was not found.`);

      if (indexName && method === 'GET' && /^\/indexes\('[^']+'\)$/.test(url.pathname)) {
        return sendJson(res, 200, index.definition, { etag: index.definition['@odata.etag'] });
      }

      if (indexName && method === 'DELETE' && /^\/indexes\('[^']+'\)$/.test(url.pathname)) {
        service.indexes.delete(indexName);
        return sendJson(res, 204);
      }

      if (indexName && method === 'GET' && url.pathname.endsWith('/docs/count')) {
        return sendJson(res, 200, index.documents.size);
      }

      if (indexName && method === 'POST' && url.pathname.endsWith('/docs/search.index')) {
        const body = await readBody(req);
        if (!Array.isArray(body?.value)) return sendError(res, 400, 'InvalidDocumentBatch', 'Document indexing payload requires a value array.');
        const key = keyField(index);
        const results = [];
        for (const action of body.value) {
          const searchAction = action['@search.action'] ?? 'upload';
          const keyValue = action[key];
          if (typeof keyValue !== 'string' || keyValue.length === 0) {
            return sendError(res, 400, 'InvalidDocumentKey', `Document action requires string key field '${key}'.`);
          }
          if (searchAction === 'delete') {
            index.documents.delete(keyValue);
          } else if (['upload', 'mergeOrUpload'].includes(searchAction)) {
            const copy = { ...structuredClone(action) };
            delete copy['@search.action'];
            index.documents.set(keyValue, copy);
          } else if (searchAction === 'merge') {
            if (!index.documents.has(keyValue)) return sendError(res, 404, 'DocumentNotFound', `Document '${keyValue}' was not found.`);
            const copy = { ...structuredClone(action) };
            delete copy['@search.action'];
            index.documents.set(keyValue, { ...index.documents.get(keyValue), ...copy });
          } else {
            return sendError(res, 400, 'InvalidDocumentAction', `Document action '${searchAction}' is not supported.`);
          }
          results.push({ key: keyValue, status: true, statusCode: searchAction === 'delete' ? 200 : 201 });
        }
        return sendJson(res, 200, { value: results });
      }

      if (indexName && method === 'POST' && url.pathname.endsWith('/docs/search')) {
        const body = await readBody(req);
        const searchText = body?.search ?? '*';
        const value = [...index.documents.values()]
          .filter(document => matchesSearch(index, document, searchText))
          .map(document => ({ '@search.score': 1, ...document }));
        return sendJson(res, 200, { value, count: value.length });
      }

      return sendError(res, 404, 'RouteNotFound', `No Azure AI Search route handled ${url.pathname}.`);
    };
  }
}

export function createSearchRouter() {
  return new SearchRouter();
}

export function createSearchRouterServer(router = createSearchRouter()) {
  return createServer(router.handler());
}
