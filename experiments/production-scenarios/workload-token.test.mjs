import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tokenNeedsRefresh, validateWorkloadToken } from './workload-token.mjs';

const now = () => 1_800_000_000_000;
const expected = { tenantId: 'tenant', principalId: 'principal', issuer: 'issuer', audiences: ['audience'] };
function token(minutes) {
  const payload = { tid: 'tenant', oid: 'principal', iss: 'issuer', aud: 'audience',
    exp: now() / 1000 + minutes * 60 };
  return `e30.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('cached token with nine minutes left remains usable after a long deployment', () => {
  assert.equal(tokenNeedsRefresh(token(9), now), false);
  assert.equal(validateWorkloadToken(token(9), expected, now).aud, 'audience');
});

test('workload token is reacquired before five minutes remain and rejects near expiry', () => {
  assert.equal(tokenNeedsRefresh(token(4), now), true);
  assert.equal(validateWorkloadToken(token(4), expected, now).aud, 'audience');
  assert.throws(() => validateWorkloadToken(token(1), expected, now), /expires too soon/);
  assert.throws(() => validateWorkloadToken(token(9), { ...expected, audiences: ['other'] }, now), /audience/);
});
