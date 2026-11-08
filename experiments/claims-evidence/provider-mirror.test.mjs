import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { verifyProviderArchive } from './provider-mirror.mjs';

test('mirror integrity requires the pinned provider checksum from its own lock entry', () => {
  const bytes = Buffer.from('fixture archive');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const lock = `provider "registry.terraform.io/azure/azapi" { version = "2.13.0" hashes = ["zh:${hash}"] }`;
  assert.equal(verifyProviderArchive(bytes, lock).sha256, hash);
  assert.throws(() => verifyProviderArchive(Buffer.from('changed'), lock), /checksum/);
  assert.throws(() => verifyProviderArchive(bytes, lock.replace('2.13.0', '2.14.0')), /pinned/);
  assert.throws(() => verifyProviderArchive(bytes, lock.replace('/azure/azapi', '/other/azapi')), /pinned/);
  assert.throws(() => verifyProviderArchive(bytes, lock.replace(hash, '0'.repeat(64)) + ` provider "unrelated" { hashes = ["zh:${hash}"] }`), /checksum/);
});
