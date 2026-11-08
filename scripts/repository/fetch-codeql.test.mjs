import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

test('CodeQL archive integrity failures do not publish or retry unverified bytes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'gs-codeql-check-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const count = join(directory, 'calls'), output = join(directory, 'bundle.tar.zst');
  await writeFile(join(directory, 'gh'), '#!/bin/sh\nprintf x >> "$FETCH_TEST_CALLS"\nprintf invalid-archive\n', { mode: 0o700 });
  assert.throws(() => execFileSync('bash', [resolve('scripts/repository/fetch-codeql.sh'), 'javascript', output], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, FETCH_TEST_CALLS: count }, stdio: 'pipe',
  }), error => error.status === 1);
  assert.equal(await readFile(count, 'utf8'), 'x');
  await assert.rejects(access(output)); await assert.rejects(access(`${output}.partial`));
});
