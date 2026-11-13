import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { open, mkdir, statfs, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const runDir = process.env.PAIRED_RUN_DIR;
assert.ok(runDir?.startsWith('/'), 'PAIRED_RUN_DIR must be an absolute private directory');
await mkdir(runDir, { recursive: true, mode: 0o700 });
const disk = await statfs(runDir);
assert.ok(disk.bavail * disk.bsize >= 40 * 1024 ** 3, 'At least 40 GiB free is required');
const log = await open(resolve(runDir, 'launcher.log'), 'wx', 0o600);
try {
  const child = spawn(process.execPath, [resolve('experiments/production-scenarios/worker-scanner-paired.mjs')], {
    cwd: process.cwd(), env: process.env, detached: true, stdio: ['ignore', log.fd, log.fd],
  });
  await new Promise((done, fail) => { child.once('spawn', done); child.once('error', fail); });
  child.unref();
  await writeFile(resolve(runDir, 'launch.json'), JSON.stringify({ pid: child.pid, launchedAt: new Date().toISOString(),
    runner: 'worker-scanner-paired.mjs' }, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(JSON.stringify({ pid: child.pid, runDir }));
} finally {
  await log.close();
}
