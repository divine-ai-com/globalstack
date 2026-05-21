import { createHmac, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';

function nowUtc() {
  return new Date().toUTCString();
}

function isoNow() {
  return new Date().toISOString();
}

function xmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function canonicalizedHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')])
    .filter(([key]) => key.startsWith('x-ms-'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join('');
}

function canonicalizedResource(url, accountName) {
  const parts = [`/${accountName}${url.pathname}`];
  const grouped = new Map();
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (!grouped.has(lower)) grouped.set(lower, []);
    grouped.get(lower).push(value);
  }
  for (const [key, values] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${key}:${values.sort().join(',')}`);
  }
  return parts.join('\n');
}

function signSharedKey({ method, url, headers, bodyLength = 0, accountKey, accountName }) {
  const contentLength = bodyLength === 0 ? '' : String(bodyLength);
  const contentType = headers['content-type'] ?? headers['Content-Type'] ?? '';
  const stringToSign = [
    method.toUpperCase(),
    '',
    '',
    contentLength,
    '',
    contentType,
    '',
    '',
    '',
    '',
    '',
    '',
    `${canonicalizedHeaders(headers)}${canonicalizedResource(url, accountName)}`,
  ].join('\n');
  return createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

function signSharedKeyLite({ url, headers, accountKey, accountName }) {
  const date = headers['x-ms-date'] ?? headers.date ?? headers.Date ?? '';
  const stringToSign = [
    date,
    canonicalizedResource(url, accountName),
  ].join('\n');
  return createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

function send(res, status, body = '', headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'content-length': String(payload.length),
    ...headers,
  });
  res.end(payload);
}

function sendXmlError(res, status, code, message, requestId = 'globalstack-storage-router') {
  const body = `<?xml version="1.0" encoding="utf-8"?><Error><Code>${xmlEscape(code)}</Code><Message>${xmlEscape(message)}\nRequestId:${requestId}\nTime:${new Date().toISOString()}</Message></Error>`;
  send(res, status, body, {
    'content-type': 'application/xml',
    'x-ms-error-code': code,
    'x-ms-request-id': requestId,
    'x-ms-version': '2023-11-03',
    date: nowUtc(),
  });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function lower(value) {
  return String(value ?? '').toLowerCase();
}

function hostName(req) {
  return String(req.headers.host ?? '').split(':')[0].toLowerCase();
}

function accountFromHost(req, suffix) {
  const host = hostName(req);
  if (!host.endsWith(suffix)) return null;
  return host.slice(0, -suffix.length);
}

function parseAuthorization(req) {
  const auth = String(req.headers.authorization ?? '');
  const match = auth.match(/^(SharedKeyLite|SharedKey)\s+([^:]+):(.+)$/);
  if (!match) return null;
  return {
    scheme: match[1],
    accountName: match[2],
    signature: match[3],
  };
}

function validateAuth(req, url, account, bodyLength = 0, preferredScheme = 'SharedKey') {
  const auth = parseAuthorization(req);
  if (!auth) return { ok: false, status: 401, code: 'NoAuthenticationInformation', message: 'Server failed to authenticate the request. Please refer to the information in the Authorization header.' };
  if (auth.accountName !== account.accountName) return { ok: false, status: 403, code: 'AuthenticationFailed', message: 'The Authorization header is malformed.' };
  const expected = auth.scheme === 'SharedKeyLite'
    ? signSharedKeyLite({ url, headers: req.headers, accountKey: account.accountKey, accountName: account.accountName })
    : signSharedKey({ method: req.method, url, headers: req.headers, bodyLength, accountKey: account.accountKey, accountName: account.accountName });
  if (auth.signature !== expected || auth.scheme !== preferredScheme) {
    return { ok: false, status: 403, code: 'AuthenticationFailed', message: 'Server failed to authenticate the request. Make sure the value of Authorization header is formed correctly including the signature.' };
  }
  return { ok: true };
}

function blobKey(containerName, blobName) {
  return `${lower(containerName)}\0${blobName}`;
}

function entityKey(partitionKey, rowKey) {
  return `${partitionKey}\0${rowKey}`;
}

function parseQueueMessageXml(text) {
  const match = String(text).match(/<MessageText>([\s\S]*?)<\/MessageText>/i);
  if (!match) return null;
  try {
    return Buffer.from(match[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function queueMessagesXml(messages) {
  return `<?xml version="1.0" encoding="utf-8"?><QueueMessagesList>${messages.map(message => `<QueueMessage><MessageId>${message.messageId}</MessageId><InsertionTime>${xmlEscape(message.insertionTime)}</InsertionTime><ExpirationTime>${xmlEscape(message.expirationTime)}</ExpirationTime><DequeueCount>${message.dequeueCount}</DequeueCount><MessageText>${xmlEscape(Buffer.from(message.text).toString('base64'))}</MessageText></QueueMessage>`).join('')}</QueueMessagesList>`;
}

export class StorageDataPlaneRouter {
  constructor() {
    this.accounts = new Map();
  }

  account(accountName) {
    return this.accounts.get(lower(accountName)) ?? null;
  }

  registerStorageAccount({ accountName, accountKey }) {
    const key = lower(accountName);
    const existing = this.accounts.get(key);
    this.accounts.set(key, {
      accountName,
      accountKey,
      containers: existing?.containers ?? new Map(),
      blobs: existing?.blobs ?? new Map(),
      queues: existing?.queues ?? new Map(),
      tables: existing?.tables ?? new Map(),
    });
  }

  unregisterStorageAccount(accountName) {
    this.accounts.delete(lower(accountName));
  }

  registerContainer({ accountName, containerName }) {
    const account = this.account(accountName);
    if (!account) throw new Error(`Storage account ${accountName} is not registered.`);
    account.containers.set(lower(containerName), { containerName });
  }

  unregisterContainer({ accountName, containerName }) {
    const account = this.account(accountName);
    if (!account) return;
    account.containers.delete(lower(containerName));
    for (const key of [...account.blobs.keys()]) {
      if (key.startsWith(`${lower(containerName)}\0`)) account.blobs.delete(key);
    }
  }

  registerQueue({ accountName, queueName }) {
    const account = this.account(accountName);
    if (!account) throw new Error(`Storage account ${accountName} is not registered.`);
    if (!account.queues.has(lower(queueName))) {
      account.queues.set(lower(queueName), { queueName, messages: [] });
    }
  }

  unregisterQueue({ accountName, queueName }) {
    const account = this.account(accountName);
    account?.queues.delete(lower(queueName));
  }

  registerTable({ accountName, tableName }) {
    const account = this.account(accountName);
    if (!account) throw new Error(`Storage account ${accountName} is not registered.`);
    if (!account.tables.has(lower(tableName))) {
      account.tables.set(lower(tableName), { tableName, entities: new Map() });
    }
  }

  unregisterTable({ accountName, tableName }) {
    const account = this.account(accountName);
    account?.tables.delete(lower(tableName));
  }

  blobHandler() {
    return async (req, res) => {
      const requestId = randomUUID();
      const url = new URL(req.url, 'http://localhost');
      const accountName = accountFromHost(req, '.blob.core.windows.net');
      if (!accountName) return sendXmlError(res, 404, 'ResourceNotFound', 'The storage account host was not found.', requestId);
      const account = this.account(accountName);
      if (!account) return sendXmlError(res, 404, 'ResourceNotFound', `The storage account '${accountName}' was not found.`, requestId);
      const auth = validateAuth(req, url, account, Number(req.headers['content-length'] ?? 0), 'SharedKey');
      if (!auth.ok) return sendXmlError(res, auth.status, auth.code, auth.message, requestId);

      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      if (segments.length < 2) return sendXmlError(res, 404, 'ResourceNotFound', 'The blob path is incomplete.', requestId);
      const [containerName, ...blobParts] = segments;
      const container = account.containers.get(lower(containerName));
      if (!container) return sendXmlError(res, 404, 'ContainerNotFound', `The specified container does not exist.`, requestId);
      const blobName = blobParts.join('/');
      const key = blobKey(containerName, blobName);

      if (req.method === 'PUT') {
        if (!req.headers['x-ms-blob-type']) {
          return sendXmlError(res, 400, 'MissingRequiredHeader', "An HTTP header that's mandatory for this request is not specified.", requestId);
        }
        const body = await readBody(req);
        account.blobs.set(key, {
          blobName,
          containerName,
          contentType: String(req.headers['content-type'] ?? 'application/octet-stream'),
          body,
          etag: `"${randomUUID()}"`,
          lastModified: nowUtc(),
        });
        return send(res, 201, '', {
          etag: account.blobs.get(key).etag,
          'last-modified': account.blobs.get(key).lastModified,
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      const blob = account.blobs.get(key);
      if (!blob) return sendXmlError(res, 404, 'BlobNotFound', 'The specified blob does not exist.', requestId);

      if (req.method === 'GET') {
        return send(res, 200, blob.body, {
          'content-type': blob.contentType,
          etag: blob.etag,
          'last-modified': blob.lastModified,
          'x-ms-blob-type': 'BlockBlob',
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      if (req.method === 'DELETE') {
        account.blobs.delete(key);
        return send(res, 202, '', {
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      return sendXmlError(res, 405, 'MethodNotAllowed', `Method ${req.method} is not allowed for blobs.`, requestId);
    };
  }

  queueHandler() {
    return async (req, res) => {
      const requestId = randomUUID();
      const url = new URL(req.url, 'http://localhost');
      const accountName = accountFromHost(req, '.queue.core.windows.net');
      if (!accountName) return sendXmlError(res, 404, 'ResourceNotFound', 'The storage account host was not found.', requestId);
      const account = this.account(accountName);
      if (!account) return sendXmlError(res, 404, 'ResourceNotFound', `The storage account '${accountName}' was not found.`, requestId);
      const auth = validateAuth(req, url, account, Number(req.headers['content-length'] ?? 0), 'SharedKey');
      if (!auth.ok) return sendXmlError(res, auth.status, auth.code, auth.message, requestId);

      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const queueName = segments[0];
      const queue = account.queues.get(lower(queueName));
      if (!queue) return sendXmlError(res, 404, 'QueueNotFound', 'The specified queue does not exist.', requestId);

      if (req.method === 'POST' && segments[1]?.toLowerCase() === 'messages') {
        const body = await readBody(req);
        const text = parseQueueMessageXml(body.toString('utf8'));
        if (text === null) {
          return sendXmlError(res, 400, 'InvalidXmlDocument', 'XML specified is not syntactically valid.', requestId);
        }
        const message = {
          messageId: randomUUID(),
          text,
          insertionTime: isoNow(),
          expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          dequeueCount: 1,
        };
        queue.messages.push(message);
        const responseBody = `<?xml version="1.0" encoding="utf-8"?><QueueMessagesList><QueueMessage><MessageId>${message.messageId}</MessageId><InsertionTime>${xmlEscape(message.insertionTime)}</InsertionTime><ExpirationTime>${xmlEscape(message.expirationTime)}</ExpirationTime><PopReceipt>${randomUUID()}</PopReceipt><TimeNextVisible>${xmlEscape(message.insertionTime)}</TimeNextVisible></QueueMessage></QueueMessagesList>`;
        return send(res, 201, responseBody, {
          'content-type': 'application/xml',
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      if (req.method === 'GET' && segments[1]?.toLowerCase() === 'messages' && url.searchParams.get('peekonly') === 'true') {
        return send(res, 200, queueMessagesXml(queue.messages.slice(0, Number(url.searchParams.get('numofmessages') ?? 1))), {
          'content-type': 'application/xml',
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      return sendXmlError(res, 405, 'MethodNotAllowed', `Method ${req.method} is not allowed for queues.`, requestId);
    };
  }

  tableHandler() {
    return async (req, res) => {
      const requestId = randomUUID();
      const url = new URL(req.url, 'http://localhost');
      const accountName = accountFromHost(req, '.table.core.windows.net');
      if (!accountName) return send(res, 404, JSON.stringify({ error: { code: 'ResourceNotFound', message: 'The storage account host was not found.' } }), { 'content-type': 'application/json' });
      const account = this.account(accountName);
      if (!account) return send(res, 404, JSON.stringify({ error: { code: 'ResourceNotFound', message: `The storage account '${accountName}' was not found.` } }), { 'content-type': 'application/json' });
      const auth = validateAuth(req, url, account, Number(req.headers['content-length'] ?? 0), 'SharedKeyLite');
      if (!auth.ok) {
        return send(res, auth.status, JSON.stringify({ error: { code: auth.code, message: auth.message } }), { 'content-type': 'application/json' });
      }

      const path = url.pathname.replace(/^\/+/, '');
      if (req.method === 'POST' && path && path !== 'Tables') {
        const table = account.tables.get(lower(decodeURIComponent(path)));
        if (!table) return send(res, 404, JSON.stringify({ error: { code: 'TableNotFound', message: 'The specified table does not exist.' } }), { 'content-type': 'application/json' });
        let body;
        try {
          body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
          return send(res, 400, JSON.stringify({ error: { code: 'BadRequest', message: 'Entity body must be valid JSON.' } }), { 'content-type': 'application/json' });
        }
        if (typeof body.PartitionKey !== 'string' || typeof body.RowKey !== 'string') {
          return send(res, 400, JSON.stringify({ error: { code: 'BadRequest', message: 'PartitionKey and RowKey are required.' } }), { 'content-type': 'application/json' });
        }
        const entity = {
          ...body,
          Timestamp: isoNow(),
          'odata.etag': `W/"datetime'${isoNow()}'"`,
        };
        table.entities.set(entityKey(body.PartitionKey, body.RowKey), entity);
        return send(res, 201, JSON.stringify(entity), {
          'content-type': 'application/json;odata=nometadata',
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      const entityMatch = path.match(/^([^()]+)\(PartitionKey='([^']+)',RowKey='([^']+)'\)$/);
      if (req.method === 'GET' && entityMatch) {
        const [, tableName, partitionKey, rowKey] = entityMatch.map(decodeURIComponent);
        const table = account.tables.get(lower(tableName));
        const entity = table?.entities.get(entityKey(partitionKey, rowKey));
        if (!entity) return send(res, 404, JSON.stringify({ error: { code: 'EntityNotFound', message: 'The specified entity does not exist.' } }), { 'content-type': 'application/json' });
        return send(res, 200, JSON.stringify(entity), {
          'content-type': 'application/json;odata=nometadata',
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      return send(res, 405, JSON.stringify({ error: { code: 'MethodNotAllowed', message: `Method ${req.method} is not allowed for table storage.` } }), { 'content-type': 'application/json' });
    };
  }
}

export function createStorageDataPlaneRouter() {
  return new StorageDataPlaneRouter();
}

export function createBlobStorageServer(router = createStorageDataPlaneRouter()) {
  return createServer(router.blobHandler());
}

export function createQueueStorageServer(router = createStorageDataPlaneRouter()) {
  return createServer(router.queueHandler());
}

export function createTableStorageServer(router = createStorageDataPlaneRouter()) {
  return createServer(router.tableHandler());
}
