import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { leaseHeaders, leaseGuard, operateLease, blobConditions, leaseState } from './storage-lease.mjs';
import { tableFilter } from './storage-table-filter.mjs';
import { parseTableBatch, executeTableBatch, tableBatchResponse } from './storage-table-batch.mjs';
import { QueueDeleteStaleReadTracker } from './queue-delete-window.mjs';

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

function headerValue(headers, name) {
  return headers[name.toLowerCase()] ?? headers[name] ?? '';
}

function signSharedKey({ method, url, headers, bodyLength = 0, accountKey, accountName }) {
  const contentLengthHeader = headerValue(headers, 'content-length');
  const contentLength = String(contentLengthHeader || bodyLength || '') === '0'
    ? ''
    : String(contentLengthHeader || bodyLength || '');
  const stringToSign = [
    method.toUpperCase(),
    headerValue(headers, 'content-encoding'),
    headerValue(headers, 'content-language'),
    contentLength,
    headerValue(headers, 'content-md5'),
    headerValue(headers, 'content-type'),
    headerValue(headers, 'date'),
    headerValue(headers, 'if-modified-since'),
    headerValue(headers, 'if-match'),
    headerValue(headers, 'if-none-match'),
    headerValue(headers, 'if-unmodified-since'),
    headerValue(headers, 'range'),
    `${canonicalizedHeaders(headers)}${canonicalizedResource(url, accountName)}`,
  ].join('\n');
  return {
    signature: createHmac('sha256', Buffer.from(accountKey, 'base64'))
      .update(stringToSign, 'utf8')
      .digest('base64'),
    stringToSign,
  };
}

function signSharedKeyLite({ url, headers, accountKey, accountName }) {
  const date = headers['x-ms-date'] ?? headers.date ?? headers.Date ?? '';
  const stringToSign = [
    date,
    canonicalizedResource(url, accountName),
  ].join('\n');
  return {
    signature: createHmac('sha256', Buffer.from(accountKey, 'base64'))
      .update(stringToSign, 'utf8')
      .digest('base64'),
    stringToSign,
  };
}

