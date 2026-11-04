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
    'x-ms-request-id': randomBytes(8).toString('hex'),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message) {
  sendJson(res, status, {
    Message: message,
    ExceptionMessage: message,
    ExceptionType: code,
    TrackingId: randomBytes(8).toString('hex'),
  });
}

function hubKey(hubName) {
  return String(hubName ?? '').toLowerCase();
}

function hubFromHost(host) {
  const hostname = String(host ?? '').split(':')[0].toLowerCase();
  if (!hostname.endsWith('.azure-devices.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function requestHost(req) {
  return req.headers['x-forwarded-host'] ?? req.headers.host;
}

function requireApiVersion(url) {
  const apiVersion = url.searchParams.get('api-version');
  if (!apiVersion) return { status: 400, code: 'MissingApiVersion', message: 'The api-version query parameter is required.' };
  if (!['2021-04-12', '2021-11-30'].includes(apiVersion)) {
    return { status: 400, code: 'InvalidApiVersion', message: `The api-version '${apiVersion}' is not supported by this local IoT Hub surface.` };
  }
  return null;
}

function requireAuth(req) {
  const auth = String(req.headers.authorization ?? '');
  if (!auth.match(/^(Bearer|SharedAccessSignature)\s+.+/i)) {
    return { status: 401, code: 'Unauthorized', message: 'Missing or invalid IoT Hub authorization token.' };
  }
  return null;
}

function ensureObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.__invalidJson) {
    throw Object.assign(new Error(message), { status: 400, code });
  }
  return value;
}

function etagFor(value) {
  return `"${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}"`;
}

function now() {
  return new Date().toISOString();
}

