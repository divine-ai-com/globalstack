import { createServer } from 'node:http';
import { URL } from 'node:url';

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const payload = Buffer.concat(chunks).toString('utf8');
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return payload;
  }
}

function sendBody(res, status, body = '', headers = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    'content-length': payload.length,
    'x-ms-activity-id': '00000000-0000-0000-0000-000000000000',
    'x-ms-request-charge': '1',
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

function sendCosmosError(res, status, code, message) {
  sendJson(res, status, { code, message });
}

function accountFromHost(host) {
  const hostname = String(host ?? '').split(':')[0].toLowerCase();
  if (!hostname.endsWith('.documents.azure.com')) return null;
  return hostname.split('.')[0] ?? null;
}

function requireCosmosHeaders(req) {
  if (!req.headers.authorization) {
    return { status: 401, code: 'Unauthorized', message: 'The input authorization token cannot serve the request.' };
  }
  if (!req.headers['x-ms-date'] && !req.headers.date) {
    return { status: 400, code: 'BadRequest', message: 'The x-ms-date header is required.' };
  }
  if (!req.headers['x-ms-version']) {
    return { status: 400, code: 'BadRequest', message: 'The x-ms-version header is required.' };
  }
  return null;
}

function splitPath(pathname) {
  return pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
}

function invalidId(value) {
  return !value || /[/?#\\]/.test(value);
}

function parsePartitionKey(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed[0] : parsed;
  } catch {
    return null;
  }
}

function etag() {
  return `"${Date.now().toString(16)}"`;
}

function resourceId(prefix, id) {
  return `${prefix}/${id}`;
}

export class CosmosSqlRouter {
  constructor() {
    this.accounts = new Map();
  }

  registerAccount({ accountName }) {
    const account = String(accountName).toLowerCase();
    if (!this.accounts.has(account)) {
      this.accounts.set(account, { accountName, databases: new Map() });
    }
  }

  unregisterAccount({ accountName }) {
    this.accounts.delete(String(accountName).toLowerCase());
  }

  registerDatabase({ accountName, databaseName }) {
    const account = this.accounts.get(String(accountName).toLowerCase());
    if (!account) return;
    if (!account.databases.has(databaseName)) {
      account.databases.set(databaseName, { id: databaseName, containers: new Map() });
    }
  }

  unregisterDatabase({ accountName, databaseName }) {
    const account = this.accounts.get(String(accountName).toLowerCase());
    account?.databases.delete(databaseName);
  }

  registerContainer({ accountName, databaseName, containerName, partitionKey = '/pk' }) {
    const account = this.accounts.get(String(accountName).toLowerCase());
    const database = account?.databases.get(databaseName);
    if (!database) return;
    if (!database.containers.has(containerName)) {
      database.containers.set(containerName, { id: containerName, partitionKey, docs: new Map() });
    }
  }

  unregisterContainer({ accountName, databaseName, containerName }) {
    const account = this.accounts.get(String(accountName).toLowerCase());
    const database = account?.databases.get(databaseName);
    database?.containers.delete(containerName);
  }

  handler() {
    return async (req, res) => {
      const method = req.method.toUpperCase();
      const url = new URL(req.url, 'http://localhost');
      const accountName = accountFromHost(req.headers.host);
      if (!accountName) return sendCosmosError(res, 404, 'NotFound', 'The requested account host was not found.');

      const headerError = requireCosmosHeaders(req);
      if (headerError) return sendCosmosError(res, headerError.status, headerError.code, headerError.message);

      const account = this.accounts.get(accountName.toLowerCase());
      if (!account) return sendCosmosError(res, 404, 'NotFound', `Entity with the specified id does not exist in the system: ${accountName}.`);

      const parts = splitPath(url.pathname);
      if (parts.length === 1 && parts[0] === 'dbs' && method === 'GET') {
        return sendJson(res, 200, {
          _rid: '',
          Databases: [...account.databases.values()].map(db => ({ id: db.id, _rid: resourceId('dbs', db.id) })),
          _count: account.databases.size,
        });
      }

      if (parts.length === 1 && parts[0] === 'dbs' && method === 'POST') {
        const body = await readBody(req);
        if (!body || typeof body !== 'object' || invalidId(body.id)) {
          return sendCosmosError(res, 400, 'BadRequest', 'The database id is required and must not contain invalid characters.');
        }
        if (account.databases.has(body.id)) {
          return sendCosmosError(res, 409, 'Conflict', 'Entity with the specified id already exists in the system.');
        }
        account.databases.set(body.id, { id: body.id, containers: new Map() });
        return sendJson(res, 201, { id: body.id, _rid: resourceId('dbs', body.id), _self: `dbs/${body.id}/` }, { etag: etag() });
      }

      if (parts.length >= 2 && parts[0] === 'dbs') {
        const database = account.databases.get(parts[1]);
        if (!database) return sendCosmosError(res, 404, 'NotFound', 'Entity with the specified id does not exist in the system.');

        if (parts.length === 2 && method === 'GET') {
          return sendJson(res, 200, { id: database.id, _rid: resourceId('dbs', database.id), _self: `dbs/${database.id}/` }, { etag: etag() });
        }

        if (parts.length === 2 && method === 'DELETE') {
          account.databases.delete(database.id);
          return sendBody(res, 204);
        }

        if (parts.length === 3 && parts[2] === 'colls' && method === 'GET') {
          return sendJson(res, 200, {
            _rid: resourceId('dbs', database.id),
            DocumentCollections: [...database.containers.values()].map(container => ({ id: container.id, partitionKey: { paths: [container.partitionKey], kind: 'Hash' } })),
            _count: database.containers.size,
          });
        }

        if (parts.length === 3 && parts[2] === 'colls' && method === 'POST') {
          const body = await readBody(req);
          const partitionKey = body?.partitionKey?.paths?.[0];
          if (!body || typeof body !== 'object' || invalidId(body.id)) {
            return sendCosmosError(res, 400, 'BadRequest', 'The collection id is required and must not contain invalid characters.');
          }
          if (!partitionKey || !String(partitionKey).startsWith('/')) {
            return sendCosmosError(res, 400, 'BadRequest', 'Partition key paths must contain at least one absolute path.');
          }
          if (database.containers.has(body.id)) {
            return sendCosmosError(res, 409, 'Conflict', 'Entity with the specified id already exists in the system.');
          }
          database.containers.set(body.id, { id: body.id, partitionKey, docs: new Map() });
          return sendJson(res, 201, {
            id: body.id,
            _rid: resourceId(`dbs/${database.id}/colls`, body.id),
            partitionKey: { paths: [partitionKey], kind: 'Hash' },
          }, { etag: etag() });
        }

        if (parts.length >= 4 && parts[2] === 'colls') {
          const container = database.containers.get(parts[3]);
          if (!container) return sendCosmosError(res, 404, 'NotFound', 'Entity with the specified id does not exist in the system.');

          if (parts.length === 4 && method === 'GET') {
            return sendJson(res, 200, {
              id: container.id,
              _rid: resourceId(`dbs/${database.id}/colls`, container.id),
              partitionKey: { paths: [container.partitionKey], kind: 'Hash' },
            }, { etag: etag() });
          }

          if (parts.length === 4 && method === 'DELETE') {
            database.containers.delete(container.id);
            return sendBody(res, 204);
          }

          if (parts.length === 5 && parts[4] === 'docs' && method === 'GET') {
            return sendJson(res, 200, {
              _rid: resourceId(`dbs/${database.id}/colls`, container.id),
              Documents: [...container.docs.values()].map(doc => doc.body),
              _count: container.docs.size,
            });
          }

          if (parts.length === 5 && parts[4] === 'docs' && method === 'POST') {
            if (req.headers['x-ms-documentdb-isquery'] === 'true') {
              const body = await readBody(req);
              const query = String(body?.query ?? '').trim().toLowerCase();
              if (!query.startsWith('select')) return sendCosmosError(res, 400, 'BadRequest', 'Only SELECT queries are supported by this local facade.');
              const docs = [...container.docs.values()].map(doc => doc.body);
              return sendJson(res, 200, { Documents: docs, _count: docs.length });
            }

            const body = await readBody(req);
            if (!body || typeof body !== 'object' || invalidId(body.id)) {
              return sendCosmosError(res, 400, 'BadRequest', 'Document id is required and must not contain invalid characters.');
            }
            const partitionValue = parsePartitionKey(req.headers['x-ms-documentdb-partitionkey']);
            const partitionProperty = container.partitionKey.slice(1);
            if (partitionValue === null || body[partitionProperty] !== partitionValue) {
              return sendCosmosError(res, 400, 'BadRequest', 'The partition key supplied in x-ms-documentdb-partitionkey must match the document body.');
            }
            if (container.docs.has(body.id)) {
              return sendCosmosError(res, 409, 'Conflict', 'Entity with the specified id already exists in the system.');
            }
            const document = { body: { ...body, _rid: resourceId(`dbs/${database.id}/colls/${container.id}/docs`, body.id) }, partitionValue };
            container.docs.set(body.id, document);
            return sendJson(res, 201, document.body, { etag: etag() });
          }

          if (parts.length === 6 && parts[4] === 'docs') {
            const document = container.docs.get(parts[5]);
            if (!document) return sendCosmosError(res, 404, 'NotFound', 'Entity with the specified id does not exist in the system.');
            const partitionValue = parsePartitionKey(req.headers['x-ms-documentdb-partitionkey']);
            if (partitionValue !== document.partitionValue) {
              return sendCosmosError(res, 404, 'NotFound', 'Entity with the specified id does not exist in the system.');
            }

            if (method === 'GET') return sendJson(res, 200, document.body, { etag: etag() });

            if (method === 'PUT') {
              const body = await readBody(req);
              if (!body || typeof body !== 'object' || body.id !== parts[5]) {
                return sendCosmosError(res, 400, 'BadRequest', 'Replacement document id must match the requested document id.');
              }
              const partitionProperty = container.partitionKey.slice(1);
              if (body[partitionProperty] !== document.partitionValue) {
                return sendCosmosError(res, 400, 'BadRequest', 'Replacement document partition key cannot change.');
              }
              document.body = { ...body, _rid: document.body._rid };
              return sendJson(res, 200, document.body, { etag: etag() });
            }

            if (method === 'DELETE') {
              container.docs.delete(parts[5]);
              return sendBody(res, 204);
            }
          }
        }
      }

      return sendCosmosError(res, 405, 'MethodNotAllowed', `Cosmos SQL route does not support ${method} ${url.pathname}.`);
    };
  }
}

export function createCosmosSqlRouter() {
  return new CosmosSqlRouter();
}

export function createCosmosSqlRouterServer(router = createCosmosSqlRouter()) {
  return createServer(router.handler());
}