function validateTableKey(req, url, account) {
  const auth = parseAuthorization(req);
  if (!auth || auth.accountName !== account.accountName) return false;
  const resource = `/${account.accountName}${url.pathname}${url.searchParams.has('comp') ? `?comp=${url.searchParams.get('comp')}` : ''}`;
  const date = req.headers['x-ms-date'] ?? req.headers.date ?? '';
  const fields = auth.scheme === 'SharedKeyLite' ? [date, resource]
    : [req.method, req.headers['content-md5'] ?? '', req.headers['content-type'] ?? '', date, resource];
  const expected = createHmac('sha256', Buffer.from(account.accountKey, 'base64')).update(fields.join('\n')).digest();
  const received = Buffer.from(auth.signature, 'base64');
  return received.length === expected.length && timingSafeEqual(received, expected);
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
  // HEAD errors have no entity body. Advertising XML bytes that are not sent
  // makes native SDKs parse an empty stream instead of handling the error code.
  send(res, status, res.req?.method === 'HEAD' ? '' : body, {
    ...(res.req?.method === 'HEAD' ? {} : { 'content-type': 'application/xml' }),
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
  const match = auth.match(/^(SharedKeyLite|SharedKey)[ \t]+([^:\s]+):(\S+)$/);
  if (!match) return null;
  return {
    scheme: match[1],
    accountName: match[2],
    signature: match[3],
  };
}

function validateSharedKey(req, url, account, bodyLength = 0, preferredScheme = 'SharedKey') {
  const auth = parseAuthorization(req);
  if (!auth) return { ok: false, status: 401, code: 'NoAuthenticationInformation', message: 'Server failed to authenticate the request. Please refer to the information in the Authorization header.' };
  if (auth.accountName !== account.accountName) return { ok: false, status: 403, code: 'AuthenticationFailed', message: 'The Authorization header is malformed.' };
  const acceptedSchemes = Array.isArray(preferredScheme) ? preferredScheme : [preferredScheme];
  const expected = auth.scheme === 'SharedKeyLite'
    ? signSharedKeyLite({ url, headers: req.headers, accountKey: account.accountKey, accountName: account.accountName })
    : signSharedKey({ method: req.method, url, headers: req.headers, bodyLength, accountKey: account.accountKey, accountName: account.accountName });
  if (auth.signature !== expected.signature || !acceptedSchemes.includes(auth.scheme)) {
    if (process.env.DEBUG) {
      console.error('[globalstack-storage-auth]', JSON.stringify({
        ok: false,
        method: req.method,
        authScheme: auth.scheme,
        acceptedSchemes,
      }));
    }
    return { ok: false, status: 403, code: 'AuthenticationFailed', message: 'Server failed to authenticate the request. Make sure the value of Authorization header is formed correctly including the signature.' };
  }
  return { ok: true };
}

function validateServiceSas(url, account, actualResource, method) {
  const signature = url.searchParams.get('sig');
  if (!signature) return { ok: false };
  const fields = {
    permissions: url.searchParams.get('sp') ?? '',
    startTime: url.searchParams.get('st') ?? '',
    expiryTime: url.searchParams.get('se') ?? '',
    canonicalizedResource: actualResource,
    protocols: url.searchParams.get('spr') ?? '',
    version: url.searchParams.get('sv') ?? '',
    resource: url.searchParams.get('sr') ?? '',
    cacheControl: url.searchParams.get('rscc') ?? '',
    contentDisposition: url.searchParams.get('rscd') ?? '',
    contentEncoding: url.searchParams.get('rsce') ?? '',
    contentLanguage: url.searchParams.get('rscl') ?? '',
    contentType: url.searchParams.get('rsct') ?? '',
  };
  const expected = createHmac('sha256', Buffer.from(account.accountKey, 'base64'))
    .update([
      fields.permissions,
      fields.startTime,
      fields.expiryTime,
      fields.canonicalizedResource,
      fields.protocols,
      fields.version,
      fields.resource,
      fields.cacheControl,
      fields.contentDisposition,
      fields.contentEncoding,
      fields.contentLanguage,
      fields.contentType,
    ].join('\n'), 'utf8')
    .digest('base64');
  const permissions = fields.permissions.toLowerCase();
  const needsRead = ['GET', 'HEAD'].includes(method.toUpperCase());
  const needsWrite = ['PUT', 'DELETE'].includes(method.toUpperCase());
  const protocol = fields.protocols.toLowerCase();
  if (signature !== expected) {
    return {
      ok: false,
      status: 403,
      code: 'AuthenticationFailed',
      message: 'Server failed to authenticate the request. Make sure the value of Authorization header or SAS token is formed correctly.',
    };
  }
  if ((protocol && protocol !== 'https' && protocol !== 'https,http') || (needsRead && !permissions.includes('r')) || (needsWrite && !permissions.includes('w') && !permissions.includes('d'))) {
    return {
      ok: false,
      status: 403,
      code: 'AuthorizationFailure',
      message: 'This request is not authorized to perform this operation using the specified service SAS.',
    };
  }
  return { ok: true };
}

function blobKey(containerName, blobName) {
  return `${lower(containerName)}\0${blobName}`;
}

function normalizeStoragePathSegments(segments, accountName) {
  if (segments.length >= 3
    && lower(segments[0]) === lower(accountName)
    && lower(segments[1]) === 'default') {
    return segments.slice(2);
  }
  return segments;
}

function entityKey(partitionKey, rowKey) {
  return `${partitionKey}\0${rowKey}`;
}

function parseQueueMessageXml(text) {
  const match = String(text).match(/^\s*(?:<\?xml[^?]*\?>\s*)?<QueueMessage>\s*<MessageText>([\s\S]*?)<\/MessageText>\s*<\/QueueMessage>\s*$/);
  if (!match || /[<>]/.test(match[1]) || /&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/i.test(match[1])) return null;
  try {
    return match[1].replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, entity) => {
      if (entity.startsWith('#')) {
        const code = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        if (!(code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff)) throw new Error('Invalid XML character');
        return String.fromCodePoint(code);
      }
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity];
    });
  } catch { return null; }
}

function queueMessagesXml(messages, receive = false, includeText = true) {
  return `<?xml version="1.0" encoding="utf-8"?><QueueMessagesList>${messages.map(message => `<QueueMessage><MessageId>${message.messageId}</MessageId><InsertionTime>${xmlEscape(message.insertionTime)}</InsertionTime><ExpirationTime>${xmlEscape(message.expirationTime)}</ExpirationTime>${receive ? `<PopReceipt>${xmlEscape(message.popReceipt)}</PopReceipt><TimeNextVisible>${xmlEscape(new Date(message.visibleAt).toUTCString())}</TimeNextVisible>` : ''}${includeText ? `<DequeueCount>${message.dequeueCount}</DequeueCount><MessageText>${xmlEscape(message.text)}</MessageText>` : ''}</QueueMessage>`).join('')}</QueueMessagesList>`;
}

