import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = 'packages/conformance/src';
const files = (await readdir(new URL(`../../${directory}/`, import.meta.url)))
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => `${directory}/${name}`);
const child = spawn(process.execPath, ['--test', '--test-concurrency=2', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, GLOBALSTACK_TEST_DOCKER: process.argv.includes('--docker') ? '1' : '0' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
