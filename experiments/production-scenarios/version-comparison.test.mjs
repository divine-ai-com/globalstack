import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const exec = promisify(execFile);
test('paired version report is reproducible and rejects wrong retained bytes, missing operations and malformed listings', async t => {
  const base = new URL('./evidence/versions-after-2d66061/', import.meta.url);
  const index = JSON.parse(await readFile(new URL('index.json', base)));
  for (const [name, metadata] of Object.entries(index.files)) {
    const bytes = await readFile(new URL(name, base));
    assert.equal(bytes.length, metadata.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  }
  const original = JSON.parse(await readFile(new URL('result.json', base)));
  const expected = JSON.parse(await readFile(new URL('comparison.json', base)));
  const dir = await mkdtemp(join(tmpdir(), 'gs-version-comparison-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  async function run(capture) {
    await writeFile(join(dir, 'input.json'), JSON.stringify(capture));
    await rm(join(dir, 'output.json'), { force: true });
    const completed = await exec('python3', [fileURLToPath(new URL('./compare-blob-versions.py', import.meta.url)), join(dir, 'input.json'), join(dir, 'output.json')])
      .then(() => true, () => false);
    const result = await readFile(join(dir, 'output.json'), 'utf8').then(JSON.parse, () => null);
    return { completed, result };
  }
  const good = await run(original);
  assert.equal(good.completed, true);
  assert.deepEqual(good.result, expected);
  assert.equal(good.result.matched, 22);
  assert.equal(good.result.errorHeaderDifferences, 1);
  for (const mutate of [
    report => { report.exchanges.find(e => e.target === 'local' && e.phase === 'versions-read-old').body = 'wrong revision'; },
    report => { report.exchanges = report.exchanges.filter(e => !(e.target === 'local' && e.phase === 'versions-delete-old')); },
    report => { report.exchanges.find(e => e.target === 'local' && e.phase === 'versions-list-after-delete').body = '<NotAListing />'; },
  ]) {
    const changed = structuredClone(original); mutate(changed);
    assert.equal((await run(changed)).completed, false);
  }
});
