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
    return { __invalidJson: true };
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
  sendJson(res, status, { error: { code, message } });
}

function instanceKey(instanceName) {
  return String(instanceName ?? '').toLowerCase();
}

function instanceFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.digitaltwins.azure.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function requireApiVersion(url) {
  const apiVersion = url.searchParams.get('api-version');
  if (!apiVersion) return { status: 400, code: 'ApiVersionParameterRequired', message: 'The api-version query parameter is required.' };
  if (!['2023-10-31', '2022-05-31'].includes(apiVersion)) {
    return { status: 400, code: 'UnsupportedApiVersion', message: `The api-version '${apiVersion}' is not supported by this local Digital Twins surface.` };
  }
  return null;
}

function requireAuth(req) {
  const auth = String(req.headers.authorization ?? '');
  if (!auth.match(/^Bearer\s+.+/i)) {
    return { status: 401, code: 'Unauthorized', message: 'Request is missing a Bearer authorization token.' };
  }
  return null;
}

function requestHost(req) {
  return req.headers['x-forwarded-host'] ?? req.headers.host;
}

function etagFor(value) {
  return `W/"${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}"`;
}

function modelId(model) {
  return model?.['@id'] ?? model?.id ?? null;
}

function ensureObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.__invalidJson) {
    throw Object.assign(new Error(message), { status: 400, code });
  }
  return value;
}