export class StorageDataPlaneRouter {
  constructor() {
    this.accounts = new Map();
    this.queueDeleteTracker = new QueueDeleteStaleReadTracker();
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
    if (!account.containers.has(lower(containerName))) {
      account.containers.set(lower(containerName), { containerName, etag: `"${randomUUID()}"`, lastModified: nowUtc(), metadata: {} });
    }
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
    this.queueDeleteTracker.clear({ accountName, queueName });
    if (!account.queues.has(lower(queueName))) {
      account.queues.set(lower(queueName), { queueName, messages: [], metadata: {} });
    }
  }

  unregisterQueue({ accountName, queueName }) {
    const account = this.account(accountName);
    this.queueDeleteTracker.clear({ accountName, queueName });
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

      const segments = normalizeStoragePathSegments(
        url.pathname.split('/').filter(Boolean).map(decodeURIComponent),
        accountName,
      );
      const [containerName, ...blobParts] = segments;
      const containerRequest = segments.length === 1 && url.searchParams.get('restype') === 'container';
      if (containerRequest && !parseAuthorization(req)) return sendXmlError(res, 501, 'NotImplemented', 'Container SAS authorization is not implemented.', requestId);
      const auth = String(req.headers.authorization ?? '').trim() !== ''
        ? validateSharedKey(req, url, account, Number(req.headers['content-length'] ?? 0), ['SharedKey', 'SharedKeyLite'])
        : validateServiceSas(url, account, `/blob/${accountName}/${containerName}/${blobParts.join('/')}`, req.method);
      if (!auth.ok) return sendXmlError(res, auth.status ?? 401, auth.code ?? 'NoAuthenticationInformation', auth.message ?? 'Server failed to authenticate the request.', requestId);
      if (containerRequest) {
        const comp = url.searchParams.get('comp');
        if (comp && !['metadata', 'lease'].includes(comp)) return sendXmlError(res, 501, 'NotImplemented', `Container operation '${comp}' is not implemented.`, requestId);
        if (!['$root', '$logs', '$web'].includes(containerName)) {
          if (containerName.length < 3 || containerName.length > 63) return sendXmlError(res, 400, 'OutOfRangeInput', 'The specified resource name length is not within the permissible limits.', requestId);
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(containerName)) return sendXmlError(res, 400, 'InvalidResourceName', 'The specifed resource name contains invalid characters.', requestId);
        }
        const existing = account.containers.get(containerName);
        const headers = { 'x-ms-request-id': requestId, 'x-ms-version': '2023-11-03', date: nowUtc() };
        const metadata = Object.fromEntries(Object.entries(req.headers).filter(([key]) => key.startsWith('x-ms-meta-')));
        if (req.method === 'PUT' && !comp) {
          if (existing) return sendXmlError(res, 409, 'ContainerAlreadyExists', 'The specified container already exists.', requestId);
          // Public access and encryption overrides require account policy evaluation.
          if (req.headers['x-ms-blob-public-access'] || req.headers['x-ms-default-encryption-scope']) return sendXmlError(res, 501, 'NotImplemented', 'Public access and encryption-scope overrides are not implemented.', requestId);
          this.registerContainer({ accountName, containerName });
          const created = account.containers.get(containerName);
          created.metadata = metadata;
          return send(res, 201, '', { ...headers, etag: created.etag, 'last-modified': created.lastModified });
        }
        if (!existing) return sendXmlError(res, 404, 'ContainerNotFound', 'The specified container does not exist.', requestId);
        if (req.method === 'PUT' && comp === 'lease') {
          const result = operateLease(existing, req.headers, 'Container');
          if (result.code) return sendXmlError(res, result.status, result.code, result.message, requestId);
          return send(res, result.status, '', { ...headers, ...result.headers, etag: existing.etag, 'last-modified': existing.lastModified });
        }
        const leaseError = leaseGuard(existing, req.headers, 'Container', req.method === 'DELETE');
        if (leaseError) return sendXmlError(res, leaseError.status, leaseError.code, leaseError.message, requestId);
        if (req.method === 'PUT' && comp === 'metadata') {
          existing.metadata = metadata;
          existing.etag = `"${randomUUID()}"`;
          existing.lastModified = nowUtc();
          return send(res, 200, '', { ...headers, etag: existing.etag, 'last-modified': existing.lastModified });
        }
        if (req.method === 'GET' || req.method === 'HEAD') return send(res, 200, '', {
          ...headers, ...existing.metadata, etag: existing.etag, 'last-modified': existing.lastModified,
          ...leaseHeaders(existing),
          'x-ms-has-immutability-policy': 'false', 'x-ms-has-legal-hold': 'false',
        });
        if (req.method === 'DELETE' && !comp) {
          this.unregisterContainer({ accountName, containerName });
          return send(res, 202, '', headers);
        }
        return sendXmlError(res, 405, 'MethodNotAllowed', `Method ${req.method} is not allowed for containers.`, requestId);
      }
      if (segments.length < 2) return sendXmlError(res, 501, 'NotImplemented', 'This Blob service operation is not implemented.', requestId);
      const container = account.containers.get(lower(containerName));
      if (!container) return sendXmlError(res, 404, 'ContainerNotFound', `The specified container does not exist.`, requestId);
      const blobName = blobParts.join('/');
      const key = blobKey(containerName, blobName);
      let existingBlob = account.blobs.get(key);
      const comp = url.searchParams.get('comp');
      const conditionError = blobConditions(existingBlob, req.headers, req.method);
      if (conditionError) {
        if (conditionError.status === 304) return send(res, 304, '', { etag: existingBlob.etag });
        return sendXmlError(res, conditionError.status, conditionError.code, conditionError.message, requestId);
      }
      if (req.method === 'PUT' && comp === 'lease') {
        if (!existingBlob) return sendXmlError(res, 404, 'BlobNotFound', 'The specified blob does not exist.', requestId);
        const result = operateLease(existingBlob, req.headers, 'Blob');
        if (result.code) return sendXmlError(res, result.status, result.code, result.message, requestId);
        return send(res, result.status, '', { ...result.headers, etag: existingBlob.etag, 'last-modified': existingBlob.lastModified, 'x-ms-request-id': requestId, 'x-ms-version': '2023-11-03', date: nowUtc() });
      }
      if (req.method === 'PUT' && comp === 'metadata') {
        if (!existingBlob) return sendXmlError(res, 404, 'BlobNotFound', 'The specified blob does not exist.', requestId);
        const metadataLeaseError = leaseGuard(existingBlob, req.headers, 'Blob', true);
        if (metadataLeaseError) return sendXmlError(res, metadataLeaseError.status, metadataLeaseError.code, metadataLeaseError.message, requestId);
        if (['x-ms-encryption-scope', 'x-ms-encryption-key', 'x-ms-encryption-key-sha256'].some(name => req.headers[name])) return sendXmlError(res, 501, 'NotImplemented', 'Customer-provided blob encryption is not implemented.', requestId);
        existingBlob.metadata = Object.fromEntries(Object.entries(req.headers).filter(([name]) => name.startsWith('x-ms-meta-')));
        existingBlob.etag = `"${randomUUID()}"`;
        existingBlob.lastModified = nowUtc();
        if (!['leased', 'breaking'].includes(leaseState(existingBlob))) delete existingBlob.lease;
        return send(res, 200, '', { etag: existingBlob.etag, 'last-modified': existingBlob.lastModified,
          'x-ms-request-id': requestId, 'x-ms-version': '2023-11-03', date: nowUtc() });
      }
      if (comp) return sendXmlError(res, 501, 'NotImplemented', `Blob operation '${comp}' is not implemented.`, requestId);
      const leaseError = leaseGuard(existingBlob, req.headers, 'Blob', ['PUT', 'DELETE'].includes(req.method));
      if (leaseError) return sendXmlError(res, leaseError.status, leaseError.code, leaseError.message, requestId);

