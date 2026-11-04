import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeCapture, sanitizeText } from '../capture/capture-redaction.mjs';

test('capture redaction removes structured credentials and identifiers recursively', () => {
  const input = { headers: { Cookie: 'private', Authorization: 'Bearer sample' }, connectionString: 'private', properties: [{ clientSecret: 'private', tenantId: 'private', location: 'eastus' }] };
  const result = sanitizeCapture(input);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(result.properties[0].location, 'eastus');
  assert.equal(input.connectionString, 'private');
});
test('capture URLs and nested messages remove credential-bearing fragments', () => {
  const input = 'https://someone:password@example.test/subscriptions/private-account/item?sig=private-signature&api-version=2024-01-01';
  const output = sanitizeText(input);
  assert.equal(output.includes('password'), false);
  assert.equal(output.includes('private-'), false);
  assert.match(output, /api-version=2024-01-01/);
  assert.equal(sanitizeText('Bearer abc.def user@example.test'), 'Bearer <redacted> <email>');
});

test('Azure capture fixtures do not expose subscription or tenant UUIDs', async () => {
  async function check(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await check(path);
      else if (entry.name.endsWith('.json')) {
        const text = await readFile(path, 'utf8');
        const values = [
          ...[...text.matchAll(/\/(?:subscriptions|tenants)\/([0-9a-fA-F-]{36})/g)].map(match => match[1]),
          ...[...text.matchAll(/"(?:subscriptionId|tenantId)"\s*:\s*"([0-9a-fA-F-]{36})"/g)].map(match => match[1]),
        ];
        for (const value of values) assert.ok(['00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111'].includes(value), `Review account identifier in ${path}`);
      }
    }
  }
  await check(new URL('../../fixtures', import.meta.url).pathname);
});
