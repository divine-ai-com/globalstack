import http from 'node:http';
import { normalizeStorageResponse } from './storage-normalizer.mjs';
import { QueueDeleteStaleReadTracker } from './queue-delete-window.mjs';

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
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
    let bytes = 0;
    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 8 * 1024 * 1024) {
        chunks.length = 0;
        reject(Object.assign(new Error('Request body exceeds the local proxy limit.'), { status: 413 }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
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
  if (!['http:', 'https:'].includes(targetBase.protocol) || targetBase.username || targetBase.password) throw new Error('Storage target must be an HTTP endpoint without URL credentials.');
  const queueDeleteTracker = new QueueDeleteStaleReadTracker();
  return http.createServer(async (req, res) => {
    try {
      const rawPath = String(req.url ?? '/');
      const targetUrl = new URL(rawPath, targetBase);
      if (!rawPath.startsWith('/') || rawPath.startsWith('//') || rawPath.includes('\\') || targetUrl.origin !== targetBase.origin) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Only paths on the configured storage backend are allowed.' }));
      }
      const body = await collectBody(req);
      const requestHeaders = filteredHeaders(req.headers);
      if (body.length > 0 && !requestHeaders['content-length']) {
        requestHeaders['content-length'] = String(body.length);
      }
      const upstream = await fetch(targetUrl, {
        method: req.method,
        redirect: 'manual',
        signal: AbortSignal.timeout(30000),
        headers: requestHeaders,
        body: body.length === 0 ? undefined : body,
      });
      const upstreamBody = Buffer.from(await upstream.arrayBuffer());
      const upstreamResponse = {
        status: upstream.status,
        headers: Object.fromEntries(upstream.headers.entries()),
        body: upstreamBody.toString('utf8'),
      };
      const requestPath = targetUrl.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
      const queueName = service === 'queue' ? requestPath[1] ?? requestPath[0] ?? '' : '';

      if (service === 'queue' && req.method === 'GET' && requestPath.at(-1)?.toLowerCase() === 'messages' && targetUrl.searchParams.get('peekonly') === 'true' && upstreamResponse.status === 200) {
        queueDeleteTracker.recordPeek({
          accountName: requestPath[0] ?? '',
          queueName,
          body: upstreamResponse.body,
        });
      }

      if (service === 'queue' && req.method === 'DELETE' && requestPath.length >= 2 && upstreamResponse.status === 204) {
        queueDeleteTracker.armDelete({
          accountName: requestPath[0] ?? '',
          queueName,
        });
      }

      let normalized = normalizeStorageResponse({
        service,
        request: {
          method: req.method ?? 'GET',
          url: targetUrl,
          headers: req.headers,
          body,
        },
        response: upstreamResponse,
      });

      if (
        service === 'queue'
        && !normalized.normalized
        && req.method === 'GET'
        && requestPath.at(-1)?.toLowerCase() === 'messages'
        && targetUrl.searchParams.get('peekonly') === 'true'
        && upstreamResponse.status === 404
        && upstreamResponse.headers['x-ms-error-code'] === 'QueueNotFound'
      ) {
        const staleBody = queueDeleteTracker.readAfterDelete({
          accountName: requestPath[0] ?? '',
          queueName,
        });
        if (staleBody !== null) {
          const normalizedHeaders = Object.fromEntries(
            Object.entries(upstreamResponse.headers).filter(([key]) => !hopByHopHeaders.has(key.toLowerCase()) && key.toLowerCase() !== 'x-ms-error-code'),
          );
          normalized = {
            normalized: true,
            ruleId: 'queue-peek-after-delete',
            response: {
              status: 200,
              headers: {
                ...normalizedHeaders,
                'content-type': 'application/xml',
                'content-length': String(Buffer.byteLength(staleBody)),
                'x-ms-version': upstreamResponse.headers['x-ms-version'] ?? req.headers['x-ms-version'] ?? '2023-11-03',
                'x-globalstack-normalized-from': 'azurite',
                'x-globalstack-normalization-rule': 'queue-peek-after-delete',
              },
              body: staleBody,
            },
          };
        }
      }
      if (normalized.normalized && logger) {
        logger({ service, ruleId: normalized.ruleId, method: req.method, path: targetUrl.pathname });
      }
      const outgoingBody = Buffer.from(normalized.response.body ?? '');
      res.writeHead(normalized.response.status, normalized.response.headers);
      res.end(outgoingBody);
    } catch (error) {
      res.writeHead(error.status === 413 ? 413 : 502, {
        'content-type': 'application/json',
        'x-globalstack-proxy-error': 'true',
      });
      res.end(JSON.stringify({ error: error.status === 413 ? 'Request body exceeds the local proxy limit.' : 'Storage backend request failed.' }));
    }
  });
}

export async function listenStorageProxy(options) {
  const server = createStorageProxyServer(options);
  await new Promise(resolve => server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve));
  return server;
}
