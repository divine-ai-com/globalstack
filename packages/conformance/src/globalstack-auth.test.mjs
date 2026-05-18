import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createArmServer, startArmServer } from '../../azure-control-plane/src/server.mjs';

async function close(server) {
  await new Promise(resolve => server.close(resolve));
}

test('daemon startup requires GLOBALSTACK_AUTH_TOKEN', async () => {
  const original = process.env.GLOBALSTACK_AUTH_TOKEN;
  delete process.env.GLOBALSTACK_AUTH_TOKEN;

  assert.throws(
    () => startArmServer({ port: 0, requireProductAuth: true }),
    /GLOBALSTACK_AUTH_TOKEN must be exported/,
  );

  if (original === undefined) {
    delete process.env.GLOBALSTACK_AUTH_TOKEN;
  } else {
    process.env.GLOBALSTACK_AUTH_TOKEN = original;
  }
});

test('daemon startup accepts a non-empty GLOBALSTACK_AUTH_TOKEN', async () => {
  const original = process.env.GLOBALSTACK_AUTH_TOKEN;
  process.env.GLOBALSTACK_AUTH_TOKEN = 'test-globalstack-token';

  const server = startArmServer({ port: 0, requireProductAuth: true });
  await new Promise(resolve => server.once('listening', resolve));
  assert.equal(server.listening, true);
  await close(server);

  if (original === undefined) {
    delete process.env.GLOBALSTACK_AUTH_TOKEN;
  } else {
    process.env.GLOBALSTACK_AUTH_TOKEN = original;
  }
});

test('in-process conformance server remains usable without product activation', async () => {
  const original = process.env.GLOBALSTACK_AUTH_TOKEN;
  delete process.env.GLOBALSTACK_AUTH_TOKEN;

  const server = createArmServer({ persist: false });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  assert.equal(server.listening, true);
  await close(server);

  if (original === undefined) {
    delete process.env.GLOBALSTACK_AUTH_TOKEN;
  } else {
    process.env.GLOBALSTACK_AUTH_TOKEN = original;
  }
});
