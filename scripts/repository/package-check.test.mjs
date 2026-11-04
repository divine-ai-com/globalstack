import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { checkSelfImports } from '../../packages/workspace-utils/src/package-check.mjs';

test('rejects direct self-import entry points', async () => {
  const root = await mkdtemp(join(tmpdir(), 'globalstack-import-check-'));
  try {
    const file = join(root, 'entry.mjs');
    await writeFile(file, 'import "./entry.mjs";\n');
    assert.equal((await checkSelfImports(file)).length, 1);
    await writeFile(file, 'import "./helper.mjs";\n');
    assert.deepEqual(await checkSelfImports(file), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('build checks syntax after the first module', async () => {
  const root = await mkdtemp(join(tmpdir(), 'globalstack-syntax-check-'));
  try {
    await mkdir(join(root, 'src'));
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'syntax-regression', type: 'module', files: ['src'] }));
    await writeFile(join(root, 'src/a.mjs'), 'export const valid = true;\n');
    await writeFile(join(root, 'src/b.mjs'), 'export const invalid = ;\n');
    const checker = new URL('../../packages/workspace-utils/src/package-check.mjs', import.meta.url).pathname;
    await assert.rejects(promisify(execFile)(process.execPath, [checker, 'build'], { cwd: root }), error => {
      assert.match(error.stderr, /SyntaxError/);
      assert.match(error.stderr, /b\.mjs/);
      return true;
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
