import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const providerArchive = 'registry.terraform.io/azure/azapi/terraform-provider-azapi_2.13.0_linux_amd64.zip';

export function verifyProviderArchive(bytes, lock) {
  const block = /provider "registry\.terraform\.io\/azure\/azapi"\s*\{([^}]+)\}/.exec(lock)?.[1];
  assert.ok(block && /version\s*=\s*"2\.13\.0"/.test(block), 'Expected the pinned AzAPI provider lock entry');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.ok([...block.matchAll(/"zh:([a-f0-9]{64})"/g)].some(match => match[1] === sha256),
    'Provider archive does not match a committed lockfile checksum');
  return { provider: 'registry.terraform.io/azure/azapi', version: '2.13.0', sha256 };
}

export async function verifyProviderMirror(directory, lockPath) {
  assert.ok(directory.startsWith('/') && !directory.includes(':'), 'Provider mirror must be an absolute mount-safe directory');
  return verifyProviderArchive(await readFile(resolve(directory, providerArchive)), await readFile(lockPath, 'utf8'));
}
