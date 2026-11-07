import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { evaluateSearch } from './search-query.mjs';
import { searchTokenAuthorizer } from './search-token-auth.mjs';

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

function sendError(res, status, code, message, details) {
  sendJson(res, status, { error: { code, message, ...(details ? { details } : {}) } });
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
  const keyCount = body.fields.filter(field => field?.key === true).length;
  if (keyCount > 1) {
    const message = `Found ${keyCount} key fields in index '${body.name}'. Each index must have exactly one key field.`;
    return { code: 'OperationNotAllowed', message: `The request is invalid. Details: index : ${message}`,
      details: [{ code: 'CompoundKeysNotSupported', message: `${message} Parameters: index` }] };
  }
  if (keyCount === 0) return 'Index payload requires exactly one key field.';
  for (const field of body.fields) {
    if (!field?.name || typeof field.name !== 'string') return 'Each index field requires a string name.';
    if (!field?.type || typeof field.type !== 'string') return `Field '${field.name}' requires a string type.`;
  }
  return null;
}

function etagFor(value) {
  return `"${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}"`;
}

function keyField(index) {
  return index.fields.find(field => field.key === true)?.name ?? 'id';
}

export class SearchRouter {
  constructor({ store, tokenTrusts = [] } = {}) {
    if (!Array.isArray(tokenTrusts)) throw new Error('Search token trusts must be an array.');
    this.store = store;
    this.workloadAuthorization = tokenTrusts.length ? searchTokenAuthorizer({ store, trusts: tokenTrusts }) : null;
    this.services = new Map();
  }

  registerService({ serviceName, endpoint, resourceId }) {
    const name = String(serviceName);
    this.services.set(serviceKey(name), {
      serviceName: name, resourceId,
      endpoint: endpoint ?? `https://${name}.search.windows.net`,
      indexes: this.services.get(serviceKey(name))?.indexes ?? new Map(),
    });
  }

  unregisterService(serviceName) {
    this.services.delete(serviceKey(serviceName));
  }

  resolveIndexScope(route) {
    if (route.providerNamespace?.toLowerCase() !== 'microsoft.search') return null;
    const parts = route.typePath.split('/');
    if (parts.length !== 4 || parts[0].toLowerCase() !== 'searchservices' || parts[2].toLowerCase() !== 'indexes') return null;
    const service = this.services.get(serviceKey(parts[1]));
    const parent = `/subscriptions/${route.subscriptionId}/resourceGroups/${route.resourceGroupName}/providers/Microsoft.Search/searchServices/${parts[1]}`;
    if (service?.resourceId?.toLowerCase() !== parent.toLowerCase() || !this.store?.resources.has(parent.toLowerCase()) || !service.indexes.has(parts[3])) return null;
    return { id: `${service.resourceId}/indexes/${parts[3]}` };
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

      if (!this.workloadAuthorization) {
        const legacyError = requireAuth(req);
        if (legacyError) return sendError(res, legacyError.status, legacyError.code, legacyError.message);
      }
      const service = this.serviceForHost(requestHost(req));
      if (!service) return sendError(res, 404, 'SearchServiceNotFound', 'The Azure AI Search service host was not found.');
      const indexName = indexNameFromPath(url.pathname);
      const authError = this.workloadAuthorization
        ? await this.workloadAuthorization({ req, url, service, indexName }) : requireAuth(req);
      if (authError) return sendError(res, authError.status, authError.code, authError.message);

      if (url.pathname === '/indexes' && method === 'GET') {
        return sendJson(res, 200, { value: [...service.indexes.values()].map(index => index.definition) });
      }

      if (indexName && (method === 'PUT' || method === 'POST') && /^\/indexes\('[^']+'\)$/.test(url.pathname)) {
        const body = await readBody(req);
        const validation = validateIndex(body);
        if (validation) return typeof validation === 'string'
          ? sendError(res, 400, 'InvalidRequestParameter', validation)
          : sendJson(res, 400, { error: validation });
        if (body.name !== indexName) return sendError(res, 400, 'InvalidRequestParameter', 'Index name in URI and body must match.');
        const definition = { ...structuredClone(body), '@odata.etag': etagFor(body) };
        for (const field of definition.fields) {
          if (field.vectorSearchProfile && field.retrievable === undefined) field.retrievable = false;
        }
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

      if (indexName && method === 'POST' && (url.pathname.endsWith('/docs/search') || url.pathname.endsWith('/docs/search.post.search'))) {
        const body = await readBody(req);
        const result = evaluateSearch(index, body);
        if (result.error) return sendError(res, result.error.status, result.error.code, result.error.message, result.error.details);
        return sendJson(res, 200, result.body);
      }

      return sendError(res, 404, 'RouteNotFound', `No Azure AI Search route handled ${url.pathname}.`);
    };
  }
}

export function createSearchRouter(options) {
  return new SearchRouter(options);
}

export function createSearchRouterServer(router = createSearchRouter()) {
  return createServer(router.handler());
}
