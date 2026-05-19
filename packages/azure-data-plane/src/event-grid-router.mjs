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
  sendJson(res, status, {
    error: {
      code,
      message,
    },
  });
}

function topicFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.eventgrid.azure.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function validEventGridEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  for (const required of ['id', 'subject', 'eventType', 'eventTime', 'dataVersion']) {
    if (typeof event[required] !== 'string' || event[required].trim() === '') return false;
  }
  if (!Number.isFinite(Date.parse(event.eventTime))) return false;
  return Object.hasOwn(event, 'data');
}

function validCustomEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return false;
  for (const required of ['sub', 'type', 'ver']) {
    if (typeof event[required] !== 'string' || event[required].trim() === '') return false;
  }
  return Object.hasOwn(event, 'data');
}

export class EventGridRouter {
  constructor() {
    this.topics = new Map();
    this.events = new Map();
  }

  registerTopic({ topicName, host, key1, key2 }) {
    const name = String(topicName);
    const keys = new Set([key1, key2].filter(Boolean));
    this.topics.set(name.toLowerCase(), {
      topicName: name,
      host: host ?? `${name}.eastus-1.eventgrid.azure.net`,
      keys,
    });
    if (!this.events.has(name.toLowerCase())) this.events.set(name.toLowerCase(), []);
  }

  publishedEvents(topicName) {
    return [...(this.events.get(String(topicName).toLowerCase()) ?? [])];
  }

  unregisterTopic(topicName) {
    this.topics.delete(String(topicName).toLowerCase());
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();
      const topicName = topicFromHost(req.headers.host);

      if (method === 'GET' && url.pathname.startsWith('/_globalstack/event-grid/topics/')) {
        const [, , , , topic, collection] = url.pathname.split('/');
        if (collection !== 'events') return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Event Grid inspection route handles ${url.pathname}.`);
        return sendJson(res, 200, {
          value: this.publishedEvents(decodeURIComponent(topic)),
        });
      }

      if (url.pathname !== '/api/events') {
        return sendError(res, 404, 'ResourceNotFound', `No Event Grid topic endpoint was found for ${url.pathname}.`);
      }

      if (method !== 'POST') {
        return sendError(res, 405, 'MethodNotAllowed', 'Event Grid topic publish supports POST.');
      }

      if (url.searchParams.get('api-version') !== '2018-01-01') {
        return sendError(res, 400, 'MissingApiVersionParameter', 'The api-version query parameter is required and must be 2018-01-01 for this Event Grid publish surface.');
      }

      if (!topicName) {
        return sendError(res, 404, 'ResourceNotFound', 'The Event Grid topic host was not found.');
      }

      const topic = this.topics.get(topicName.toLowerCase());
      if (!topic) {
        return sendError(res, 404, 'ResourceNotFound', `The Event Grid topic '${topicName}' was not found.`);
      }

      const key = req.headers['aeg-sas-key'];
      if (!key || !topic.keys.has(String(key))) {
        return sendError(res, 401, 'Unauthorized', 'The aeg-sas-key header is missing or invalid for this Event Grid topic.');
      }

      const body = await readBody(req);
      if (body?.__invalidJson || !Array.isArray(body) || body.length === 0) {
        return sendError(res, 400, 'InvalidRequest', 'Event Grid publish requests must contain a non-empty JSON array of events.');
      }

      const overload = url.searchParams.get('overload') ?? 'EventGridEvent';
      if (!['EventGridEvent', 'customEvent'].includes(overload)) {
        return sendError(res, 400, 'InvalidRequest', `The event batch does not match the ${overload} schema.`);
      }
      const validator = overload === 'customEvent' ? validCustomEvent : validEventGridEvent;
      if (!body.every(validator)) {
        return sendError(res, 400, 'InvalidRequest', `The event batch does not match the ${overload} schema.`);
      }

      const existing = this.events.get(topicName.toLowerCase()) ?? [];
      for (const event of body) {
        existing.push({
          ...event,
          globalstackReceivedAt: new Date().toISOString(),
        });
      }
      this.events.set(topicName.toLowerCase(), existing);
      return sendJson(res, 200);
    };
  }
}

export function createEventGridRouter() {
  return new EventGridRouter();
}

export function createEventGridRouterServer(router = createEventGridRouter()) {
  return createServer(router.handler());
}
