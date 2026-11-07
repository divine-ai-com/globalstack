import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
function headersFor(headers) {
  const excluded = new Set([...hopHeaders, ...String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !excluded.has(name.toLowerCase())));
}
function workerResponseHeaders(headers) {
  const result = Object.create(null);
  const excluded = new Set(String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim()));
  // Keep response names fixed so upstream-controlled names cannot become
  // properties on the public response. Custom application headers need review.
  for (const name of ['content-type', 'content-length', 'content-encoding', 'content-language', 'content-disposition',
    'cache-control', 'etag', 'last-modified', 'expires', 'vary', 'location', 'retry-after', 'www-authenticate',
    'set-cookie', 'date', 'allow', 'accept-ranges', 'content-range', 'x-ms-request-id', 'request-id', 'traceparent',
    'access-control-allow-origin', 'access-control-allow-credentials', 'access-control-allow-methods',
    'access-control-allow-headers', 'access-control-expose-headers', 'access-control-max-age',
    'content-security-policy', 'content-security-policy-report-only', 'strict-transport-security',
    'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy']) {
    if (!excluded.has(name) && Object.hasOwn(headers, name)) result[name] = headers[name];
  }
  return result;
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
    assert.ok(value.masterKeyFile === undefined || typeof value.masterKeyFile === 'string' && isAbsolute(value.masterKeyFile),
      'Native host master key files must use absolute paths');
    bindings.set(key, { origin: origin.origin, masterKeyFile: value.masterKeyFile });
  }
  return bindings;
}

// Bindings are trusted operator configuration. Request hosts and ARM bodies
// cannot select an upstream address. Redirects are returned, never followed.
export function forwardNativeFunction(req, res, origin, { timeoutMs = 120000, connectTimeoutMs = 3000, maxRequestBytes = 12 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    let settled = false, bytes = 0, connectTimer;
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
      settled = true; clearTimeout(timer); clearTimeout(connectTimer);
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
    request.once('socket', socket => {
      if (request.reusedSocket || target.protocol === 'http:' && !socket.connecting) return;
      // A removed container can leave a route that drops connection attempts.
      // Bound TCP/TLS establishment separately from valid long-running work.
      connectTimer = setTimeout(() => fail(502, 'NativeFunctionsWorkerUnavailable'), Math.min(connectTimeoutMs, timeoutMs));
      connectTimer.unref?.();
      socket.once(target.protocol === 'https:' ? 'secureConnect' : 'connect', () => clearTimeout(connectTimer));
    });
    request.on('error', () => { if (!settled) fail(502, 'NativeFunctionsWorkerUnavailable'); });
    request.on('response', upstream => {
      clearTimeout(connectTimer);
      if (settled) { upstream.destroy(); return; }
      const status = Number(upstream.statusCode);
      if (!Number.isInteger(status) || status < 200 || status > 599) return fail(502, 'NativeFunctionsWorkerInvalidResponse');
      res.writeHead(status, workerResponseHeaders(upstream.headers));
      upstream.on('error', () => fail(502, 'NativeFunctionsWorkerUnavailable'));
      upstream.once('aborted', () => fail(502, 'NativeFunctionsWorkerUnavailable'));
      upstream.pipe(res);
      res.once('finish', finish);
    });
    if (Number(req.headers['content-length'] ?? 0) > maxRequestBytes) return fail(413, 'RequestBodyTooLarge');
    req.pipe(request);
  });
}


export async function readNativeHostKeys(binding, { signal } = {}) {
  if (!binding?.masterKeyFile) return { status: 501, body: { error: { code: 'NativeFunctionsKeysNotConfigured',
    message: 'The native host management credential file is not configured.' } } };
  try {
    const file = await open(binding.masterKeyFile, 'r');
    let masterKey;
    try {
      const metadata = await file.stat();
      assert.ok(metadata.isFile() && metadata.size <= 4096 && (metadata.mode & 0o077) === 0);
      masterKey = (await file.readFile('utf8')).trim();
    } finally { await file.close(); }
    assert.match(masterKey, /^[A-Za-z0-9_+/=-]{16,256}$/);
    async function get(path) {
      const response = await fetch(`${binding.origin}${path}`, { headers: { 'x-functions-key': masterKey },
        redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000) });
      if (response.status !== 200) { await response.body?.cancel(); throw new Error('Native key lookup failed'); }
      const chunks = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length; assert.ok(size <= 65536); chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    const verifiedMaster = await get('/admin/host/systemkeys/_master');
    assert.equal(verifiedMaster.value, masterKey);
    const functionResult = await get('/admin/host/functionkeys');
    const systemResult = await get('/admin/host/systemkeys');
    const dictionary = result => {
      assert.ok(Array.isArray(result.keys));
      const entries = result.keys.map(item => {
        assert.ok(typeof item.name === 'string' && item.name.length > 0 && item.name.length <= 256);
        assert.ok(!['__proto__', 'constructor', 'prototype'].includes(item.name));
        assert.ok(typeof item.value === 'string' && item.value.length > 0 && item.value.length <= 256);
        return [item.name, item.value];
      });
      assert.equal(new Set(entries.map(([name]) => name)).size, entries.length);
      return Object.fromEntries(entries);
    };
    return { status: 200, body: { masterKey: verifiedMaster.value,
      functionKeys: dictionary(functionResult), systemKeys: dictionary(systemResult) } };
  } catch {
    // Never include credential paths, native response bodies or keys in errors.
    return { status: 502, body: { error: { code: 'NativeFunctionsKeysUnavailable',
      message: 'The native host key lookup failed. Check its availability and the private management credential.' } } };
  }
}

export async function deliverNativeEventGrid(binding, functionName, event, { signal } = {}) {
  const keys = await readNativeHostKeys(binding, { signal });
  if (keys.status !== 200) return { reason: keys.body.error.code };
  const key = keys.body.systemKeys.eventgrid_extension;
  if (!key) return { reason: 'NativeEventGridKeyUnavailable' };
  try {
    const url = new URL('/runtime/webhooks/eventgrid', binding.origin);
    url.searchParams.set('functionName', functionName);
    const response = await fetch(url, { method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', 'aeg-event-type': 'Notification', 'x-functions-key': key },
      body: JSON.stringify([event]), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
    await response.body?.cancel();
    return response.status >= 200 && response.status < 300 ? { status: response.status }
      : { status: response.status, reason: `NativeEventGridHttp${response.status}` };
  } catch { return { reason: 'NativeEventGridUnavailable' }; }
}
