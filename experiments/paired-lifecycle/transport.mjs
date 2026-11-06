import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import { gunzipSync, inflateSync } from 'node:zlib';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const observedHeaders = new Set(['content-type', 'location', 'azure-asyncoperation', 'retry-after', 'etag', 'x-ms-request-id', 'x-ms-correlation-request-id', 'x-ms-ratelimit-remaining-subscription-writes']);

export function sanitize(value, replacements = []) {
  if (Array.isArray(value)) return value.map(item => sanitize(item, replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    /^(authorization|access_token|accessToken|refresh_token|client_secret|password)$/i.test(key) ? '<redacted>' : sanitize(item, replacements)]));
  if (typeof value !== 'string') return value;
  const replaced = replacements.filter(([from]) => from).sort((a, b) => b[0].length - a[0].length).reduce((text, [from, to]) => text.replaceAll(from, to), value);
  return replaced
    .replace(/([?&](?:sig|signature|s|c|h|t|token|access_token)=)[^&#\s"']+/gi, '$1<redacted>')
    .replace(/(\/operationresults\/)[^/?\s"']+/gi, '$1<operation>')
    .replace(/\/subscriptions\/[a-f0-9-]{8,}(?:\.{3}[a-f0-9-]+)?/gi, '/subscriptions/<subscription>');
}

export function permitted(method, path, groupPath, pollPaths = new Set()) {
  const url = new URL(path, 'https://management.azure.com');
  if (url.origin !== 'https://management.azure.com') return false;
  const pathname = url.pathname.toLowerCase();
  if (pathname === groupPath.toLowerCase()) return ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'].includes(method);
  // Only follow operation URLs actually returned for an allowed request in this run.
  return method === 'GET' && pollPaths.has(url.pathname + url.search);
}

function parseBody(bytes, headers) {
  try {
    if (headers['content-encoding'] === 'gzip') bytes = gunzipSync(bytes);
    if (headers['content-encoding'] === 'deflate') bytes = inflateSync(bytes);
    const text = bytes.toString();
    return text ? JSON.parse(text) : null;
  } catch { return { unparsedBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }; }
}

export async function startObserver({ targetOrigin, groupPath, cert, key, replacements, phase, record, additionalPolicy = () => false }) {
  const origin = new URL(targetOrigin);
  const azure = targetOrigin === 'https://management.azure.com';
  assert.ok(azure || (origin.protocol === 'http:' && origin.hostname === '127.0.0.1' && origin.port && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash), 'Observer target must be Azure ARM or the owned loopback listener');
  const sockets = new Set();
  const pollPaths = new Set();
  const observer = http.createServer(async (req, res) => {
    const event = { phase: phase(), method: req.method, path: sanitize(req.url, replacements), startedAt: new Date().toISOString() };
    try {
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Pilot request size exceeded'); chunks.push(chunk); }
      const body = Buffer.concat(chunks);
      const requested = new URL(req.url, 'https://management.azure.com');
      if (requested.origin !== 'https://management.azure.com' || (!permitted(req.method, req.url, groupPath, pollPaths)
        && !additionalPolicy(req.method, requested, parseBody(body, req.headers)))) {
        event.blocked = true; event.status = 403; record(event);
        res.writeHead(403, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ObserverScopeDenied' } })); return;
      }
      event.request = { headers: Object.fromEntries(Object.entries(req.headers).filter(([name]) => ['content-type', 'if-match', 'if-none-match', 'user-agent'].includes(name))), body: sanitize(parseBody(body, req.headers), replacements), authenticated: !!req.headers.authorization };
      const headers = { ...req.headers, host: origin.host };
      delete headers['proxy-authorization']; delete headers['proxy-connection'];
      const response = await new Promise((resolve, reject) => {
        // The request controls only a scoped path. Neither hostname comes from client input.
        const options = { method: req.method, path: requested.pathname + requested.search, headers };
        const outgoing = azure
          ? https.request({ ...options, hostname: 'management.azure.com', port: 443 }, resolve)
          : http.request({ ...options, hostname: '127.0.0.1', port: Number(origin.port) }, resolve);
        outgoing.setTimeout(45000, () => outgoing.destroy(new Error('Observer upstream timeout')));
        outgoing.on('error', reject); outgoing.end(body);
      });
      const received = []; let bytes = 0;
      for await (const chunk of response) { bytes += chunk.length; if (bytes > 1048576) { response.destroy(); throw new Error('Pilot response size exceeded'); } received.push(chunk); }
      const raw = Buffer.concat(received);
      for (const header of ['location', 'azure-asyncoperation']) {
        if (response.statusCode !== 202 || !response.headers[header]) continue;
        const poll = new URL(response.headers[header], 'https://management.azure.com');
        const subscriptionPrefix = groupPath.split('/').slice(0, 3).join('/').toLowerCase() + '/';
        if (poll.origin === 'https://management.azure.com' && !poll.username && !poll.password
          && poll.pathname.toLowerCase().startsWith(subscriptionPrefix)
          && /\/(operations|operationresults|operationstatuses)\//i.test(poll.pathname)) pollPaths.add(poll.pathname + poll.search);
      }
      event.status = response.statusCode;
      event.response = { headers: sanitize(Object.fromEntries(Object.entries(response.headers).filter(([name]) => observedHeaders.has(name))), replacements), body: sanitize(parseBody(raw, response.headers), replacements) };
      event.completedAt = new Date().toISOString(); record(event);
      res.writeHead(response.statusCode, response.headers).end(raw);
    } catch (error) {
      event.transportError = sanitize(error.message, replacements); record(event);
      res.writeHead(502, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { code: 'ObserverFailure' } }));
    }
  });
  const encrypted = tls.createServer({ cert, key }, socket => observer.emit('connection', socket));
  encrypted.on('tlsClientError', () => {});
  const proxy = http.createServer((_req, res) => res.writeHead(405).end());
  proxy.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  proxy.on('connect', (req, socket, head) => {
    if (req.url !== 'management.azure.com:443') { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) socket.unshift(head);
    encrypted.emit('connection', socket);
  });
  await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${proxy.address().port}`, close: async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => proxy.close(resolve));
  } };
}
