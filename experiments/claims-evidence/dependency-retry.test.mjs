import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retryableDependencyFailure } from './dependency-retry.mjs';

test('provider initialization retries transport outages only', () => {
  const outage = 'Error: Failed to install provider\nfailed to retrieve cryptographic signature for provider: 504 Gateway Timeout returned from github.com';
  assert.equal(retryableDependencyFailure('init', 1, outage), true);
  for (const label of ['apply-connected', 'destroy', 'validate']) assert.equal(retryableDependencyFailure(label, 1, outage), false);
  for (const message of ['checksum mismatch 504', 'invalid signature 504', 'signature verification failed 504', 'permission denied 504', 'invalid configuration']) {
    assert.equal(retryableDependencyFailure('init', 1, 'Error: Failed to install provider\n' + message), false);
  }
  assert.equal(retryableDependencyFailure('init', 0, outage), false);
  assert.equal(retryableDependencyFailure('init', null, outage), false);
});
