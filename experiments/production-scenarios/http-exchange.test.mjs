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
  await httpExchange(`${origin}/blob`, { method: 'PUT', body: Buffer.from('{"document_id":"doc-1"}'),
    headers: { 'content-type': 'application/json' } });
  assert.equal(calls[1].body, '{"document_id":"doc-1"}');
  const redirect = await httpExchange(`${origin}/redirect`);
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers['set-cookie'], undefined);
  assert.equal(calls.length, 3);
});

test('capture calls use fresh sockets across blocking deployment commands', async t => {
  const sockets = new Set();
  const server = createServer((req, res) => { sockets.add(req.socket); res.end('{"ok":true}'); });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  t.after(() => new Promise(done => { server.closeAllConnections(); server.close(done); }));
  const url = `http://127.0.0.1:${server.address().port}/capture`;
  assert.equal((await httpExchange(url)).status, 200);
  assert.equal((await httpExchange(url, { method: 'PUT', body: { revision: 'next' } })).status, 200);
  assert.equal(sockets.size, 2, 'A pooled socket may expire while a native CLI command blocks the event loop');
});
