import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const hopHeaders = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

export function endToEndHeaders(headers) {
  const removed = new Set([...hopHeaders, ...String(headers.connection ?? '').toLowerCase().split(',').map(value => value.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !removed.has(name.toLowerCase())));
}

export function backendTarget(serviceUrl, apiPath, incomingUrl) {
  const target = new URL(serviceUrl);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || target.hash) {
    throw new Error('Unsupported backend URL');
  }
  const prefix = apiPath ? `/${apiPath}` : '';
  // Append the operation path without allowing URL resolution to replace the
  // configured backend origin or interpret a client path as another host.
  const suffix = incomingUrl.pathname.slice(prefix.length);
  target.pathname = target.pathname.replace(/\/$/, '') + (suffix.startsWith('/') ? suffix : `/${suffix}`);
  for (const [key, value] of incomingUrl.searchParams) target.searchParams.append(key, value);
  return target;
}

function proxyError(res, status, code, message) {
  if (res.destroyed) return;
  if (res.headersSent) { res.destroy(); return; }
  const body = JSON.stringify({ error: { code, message } });
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), connection: 'close' });
  res.end(body);
}

// Backend URLs are operator-controlled configuration on a trusted development
// host. Redirects are returned unchanged; this is not an outbound-network sandbox.
export function forwardBackend(req, res, target, { timeoutMs = 30000, maxRequestBytes = 8 * 1024 * 1024, maxResponseBytes = 32 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    let upstream;
    let backendResponse;
    let timer;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
      resolve();
    };
    const abort = () => { upstream?.destroy(); backendResponse?.destroy(); finish(); };
    const fail = (status, code, message) => {
      if (finished) return;
      proxyError(res, status, code, message);
      upstream?.destroy(); backendResponse?.destroy();
      req.unpipe(upstream);
      req.resume();
      finish();
    };
    req.once('aborted', abort);
    res.once('close', abort);
    const headers = endToEndHeaders(req.headers);
    headers.host = target.host;
    // These routing hints belong to the local ingress, not the backend contract.
    delete headers['x-forwarded-host'];
    delete headers['x-globalstack-edge-host'];
    const length = Number(req.headers['content-length']);
    if (Number.isFinite(length) && length > maxRequestBytes) {
      fail(413, 'RequestBodyTooLarge', 'The gateway request exceeds the local size limit.');
      return;
    }
    timer = setTimeout(() => fail(504, 'BackendTimeout', 'The configured backend did not finish within the local timeout.'), timeoutMs);
    const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
    upstream = request(target, { method: req.method, headers }, response => {
      if (finished) { response.destroy(); return; }
      backendResponse = response;
      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
        fail(502, 'BackendResponseTooLarge', 'The backend response exceeds the local size limit.');
        return;
      }
      res.writeHead(response.statusCode ?? 502, endToEndHeaders(response.headers));
      let responseBytes = 0;
      response.on('data', chunk => {
        responseBytes += chunk.length;
        if (responseBytes > maxResponseBytes) fail(502, 'BackendResponseTooLarge', 'The backend response exceeds the local size limit.');
      });
      response.once('error', () => fail(502, 'BackendConnectionFailure', 'The configured backend response was interrupted.'));
      response.once('end', finish);
      response.pipe(res);
    });
    upstream.once('error', () => fail(502, 'BackendConnectionFailure', 'The configured backend could not be reached.'));
    let requestBytes = 0;
    req.on('data', chunk => {
      requestBytes += chunk.length;
      if (requestBytes > maxRequestBytes) fail(413, 'RequestBodyTooLarge', 'The gateway request exceeds the local size limit.');
    });
    req.once('error', () => fail(400, 'InvalidRequest', 'The gateway request was interrupted.'));
    req.pipe(upstream);
  });
}
