import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { AccessError, configuredTokenVerifier, uuid } from './auth.mjs';
import { clients, closeClients } from './adapters.mjs';
import { documentAccess, registerDocumentAccess, searchAccessFilter } from './access.mjs';
import { currentSearchResults } from './repository.mjs';

const maxBytes = 10 * 1024 ** 2;
const types = new Set(['text/plain', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
function response(res, status, value, headers = {}) {
  if (res.destroyed) return;
  const body = value === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(value));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': body.length, 'cache-control': 'no-store', ...headers });
  res.end(body);
}
async function documentBytes(req) {
  const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
  if (!types.has(type)) throw new AccessError(415, 'unsupported_document_type');
  const length = req.headers['content-length'];
  if (req.headers['transfer-encoding'] || typeof length !== 'string' || !/^\d{1,8}$/.test(length)) throw new AccessError(400, 'content_length_required');
  const size = Number(length);
  if (size < 1 || size > maxBytes) throw new AccessError(413, 'file_size_out_of_range');
  const chunks = []; let count = 0;
  for await (const chunk of req) {
    count += chunk.length;
    if (count > size || count > maxBytes) throw new AccessError(413, 'file_size_out_of_range');
    chunks.push(chunk);
  }
  if (count !== size) throw new AccessError(400, 'incomplete_document');
  const bytes = Buffer.concat(chunks);
  return { bytes, type, sha256: createHash('sha256').update(bytes).digest('hex') };
}
function fileName(req) {
  let value;
  try { value = decodeURIComponent(req.headers['x-document-name'] ?? ''); } catch { throw new AccessError(400, 'invalid_file_name'); }
  if (!value || value.length > 255 || value === '.' || value === '..' || /[\x00-\x1f\x7f/\\]/.test(value)) throw new AccessError(400, 'invalid_file_name');
  return value.normalize('NFC');
}
function ownedBlob(application, access) {
  const url = new URL(access.blob_url), base = new URL(application.config.storageEndpoint);
  const prefix = `/${application.config.landingContainer}/`;
  if (url.username || url.password || url.protocol !== base.protocol || url.hostname !== base.hostname || url.port
    || !url.pathname.startsWith(prefix) || url.search || url.hash) throw new AccessError(503, 'document_location_invalid');
  return application.blobs.getContainerClient(application.config.landingContainer).getBlockBlobClient(decodeURIComponent(url.pathname.slice(prefix.length)));
}
function canonicalBlobUrl(blob) {
  const url = new URL(blob.url);
  // The local transport may add a port. Document identity must use the Azure
  // resource URL that Event Grid publishes for the same Blob.
  url.port = '';
  return url.href;
}
function condition(req) {
  const etag = req.headers['if-match'];
  if (typeof etag !== 'string' || !/^"[\x21\x23-\x7e]{1,256}"$/.test(etag)) throw new AccessError(428, 'document_version_required');
  return etag;
}
export function fuzzyQuery(value) {
  if (typeof value !== 'string' || value.length > 256) throw new AccessError(400, 'invalid_query');
  const words = value.match(/[\p{L}\p{N}]+/gu) ?? [];
  if (!words.length || words.length > 8 || words.some(word => word.length > 40)) throw new AccessError(400, 'invalid_query');
  return words.map(word => `${word}~1`).join(' AND ');
}

export function documentHandler({ verify = configuredTokenVerifier(), getClients = clients, log = event => console.log(JSON.stringify(event)) } = {}) {
  let active = 0;
  return async (req, res) => {
    const correlationId = uuid.test(req.headers['x-correlation-id']) ? req.headers['x-correlation-id'] : randomUUID();
    res.setHeader('x-correlation-id', correlationId);
    if (req.method === 'GET' && req.url === '/health') return response(res, 200, { application: 'ready' });
    if (active >= 8) return response(res, 503, { error: 'application_busy', correlationId }, { 'retry-after': '2' });
    active++;
    try {
      const url = new URL(req.url, 'http://localhost');
      const document = /^\/documents\/([0-9a-f-]{36})$/i.exec(url.pathname);
      const role = req.method === 'GET' ? 'Documents.Read' : req.method === 'DELETE' ? 'Documents.Delete' : 'Documents.Upload';
      const principal = await verify(req.headers.authorization, role);
      if (req.method === 'POST' && url.pathname === '/documents') {
        const name = fileName(req), uploadKey = req.headers['idempotency-key'];
        if (!uuid.test(uploadKey)) throw new AccessError(400, 'upload_key_required');
        const groups = req.headers['x-read-groups'] ? String(req.headers['x-read-groups']).split(',') : [];
        const { bytes, type, sha256 } = await documentBytes(req);
        const application = await getClients(), { blobs, pool, config } = application;
        const blob = blobs.getContainerClient(config.landingContainer).getBlockBlobClient(`${principal.tenant}/${principal.subject}/${uploadKey}/${name}`);
        const access = await registerDocumentAccess(pool, principal, { blobUrl: canonicalBlobUrl(blob), fileName: name, uploadKey, readGroups: groups });
        let properties;
        try {
          properties = await blob.uploadData(bytes, { conditions: { ifNoneMatch: '*' },
            blobHTTPHeaders: { blobContentType: type }, metadata: { sha256, uploadkey: uploadKey }, abortSignal: AbortSignal.timeout(30000) });
        } catch (error) {
          if (![409, 412].includes(error.statusCode)) throw error;
          properties = await blob.getProperties({ abortSignal: AbortSignal.timeout(10000) });
          if (properties.metadata?.sha256 !== sha256 || properties.metadata?.uploadkey !== uploadKey) throw new AccessError(409, 'upload_key_conflict');
        }
        log({ stage: 'upload_accepted', correlationId: uploadKey, requestId: correlationId, documentId: access.document_id, sha256, etag: properties.etag });
        return response(res, 202, { documentId: access.document_id, correlationId: uploadKey, sha256, etag: properties.etag, status: 'accepted' });
      }
      if (req.method === 'GET' && url.pathname === '/search') {
        const query = fuzzyQuery(url.searchParams.get('q'));
        const { search, pool } = await getClients();
        const result = await search.search(query, { queryType: 'full', searchMode: 'all', filter: searchAccessFilter(principal), top: 20,
          select: ['document_id', 'revision_id'], abortSignal: AbortSignal.timeout(10000) });
        const hits = [];
        for await (const item of result.results) { hits.push({ ...item.document, '@search.score': item.score }); if (hits.length >= 20) break; }
        const records = await currentSearchResults(pool, principal, hits);
        log({ stage: 'query_completed', correlationId, returned: records.length });
        return response(res, 200, { correlationId, results: records.map(item => ({ documentId: item.document_id, revisionId: item.revision_id,
          fileName: item.file_name, scanStatus: item.scan_status, snippet: item.extracted_text.slice(0, 600),
          pages: item.extraction_pages?.map(({ page, method }) => ({ page, method })) ?? [] })) });
      }
      if (document && ['GET', 'PUT', 'DELETE'].includes(req.method)) {
        const application = await getClients(), { pool } = application;
        const access = await documentAccess(pool, principal, document[1], { write: req.method !== 'GET' });
        const blob = ownedBlob(application, access);
        if (req.method === 'GET') {
          const state = (await pool.query('SELECT scan_status, blob_version, content_sha256, revision_id FROM scanned_documents WHERE document_id=$1 AND tenant_id=$2', [access.document_id, principal.tenant])).rows[0];
          return response(res, 200, { documentId: access.document_id, correlationId: access.upload_key, ...(state ?? { scan_status: 'PENDING' }) });
        }
        const ifMatch = condition(req);
        if (req.method === 'DELETE') {
          await blob.deleteIfExists({ conditions: { ifMatch }, abortSignal: AbortSignal.timeout(10000) });
          log({ stage: 'delete_accepted', correlationId: access.upload_key, requestId: correlationId, documentId: access.document_id });
          return response(res, 202, { documentId: access.document_id, correlationId: access.upload_key, status: 'deletion_requested' });
        }
        const { bytes, type, sha256 } = await documentBytes(req);
        const changed = await blob.uploadData(bytes, { conditions: { ifMatch }, blobHTTPHeaders: { blobContentType: type },
          metadata: { sha256, uploadkey: access.upload_key }, abortSignal: AbortSignal.timeout(30000) });
        log({ stage: 'update_accepted', correlationId: access.upload_key, requestId: correlationId, documentId: access.document_id, sha256, etag: changed.etag });
        return response(res, 202, { documentId: access.document_id, correlationId: access.upload_key, sha256, etag: changed.etag });
      }
      throw new AccessError(404, 'route_not_found');
    } catch (error) {
      const status = error instanceof AccessError ? error.status : error.statusCode === 412 ? 412 : 503;
      const code = error instanceof AccessError ? error.code : status === 412 ? 'document_version_conflict' : 'dependency_failed';
      log({ stage: 'request_rejected', correlationId, status, code });
      response(res, status, { error: code, correlationId }, { connection: 'close', ...(status === 401 ? { 'www-authenticate': 'Bearer' } : {}) });
    } finally { active--; }
  };
}

export function documentServer(options) {
  const server = createServer({ maxHeaderSize: 24 * 1024 }, documentHandler(options));
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000; server.maxHeadersCount = 32; server.maxConnections = 32;
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = documentServer().listen(Number(process.env.PORT ?? 8080), '0.0.0.0');
  const shutdown = () => {
    server.close(async () => { await closeClients(); process.exit(0); });
    setTimeout(() => process.exit(1), 30000).unref();
  };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
}
