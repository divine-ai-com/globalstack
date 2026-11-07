import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient } from '@azure/storage-blob';
import { SearchClient } from '@azure/search-documents';
import { ServiceBusClient } from '@azure/service-bus';
import pg from 'pg';
import { commitRevision, deliverNext } from './repository.mjs';

const required = name => {
  const value = process.env[name];
  assert.ok(value, `Missing application setting ${name}`);
  return value;
};
const endpoint = name => {
  const value = required(name), url = new URL(value);
  assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, `${name} must be a credential-free HTTPS endpoint`);
  return value.replace(/\/$/, '');
};

export function applicationConfig() {
  return { storageEndpoint: endpoint('STORAGE_ENDPOINT'), storageResourceId: required('STORAGE_RESOURCE_ID'),
    landingContainer: required('LANDING_CONTAINER'), quarantineContainer: required('QUARANTINE_CONTAINER'),
    projectionContainer: required('PROJECTION_CONTAINER'), scannerEndpoint: endpoint('SCANNER_ENDPOINT'), scannerScope: required('SCANNER_SCOPE'),
    searchEndpoint: endpoint('SEARCH_ENDPOINT'), searchIndex: required('SEARCH_INDEX'),
    failuresNamespace: required('FAILURES_NAMESPACE'), failuresQueue: required('FAILURES_QUEUE') };
}

let application;
export async function clients() {
  if (!application) application = createClients();
  return application;
}

export async function closeClients() {
  const pending = application; application = undefined;
  if (!pending) return;
  const value = await pending.catch(() => null);
  if (value) await Promise.allSettled([value.pool.end(), value.bus.close()]);
}

