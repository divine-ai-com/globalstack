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