function setPath(target, path, value) {
  const parts = String(path ?? '').split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (!parts.length) throw Object.assign(new Error('JSON Patch path is required.'), { status: 400, code: 'JsonPatchInvalid' });
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function removePath(target, path) {
  const parts = String(path ?? '').split('/').slice(1).map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
  if (!parts.length) throw Object.assign(new Error('JSON Patch path is required.'), { status: 400, code: 'JsonPatchInvalid' });
  let cursor = target;
  for (const part of parts.slice(0, -1)) cursor = cursor?.[part];
  if (!cursor || !Object.hasOwn(cursor, parts.at(-1))) {
    throw Object.assign(new Error(`JSON Patch path '${path}' does not exist.`), { status: 400, code: 'JsonPatchInvalid' });
  }
  delete cursor[parts.at(-1)];
}

function applyPatch(twin, patch) {
  if (!Array.isArray(patch)) {
    throw Object.assign(new Error('JSON Patch body must be an array.'), { status: 400, code: 'JsonPatchInvalid' });
  }
  for (const operation of patch) {
    if (!['add', 'replace', 'remove'].includes(operation?.op)) {
      throw Object.assign(new Error(`JSON Patch operation '${operation?.op}' is not supported.`), { status: 400, code: 'JsonPatchInvalid' });
    }
    if (operation.op === 'remove') removePath(twin, operation.path);
    else setPath(twin, operation.path, operation.value);
  }
}

export class DigitalTwinsRouter {
  constructor() {
    this.instances = new Map();
  }

  registerInstance({ instanceName, hostName }) {
    const name = String(instanceName);
    this.instances.set(instanceKey(name), {
      instanceName: name,
      hostName: hostName ?? `${name}.api.eastus.digitaltwins.azure.net`,
      models: new Map(),
      twins: new Map(),
      relationships: new Map(),
    });
  }

  unregisterInstance(instanceName) {
    this.instances.delete(instanceKey(instanceName));
  }

  instanceForHost(host) {
    const hostname = String(host ?? '').split(':')[0].toLowerCase();
    const byHost = [...this.instances.values()].find(instance => String(instance.hostName).toLowerCase() === hostname);
    if (byHost) return byHost;
    const byName = instanceFromHost(host);
    return this.instances.get(instanceKey(byName));
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();
      const versionError = requireApiVersion(url);
      if (versionError) return sendError(res, versionError.status, versionError.code, versionError.message);
      const authError = requireAuth(req);
      if (authError) return sendError(res, authError.status, authError.code, authError.message);

      const instance = this.instanceForHost(requestHost(req));
      if (!instance) return sendError(res, 404, 'DigitalTwinsInstanceNotFound', 'The Digital Twins instance host was not found.');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      try {
        if (parts[0] === 'models') {
          if (method === 'POST' && parts.length === 1) {
            const body = await readBody(req);
            if (!Array.isArray(body) || body.length === 0) return sendError(res, 400, 'DTDLParserError', 'Models body must be a non-empty array.');
            for (const model of body) {
              const id = modelId(model);
              if (!id) return sendError(res, 400, 'InvalidArgument', 'Each model requires @id.');
              if (instance.models.has(id)) return sendError(res, 409, 'ModelAlreadyExists', `Model '${id}' already exists.`);
            }
            const created = body.map(model => {
              const id = modelId(model);
              const metadata = { id, decommissioned: false, model: structuredClone(model), etag: etagFor(model) };
              instance.models.set(id, metadata);
              return metadata;
            });
            return sendJson(res, 201, { value: created });
          }
          if (method === 'GET' && parts.length === 1) return sendJson(res, 200, { value: [...instance.models.values()] });
          if (method === 'GET' && parts.length === 2) {
            const model = instance.models.get(parts[1]);
            if (!model) return sendError(res, 404, 'ModelNotFound', `Model '${parts[1]}' was not found.`);
            return sendJson(res, 200, model);
          }
        }

        if (parts[0] === 'digitaltwins') {
          const twinId = parts[1];
          if (!twinId) return sendError(res, 400, 'InvalidArgument', 'Digital twin id is required.');

          if (method === 'PUT' && parts.length === 2) {
            const body = ensureObject(await readBody(req), 'ValidationFailed', 'Digital twin payload must be an object.');
            const model = body.$metadata?.$model;
            if (model && !instance.models.has(model)) return sendError(res, 400, 'ValidationFailed', `Model '${model}' has not been uploaded.`);
            const twin = { ...structuredClone(body), $dtId: twinId, $etag: etagFor(body) };
            instance.twins.set(twinId, twin);
            return sendJson(res, 200, twin);
          }
          if (method === 'GET' && parts.length === 2) {
            const twin = instance.twins.get(twinId);
            if (!twin) return sendError(res, 404, 'DigitalTwinNotFound', `Digital twin '${twinId}' was not found.`);
            return sendJson(res, 200, twin);
          }
          if (method === 'PATCH' && parts.length === 2) {
            const twin = instance.twins.get(twinId);
            if (!twin) return sendError(res, 404, 'DigitalTwinNotFound', `Digital twin '${twinId}' was not found.`);
            applyPatch(twin, await readBody(req));
            twin.$etag = etagFor(twin);
            return sendJson(res, 204);
          }
          if (method === 'DELETE' && parts.length === 2) {
            const twin = instance.twins.get(twinId);
            if (!twin) return sendError(res, 404, 'DigitalTwinNotFound', `Digital twin '${twinId}' was not found.`);
            const outgoing = instance.relationships.get(twinId);
            const incoming = [...instance.relationships.values()].flatMap(map => [...map.values()]).some(rel => rel.$targetId === twinId);
            if ((outgoing?.size ?? 0) > 0 || incoming) return sendError(res, 400, 'RelationshipsNotDeleted', `Digital twin '${twinId}' has relationships.`);
            instance.twins.delete(twinId);
            return sendJson(res, 204);
          }

          if (parts[2] === 'relationships') {
            const twin = instance.twins.get(twinId);
            if (!twin) return sendError(res, 404, 'DigitalTwinNotFound', `Digital twin '${twinId}' was not found.`);
            const relationshipId = parts[3];
            const relationships = instance.relationships.get(twinId) ?? new Map();
            instance.relationships.set(twinId, relationships);
            if (method === 'PUT' && relationshipId) {
              const body = ensureObject(await readBody(req), 'InvalidArgument', 'Relationship payload must be an object.');
              if (!instance.twins.has(body.$targetId)) return sendError(res, 404, 'DigitalTwinNotFound', `Target digital twin '${body.$targetId}' was not found.`);
              const relationship = {
                ...structuredClone(body),
                $relationshipId: relationshipId,
                $sourceId: twinId,
                $etag: etagFor(body),
              };
              relationships.set(relationshipId, relationship);
              return sendJson(res, 200, relationship);
            }
            if (method === 'GET' && !relationshipId) {
              const relationshipName = url.searchParams.get('relationshipName');
              const value = [...relationships.values()].filter(rel => !relationshipName || rel.$relationshipName === relationshipName);
              return sendJson(res, 200, { value });
            }
            if (method === 'GET' && relationshipId) {
              const relationship = relationships.get(relationshipId);
              if (!relationship) return sendError(res, 404, 'RelationshipNotFound', `Relationship '${relationshipId}' was not found.`);
              return sendJson(res, 200, relationship);
            }
            if (method === 'DELETE' && relationshipId) {
              if (!relationships.has(relationshipId)) return sendError(res, 404, 'RelationshipNotFound', `Relationship '${relationshipId}' was not found.`);
              relationships.delete(relationshipId);
              return sendJson(res, 204);
            }
          }
        }

        if (parts[0] === 'query' && method === 'POST') {
          const body = ensureObject(await readBody(req), 'InvalidArgument', 'Query payload must be an object.');
          const query = String(body.query ?? '').trim();
          if (!/^SELECT\s+\*\s+FROM\s+DIGITALTWINS/i.test(query)) return sendError(res, 400, 'InvalidQuery', 'Only SELECT * FROM DIGITALTWINS queries are supported locally.');
          return sendJson(res, 200, { value: [...instance.twins.values()] });
        }
      } catch (cause) {
        const status = cause.status >= 400 && cause.status < 500 ? cause.status : 500;
        return sendError(res, status, status === 500 ? 'InternalServerError' : cause.code ?? 'InvalidArgument', status === 500 ? 'The local service could not complete the request.' : cause.message);
      }

      return sendError(res, 404, 'RouteNotFound', `No Digital Twins data-plane route handled ${url.pathname}.`);
    };
  }
}

export function createDigitalTwinsRouter(options = {}) {
  return new DigitalTwinsRouter(options);
}

export function createDigitalTwinsRouterServer(router = createDigitalTwinsRouter()) {
  return createServer(router.handler());
}
