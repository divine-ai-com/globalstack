import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { azureDockerArguments } from './azure-session.mjs';

test('certificate sessions mount only an owner-private file at the CLI credential path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'gs-cli-session-'));
  try {
    const certificate = join(directory, 'test.pem');
    writeFileSync(certificate, 'fixture, not a credential', { mode: 0o600 });
    const args = azureDockerArguments(directory, ['account', 'show'], certificate);
    assert.ok(args.includes(`${certificate}:/credential/pilot-login.pem:ro`));
    assert.ok(!args.some(arg => arg.includes('fixture, not a credential')));
    chmodSync(certificate, 0o644);
    assert.throws(() => azureDockerArguments(directory, [], certificate), /owner-accessible/);
    assert.throws(() => azureDockerArguments(directory, [], 'relative.pem'), /absolute/);
    assert.throws(() => azureDockerArguments(directory, [], directory), /owner-accessible/);
    assert.ok(!azureDockerArguments(directory, ['account', 'show'], '').some(arg => arg.includes('/credential/')));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
