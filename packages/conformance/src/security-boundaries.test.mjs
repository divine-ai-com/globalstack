import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request } from 'node:http';
import { Readable } from 'node:stream';
import test from 'node:test';
import { parse } from 'yaml';
import { createArmServer } from '../../azure-control-plane/src/server.mjs';
import { maxArmBodyBytes, readBody } from '../../azure-control-plane/src/server-support.mjs';
import { renderOfficialEmulatorCompose } from '../../azure-data-plane/src/official-emulator-compose.mjs';

function bodyStream(chunks, headers = {}) {
  const req = Readable.from(chunks);
  req.headers = headers;
  return req;
}
test('ARM bodies enforce the limit for declared and chunked requests', async () => {
  await assert.rejects(readBody(bodyStream([], { 'content-length': maxArmBodyBytes + 1 })), { code: 'GLOBALSTACK_BODY_TOO_LARGE' });
  await assert.rejects(readBody(bodyStream([Buffer.alloc(maxArmBodyBytes), Buffer.from('x')])), { code: 'GLOBALSTACK_BODY_TOO_LARGE' });
  const req = bodyStream([Buffer.from('{"ok":'), Buffer.from('true}')]);
  assert.deepEqual(await readBody(req), { ok: true });
  assert.deepEqual(await readBody(req), { ok: true });
});
test('ARM returns 413 and malformed paths return 400 without crashing', async t => {
  const server = createArmServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const port = server.address().port;
  const result = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/common/oauth2/token', method: 'POST', headers: { 'content-length': maxArmBodyBytes + 1 } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(result, 413);
  const bad = await fetch(`http://127.0.0.1:${port}/subscriptions/%ZZ/resourceGroups`, { headers: { authorization: 'Bearer globalstack-local-token' } });
  assert.equal(bad.status, 400);
  assert.equal((await fetch(`http://127.0.0.1:${port}/_globalstack/health`)).status, 200);
});
test('generated emulator ports are published only on loopback', () => {
  const compose = parse(renderOfficialEmulatorCompose());
  for (const service of Object.values(compose.services)) {
    for (const port of service.ports ?? []) assert.match(port, /^127\.0\.0\.1:/);
  }
});
