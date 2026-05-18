import http from 'node:http';
import { normalizeStorageResponse } from './storage-normalizer.mjs';

const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function collectBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function filteredHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([key]) => !hopByHopHeaders.has(key.toLowerCase()))
      .filter(([key]) => key.toLowerCase() !== 'host'),
  );
}

export function createStorageProxyServer({
  service,
  targetEndpoint,
  logger = null,
}) {
  if (!['blob', 'queue'].includes(service)) {
    throw new Error(`Unsupported storage proxy service: ${service}`);
  }
  if (!targetEndpoint) {
    throw new Error('targetEndpoint is required');
  }

  const targetBase = new URL(targetEndpoint);
  return http.createServer(async (req, res) => {
    try {
      const body = await collectBody(req);
      const targetUrl = new URL(req.url ?? '/', targetBase);
      const requestHeaders = filteredHeaders(req.headers);
      if (body.length > 0 && !requestHeaders['content-length']) {
        requestHeaders['content-length'] = String(body.length);
      }
      const upstream = await fetch(targetUrl, {
        method: req.method,
        headers: requestHeaders,
        body: body.length === 0 ? undefined : body,
      });
      const upstreamBody = Buffer.from(await upstream.arrayBuffer());
      const upstreamResponse = {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: upstreamBody.toString('utf8'),
      };
      const normalized = normalizeStorageResponse({
        service,
        request: {
          method: req.method ?? 'GET',
          url: targetUrl,
          headers: req.headers,
          body,
        },
        response: upstreamResponse,
      });
      if (normalized.normalized && logger) {
        logger({ service, ruleId: normalized.ruleId, method: req.method, path: targetUrl.pathname });
      }
      const outgoingBody = Buffer.from(normalized.response.body ?? '');
      res.writeHead(normalized.response.status, normalized.response.headers);
      res.end(outgoingBody);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.writeHead(502, {
        'content-type': 'application/json',
        'x-globalstack-proxy-error': 'true',
      });
      res.end(JSON.stringify({ error: message }));
    }
  });
}

export async function listenStorageProxy(options) {
  const server = createStorageProxyServer(options);
  await new Promise(resolve => server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve));
  return server;
}
