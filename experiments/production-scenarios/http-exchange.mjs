import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

// Native requests preserve an explicitly configured Host header. Node fetch can
// replace it with the connection address, which breaks local virtual-host routing.
export function httpExchange(url, { method = 'GET', body, headers = {}, timeoutMs = 30000, maxResponseBytes = 8 * 1024 * 1024, ca } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) return reject(new Error('Unsupported HTTP target'));
    const payload = body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body);
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    // Native CLI subprocesses can block long enough for a pooled socket to expire.
    // Use a fresh connection rather than retrying a potentially submitted mutation.
    const req = request(target, { agent: false, method, signal: AbortSignal.timeout(timeoutMs),
      ...(target.protocol === 'https:' && ca ? { ca } : {}), headers: {
      'content-type': 'application/json', ...headers,
      ...(payload === undefined ? {} : { 'content-length': Buffer.byteLength(payload) }),
    } }, response => {
      const chunks = [];
      let bytes = 0;
      response.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > maxResponseBytes) { response.destroy(new Error('HTTP response exceeded capture limit')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { unparsedBytes: bytes }; }
        const retainedHeaders = ['content-type', 'etag', 'retry-after', 'request-id', 'www-authenticate', 'x-ms-request-id', 'x-ms-correlation-request-id', 'azure-asyncoperation', 'location'];
        resolve({ status: response.statusCode, body: parsed,
          headers: Object.fromEntries(retainedHeaders.filter(key => response.headers[key] !== undefined).map(key => [key, response.headers[key]])),
        });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}
