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
    ...(payload ? { 'content-type': 'application/json' } : {}),
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function namespaceKey(namespaceName) {
  return String(namespaceName).toLowerCase();
}

function eventHubKey(eventHubName) {
  return String(eventHubName).toLowerCase();
}

function choosePartition(partitionIds, body) {
  if (body.partitionId !== undefined) return String(body.partitionId);
  if (body.partitionKey !== undefined) {
    const hash = createHash('sha256').update(String(body.partitionKey)).digest();
    return partitionIds[hash[0] % partitionIds.length];
  }
  return partitionIds[0];
}

function parseNonNegativeInteger(value, fieldName) {
  if (value === null || value === undefined) return { value: 0 };
  if (!/^(0|[1-9]\d*)$/.test(String(value))) {
    return { error: `${fieldName} must be a non-negative integer.` };
  }
  return { value: Number(value) };
}

function parsePositiveInteger(value, fieldName) {
  if (value === null || value === undefined) return { value: null };
  if (!/^[1-9]\d*$/.test(String(value))) {
    return { error: `${fieldName} must be a positive integer when provided.` };
  }
  return { value: Number(value) };
}

function normalizePublishBody(body) {
  if (body?.__invalidJson || !isObject(body)) {
    return { error: 'Event publish requires a JSON object with a body field or an events array.' };
  }
  if (Array.isArray(body.events)) {
    if (body.events.length === 0) return { error: 'Event batch publish requires at least one event.' };
    return { events: body.events, batch: true };
  }
  if (body.body !== undefined) return { events: [body], batch: false };
  return { error: 'Event publish requires a JSON object with a body field or an events array.' };
}

function validateEventBody(body) {
  if (!isObject(body) || body.body === undefined) {
    return 'Each event requires a JSON object with a body field.';
  }
  if (Object.hasOwn(body, 'properties') && !isObject(body.properties)) {
    return 'Event properties must be an object when provided.';
  }
  return null;
}

function buildEvent(eventHub, partitionId, body) {
  const events = eventHub.partitions.get(partitionId);
  const sequenceNumber = events.length;
  const event = {
    sequenceNumber,
    offset: String(sequenceNumber),
    enqueuedTimeUtc: new Date().toISOString(),
    messageId: body.messageId ?? randomUUID(),
    partitionId,
    partitionKey: body.partitionKey ?? null,
    body: body.body,
    properties: body.properties ?? {},
  };
  events.push(event);
  return event;
}

export class EventHubsRouter {
  constructor() {
    this.namespaces = new Map();
  }

  registerNamespace({ namespaceName, serviceBusEndpoint }) {
    const name = String(namespaceName);
    const key = namespaceKey(name);
    const existing = this.namespaces.get(key);
    this.namespaces.set(key, {
      namespaceName: name,
      serviceBusEndpoint: serviceBusEndpoint ?? `https://${name}.servicebus.windows.net:443/`,
      eventHubs: existing?.eventHubs ?? new Map(),
    });
  }

  unregisterNamespace(namespaceName) {
    this.namespaces.delete(namespaceKey(namespaceName));
  }

  registerEventHub({ namespaceName, eventHubName, partitionCount = 2, messageRetentionInDays = 1 }) {
    const namespace = this.namespaces.get(namespaceKey(namespaceName));
    if (!namespace) throw new Error(`Event Hubs namespace ${namespaceName} is not registered in the local router.`);
    const count = Number.isInteger(partitionCount) && partitionCount > 0 ? partitionCount : 2;
    const partitionIds = Array.from({ length: count }, (_, index) => String(index));
    namespace.eventHubs.set(eventHubKey(eventHubName), {
      eventHubName: String(eventHubName),
      partitionIds,
      messageRetentionInDays,
      partitions: new Map(partitionIds.map(partitionId => [partitionId, []])),
    });
  }

  unregisterEventHub({ namespaceName, eventHubName }) {
    const namespace = this.namespaces.get(namespaceKey(namespaceName));
    namespace?.eventHubs.delete(eventHubKey(eventHubName));
  }

