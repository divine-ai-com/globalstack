import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const binary = resolve(process.argv[2]);
const config = resolve(repo, '.gitleaks.toml');
const fixture = 'docs/research/globalstack/claims/evidence/public-1.json';
const report = JSON.parse(await readFile(resolve(repo, fixture)));
const known = report.episodes[0].ledger.body.RowKey;
const canary = randomBytes(32).toString('hex');
const cases = [
  [fixture, JSON.stringify({ RowKey: known }), 0],
  [fixture, JSON.stringify({ RowKey: canary }), 1],
  ['other.json', JSON.stringify({ RowKey: known }), 1],
  [fixture, JSON.stringify({ api_key: known }), 1],
  ['experiments/claims-evidence/run.mjs', 'eventKey = topicKeys.body.key1;', 0],
  ['experiments/claims-evidence/run.mjs', `eventKey = '${canary}';`, 1],
];
for (const [path, contents, expected] of cases) {
  const directory = await mkdtemp(join(tmpdir(), 'research-secrets-'));
  try {
    const file = resolve(directory, path);
    await mkdir(dirname(file), { recursive: true }); await writeFile(file, contents);
    const result = spawnSync(binary, ['dir', '.', '--config', config, '--redact=100', '--no-banner'], {
      cwd: directory, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, expected, `Secret-scan boundary failed for ${path}: ${result.stderr}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
console.log('Six secret-scan boundaries verified: known fixtures pass; new values, fields and paths remain detected.');
