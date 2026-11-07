import { randomUUID } from 'node:crypto';

const problem = (code, message, status = 400) => Object.assign(new Error(message), { code, status });
const invalid = () => problem('InvalidInput', 'The batch request is invalid.');
const split = text => {
  const at = text.indexOf('\r\n\r\n');
  if (at < 0) throw invalid();
  return [text.slice(0, at), text.slice(at + 4)];
};
function headers(text) {
  const result = Object.create(null);
  for (const line of text.split('\r\n')) {
    const at = line.indexOf(':');
    if (at < 1 || !/^[!#$%&'*+.^_`|~\w-]+$/.test(line.slice(0, at))) throw invalid();
    const name = line.slice(0, at).toLowerCase();
    if (Object.hasOwn(result, name)) throw invalid();
    result[name] = line.slice(at + 1).trim();
  }
  return result;
}
function multipart(text, contentType) {
  const match = /^multipart\/mixed\s*;\s*boundary=(?:"([\w-]{1,70})"|([\w-]{1,70}))\s*$/i.exec(contentType ?? '');
  if (!match) throw invalid();
  const boundary = match[1] ?? match[2];
  const start = `--${boundary}\r\n`, end = `\r\n--${boundary}--`;
  if (!text.startsWith(start)) throw invalid();
  const endAt = text.lastIndexOf(end);
  if (endAt < start.length || !['', '\r\n'].includes(text.slice(endAt + end.length))) throw invalid();
  return text.slice(start.length, endAt).split(`\r\n--${boundary}\r\n`);
}

// Parse embedded requests only. Their URLs are never fetched or forwarded.
export function parseTableBatch(text, contentType, accountName) {
  if (Buffer.byteLength(text) > 4 * 1024 ** 2) throw problem('RequestBodyTooLarge', 'The request body is too large.', 413);
  const outer = multipart(text, contentType);
  if (outer.length !== 1) throw problem('NotImplemented', 'Only one changeset per batch is implemented.', 501);
  const [metadata, content] = split(outer[0]);
  const parts = multipart(content, headers(metadata)['content-type']);
  if (!parts.length || parts.length > 100) throw invalid();
  return parts.map(part => {
    const [metadata, content] = split(part);
    const mime = headers(metadata);
    if (mime['content-type'] !== 'application/http' || mime['content-transfer-encoding']?.toLowerCase() !== 'binary') throw invalid();
    const [head, body] = split(content), lines = head.split('\r\n');
    const request = /^(POST|PUT|MERGE|PATCH|DELETE) ([^\s]+) HTTP\/1\.1$/.exec(lines.shift());
    if (!request) throw problem('NotImplemented', 'This batch operation is not implemented.', 501);
    const url = new URL(request[2], `https://${accountName}.table.core.windows.net`);
    if (url.hostname !== `${accountName}.table.core.windows.net` || !['http:', 'https:'].includes(url.protocol)
      || url.username || url.password || url.hash) throw invalid();
    if ([...url.searchParams.keys()].some(name => name !== '$format') || url.searchParams.has('$format') && !/^application\/json(?:;|$)/.test(url.searchParams.get('$format'))) throw invalid();
    const h = headers(lines.join('\r\n'));
    if (request[1] !== 'DELETE' && !h['content-type']?.startsWith('application/json')) throw invalid();
    let entity;
    try { entity = request[1] === 'DELETE' ? {} : JSON.parse(body); } catch { throw invalid(); }
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) throw invalid();
    const path = url.pathname.slice(1);
    const target = /^([a-zA-Z][a-zA-Z0-9]{2,62})(?:\(PartitionKey='((?:[^']|'')*)',RowKey='((?:[^']|'')*)'\))?$/.exec(path);
    if (!target || (request[1] === 'POST') !== (target[2] === undefined)) throw invalid();
    const partition = request[1] === 'POST' ? entity.PartitionKey : decodeURIComponent(target[2]).replaceAll("''", "'");
    const row = request[1] === 'POST' ? entity.RowKey : decodeURIComponent(target[3]).replaceAll("''", "'");
    if ([partition, row].some(key => typeof key !== 'string' || key.length > 1024 || /[\x00-\x1f\x7f-\x9f/\\#?]/.test(key))) throw invalid();
    if (entity.PartitionKey !== undefined && entity.PartitionKey !== partition || entity.RowKey !== undefined && entity.RowKey !== row) throw invalid();
    if (Buffer.byteLength(body) > 1024 ** 2) throw problem('EntityTooLarge', 'The entity is larger than allowed.');
    return { method: request[1], tableName: target[1], partition, row, headers: h, entity };
  });
}

// No await occurs between snapshot and commit. Readers cannot observe a partial
// changeset, and a conflict leaves every original entity and timestamp intact.
export function executeTableBatch(account, operations) {
  const first = operations[0], original = account.tables.get(first.tableName.toLowerCase());
  const working = original && { ...original, entities: new Map(original.entities) };
  const seen = new Set(), results = [];
  for (const [index, operation] of operations.entries()) {
    try {
      if (!working) throw problem('TableNotFound', 'The table specified does not exist.', 404);
      if (operation.tableName.toLowerCase() !== first.tableName.toLowerCase() || operation.partition !== first.partition)
        throw problem('CommandsInBatchActOnDifferentPartitions', 'All commands in a batch must operate on same entity group.');
      if (seen.has(operation.row)) throw problem('InvalidDuplicateRow', 'The batch request contains multiple changes with the same row key.');
      seen.add(operation.row);
      const key = `${operation.partition}\0${operation.row}`, current = working.entities.get(key), condition = operation.headers['if-match'];
      if (operation.method === 'POST' && current) throw problem('EntityAlreadyExists', 'The specified entity already exists.', 409);
      if (operation.method !== 'POST' && !current && (condition || operation.method === 'DELETE')) throw problem('ResourceNotFound', 'The specified resource does not exist.', 404);
      if (condition && condition !== '*' && condition !== current?.['odata.etag']) throw problem('UpdateConditionNotSatisfied', 'The update condition specified in the request was not satisfied.', 412);
      if (operation.method === 'DELETE') {
        if (!condition) throw problem('MissingRequiredHeader', 'A required header was not specified.');
        working.entities.delete(key); results.push({ status: 204 }); continue;
      }
      const properties = Object.fromEntries(Object.entries(operation.entity).filter(([name, value]) => value !== null && name !== 'Timestamp' && !name.startsWith('odata.')));
      working.lastTimestamp = Math.max(Date.now(), (working.lastTimestamp ?? 0) + 1);
      const timestamp = new Date(working.lastTimestamp).toISOString();
      const entity = { ...(['MERGE', 'PATCH'].includes(operation.method) ? current : {}), ...properties,
        PartitionKey: operation.partition, RowKey: operation.row, Timestamp: timestamp, 'odata.etag': `W/"datetime'${timestamp}'"` };
      working.entities.set(key, entity);
      const echo = operation.method === 'POST' && operation.headers.prefer !== 'return-no-content';
      results.push({ status: echo ? 201 : 204, headers: { ETag: entity['odata.etag'] }, body: echo ? entity : undefined });
    } catch (error) {
      return [{ status: error.status ?? 400, error: { code: error.code ?? 'InvalidInput', message: `${index}:${error.message}` } }];
    }
  }
  original.entities = working.entities; original.lastTimestamp = working.lastTimestamp;
  return results;
}

export function tableBatchResponse(results, requestId) {
  const batch = `batchresponse_${randomUUID()}`, changeset = `changesetresponse_${randomUUID()}`;
  const reasons = { 200: 'OK', 201: 'Created', 204: 'No Content', 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict', 412: 'Precondition Failed' };
  const body = [`--${batch}`, `Content-Type: multipart/mixed; boundary=${changeset}`, '', ...results.flatMap(result => {
    const data = result.error ? { 'odata.error': { code: result.error.code, message: { lang: 'en-US',
      value: `${result.error.message}\nRequestId:${requestId}\nTime:${new Date().toISOString()}` } } } : result.body;
    return [`--${changeset}`, 'Content-Type: application/http', 'Content-Transfer-Encoding: binary', '',
      `HTTP/1.1 ${result.status} ${reasons[result.status] ?? 'Error'}`, 'DataServiceVersion: 3.0;',
      ...Object.entries(result.headers ?? {}).map(([name, value]) => `${name}: ${value}`),
      ...(data ? ['Content-Type: application/json;odata=minimalmetadata'] : []), '', data ? JSON.stringify(data) : ''];
  }), `--${changeset}--`, `--${batch}--`, ''].join('\r\n');
  return { body, contentType: `multipart/mixed; boundary=${batch}` };
}
