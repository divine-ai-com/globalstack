import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';

test('public startup works without activation and retains request authentication', { timeout: 15000 }, async () => {
  const env = { ...process.env, GLOBALSTACK_ARM_PORT: '0', GLOBALSTACK_ARM_HOST: '127.0.0.1' };
  delete env.GLOBALSTACK_AUTH_TOKEN;
  const child = spawn(process.execPath, [new URL('../../../scripts/runtime/start-local.mjs', import.meta.url).pathname], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit');
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Startup timed out: ${stderr}`)), 10000);
      let output = '';
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      exit.then(() => { clearTimeout(timer); reject(new Error(`Startup exited: ${stderr}`)); });
    });
    assert.equal((await fetch(`${endpoint}/_globalstack/health`)).status, 200);
    const denied = await fetch(`${endpoint}/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups?api-version=2021-04-01`);
    assert.equal(denied.status, 401);
  } finally {
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
    await exit;
    clearTimeout(timeout);
  }
});
