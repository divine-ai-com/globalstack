import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { httpExchange } from './http-exchange.mjs';

test('capture transport preserves virtual host, body and response metadata without following redirects', async t => {
  const calls = [];
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    calls.push({ host: req.headers.host, path: req.url, method: req.method, body });
    if (req.url === '/redirect') { res.writeHead(302, { location: '/other', 'set-cookie': 'synthetic=private' }); res.end(); return; }
    res.writeHead(200, { 'request-id': 'response-proof', 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const result = await httpExchange(`${origin}/query?a=1`, { method: 'POST', headers: { host: 'capture-search.search.windows.net' }, body: { search: 'query' } });
  assert.deepEqual(calls[0], { host: 'capture-search.search.windows.net', path: '/query?a=1', method: 'POST', body: '{"search":"query"}' });
  assert.equal(result.headers['request-id'], 'response-proof');
  const redirect = await httpExchange(`${origin}/redirect`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers['set-cookie'], undefined);
  assert.equal(calls.length, 2);
});
