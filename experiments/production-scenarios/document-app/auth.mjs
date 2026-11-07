import assert from 'node:assert/strict';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export class AccessError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}

export function tokenVerifier({ tenant, audience, clients }, keys) {
  assert.match(tenant, uuid); assert.match(audience, uuid);
  assert.ok(Array.isArray(clients) && clients.length > 0 && clients.every(value => uuid.test(value)));
  const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`;
  const keySet = keys ?? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`), {
    timeoutDuration: 5000, cooldownDuration: 30000, cacheMaxAge: 10 * 60000,
  });
  return async (authorization, role) => {
    const match = typeof authorization === 'string' && /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization);
    if (!match || authorization.length > 16384) throw new AccessError(401, 'invalid_token');
    let payload;
    try {
      ({ payload } = await jwtVerify(match[1], keySet, { algorithms: ['RS256'], issuer, audience,
        requiredClaims: ['exp', 'nbf', 'iat', 'tid', 'oid', 'azp', 'ver'], clockTolerance: 5 }));
    } catch { throw new AccessError(401, 'invalid_token'); }
    if (payload.ver !== '2.0' || payload.tid !== tenant || !uuid.test(payload.oid)) throw new AccessError(401, 'invalid_token');
    if (!clients.includes(payload.azp) || !Array.isArray(payload.roles) || !payload.roles.includes(role)) throw new AccessError(403, 'permission_denied');
    // ID tokens are not API authorization. Delegated callers need the API scope;
    // app-only callers need the explicit application token claim and app role.
    if (typeof payload.scp === 'string' ? !payload.scp.split(' ').includes('Documents.Access') : payload.idtyp !== 'app') throw new AccessError(403, 'permission_denied');
    const groups = payload.groups ?? [];
    if (payload._claim_names?.groups || payload.hasgroups || !Array.isArray(groups) || groups.length > 200 || !groups.every(value => uuid.test(value))) throw new AccessError(403, 'group_membership_unresolved');
    return Object.freeze({ tenant: payload.tid, subject: payload.oid.toLowerCase(), client: payload.azp,
      groups: Object.freeze([...new Set(groups.map(value => value.toLowerCase()))]), roles: Object.freeze([...payload.roles]) });
  };
}

export function configuredTokenVerifier() {
  return tokenVerifier({ tenant: process.env.ENTRA_TENANT_ID, audience: process.env.API_AUDIENCE,
    clients: process.env.API_ALLOWED_CLIENTS?.split(',') });
}
