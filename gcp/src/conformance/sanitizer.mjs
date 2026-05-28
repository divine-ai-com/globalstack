const dynamicKeys = new Set([
  'access_token',
  'ackId',
  'ackIds',
  'authorization',
  'client_secret',
  'etag',
  'expireTime',
  'generation',
  'id',
  'crc32c',
  'metageneration',
  'md5Hash',
  'mediaLink',
  'messageId',
  'messageIds',
  'private_key',
  'publishTime',
  'projectNumber',
  'refresh_token',
  'selfLink',
  'timeCreated',
  'timeFinalized',
  'timeStorageClassUpdated',
  'updated',
]);

const dynamicHeaderKeys = new Set([
  'date',
  'etag',
  'x-guploader-uploadid',
  'x-goog-generation',
  'x-goog-hash',
  'x-goog-metageneration',
  'x-goog-request-id',
]);

export function sanitizeExchange(exchange) {
  return sanitizeValue(exchange, { inHeaders: false });
}

export function sanitizeMetadata(metadata) {
  return sanitizeValue(metadata, { inHeaders: false });
}

function sanitizeValue(value, { inHeaders }) {
  if (Array.isArray(value)) return value.map(item => sanitizeValue(item, { inHeaders }));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (dynamicKeys.has(key) || dynamicKeys.has(lower) || (inHeaders && dynamicHeaderKeys.has(lower))) {
      result[key] = '<redacted>';
      continue;
    }
    result[key] = sanitizeValue(child, { inHeaders: lower === 'headers' });
  }
  return result;
}
