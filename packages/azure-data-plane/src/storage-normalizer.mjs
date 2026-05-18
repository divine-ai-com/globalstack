const sourceFixture = 'fixtures/azure-storage-data-plane-captures/storage-data-plane-blob-queue-wave-1.json';

export const storageNormalizationRules = [
  {
    id: 'blob-missing-blob-type-header',
    service: 'blob',
    sourceFixture,
    azureStatus: 400,
    azureErrorCode: 'MissingRequiredHeader',
    azuriteStatus: 400,
    azuriteErrorCode: null,
    status: 'implemented',
  },
  {
    id: 'blob-get-without-authorization',
    service: 'blob',
    sourceFixture,
    azureStatus: 401,
    azureErrorCode: 'NoAuthenticationInformation',
    azuriteStatus: 403,
    azuriteErrorCode: 'AuthorizationFailure',
    status: 'implemented',
  },
  {
    id: 'queue-malformed-message',
    service: 'queue',
    sourceFixture,
    azureStatus: 400,
    azureErrorCode: 'InvalidXmlDocument',
    azuriteStatus: 400,
    azuriteErrorCode: null,
    status: 'implemented',
  },
  {
    id: 'queue-peek-after-delete',
    service: 'queue',
    sourceFixture,
    azureStatus: 200,
    azureErrorCode: null,
    azuriteStatus: 404,
    azuriteErrorCode: 'QueueNotFound',
    status: 'needs-repeat-capture',
  },
];

const implementedRuleIds = new Set(storageNormalizationRules
  .filter(rule => rule.status === 'implemented')
  .map(rule => rule.id));

function headerValue(headers, name) {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === lower) return value;
  }
  return undefined;
}

function withoutHopByHopHeaders(headers) {
  const excluded = new Set([
    'connection',
    'content-encoding',
    'content-length',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ]);
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(([key]) => !excluded.has(key.toLowerCase())),
  );
}

function setHeader(headers, name, value) {
  const next = withoutHopByHopHeaders(headers);
  const lower = name.toLowerCase();
  for (const key of Object.keys(next)) {
    if (key.toLowerCase() === lower) delete next[key];
  }
  next[name] = value;
  return next;
}

function requestPathSegments(request) {
  const url = request.url instanceof URL ? request.url : new URL(request.url, 'http://127.0.0.1');
  return url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
}

function isBlobObjectPath(request) {
  const url = request.url instanceof URL ? request.url : new URL(request.url, 'http://127.0.0.1');
  if (url.searchParams.get('restype') === 'container') return false;
  return requestPathSegments(request).length >= 3;
}

function isQueueMessagesPath(request) {
  const segments = requestPathSegments(request);
  return segments.length >= 3 && segments.at(-1)?.toLowerCase() === 'messages';
}

function looksMalformedQueueMessage(body) {
  const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body ?? '');
  if (!text.trim()) return false;
  if (!text.includes('<QueueMessage')) return false;
  return !text.includes('</QueueMessage>') || !text.includes('</MessageText>');
}

function errorBody({ code, message, requestId, extra = '' }) {
  return `<?xml version="1.0" encoding="utf-8"?><Error><Code>${code}</Code><Message>${message}\nRequestId:${requestId}\nTime:${new Date().toISOString()}</Message>${extra}</Error>`;
}

function normalize({ request, response, ruleId, status, errorCode, message, extra = '' }) {
  const requestId = headerValue(response.headers, 'x-ms-request-id') ?? 'globalstack-storage-normalized';
  let headers = setHeader(response.headers, 'content-type', 'application/xml');
  headers = setHeader(headers, 'x-ms-error-code', errorCode);
  headers = setHeader(headers, 'x-ms-version', headerValue(response.headers, 'x-ms-version') ?? headerValue(request.headers, 'x-ms-version') ?? '2023-11-03');
  headers = setHeader(headers, 'x-globalstack-normalized-from', 'azurite');
  headers = setHeader(headers, 'x-globalstack-normalization-rule', ruleId);
  const body = errorBody({ code: errorCode, message, requestId, extra });
  headers = setHeader(headers, 'content-length', Buffer.byteLength(body));
  return {
    normalized: true,
    ruleId,
    response: {
      status,
      headers,
      body,
    },
  };
}

export function normalizeStorageResponse({ service, request, response }) {
  const method = request.method.toUpperCase();
  const headers = request.headers ?? {};
  const responseErrorCode = headerValue(response.headers, 'x-ms-error-code') ?? null;

  if (
    implementedRuleIds.has('blob-missing-blob-type-header')
    && service === 'blob'
    && method === 'PUT'
    && isBlobObjectPath(request)
    && headerValue(headers, 'x-ms-blob-type') === undefined
    && response.status === 400
    && responseErrorCode === null
  ) {
    return normalize({
      request,
      response,
      ruleId: 'blob-missing-blob-type-header',
      status: 400,
      errorCode: 'MissingRequiredHeader',
      message: "An HTTP header that's mandatory for this request is not specified.",
      extra: '<HeaderName>x-ms-blob-type</HeaderName>',
    });
  }

  if (
    implementedRuleIds.has('blob-get-without-authorization')
    && service === 'blob'
    && method === 'GET'
    && isBlobObjectPath(request)
    && headerValue(headers, 'authorization') === undefined
    && response.status === 403
    && responseErrorCode === 'AuthorizationFailure'
  ) {
    return normalize({
      request,
      response,
      ruleId: 'blob-get-without-authorization',
      status: 401,
      errorCode: 'NoAuthenticationInformation',
      message: 'Server failed to authenticate the request. Please refer to the information in the www-authenticate header.',
    });
  }

  if (
    implementedRuleIds.has('queue-malformed-message')
    && service === 'queue'
    && method === 'POST'
    && isQueueMessagesPath(request)
    && looksMalformedQueueMessage(request.body)
    && response.status === 400
    && responseErrorCode === null
  ) {
    return normalize({
      request,
      response,
      ruleId: 'queue-malformed-message',
      status: 400,
      errorCode: 'InvalidXmlDocument',
      message: 'XML specified is not syntactically valid.',
      extra: '<LineNumber>1</LineNumber><LinePosition>40</LinePosition><Reason>Error parsing Xml content</Reason>',
    });
  }

  return {
    normalized: false,
    ruleId: null,
    response,
  };
}

export function normalizationRuleById(id) {
  return storageNormalizationRules.find(rule => rule.id === id) ?? null;
}