function deleteNullsMerge(target, patch) {
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw Object.assign(new Error('Prototype keys are not supported in twin patches.'), { status: 400, code: 'InvalidArgument' });
    }
    if (value === null) {
      delete target[key];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deleteNullsMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function defaultAuthentication() {
  return {
    type: 'sas',
    symmetricKey: {
      primaryKey: randomBytes(32).toString('base64'),
      secondaryKey: randomBytes(32).toString('base64'),
    },
  };
}

function identityFromBody(deviceId, body = {}, existing = null) {
  const timestamp = now();
  const identity = {
    deviceId,
    generationId: existing?.generationId ?? randomBytes(8).toString('hex'),
    etag: '',
    connectionState: existing?.connectionState ?? 'Disconnected',
    status: body.status ?? existing?.status ?? 'enabled',
    statusReason: body.statusReason ?? existing?.statusReason ?? null,
    connectionStateUpdatedTime: existing?.connectionStateUpdatedTime ?? timestamp,
    statusUpdatedTime: timestamp,
    lastActivityTime: existing?.lastActivityTime ?? '0001-01-01T00:00:00Z',
    cloudToDeviceMessageCount: existing?.cloudToDeviceMessageCount ?? 0,
    authentication: body.authentication ?? existing?.authentication ?? defaultAuthentication(),
    capabilities: body.capabilities ?? existing?.capabilities ?? { iotEdge: false },
    ...(body.deviceScope ?? existing?.deviceScope ? { deviceScope: body.deviceScope ?? existing.deviceScope } : {}),
    ...(body.parentScopes ?? existing?.parentScopes ? { parentScopes: body.parentScopes ?? existing.parentScopes } : {}),
  };
  identity.etag = etagFor(identity);
  return identity;
}

function twinFromIdentity(identity, existingTwin = null) {
  const twin = {
    deviceId: identity.deviceId,
    etag: existingTwin?.etag ?? '',
    deviceEtag: identity.etag,
    status: identity.status,
    statusReason: identity.statusReason,
    statusUpdateTime: identity.statusUpdatedTime,
    connectionState: identity.connectionState,
    lastActivityTime: identity.lastActivityTime,
    cloudToDeviceMessageCount: identity.cloudToDeviceMessageCount,
    authenticationType: identity.authentication?.type ?? 'sas',
    x509Thumbprint: identity.authentication?.x509Thumbprint ?? { primaryThumbprint: null, secondaryThumbprint: null },
    capabilities: identity.capabilities,
    version: existingTwin?.version ?? 1,
    tags: existingTwin?.tags ?? {},
    properties: existingTwin?.properties ?? {
      desired: { $metadata: {}, $version: 1 },
      reported: { $metadata: {}, $version: 1 },
    },
  };
  twin.etag = etagFor(twin);
  return twin;
}

function queryDevices(hub, query) {
  const normalized = String(query ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (normalized === 'select * from devices') return [...hub.twins.values()];
  if (normalized === 'select * from devices.modules') return [];
  throw Object.assign(new Error('Only SELECT * FROM devices queries are supported locally.'), {
    status: 400,
    code: 'IotHubQueryNotSupported',
  });
}

export class IotHubRouter {
  constructor() {
    this.hubs = new Map();
  }

  registerHub({ hubName, hostName }) {
    const name = String(hubName);
    this.hubs.set(hubKey(name), {
      hubName: name,
      hostName: hostName ?? `${name}.azure-devices.net`,
      devices: new Map(),
      twins: new Map(),
      telemetry: [],
    });
  }

  unregisterHub(hubName) {
    this.hubs.delete(hubKey(hubName));
  }

  hubForHost(host) {
    const hostname = String(host ?? '').split(':')[0].toLowerCase();
    const byHost = [...this.hubs.values()].find(hub => String(hub.hostName).toLowerCase() === hostname);
    if (byHost) return byHost;
    return this.hubs.get(hubKey(hubFromHost(host)));
  }

  listTelemetry(hubName) {
    return [...(this.hubs.get(hubKey(hubName))?.telemetry ?? [])];
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();
      const versionError = requireApiVersion(url);
      if (versionError) return sendError(res, versionError.status, versionError.code, versionError.message);
      const authError = requireAuth(req);
      if (authError) return sendError(res, authError.status, authError.code, authError.message);

      const hub = this.hubForHost(requestHost(req));
      if (!hub) return sendError(res, 404, 'IotHubNotFound', 'The IoT Hub host was not found.');
      const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

      try {
        if (parts[0] === 'devices') {
          const deviceId = parts[1];
          if (method === 'GET' && parts.length === 1) return sendJson(res, 200, { value: [...hub.devices.values()] });
          if (method === 'POST' && parts[1] === 'query') {
            const body = ensureObject(await readBody(req), 'InvalidRequestBody', 'Query payload must be an object.');
            return sendJson(res, 200, { value: queryDevices(hub, body.query) });
          }
          if (!deviceId) return sendError(res, 400, 'InvalidDeviceId', 'Device id is required.');

          if (method === 'PUT' && parts.length === 2) {
            const body = ensureObject(await readBody(req), 'InvalidRequestBody', 'Device identity payload must be an object.');
            const identity = identityFromBody(deviceId, body, hub.devices.get(deviceId));
            hub.devices.set(deviceId, identity);
            hub.twins.set(deviceId, twinFromIdentity(identity, hub.twins.get(deviceId)));
            return sendJson(res, 200, identity, { etag: identity.etag });
          }
          if (method === 'GET' && parts.length === 2) {
            const identity = hub.devices.get(deviceId);
            if (!identity) return sendError(res, 404, 'DeviceNotFound', `Device '${deviceId}' was not found.`);
            return sendJson(res, 200, identity, { etag: identity.etag });
          }
          if (method === 'DELETE' && parts.length === 2) {
            if (!hub.devices.has(deviceId)) return sendError(res, 404, 'DeviceNotFound', `Device '${deviceId}' was not found.`);
            hub.devices.delete(deviceId);
            hub.twins.delete(deviceId);
            return sendJson(res, 204);
          }
          if (method === 'POST' && parts[2] === 'messages' && parts[3] === 'events') {
            const identity = hub.devices.get(deviceId);
            if (!identity) return sendError(res, 404, 'DeviceNotFound', `Device '${deviceId}' was not found.`);
            if (identity.status === 'disabled') return sendError(res, 403, 'DeviceDisabled', `Device '${deviceId}' is disabled.`);
            const body = await readBody(req);
            identity.connectionState = 'Connected';
            identity.connectionStateUpdatedTime = now();
            identity.lastActivityTime = identity.connectionStateUpdatedTime;
            identity.etag = etagFor(identity);
            const twin = hub.twins.get(deviceId);
            if (twin) {
              twin.connectionState = identity.connectionState;
              twin.lastActivityTime = identity.lastActivityTime;
              twin.deviceEtag = identity.etag;
              twin.etag = etagFor(twin);
            }
            hub.telemetry.push({
              deviceId,
              enqueuedTime: identity.lastActivityTime,
              contentType: req.headers['content-type'] ?? null,
              properties: Object.fromEntries(Object.entries(req.headers).filter(([key]) => key.startsWith('iothub-app-'))),
              body,
            });
            return sendJson(res, 204);
          }
        }

        if (parts[0] === 'twins') {
          const deviceId = parts[1];
          if (!deviceId) return sendError(res, 400, 'InvalidDeviceId', 'Device id is required.');
          const twin = hub.twins.get(deviceId);
          if (!twin) return sendError(res, 404, 'DeviceNotFound', `Device '${deviceId}' was not found.`);
          if (method === 'GET' && parts.length === 2) return sendJson(res, 200, twin, { etag: twin.etag });
          if ((method === 'PATCH' || method === 'PUT') && parts.length === 2) {
            const body = ensureObject(await readBody(req), 'InvalidRequestBody', 'Twin payload must be an object.');
            if (method === 'PUT') {
              twin.tags = structuredClone(body.tags ?? {});
              twin.properties.desired = structuredClone(body.properties?.desired ?? { $metadata: {}, $version: 1 });
            } else {
              deleteNullsMerge(twin.tags, body.tags ?? {});
              deleteNullsMerge(twin.properties.desired, body.properties?.desired ?? {});
              deleteNullsMerge(twin.properties.reported, body.properties?.reported ?? {});
            }
            twin.version += 1;
            twin.properties.desired.$version = (twin.properties.desired.$version ?? 0) + 1;
            twin.etag = etagFor(twin);
            return sendJson(res, 200, twin, { etag: twin.etag });
          }
        }
      } catch (cause) {
        const status = cause.status >= 400 && cause.status < 500 ? cause.status : 500;
        return sendError(res, status, status === 500 ? 'InternalServerError' : cause.code ?? 'InvalidArgument', status === 500 ? 'The local service could not complete the request.' : cause.message);
      }

      return sendError(res, 404, 'RouteNotFound', `No IoT Hub data-plane route handled ${url.pathname}.`);
    };
  }
}

export function createIotHubRouter() {
  return new IotHubRouter();
}

export function createIotHubRouterServer(router = createIotHubRouter()) {
  return createServer(router.handler());
}
