import { createLocalJWKSet, jwtVerify } from 'jose';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const lower = value => String(value ?? '').toLowerCase();

// Trust is operator configuration. A token cannot supply its own key location.
export function createWorkloadTokenVerifier({ trusts = [], audiences }) {
  if (!Array.isArray(audiences) || !audiences.length || !audiences.every(value => typeof value === 'string' && value)) {
    throw new Error('Explicit token audiences are required.');
  }
  if (!Array.isArray(trusts)) throw new Error('Workload token trusts must be an array.');
  const configured = trusts.map(trust => {
    if (!trust || typeof trust.issuer !== 'string' || !uuid.test(trust.tenantId)
      || !Array.isArray(trust.subscriptionIds) || !trust.subscriptionIds.length || !trust.subscriptionIds.every(id => typeof id === 'string' && uuid.test(id))) {
      throw new Error('Each workload token trust requires an issuer, tenant UUID and subscription UUIDs.');
    }
    const issuer = new URL(trust.issuer);
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error('Workload token issuers must be credential-free HTTPS URLs.');
    const keys = trust.jwks?.keys;
    if (!Array.isArray(keys) || !keys.length || keys.length > 16 || keys.some(key => !key || key.kty !== 'RSA'
      || typeof key.kid !== 'string' || !key.kid || typeof key.n !== 'string' || Buffer.from(key.n, 'base64url').length < 256
      || typeof key.e !== 'string' || key.alg !== 'RS256' || key.use !== 'sig'
      || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(field => field in key)
      || key.key_ops !== undefined && (!Array.isArray(key.key_ops) || key.key_ops.length !== 1 || key.key_ops[0] !== 'verify'))
      || new Set(keys.map(key => key.kid)).size !== keys.length) throw new Error('Workload token trusts require unique public RS256 signing keys of at least 2048 bits.');
    return { issuer: trust.issuer, tenantId: lower(trust.tenantId), subscriptions: new Set(trust.subscriptionIds.map(lower)),
      keys: createLocalJWKSet({ keys: structuredClone(keys) }) };
  });

  return async ({ authorization, subscription, tenantId }) => {
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(String(authorization ?? ''));
    if (!match || match[1].length > 16384) return null;
    let principal;
    for (const trust of configured) {
      if (!trust.subscriptions.has(lower(subscription)) || tenantId !== undefined && lower(tenantId) !== trust.tenantId) continue;
      try {
        const { payload, protectedHeader } = await jwtVerify(match[1], trust.keys, {
          algorithms: ['RS256'], issuer: trust.issuer, audience: audiences,
          requiredClaims: ['exp', 'nbf', 'iat', 'oid', 'tid'], clockTolerance: 0,
        });
        if (protectedHeader.jku || protectedHeader.jwk || protectedHeader.x5u || typeof protectedHeader.kid !== 'string'
          || !uuid.test(payload.oid) || lower(payload.tid) !== trust.tenantId
          || ![payload.exp, payload.nbf, payload.iat].every(Number.isSafeInteger)
          || payload.iat > Math.floor(Date.now() / 1000) || payload.exp <= payload.iat || payload.exp <= payload.nbf) continue;
        principal = lower(payload.oid);
        break;
      } catch { /* Invalid or untrusted tokens never reach role evaluation. */ }
    }
    return principal ?? null;
  };
}
