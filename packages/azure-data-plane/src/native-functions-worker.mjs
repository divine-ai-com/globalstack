import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
function headersFor(headers) {
  const excluded = new Set([...hopHeaders, ...String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}
function localAddress(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  if (isIP(hostname) !== 4) return false;
  const [a, b] = hostname.split('.').map(Number);
  return a === 127 || a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31;
}

export function nativeWorkerBindings(values = []) {
  assert.ok(Array.isArray(values), 'Functions worker bindings must be an array');
  const bindings = new Map();
  for (const value of values) {
    assert.ok(value && typeof value === 'object' && typeof value.appResourceId === 'string', 'A worker needs an ARM site resource ID');
    assert.match(value.appResourceId, /^\/subscriptions\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/resourceGroups\/[^/]+\/providers\/Microsoft\.Web\/sites\/[^/]+$/i);
    const origin = new URL(value.origin);
    assert.ok(['http:', 'https:'].includes(origin.protocol) && localAddress(origin.hostname)
      && origin.pathname === '/' && !origin.username && !origin.password && !origin.search && !origin.hash,
    'Functions workers must use a credential-free loopback or private IP origin');
    const key = value.appResourceId.toLowerCase();
    assert.ok(!bindings.has(key), 'Duplicate Functions worker binding');
    bindings.set(key, origin.origin);
  }
  return bindings;
}

// Bindings are trusted operator configuration. Request hosts and ARM bodies
// cannot select an upstream address. Redirects are returned, never followed.
export function forwardNativeFunction(req, res, origin, { timeoutMs = 120000, maxRequestBytes = 12 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    let settled = false, bytes = 0;
    const target = new URL(origin);
    const headers = headersFor(req.headers);
    // The application hostname keeps host-generated Durable URLs on the facade.
    headers.host = req.headers.host ?? target.host;
    delete headers['x-forwarded-host'];
    delete headers['x-forwarded-proto'];
    delete headers['x-forwarded-for'];
    const request = (target.protocol === 'https:' ? httpsRequest : httpRequest)({
      protocol: target.protocol, hostname: target.hostname.replace(/^\[|\]$/g, ''), port: target.port,
      method: req.method, path: req.url, headers,
    });
    function finish() {
      if (settled) return;
      settled = true; clearTimeout(timer);
      req.off('aborted', abort); req.off('data', count); res.off('close', disconnected);
      resolve();
    }
    function fail(status, code) {
      req.unpipe(request); request.destroy();
      if (!res.headersSent) {
        const payload = JSON.stringify({ error: { code, message: 'The configured native Functions worker could not complete the request.' } });
        res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), connection: 'close' });
        res.end(payload);
      } else res.destroy();
      finish();
    }
    function abort() { request.destroy(); finish(); }
    function disconnected() { if (!res.writableFinished) request.destroy(); finish(); }
    function count(chunk) { bytes += chunk.length; if (bytes > maxRequestBytes) fail(413, 'RequestBodyTooLarge'); }
    const timer = setTimeout(() => fail(504, 'NativeFunctionsWorkerTimeout'), timeoutMs);
    timer.unref?.();
    req.once('aborted', abort); req.on('data', count); res.once('close', disconnected);
    request.on('error', () => { if (!settled) fail(502, 'NativeFunctionsWorkerUnavailable'); });
    request.on('response', upstream => {
      if (settled) { upstream.destroy(); return; }
      res.writeHead(upstream.statusCode, headersFor(upstream.headers));
      upstream.on('error', () => fail(502, 'NativeFunctionsWorkerUnavailable'));
      upstream.once('aborted', () => fail(502, 'NativeFunctionsWorkerUnavailable'));
      upstream.pipe(res);
      res.once('finish', finish);
    });
    if (Number(req.headers['content-length'] ?? 0) > maxRequestBytes) return fail(413, 'RequestBodyTooLarge');
    req.pipe(request);
  });
}