      if (req.method === 'PUT') {
        if (!req.headers['x-ms-blob-type']) {
          return sendXmlError(res, 400, 'MissingRequiredHeader', "An HTTP header that's mandatory for this request is not specified.", requestId);
        }
        const body = await readBody(req);
        // The body may arrive slowly while another writer or lease holder acts.
        // Recheck against current state immediately before the atomic Map update.
        if (account.containers.get(lower(containerName)) !== container) return sendXmlError(res, 404, 'ContainerNotFound', 'The specified container does not exist.', requestId);
        existingBlob = account.blobs.get(key);
        const currentError = blobConditions(existingBlob, req.headers, req.method) || leaseGuard(existingBlob, req.headers, 'Blob', true);
        if (currentError) return sendXmlError(res, currentError.status, currentError.code, currentError.message, requestId);
        account.blobs.set(key, {
          ...(existingBlob && ['leased', 'breaking'].includes(leaseState(existingBlob)) ? { lease: existingBlob.lease } : {}),
          blobName,
          containerName,
          metadata: Object.fromEntries(Object.entries(req.headers).filter(([name]) => name.startsWith('x-ms-meta-'))),
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
          ...leaseHeaders(blob), ...blob.metadata,
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      if (req.method === 'HEAD') {
        return send(res, 200, '', {
          'content-type': blob.contentType,
          etag: blob.etag,
          'last-modified': blob.lastModified,
          'content-length': String(blob.body.length),
          'x-ms-blob-type': 'BlockBlob',
          ...leaseHeaders(blob), ...blob.metadata,
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
      const auth = validateSharedKey(req, url, account, Number(req.headers['content-length'] ?? 0), 'SharedKey');
      if (!auth.ok) return sendXmlError(res, auth.status, auth.code, auth.message, requestId);

      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const queueName = segments[0];
      let queue = account.queues.get(lower(queueName));
      const comp = url.searchParams.get('comp');
      const common = { 'x-ms-request-id': requestId, 'x-ms-version': '2023-11-03', date: nowUtc() };
      const fail = (status, code, message) => sendXmlError(res, status, code, message, requestId);
      const metadata = Object.fromEntries(Object.entries(req.headers).filter(([key]) => key.startsWith('x-ms-meta-')));
      if (req.method === 'PUT' && segments.length === 1 && !comp) {
        if (queueName.length < 3 || queueName.length > 63) return fail(400, 'OutOfRangeInput', 'The specified resource name length is not within the permissible limits.');
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(queueName)) return fail(400, 'InvalidResourceName', 'The specifed resource name contains invalid characters.');
        if (queue) {
          if (JSON.stringify(Object.entries(queue.metadata ?? {}).sort()) !== JSON.stringify(Object.entries(metadata).sort())) return fail(409, 'QueueAlreadyExists', 'The specified queue already exists.');
          return send(res, 204, '', common);
        }
        this.registerQueue({ accountName, queueName });
        account.queues.get(queueName).metadata = metadata;
        return send(res, 201, '', common);
      }
      if (!queue) {
        if (req.method === 'GET' && segments[1]?.toLowerCase() === 'messages' && url.searchParams.get('peekonly') === 'true') {
          const staleBody = this.queueDeleteTracker.readAfterDelete({ accountName, queueName });
          if (staleBody !== null) {
            return send(res, 200, staleBody, {
              'content-type': 'application/xml',
              'x-ms-request-id': requestId,
              'x-ms-version': '2023-11-03',
              date: nowUtc(),
            });
          }
        }
        return sendXmlError(res, 404, 'QueueNotFound', 'The specified queue does not exist.', requestId);
      }

      queue.messages = queue.messages.filter(message => Date.parse(message.expirationTime) > Date.now());
      if (segments.length === 1 && comp === 'metadata') {
        if (req.method === 'PUT') { queue.metadata = metadata; return send(res, 204, '', common); }
        if (req.method === 'GET' || req.method === 'HEAD') return send(res, 200, '', { ...common, ...queue.metadata, 'x-ms-approximate-messages-count': String(queue.messages.length) });
      }
      if (comp) return fail(501, 'NotImplemented', 'This Queue service operation is not implemented.');
      const integer = (name, fallback, min, max) => {
        const raw = url.searchParams.get(name);
        if (raw === null) return fallback;
        if (!/^-?\d+$/.test(raw)) return NaN;
        const value = Number(raw);
        return Number.isSafeInteger(value) && value >= min && value <= max ? value : NaN;
      };
      if (req.method === 'POST' && segments.length === 2 && segments[1] === 'messages') {
        const body = await readBody(req), text = parseQueueMessageXml(body.toString('utf8'));
        if (text === null) return fail(400, 'InvalidXmlDocument', 'XML specified is not syntactically valid.');
        if (Buffer.byteLength(text) > 65536) return fail(400, 'MessageTooLarge', 'The message exceeds the maximum allowed size.');
        const ttl = integer('messagettl', 604800, -1, 2147483647), visibility = integer('visibilitytimeout', 0, 0, 604800);
        if (!Number.isFinite(ttl) || ttl === 0 || !Number.isFinite(visibility) || ttl !== -1 && visibility >= ttl) return fail(400, 'OutOfRangeQueryParameterValue', 'One of the query parameters specified in the request URI is outside the permissible range.');
        if (account.queues.get(lower(queueName)) !== queue) return fail(404, 'QueueNotFound', 'The specified queue does not exist.');
        const now = Date.now();
        const message = { messageId: randomUUID(), text, insertionTime: new Date(now).toUTCString(),
          expirationTime: ttl === -1 ? 'Fri, 31 Dec 9999 23:59:59 GMT' : new Date(now + ttl * 1000).toUTCString(),
          visibleAt: now + visibility * 1000, popReceipt: randomUUID(), dequeueCount: 0 };
        queue.messages.push(message);
        return send(res, 201, queueMessagesXml([message], true, false), { ...common, 'content-type': 'application/xml' });
      }
      if (req.method === 'GET' && segments.length === 2 && segments[1] === 'messages') {
        const peek = url.searchParams.get('peekonly') === 'true';
        const count = integer('numofmessages', 1, 1, 32), visibility = integer('visibilitytimeout', 30, 1, 604800);
        if (!Number.isFinite(count) || !Number.isFinite(visibility)) return fail(400, 'OutOfRangeQueryParameterValue', 'One of the query parameters specified in the request URI is outside the permissible range.');
        const now = Date.now(), visible = queue.messages.filter(message => message.visibleAt <= now).slice(0, count);
        if (!peek) for (const message of visible) { message.visibleAt = now + visibility * 1000; message.popReceipt = randomUUID(); message.dequeueCount++; }
        const responseBody = queueMessagesXml(visible, !peek);
        if (peek) this.queueDeleteTracker.recordPeek({ accountName, queueName, body: responseBody });
        return send(res, 200, responseBody, { ...common, 'content-type': 'application/xml' });
      }
      if (segments.length === 3 && segments[1] === 'messages' && ['DELETE', 'PUT'].includes(req.method)) {
        const message = queue.messages.find(item => item.messageId === segments[2]);
        if (!message) return fail(404, 'MessageNotFound', 'The specified message does not exist.');
        if (!url.searchParams.has('popreceipt')) return fail(400, 'MissingRequiredQueryParameter', 'A query parameter required for this request was not specified.');
        if (url.searchParams.get('popreceipt') !== message.popReceipt) return fail(400, 'PopReceiptMismatch', 'The specified pop receipt did not match the pop receipt for a dequeued message.');
        if (req.method === 'DELETE') {
          queue.messages.splice(queue.messages.indexOf(message), 1);
          return send(res, 204, '', common);
        }
        const visibility = integer('visibilitytimeout', NaN, 0, 604800);
        if (!Number.isFinite(visibility) || Date.now() + visibility * 1000 > Date.parse(message.expirationTime)) return fail(400, 'OutOfRangeQueryParameterValue', 'One of the query parameters specified in the request URI is outside the permissible range.');
        const body = await readBody(req);
        const text = body.length ? parseQueueMessageXml(body.toString('utf8')) : message.text;
        if (text === null) return fail(400, 'InvalidXmlDocument', 'XML specified is not syntactically valid.');
        if (Buffer.byteLength(text) > 65536) return fail(400, 'MessageTooLarge', 'The message exceeds the maximum allowed size.');
        // A concurrent receive/update can replace the receipt while this body arrives.
        if (!queue.messages.includes(message) || url.searchParams.get('popreceipt') !== message.popReceipt) return fail(400, 'PopReceiptMismatch', 'The specified pop receipt did not match the pop receipt for a dequeued message.');
        message.text = text; message.visibleAt = Date.now() + visibility * 1000; message.popReceipt = randomUUID();
        return send(res, 204, '', { ...common, 'x-ms-popreceipt': message.popReceipt, 'x-ms-time-next-visible': new Date(message.visibleAt).toUTCString() });
      }
      if (req.method === 'DELETE' && segments.length === 2 && segments[1] === 'messages') {
        queue.messages = []; return send(res, 204, '', common);
      }

      if (req.method === 'DELETE' && segments.length === 1) {
        this.queueDeleteTracker.armDelete({
          accountName,
          queueName,
          body: queue.messages.length > 0 ? queueMessagesXml(queue.messages.slice(0, 1)) : null,
        });
        account.queues.delete(lower(queueName));
        return send(res, 204, '', {
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
      const format = url.searchParams.get('$format') ?? req.headers.accept ?? 'application/atom+xml';
      const common = { 'content-type': format.startsWith('application/json') ? format : 'application/json;odata=nometadata', 'x-ms-request-id': requestId, 'x-ms-version': '2023-11-03', date: nowUtc() };
      const failure = (status, code, message) => send(res, status, JSON.stringify({ 'odata.error': { code,
        message: { lang: 'en-US', value: `${message}\nRequestId:${requestId}\nTime:${isoNow()}` } } }), common);
      if (!validateTableKey(req, url, account)) return failure(403, 'AuthenticationFailed', 'Server failed to authenticate the request. Make sure the value of Authorization header is formed correctly including the signature.');
      const entityBody = entity => Object.fromEntries(Object.entries(entity).filter(([key]) => !format.includes('odata=nometadata') || !key.startsWith('odata.')));
      const path = url.pathname.replace(/^\/+/, '');
      if (req.method === 'POST' && path === '$batch') {
        const chunks = []; let bytes = 0;
        for await (const chunk of req) { bytes += chunk.length; if (bytes <= 4 * 1024 ** 2) chunks.push(chunk); }
        if (bytes > 4 * 1024 ** 2) return failure(413, 'RequestBodyTooLarge', 'The request body is too large.');
        let operations;
        try { operations = parseTableBatch(Buffer.concat(chunks).toString('utf8'), req.headers['content-type'], account.accountName); }
        catch (error) { return failure(error.status ?? 400, error.code ?? 'InvalidInput', error.message); }
        const response = tableBatchResponse(executeTableBatch(account, operations), requestId);
        return send(res, 202, response.body, { ...common, 'content-type': response.contentType });
      }
      if (!/^application\/json(?:;|$)/.test(format)) return send(res, 415,
        `<?xml version="1.0" encoding="utf-8"?><error xmlns="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"><code>AtomFormatNotSupported</code><message xml:lang="en-US">Atom format is not supported.\nRequestId:${requestId}\nTime:${isoNow()}</message></error>`,
        { ...common, 'content-type': 'application/xml;charset=utf-8' });

      if (req.method === 'POST' && path === 'Tables') {
        let body;
        try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return failure(400, 'InvalidInput', 'The request body is invalid.'); }
        if (!body || typeof body.TableName !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]{2,62}$/.test(body.TableName)) return failure(400, 'InvalidResourceName', 'The specified resource name contains invalid characters.');
        const name = lower(body.TableName);
        if (account.tables.has(name)) return failure(409, 'TableAlreadyExists', 'The table specified already exists.');
        this.registerTable({ accountName, tableName: body.TableName });
        const noContent = req.headers.prefer === 'return-no-content';
        return send(res, noContent ? 204 : 201, noContent ? '' : JSON.stringify({ TableName: body.TableName }), common);
      }
      if (req.method === 'GET' && path === 'Tables') {
        if ([...url.searchParams.keys()].some(key => !['timeout', '$format'].includes(key))) return failure(501, 'NotImplemented', 'Table enumeration query options are not implemented.');
        if (account.tables.size > 1000) return failure(501, 'NotImplemented', 'Table enumeration continuation is not implemented.');
        return send(res, 200, JSON.stringify({ value: [...account.tables.values()].map(table => ({ TableName: table.tableName })) }), common);
      }
      const tablePath = path.match(/^Tables\('([a-zA-Z][a-zA-Z0-9]{2,62})'\)$/);
      if (req.method === 'DELETE' && tablePath) {
        if (!account.tables.has(lower(tablePath[1]))) return failure(404, 'TableNotFound', 'The table specified does not exist.');
        this.unregisterTable({ accountName, tableName: tablePath[1] });
        return send(res, 204, '', common);
      }
      const queryPath = path.match(/^([a-zA-Z][a-zA-Z0-9]{2,62})(?:\(\))?$/);
      if (req.method === 'GET' && queryPath) {
        const table = account.tables.get(lower(queryPath[1]));
        if (!table) return failure(404, 'TableNotFound', 'The table specified does not exist.');
        if ([...url.searchParams.keys()].some(key => !['$filter', '$select', '$top', 'timeout', '$format'].includes(key))) return failure(501, 'NotImplemented', 'This Table query option is not implemented.');
        const filter = url.searchParams.get('$filter');
        let predicate;
        try { predicate = tableFilter(filter); } catch (error) { return failure(501, 'NotImplemented', error.message); }
        const values = [...table.entities.values()].filter(predicate);
        const top = url.searchParams.get('$top');
        if (top !== null && (!/^\d+$/.test(top) || Number(top) < 1 || Number(top) > 1000)) return failure(400, 'InvalidInput', 'The query parameter value is invalid.');
        const limit = top === null ? 1000 : Number(top);
        if (values.length > limit) return failure(501, 'NotImplemented', 'Entity query continuation is not implemented.');
        const select = url.searchParams.get('$select');
        const selected = select === null ? null : select.split(',');
        if (selected && (selected.length > 255 || selected.some(name => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)))) return failure(400, 'InvalidInput', 'The projection is invalid.');
        values.sort((a, b) => a.PartitionKey < b.PartitionKey ? -1 : a.PartitionKey > b.PartitionKey ? 1 : a.RowKey < b.RowKey ? -1 : a.RowKey > b.RowKey ? 1 : 0);
        const projected = values.map(entity => selected ? {
          ...(!format.includes('odata=nometadata') ? { 'odata.etag': entity['odata.etag'] } : {}),
          ...Object.fromEntries(selected.map(name => [name, entity[name] ?? null])),
        } : entityBody(entity));
        const metadata = format.includes('odata=nometadata') ? {} : {
          'odata.metadata': `https://${account.accountName}.table.core.windows.net/$metadata#${table.tableName}${select ? `&$select=${select}` : ''}`,
        };
        return send(res, 200, JSON.stringify({ ...metadata, value: projected }), common);
      }
      if (req.method === 'POST' && path && path !== 'Tables') {
        const table = account.tables.get(lower(decodeURIComponent(path)));
        if (!table) return send(res, 404, JSON.stringify({ error: { code: 'TableNotFound', message: 'The specified table does not exist.' } }), { 'content-type': 'application/json' });
        let body;
        try {
          body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
        } catch {
          return send(res, 400, JSON.stringify({ error: { code: 'BadRequest', message: 'Entity body must be valid JSON.' } }), { 'content-type': 'application/json' });
        }
        if (!body || typeof body.PartitionKey !== 'string' || typeof body.RowKey !== 'string') {
          return send(res, 400, JSON.stringify({ error: { code: 'BadRequest', message: 'PartitionKey and RowKey are required.' } }), { 'content-type': 'application/json' });
        }
        const key = entityKey(body.PartitionKey, body.RowKey);
        // Insert must not silently replace an existing entity, including its metadata.
        if (table.entities.has(key)) {
          return failure(409, 'EntityAlreadyExists', 'The specified entity already exists.');
        }
        table.lastTimestamp = Math.max(Date.now(), (table.lastTimestamp ?? 0) + 1);
        const timestamp = new Date(table.lastTimestamp).toISOString();
        const entity = {
          ...body,
          Timestamp: timestamp,
          'odata.etag': `W/"datetime'${timestamp}'"`,
        };
        table.entities.set(key, entity);
        const noContent = req.headers.prefer === 'return-no-content';
        return send(res, noContent ? 204 : 201, noContent ? '' : JSON.stringify(entityBody(entity)), {
          etag: entity['odata.etag'],
          'content-type': 'application/json;odata=nometadata',
          'x-ms-request-id': requestId,
          'x-ms-version': '2023-11-03',
          date: nowUtc(),
        });
      }

      const entityMatch = path.match(/^([^()]+)\(PartitionKey='((?:[^']|'')*)',RowKey='((?:[^']|'')*)'\)$/);
      if (entityMatch && ['PUT', 'MERGE', 'DELETE'].includes(req.method)) {
        const [, tableName, partitionKey, rowKey] = entityMatch.map(value => decodeURIComponent(value).replaceAll("''", "'"));
        const table = account.tables.get(lower(tableName));
        if (!table) return failure(404, 'TableNotFound', 'The table specified does not exist.');
        let body = {};
        if (req.method !== 'DELETE') {
          try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch { return failure(400, 'InvalidInput', 'The request body is invalid.'); }
          if (!body || typeof body !== 'object' || Array.isArray(body)
            || body.PartitionKey !== undefined && body.PartitionKey !== partitionKey
            || body.RowKey !== undefined && body.RowKey !== rowKey) return failure(400, 'InvalidInput', 'The entity keys do not match the request URI.');
        }
        if (account.tables.get(lower(tableName)) !== table) return failure(404, 'TableNotFound', 'The table specified does not exist.');
        const key = entityKey(partitionKey, rowKey), existing = table.entities.get(key), condition = req.headers['if-match'];
        if (!existing && (condition || req.method === 'DELETE')) return failure(404, 'ResourceNotFound', 'The specified resource does not exist.');
        if (condition && condition !== '*' && condition !== existing?.['odata.etag']) return failure(412, 'UpdateConditionNotSatisfied', 'The update condition specified in the request was not satisfied.');
        if (req.method === 'DELETE') {
          if (!condition) return failure(400, 'MissingRequiredHeader', 'A required header was not specified.');
          table.entities.delete(key); return send(res, 204, '', common);
        }
        // No If-Match selects insert-or-replace/merge on supported modern versions.
        const properties = Object.fromEntries(Object.entries(body).filter(([name, value]) => value !== null && name !== 'Timestamp' && !name.startsWith('odata.')));
        table.lastTimestamp = Math.max(Date.now(), (table.lastTimestamp ?? 0) + 1);
        const timestamp = new Date(table.lastTimestamp).toISOString();
        const entity = { ...(req.method === 'MERGE' ? existing : {}), ...properties, PartitionKey: partitionKey, RowKey: rowKey,
          Timestamp: timestamp, 'odata.etag': `W/"datetime'${timestamp}'"` };
        table.entities.set(key, entity);
        return send(res, 204, '', { ...common, etag: entity['odata.etag'] });
      }
      if (req.method === 'GET' && entityMatch) {
        const [, tableName, partitionKey, rowKey] = entityMatch.map(value => decodeURIComponent(value).replaceAll("''", "'"));
        const table = account.tables.get(lower(tableName));
        const entity = table?.entities.get(entityKey(partitionKey, rowKey));
        if (!entity) return send(res, 404, JSON.stringify({ error: { code: 'EntityNotFound', message: 'The specified entity does not exist.' } }), { 'content-type': 'application/json' });
        return send(res, 200, JSON.stringify(entityBody(entity)), {
          etag: entity['odata.etag'],
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
