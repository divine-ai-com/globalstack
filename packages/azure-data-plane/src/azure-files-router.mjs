import { createServer } from 'node:http';
import { URL } from 'node:url';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sendBody(res, status, body = '', headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'content-length': payload.length,
    ...headers,
  });
  res.end(payload);
}

function sendJson(res, status, body, headers = {}) {
  sendBody(res, status, JSON.stringify(body, null, 2), {
    'content-type': 'application/json',
    ...headers,
  });
}

function sendError(res, status, code, message) {
  sendJson(res, status, { error: { code, message } });
}

function accountFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.file.core.windows.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function requireStorageHeaders(req) {
  if (!req.headers.authorization) {
    return { status: 403, code: 'AuthenticationFailed', message: 'Server failed to authenticate the request.' };
  }
  if (!req.headers['x-ms-version']) {
    return { status: 400, code: 'MissingRequiredHeader', message: 'The x-ms-version header is required.' };
  }
  return null;
}

function storageKey(value) {
  return String(value).toLowerCase();
}

function splitPath(pathname) {
  return pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
}

function invalidPath(parts) {
  return parts.some(part => !part || part === '.' || part === '..' || part.includes('/') || part.includes('\\'));
}

function parseRange(value) {
  const match = String(value ?? '').match(/^bytes=(\d+)-(\d+)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) return null;
  return { start, end };
}

function parentDirectory(pathSegments) {
  return pathSegments.slice(0, -1).join('/');
}

function filePath(pathSegments) {
  return pathSegments.join('/');
}

export class AzureFilesRouter {
  constructor() {
    this.accounts = new Map();
  }

  registerShare({ accountName, shareName, shareQuota = 5120 }) {
    const account = storageKey(accountName);
    const share = storageKey(shareName);
    if (!this.accounts.has(account)) this.accounts.set(account, { accountName, shares: new Map() });
    const accountRecord = this.accounts.get(account);
    const existing = accountRecord.shares.get(share);
    accountRecord.shares.set(share, {
      shareName,
      shareQuota,
      directories: existing?.directories ?? new Set(['']),
      files: existing?.files ?? new Map(),
    });
  }

  unregisterShare({ accountName, shareName }) {
    const account = this.accounts.get(storageKey(accountName));
    account?.shares.delete(storageKey(shareName));
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();
      const accountName = accountFromHost(req.headers.host);
      if (!accountName) return sendError(res, 404, 'AccountNotFound', 'The Azure Files account host was not found.');

      const headerError = requireStorageHeaders(req);
      if (headerError) return sendError(res, headerError.status, headerError.code, headerError.message);

      const account = this.accounts.get(storageKey(accountName));
      if (!account) return sendError(res, 404, 'AccountNotFound', `The storage account '${accountName}' was not found.`);

      const parts = splitPath(url.pathname);
      const [shareName, ...pathSegments] = parts;
      if (!shareName || invalidPath(parts)) return sendError(res, 400, 'InvalidResourceName', 'The specified resource name contains invalid characters.');

      const share = account.shares.get(storageKey(shareName));
      if (!share) return sendError(res, 404, 'ShareNotFound', `The share '${shareName}' was not found.`);

      const restype = url.searchParams.get('restype');
      const comp = url.searchParams.get('comp');

      if (method === 'GET' && restype === 'share' && !pathSegments.length) {
        return sendJson(res, 200, {
          name: share.shareName,
          properties: { shareQuota: share.shareQuota },
        }, { 'x-ms-share-quota': String(share.shareQuota) });
      }

      if (method === 'PUT' && restype === 'directory') {
        if (!pathSegments.length) return sendError(res, 400, 'InvalidResourceName', 'Directory path is required.');
        const directory = filePath(pathSegments);
        const parent = parentDirectory(pathSegments);
        if (!share.directories.has(parent)) return sendError(res, 404, 'ParentNotFound', 'The parent directory was not found.');
        share.directories.add(directory);
        return sendBody(res, 201, '', { 'x-ms-resource-type': 'directory' });
      }

      if (method === 'GET' && restype === 'directory' && comp === 'list') {
        const directory = filePath(pathSegments);
        if (!share.directories.has(directory)) return sendError(res, 404, 'ResourceNotFound', 'The specified directory was not found.');
        const prefix = directory ? `${directory}/` : '';
        const entries = [
          ...[...share.directories].filter(item => item.startsWith(prefix) && item !== directory).map(item => ({ type: 'Directory', name: item.slice(prefix.length).split('/')[0] })),
          ...[...share.files.keys()].filter(item => item.startsWith(prefix)).map(item => ({ type: 'File', name: item.slice(prefix.length).split('/')[0] })),
        ].filter((entry, index, all) => all.findIndex(other => other.type === entry.type && other.name === entry.name) === index);
        return sendJson(res, 200, { value: entries });
      }

      if (method === 'PUT' && comp === 'range') {
        const path = filePath(pathSegments);
        const file = share.files.get(path);
        if (!file) return sendError(res, 404, 'ResourceNotFound', 'The specified file was not found.');
        if (req.headers['x-ms-write'] !== 'update') return sendError(res, 400, 'InvalidHeaderValue', 'x-ms-write must be update for range upload.');
        const range = parseRange(req.headers['x-ms-range']);
        if (!range) return sendError(res, 400, 'InvalidRange', 'The range specified is invalid.');
        const body = await readBody(req);
        if (body.length !== range.end - range.start + 1 || range.end >= file.content.length) {
          return sendError(res, 416, 'InvalidRange', 'The range specified is invalid for the current file size.');
        }
        body.copy(file.content, range.start);
        file.updatedAt = new Date().toISOString();
        return sendBody(res, 201, '', { 'x-ms-range': `bytes=${range.start}-${range.end}` });
      }

      if (method === 'PUT') {
        if (req.headers['x-ms-type'] !== 'file') return sendError(res, 400, 'InvalidHeaderValue', 'x-ms-type must be file for file creation.');
        const size = Number(req.headers['x-ms-content-length']);
        if (!Number.isInteger(size) || size < 0) return sendError(res, 400, 'InvalidHeaderValue', 'x-ms-content-length must be a non-negative integer.');
        const path = filePath(pathSegments);
        if (!path) return sendError(res, 400, 'InvalidResourceName', 'File path is required.');
        const parent = parentDirectory(pathSegments);
        if (!share.directories.has(parent)) return sendError(res, 404, 'ParentNotFound', 'The parent directory was not found.');
        share.files.set(path, {
          content: Buffer.alloc(size),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        return sendBody(res, 201, '', { 'x-ms-content-length': String(size), 'x-ms-type': 'file' });
      }

      if (method === 'GET') {
        const path = filePath(pathSegments);
        const file = share.files.get(path);
        if (!file) return sendError(res, 404, 'ResourceNotFound', 'The specified file was not found.');
        return sendBody(res, 200, file.content, {
          'content-type': 'application/octet-stream',
          'x-ms-content-length': String(file.content.length),
        });
      }

      if (method === 'DELETE') {
        const path = filePath(pathSegments);
        if (!share.files.has(path)) return sendError(res, 404, 'ResourceNotFound', 'The specified file was not found.');
        share.files.delete(path);
        return sendBody(res, 202);
      }

      return sendError(res, 405, 'MethodNotAllowed', `Azure Files route does not support ${method}.`);
    };
  }
}

export function createAzureFilesRouter() {
  return new AzureFilesRouter();
}

export function createAzureFilesRouterServer(router = createAzureFilesRouter()) {
  return createServer(router.handler());
}
