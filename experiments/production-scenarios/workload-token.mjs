import assert from 'node:assert/strict';

function claims(token) {
  assert.equal(typeof token, 'string');
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'Expected a JWT access token');
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

export function tokenNeedsRefresh(token, now = Date.now) {
  return claims(token).exp - now() / 1000 < 5 * 60;
}

export function validateWorkloadToken(token, { tenantId, principalId, issuer, audiences }, now = Date.now) {
  const payload = claims(token);
  assert.equal(payload.tid, tenantId);
  assert.equal(payload.oid, principalId);
  assert.equal(payload.iss, issuer);
  assert.ok(audiences.includes(payload.aud), 'Unexpected workload token audience');
  assert.ok(payload.exp - now() / 1000 > 2 * 60, 'Workload token expires too soon for the next request');
  return payload;
}
