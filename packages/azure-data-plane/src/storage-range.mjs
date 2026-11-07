import { createHash } from 'node:crypto';

export const blobContentMd5 = body => createHash('md5').update(body).digest('base64');

// Decisions for the standard Range header are backed by the retained Azure
// capture. The custom header has precedence; unmeasured syntax fails closed.
export function blobRange(body, headers) {
  const custom = headers['x-ms-range'], value = custom ?? headers.range;
  const md5 = headers['x-ms-range-get-content-md5'], crc = headers['x-ms-range-get-content-crc64'];
  const error = (status, code, message, extra = {}) => ({ status, code, message, headers: extra });
  if (crc !== undefined) return error(501, 'NotImplemented', 'CRC64 range verification is not implemented.');
  if (md5 !== undefined && !['true', 'false'].includes(md5)) return error(400, 'InvalidHeaderValue', 'The range checksum header is invalid.');
  if (value === undefined) {
    if (md5 === 'true') return error(400, 'InvalidHeaderValue', 'Range checksums require a range.');
    return { status: 200, body, headers: { 'content-md5': blobContentMd5(body) } };
  }
  const parsed = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!parsed) {
    if (String(value).includes(',')) return error(400, 'InvalidHeaderValue', 'Multiple byte ranges are not supported.');
    if (custom !== undefined || md5 === 'true') return error(501, 'NotImplemented', 'This range syntax has not been validated.');
    return { status: 200, body, headers: { 'content-md5': blobContentMd5(body) } };
  }
  const start = BigInt(parsed[1]), end = parsed[2] ? BigInt(parsed[2]) : null;
  if (start > 9223372036854775807n || end !== null && end > 9223372036854775807n) {
    return error(400, 'InvalidHeaderValue', 'The byte offset exceeds the supported integer range.');
  }
  if (end !== null && end < start) {
    if (custom !== undefined || md5 === 'true') return error(501, 'NotImplemented', 'This range syntax has not been validated.');
    return { status: 200, body, headers: { 'content-md5': blobContentMd5(body) } };
  }
  if (start >= BigInt(body.length)) return error(416, 'InvalidRange', 'The range specified is invalid for the current size of the resource.', { 'content-range': `bytes */${body.length}` });
  const final = end === null || end >= BigInt(body.length) ? body.length - 1 : Number(end);
  const bytes = body.subarray(Number(start), final + 1);
  if (md5 === 'true' && bytes.length > 4 * 1024 ** 2) return error(400, 'OutOfRangeInput', 'Range checksums are limited to 4 MiB.');
  return { status: 206, body: bytes, headers: { 'content-range': `bytes ${start}-${final}/${body.length}`,
    // MD5 is an Azure wire-integrity field, not an authentication mechanism.
    ...(md5 === 'true' ? { 'content-md5': blobContentMd5(bytes) } : {}) } };
}
