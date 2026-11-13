import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// Diagnostic Shared Key transport. Credentials stay in memory and response
// headers are allowlisted before any caller records the exchange.
export function storageExchange({ account, key, surface, origin, method, path, headers = {}, body = '', scheme = 'SharedKey' }) {
  assert.match(account, /^[a-z0-9]{3,24}$/);
  assert.ok(['blob', 'queue', 'table'].includes(surface));
  assert.ok(['SharedKey', 'SharedKeyLite'].includes(scheme));
  assert.ok(path.startsWith('/') && !path.startsWith('//'));
  const base = new URL(origin);
  assert.ok(!base.username && !base.password && !base.search && !base.hash && base.pathname === '/');
  assert.ok(base.href === `https://${account}.${surface}.core.windows.net/` || (base.protocol === 'http:' && base.hostname === '127.0.0.1'));
  const url = new URL(path, base);
  assert.equal(url.origin, base.origin);
  const payload = Buffer.from(body);
  const sent = { 'x-ms-date': new Date().toUTCString(), 'x-ms-version': '2023-11-03',
    host: `${account}.${surface}.core.windows.net`, ...headers, 'content-length': String(payload.length) };
  let canonical = `/${account}${url.pathname}`;
  let signed;
  if (surface === 'table') {
    if (url.searchParams.has('comp')) canonical += `?comp=${url.searchParams.get('comp')}`;
    signed = scheme === 'SharedKeyLite' ? [sent['x-ms-date'], canonical]
      : [method, sent['content-md5'] ?? '', sent['content-type'] ?? '', sent['x-ms-date'], canonical];
  } else {
    assert.equal(scheme, 'SharedKey');
    const params = new Map();
    for (const [name, value] of url.searchParams) params.set(name.toLowerCase(), [...(params.get(name.toLowerCase()) ?? []), value]);
    for (const [name, values] of [...params].sort(([a], [b]) => a.localeCompare(b))) canonical += `\n${name}:${values.sort().join(',')}`;
    const custom = Object.entries(sent).filter(([name]) => name.startsWith('x-ms-')).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}:${String(value).trim()}\n`).join('');
    signed = [method, sent['content-encoding'] ?? '', sent['content-language'] ?? '', payload.length ? String(payload.length) : '',
      sent['content-md5'] ?? '', sent['content-type'] ?? '', '', sent['if-modified-since'] ?? '', sent['if-match'] ?? '',
      sent['if-none-match'] ?? '', sent['if-unmodified-since'] ?? '', sent.range ?? '', custom + canonical];
  }
  sent.authorization = `${scheme} ${account}:${createHmac('sha256', Buffer.from(key, 'base64')).update(signed.join('\n')).digest('base64')}`;
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method, headers: sent, signal: AbortSignal.timeout(30000),
    }, response => {
      const chunks = []; let size = 0;
      response.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 ** 2) response.destroy(new Error('Storage response too large')); else chunks.push(chunk); });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8'),
        headers: Object.fromEntries(Object.entries(response.headers).filter(([name]) =>
          ['content-type', 'content-length', 'content-range', 'content-md5', 'etag', 'last-modified', 'date', 'x-ms-request-id', 'x-ms-version', 'x-ms-version-id', 'x-ms-is-current-version', 'x-ms-error-code', 'x-ms-lease-id', 'x-ms-lease-time', 'x-ms-lease-state', 'x-ms-lease-status', 'x-ms-lease-duration', 'x-ms-popreceipt', 'x-ms-time-next-visible', 'x-ms-continuation-nextpartitionkey', 'x-ms-continuation-nextrowkey'].includes(name))) }));
    });
    request.on('error', reject); request.end(payload);
  });
}

export const storageCases = [
  { id: 'container-create', surface: 'blob', method: 'PUT', path: '/native-host?restype=container' },
  { id: 'container-duplicate', surface: 'blob', method: 'PUT', path: '/native-host?restype=container' },
  { id: 'blob-create', surface: 'blob', method: 'PUT', path: '/native-host/lock', headers: { 'x-ms-blob-type': 'BlockBlob', 'if-none-match': '*' }, body: 'lease fixture' },
  { id: 'blob-conditional-conflict', surface: 'blob', method: 'PUT', path: '/native-host/lock', headers: { 'x-ms-blob-type': 'BlockBlob', 'if-none-match': '*' }, body: 'must not replace' },
  { id: 'blob-acquire-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock?comp=lease', headers: { 'x-ms-lease-action': 'acquire', 'x-ms-lease-duration': '60', 'x-ms-proposed-lease-id': '41234567-1234-4321-8123-123456789abc' } },
  { id: 'blob-metadata-without-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock?comp=metadata', headers: { 'x-ms-meta-owner': 'wrong-worker' } },
  { id: 'blob-metadata-with-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock?comp=metadata', headers: { 'x-ms-meta-owner': 'lease-worker', 'x-ms-lease-id': '41234567-1234-4321-8123-123456789abc' } },
  { id: 'blob-competing-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock?comp=lease', headers: { 'x-ms-lease-action': 'acquire', 'x-ms-lease-duration': '60', 'x-ms-proposed-lease-id': '51234567-1234-4321-8123-123456789abc' } },
  { id: 'blob-properties-leased', surface: 'blob', method: 'HEAD', path: '/native-host/lock' },
  { id: 'blob-write-without-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock', headers: { 'x-ms-blob-type': 'BlockBlob' }, body: 'must not replace' },
  { id: 'blob-renew-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock?comp=lease', headers: { 'x-ms-lease-action': 'renew', 'x-ms-lease-id': '41234567-1234-4321-8123-123456789abc' } },
  { id: 'blob-release-wrong-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock?comp=lease', headers: { 'x-ms-lease-action': 'release', 'x-ms-lease-id': '51234567-1234-4321-8123-123456789abc' } },
  { id: 'blob-release-lease', surface: 'blob', method: 'PUT', path: '/native-host/lock?comp=lease', headers: { 'x-ms-lease-action': 'release', 'x-ms-lease-id': '41234567-1234-4321-8123-123456789abc' } },
  { id: 'blob-retained-content', surface: 'blob', method: 'GET', path: '/native-host/lock' },
  { id: 'container-acquire-lease', surface: 'blob', method: 'PUT', path: '/native-host?restype=container&comp=lease', headers: { 'x-ms-lease-action': 'acquire', 'x-ms-lease-duration': '-1', 'x-ms-proposed-lease-id': '61234567-1234-4321-8123-123456789abc' } },
  { id: 'container-delete-without-lease', surface: 'blob', method: 'DELETE', path: '/native-host?restype=container' },
  { id: 'container-release-lease', surface: 'blob', method: 'PUT', path: '/native-host?restype=container&comp=lease', headers: { 'x-ms-lease-action': 'release', 'x-ms-lease-id': '61234567-1234-4321-8123-123456789abc' } },
  { id: 'table-create', surface: 'table', method: 'POST', path: '/Tables', headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata', dataserviceversion: '3.0', maxdataserviceversion: '3.0', prefer: 'return-no-content' }, body: '{"TableName":"NativePartitions"}' },
  { id: 'table-create-duplicate', surface: 'table', method: 'POST', path: '/Tables', headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata' }, body: '{"TableName":"NativePartitions"}' },
  { id: 'table-insert', surface: 'table', method: 'POST', path: '/NativePartitions', headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata', prefer: 'return-no-content' }, body: '{"PartitionKey":"taskhub","RowKey":"0","Owner":"worker-one"}' },
  { id: 'table-point-read', surface: 'table', method: 'GET', path: "/NativePartitions(PartitionKey='taskhub',RowKey='0')", headers: { accept: 'application/json;odata=nometadata' } },
  { id: 'table-replace-stale-etag', surface: 'table', method: 'PUT', path: "/NativePartitions(PartitionKey='taskhub',RowKey='0')", headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata', 'if-match': 'W/"datetime\'2000-01-01T00%3A00%3A00.0000000Z\'"' }, body: '{"PartitionKey":"taskhub","RowKey":"0","Owner":"must-not-change"}' },
  { id: 'table-replace', surface: 'table', method: 'PUT', path: "/NativePartitions(PartitionKey='taskhub',RowKey='0')", headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata', 'if-match': '*' }, body: '{"PartitionKey":"taskhub","RowKey":"0","Owner":"worker-two"}' },
  { id: 'table-merge', surface: 'table', method: 'MERGE', path: "/NativePartitions(PartitionKey='taskhub',RowKey='0')", headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata', 'if-match': '*' }, body: '{"Phase":"processing"}' },
  { id: 'table-filtered-read', surface: 'table', method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'taskhub'", headers: { accept: 'application/json;odata=nometadata' } },
  { id: 'queue-create', surface: 'queue', method: 'PUT', path: '/native-control' },
  { id: 'queue-create-duplicate', surface: 'queue', method: 'PUT', path: '/native-control' },
  { id: 'queue-send-raw-message', surface: 'queue', method: 'POST', path: '/native-control/messages', headers: { 'content-type': 'application/xml' }, body: '<QueueMessage><MessageText>native-text</MessageText></QueueMessage>' },
  { id: 'queue-receive', surface: 'queue', method: 'GET', path: '/native-control/messages?numofmessages=1&visibilitytimeout=30' },
  { id: 'queue-hidden-message', surface: 'queue', method: 'GET', path: '/native-control/messages?peekonly=true' },
];

// The account placeholder is resolved by the capture runner before signing.
export function storageBatch(operations) {
  return ['--batch_native', 'Content-Type: multipart/mixed; boundary=changeset_native', '',
    ...operations.flatMap((operation, index) => [
      '--changeset_native', 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', `Content-ID: ${index + 1}`, '',
      `${operation.method ?? 'POST'} https://{account}.table.core.windows.net/${operation.path ?? 'NativePartitions'} HTTP/1.1`,
      'Content-Type: application/json', 'Accept: application/json;odata=nometadata', 'Prefer: return-no-content',
      ...Object.entries(operation.headers ?? {}).map(([name, value]) => `${name}: ${value}`), '', operation.body === undefined ? '' : JSON.stringify(operation.body),
    ]), '--changeset_native--', '--batch_native--', ''].join('\r\n');
}
const batchHeaders = { 'content-type': 'multipart/mixed; boundary=batch_native', accept: 'application/json;odata=nometadata', dataserviceversion: '3.0' };
storageCases.push(
  { id: 'table-second-row', surface: 'table', method: 'POST', path: '/NativePartitions', headers: { 'content-type': 'application/json', accept: 'application/json;odata=nometadata', prefer: 'return-no-content' }, body: '{"PartitionKey":"taskhub","RowKey":"1","Owner":"worker-three"}' },
  { id: 'table-projected-top', surface: 'table', method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'taskhub'&$top=1&$select=Owner,Missing,PartitionKey,RowKey&$format=application/json;odata=minimalmetadata" },
  { id: 'table-projected-no-keys', surface: 'table', method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'taskhub'&$select=Owner&$format=application/json;odata=nometadata" },
  { id: 'table-top-zero', surface: 'table', method: 'GET', path: '/NativePartitions()?$top=0', headers: { accept: 'application/json;odata=nometadata' } },
  { id: 'table-batch-insert', surface: 'table', method: 'POST', path: '/$batch', headers: batchHeaders,
    body: storageBatch([{ body: { PartitionKey: 'batch', RowKey: '1', Owner: 'first' } }, { body: { PartitionKey: 'batch', RowKey: '2', Owner: 'second' } }]) },
  { id: 'table-batch-read', surface: 'table', method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'batch'", headers: { accept: 'application/json;odata=nometadata' } },
  { id: 'table-batch-conflict', surface: 'table', method: 'POST', path: '/$batch', headers: batchHeaders,
    body: storageBatch([{ body: { PartitionKey: 'batch', RowKey: '3', Owner: 'must-roll-back' } }, { body: { PartitionKey: 'batch', RowKey: '1', Owner: 'conflict' } }]) },
  { id: 'table-batch-rollback-read', surface: 'table', method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'batch'", headers: { accept: 'application/json;odata=nometadata' } },
  { id: 'table-batch-mixed-partitions', surface: 'table', method: 'POST', path: '/$batch', headers: batchHeaders,
    body: storageBatch([{ body: { PartitionKey: 'batch', RowKey: '4' } }, { body: { PartitionKey: 'foreign', RowKey: '5' } }]) },
);

storageCases.push(
  { id: 'table-compound-filter', surface: 'table', method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'batch'%20and%20(RowKey%20eq%20'1'%20or%20Owner%20eq%20'second')", headers: { accept: 'application/json;odata=nometadata' } },
  { id: 'table-batch-merge-delete', surface: 'table', method: 'POST', path: '/$batch', headers: batchHeaders,
    body: storageBatch([
      { method: 'MERGE', path: "NativePartitions(PartitionKey='batch',RowKey='1')?$format=application%2Fjson%3Bodata%3Dminimalmetadata", body: { Owner: 'merged' } },
      { method: 'DELETE', path: "NativePartitions(PartitionKey='batch',RowKey='2')", headers: { 'If-Match': '*' } },
    ]) },
  { id: 'table-batch-final-read', surface: 'table', method: 'GET', path: "/NativePartitions()?$filter=PartitionKey%20eq%20'batch'", headers: { accept: 'application/json;odata=nometadata' } },
);