  getEventHub(namespaceName, eventHubName) {
    const namespace = this.namespaces.get(namespaceKey(namespaceName));
    if (!namespace) return { error: { status: 404, code: 'NamespaceNotFound', message: `The Event Hubs namespace '${namespaceName}' was not found.` } };
    const eventHub = namespace.eventHubs.get(eventHubKey(eventHubName));
    if (!eventHub) return { error: { status: 404, code: 'EventHubNotFound', message: `The event hub '${eventHubName}' was not found.` } };
    return { namespace, eventHub };
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();
      const parts = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));

      if (parts[0] !== '_globalstack' || parts[1] !== 'event-hubs') {
        return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Event Hubs route handles ${url.pathname}.`);
      }

      if (parts[2] === 'namespaces' && parts[4] === 'eventhubs') {
        const namespaceName = parts[3];
        const eventHubName = parts[5];
        const action = parts[6];
        const lookup = this.getEventHub(namespaceName, eventHubName);
        if (lookup.error) return sendError(res, lookup.error.status, lookup.error.code, lookup.error.message);
        const { eventHub } = lookup;

        if (method === 'GET' && !action) {
          return sendJson(res, 200, {
            name: eventHub.eventHubName,
            partitionIds: eventHub.partitionIds,
            messageRetentionInDays: eventHub.messageRetentionInDays,
            eventCount: [...eventHub.partitions.values()].reduce((total, events) => total + events.length, 0),
          });
        }

        if (method === 'GET' && action === 'partitions') {
          return sendJson(res, 200, {
            value: eventHub.partitionIds.map(partitionId => ({
              partitionId,
              beginningSequenceNumber: 0,
              lastEnqueuedSequenceNumber: Math.max(-1, (eventHub.partitions.get(partitionId)?.length ?? 0) - 1),
            })),
          });
        }

        if (method === 'POST' && action === 'events') {
          const body = await readBody(req);
          const normalized = normalizePublishBody(body);
          if (normalized.error) return sendError(res, 400, 'BadParameter', normalized.error);

          const pending = [];
          for (const eventBody of normalized.events) {
            const validationError = validateEventBody(eventBody);
            if (validationError) return sendError(res, 400, 'BadParameter', validationError);
            const partitionId = choosePartition(eventHub.partitionIds, eventBody);
            if (!eventHub.partitionIds.includes(partitionId)) {
              return sendError(res, 400, 'PartitionNotFound', `Partition '${partitionId}' does not exist on event hub '${eventHubName}'.`);
            }
            pending.push({ partitionId, eventBody });
          }

          const published = pending.map(item => buildEvent(eventHub, item.partitionId, item.eventBody));
          return sendJson(res, 201, normalized.batch ? { value: published } : published[0]);
        }

        if (method === 'GET' && action === 'events') {
          const partitionId = String(url.searchParams.get('partitionId') ?? eventHub.partitionIds[0]);
          if (!eventHub.partitionIds.includes(partitionId)) {
            return sendError(res, 400, 'PartitionNotFound', `Partition '${partitionId}' does not exist on event hub '${eventHubName}'.`);
          }
          const fromSequenceNumber = parseNonNegativeInteger(url.searchParams.get('fromSequenceNumber'), 'fromSequenceNumber');
          if (fromSequenceNumber.error) return sendError(res, 400, 'BadParameter', fromSequenceNumber.error);
          const maxEvents = parsePositiveInteger(url.searchParams.get('maxEvents'), 'maxEvents');
          if (maxEvents.error) return sendError(res, 400, 'BadParameter', maxEvents.error);
          let value = (eventHub.partitions.get(partitionId) ?? []).filter(event => event.sequenceNumber >= fromSequenceNumber.value);
          if (maxEvents.value !== null) {
            value = value.slice(0, maxEvents.value);
          }
          return sendJson(res, 200, {
            value,
          });
        }

        return sendError(res, 405, 'MethodNotAllowed', `Event hub ${eventHubName} does not support ${method} ${action ?? ''}`.trim());
      }

      return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Event Hubs route handles ${url.pathname}.`);
    };
  }
}

export function createEventHubsRouter() {
  return new EventHubsRouter();
}

export function createEventHubsRouterServer(router = createEventHubsRouter()) {
  return createServer(router.handler());
}