async function createClients() {
  const config = applicationConfig();
  const credential = new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID });
  const authMode = required('DB_AUTH_MODE');
  assert.ok(['entra', 'key-vault'].includes(authMode));
  const ca = process.env.PGSSLROOTCERT ? await readFile(process.env.PGSSLROOTCERT, 'utf8') : undefined;
  const password = async () => {
    if (authMode === 'entra') return (await credential.getToken('https://ossrdbms-aad.database.windows.net/.default')).token;
    const token = await credential.getToken('https://vault.azure.net/.default');
    const secretUrl = `${endpoint('KEY_VAULT_ENDPOINT')}/secrets/${encodeURIComponent(required('DB_PASSWORD_SECRET'))}?api-version=7.4`;
    const response = await fetch(secretUrl, { headers: { authorization: `Bearer ${token.token}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, 'Database secret lookup failed');
    const secret = await response.json();
    assert.equal(typeof secret.value, 'string');
    return secret.value;
  };
  const pool = new pg.Pool({ host: required('DB_HOST'), database: required('DB_NAME'), user: required('DB_USER'),
    port: Number(process.env.DB_PORT ?? 5432), password, ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 5, connectionTimeoutMillis: 10000, statement_timeout: 10000, idle_in_transaction_session_timeout: 15000 });
  pool.on('error', () => console.error(JSON.stringify({ stage: 'database', outcome: 'idle_connection_error' })));
  return { config, credential, pool,
    blobs: new BlobServiceClient(config.storageEndpoint, credential, { retryOptions: { maxTries: 3 } }),
    search: new SearchClient(config.searchEndpoint, config.searchIndex, credential, { serviceVersion: '2024-07-01', retryOptions: { maxRetries: 2 } }),
    bus: new ServiceBusClient(config.failuresNamespace, credential, { retryOptions: { maxRetries: 2 } }) };
}

function log(context, stage, input, extra = {}) {
  context.log(JSON.stringify({ stage, correlationId: input.rootCorrelationId ?? input.correlationId, processingId: input.correlationId, ...extra }));
}

export async function sourceRevision(blobs, input) {
  const container = blobs.getContainerClient(input.container), current = container.getBlobClient(input.blobName);
  const signal = AbortSignal.timeout(30000);
  const match = etag => String(etag ?? '').replace(/^"|"$/g, '') === input.etag;
  let client = current, properties;
  try {
    properties = await current.getProperties({ abortSignal: signal });
  } catch (error) {
    // Deleting the current blob can leave immutable versions available. Other
    // failures, including permissions and a missing container, must propagate.
    const code = error.code ?? error.details?.errorCode ?? error.response?.headers?.get('x-ms-error-code');
    if (error.statusCode !== 404 || code !== 'BlobNotFound') throw error;
  }
  if (!properties || !match(properties.etag)) {
    client = null;
    let examined = 0;
    for await (const item of container.listBlobsFlat({ prefix: input.blobName, includeVersions: true, abortSignal: signal })) {
      assert.ok(++examined <= 1000, 'Source version lookup exceeded its bound');
      if (item.name === input.blobName && item.versionId && match(item.properties.etag)) {
        client = current.withVersion(item.versionId);
        properties = await client.getProperties({ abortSignal: signal });
        assert.ok(match(properties.etag), 'Historical version does not match the event ETag');
        break;
      }
    }
    assert.ok(client, 'The referenced source revision is unavailable');
  } else if (properties.versionId) {
    client = current.withVersion(properties.versionId);
  }
  assert.ok(properties.contentLength > 0 && properties.contentLength <= 10 * 1024 * 1024, 'Source exceeds the file size limit');
  const bytes = await client.downloadToBuffer(0, properties.contentLength, { conditions: { ifMatch: properties.etag }, abortSignal: signal });
  assert.equal(bytes.length, properties.contentLength);
  return { bytes, properties };
}

export async function scanAndStore(input, context) {
  const { config, credential, pool, blobs } = await clients();
  if (input.deleted) {
    const result = await commitRevision(pool, { ...input, status: 'deleted' });
    log(context, 'metadata_deleted', input, { documentId: result.documentId, state: result.state });
    return result;
  }
  const pending = await commitRevision(pool, { ...input, status: 'pending' });
  if (pending.state === 'stale' || (pending.state === 'duplicate' && !pending.needsProcessing)) return pending;
  log(context, 'source_read_started', input);
  try {
    const { bytes, properties } = await sourceRevision(blobs, input);
    const token = await credential.getToken(config.scannerScope);
    const response = await fetch(`${config.scannerEndpoint}/scan`, { method: 'POST', body: bytes, redirect: 'error',
      headers: { authorization: `Bearer ${token.token}`, 'content-type': properties.contentType,
        'x-correlation-id': input.rootCorrelationId ?? input.correlationId }, signal: AbortSignal.timeout(90000) });
    assert.equal(response.status, 200, 'Scanner request failed');
    const scan = await response.json();
    assert.equal(scan.sha256, createHash('sha256').update(bytes).digest('hex'), 'Scanner result does not refer to the downloaded bytes');
    assert.ok(['clean', 'detected'].includes(scan.status), 'Scanning or extraction is unresolved');
    if (scan.status === 'detected') {
      const name = `${input.tenant}/${pending.documentId}/${scan.sha256}`;
      await blobs.getContainerClient(config.quarantineContainer).getBlockBlobClient(name).uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: properties.contentType }, metadata: { correlationid: input.correlationId, sha256: scan.sha256 },
        abortSignal: AbortSignal.timeout(30000),
      });
      log(context, 'quarantine_written', input, { documentId: pending.documentId, contentHash: scan.sha256 });
    }
    const result = await commitRevision(pool, { ...input, status: scan.status, scan });
    log(context, 'metadata_committed', input, { documentId: result.documentId, state: result.state, scanStatus: scan.status });
    return result;
  } catch (error) {
    await commitRevision(pool, { ...input, status: 'unresolved' });
    log(context, 'processing_unresolved', input);
    throw error;
  }
}

export async function drainOutbox(context) {
  const { pool, blobs, search, config } = await clients();
  for (let i = 0; i < 20; i++) {
    const result = await deliverNext(pool, async ({ operation, document, signal }) => {
      const response = operation === 'upload'
        ? await search.uploadDocuments([document], { abortSignal: signal })
        : await search.deleteDocuments('document_id', [document.document_id], { abortSignal: signal });
      const item = response.results[0];
      if (!item?.succeeded) return { status: false, key: item?.key };
      // The separately configured Blob indexer reads committed projections only.
      // Tombstones must be consumed by its explicit deletion-detection policy.
      const projection = { ...document, deleted: operation === 'delete' ? 'true' : 'false' };
      await blobs.getContainerClient(config.projectionContainer).getBlockBlobClient(`${document.document_id}.json`).uploadData(Buffer.from(JSON.stringify(projection)), {
        blobHTTPHeaders: { blobContentType: 'application/json' }, metadata: { isdeleted: projection.deleted }, abortSignal: signal,
      });
      context.log(JSON.stringify({ stage: 'search_and_projection_acknowledged', correlationId: document.root_correlation_id,
        documentId: document.document_id, revisionId: document.revision_id, operation }));
      return { status: true, key: item.key };
    });
    context.log(JSON.stringify({ stage: 'outbox', ...result }));
    if (result.state === 'idle') break;
  }
}

export async function recordFailure(input, context) {
  const { bus, config } = await clients();
  const sender = bus.createSender(config.failuresQueue);
  try {
    await sender.sendMessages({ messageId: input.correlationId, correlationId: input.rootCorrelationId ?? input.correlationId,
      body: { event: input, reason: 'processing_retries_exhausted' }, applicationProperties: { category: 'document_processing' } }, { abortSignal: AbortSignal.timeout(10000) });
    log(context, 'failure_queue_sent', input);
  } finally { await sender.close(); }
}

export async function settleFailures(context) {
  const { bus, config } = await clients();
  const receiver = bus.createReceiver(config.failuresQueue, { receiveMode: 'peekLock' });
  try {
    const messages = await receiver.receiveMessages(5, { maxWaitTimeInMs: 1000 });
    for (const message of messages) {
      await receiver.deadLetterMessage(message, { deadLetterReason: 'DocumentProcessingFailed', deadLetterErrorDescription: 'Processing retries exhausted; inspect the correlated orchestration before replay.' });
      context.log(JSON.stringify({ stage: 'failure_dead_lettered', correlationId: message.correlationId }));
    }
  } finally { await receiver.close(); }
}
