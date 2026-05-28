import { spawnFileText } from '../util/spawn-json.mjs';

const scrubbedRequestHeaders = new Set(['authorization']);
const capturedResponseHeaders = [
  'cache-control',
  'content-type',
  'date',
  'etag',
  'server',
  'vary',
  'x-guploader-uploadid',
  'x-goog-generation',
  'x-goog-hash',
  'x-goog-metageneration',
  'x-goog-request-id',
  'x-goog-stored-content-encoding',
  'x-goog-stored-content-length',
];

export async function getAdcAccessToken() {
  return (await spawnFileText('gcloud', ['auth', 'application-default', 'print-access-token'])).trim();
}

export class GoogleRestClient {
  constructor({
    tokenProvider = getAdcAccessToken,
    userAgent = 'globalstack-gcp-conformance/0.0.0',
    timeoutMs = 30000,
  } = {}) {
    this.tokenProvider = tokenProvider;
    this.userAgent = userAgent;
    this.timeoutMs = timeoutMs;
  }

  async requestJson({ method = 'GET', url, body, headers = {}, allowEmpty = false }) {
    const token = this.tokenProvider ? await this.tokenProvider() : null;
    const requestHeaders = {
      accept: 'application/json',
      'user-agent': this.userAgent,
      ...headers,
    };
    if (token) requestHeaders.authorization = `Bearer ${token}`;
    if (body !== undefined && !requestHeaders['content-type']) {
      requestHeaders['content-type'] = 'application/json';
    }

    const startedAt = new Date().toISOString();
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await response.text();
    const responseBody = parseBody(text, response.headers.get('content-type'));

    return {
      request: {
        method,
        url: String(url),
        headers: scrubRequestHeaders(requestHeaders),
        body: body ?? null,
        started_at: startedAt,
      },
      response: {
        ok: response.ok,
        status: response.status,
        status_text: response.statusText,
        headers: captureResponseHeaders(response.headers),
        body: responseBody ?? (allowEmpty ? null : {}),
        ended_at: new Date().toISOString(),
      },
    };
  }

  async requireOk(request) {
    const exchange = await this.requestJson(request);
    if (!exchange.response.ok) {
      throw new GoogleRestError(exchange);
    }
    return exchange;
  }
}

export class GoogleRestError extends Error {
  constructor(exchange) {
    super(`${exchange.request.method} ${exchange.request.url} failed with ${exchange.response.status}`);
    this.name = 'GoogleRestError';
    this.exchange = exchange;
  }
}

function parseBody(text, contentType) {
  if (!text) return null;
  if (contentType?.includes('application/json')) {
    return JSON.parse(text);
  }
  return text;
}

function scrubRequestHeaders(headers) {
  const scrubbed = {};
  for (const [key, value] of Object.entries(headers)) {
    scrubbed[key] = scrubbedRequestHeaders.has(key.toLowerCase()) ? '<redacted>' : value;
  }
  return scrubbed;
}

function captureResponseHeaders(headers) {
  const captured = {};
  for (const key of capturedResponseHeaders) {
    const value = headers.get(key);
    if (value !== null) captured[key] = value;
  }
  return captured;
}
