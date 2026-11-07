import { createLocalJWKSet, jwtVerify } from 'jose';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const lower = value => String(value ?? '').toLowerCase();
export const blobDataRoles = Object.freeze({
  reader: '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1',
  contributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe',
  owner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b',
});
const denied = () => ({ ok: false, status: 403, code: 'AuthorizationPermissionMismatch', message: 'This request is not authorized to perform this operation using this permission.' });
const invalid = () => ({ ok: false, status: 401, code: 'InvalidAuthenticationInfo', message: 'The authentication information is not valid.' });

// Only operator-pinned public keys are trusted. Token headers cannot select a
// remote key server, and the emulator never needs the issuer's signing key.
export function storageTokenAuthorizer({ store, trusts = [] } = {}) {
  if (!Array.isArray(trusts)) throw new Error('Storage token trusts must be an array.');
  const configured = trusts.map(trust => {
    if (!trust || typeof trust.issuer !== 'string' || !uuid.test(trust.tenantId)
      || !Array.isArray(trust.subscriptionIds) || !trust.subscriptionIds.length || !trust.subscriptionIds.every(id => typeof id === 'string' && uuid.test(id))) {
      throw new Error('Each storage token trust requires an issuer, tenant UUID and subscription UUIDs.');
    }
    const issuer = new URL(trust.issuer);
    if (issuer.protocol !== 'https:' || issuer.username || issuer.password || issuer.search || issuer.hash) throw new Error('Storage token issuers must be credential-free HTTPS URLs.');
    const keys = trust.jwks?.keys;
    if (!Array.isArray(keys) || !keys.length || keys.length > 16 || keys.some(key => !key || key.kty !== 'RSA'
      || typeof key.kid !== 'string' || !key.kid || typeof key.n !== 'string' || Buffer.from(key.n, 'base64url').length < 256
      || typeof key.e !== 'string' || key.alg !== 'RS256' || key.use !== 'sig'
      || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth'].some(field => field in key)
      || key.key_ops !== undefined && (!Array.isArray(key.key_ops) || key.key_ops.length !== 1 || key.key_ops[0] !== 'verify'))
      || new Set(keys.map(key => key.kid)).size !== keys.length) throw new Error('Storage token trusts require unique public RS256 signing keys of at least 2048 bits.');
    return { issuer: trust.issuer, tenantId: lower(trust.tenantId), subscriptions: new Set(trust.subscriptionIds.map(lower)),
      keys: createLocalJWKSet({ keys: structuredClone(keys) }) };
  });

  return async ({ req, url, account, containerName, containerRequest }) => {
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(String(req.headers.authorization ?? ''));
    if (!match || match[1].length > 16384) return invalid();
    const subscription = /^\/subscriptions\/([^/]+)\//i.exec(account.resourceId ?? '')?.[1];
    let principal;
    for (const trust of configured) {
      if (!trust.subscriptions.has(lower(subscription))) continue;
      try {
        const { payload, protectedHeader } = await jwtVerify(match[1], trust.keys, {
          algorithms: ['RS256'], issuer: trust.issuer, audience: ['https://storage.azure.com', 'https://storage.azure.com/'],
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
    if (!principal) return invalid();
    // Bound authorization to implemented operations. Future operations need an
    // explicit permission mapping before they can use this token path.
    const comp = url.searchParams.get('comp');
    const read = ['GET', 'HEAD'].includes(req.method);
    const supported = containerRequest
      ? read && [null, 'metadata', 'list'].includes(comp) || ['PUT', 'DELETE'].includes(req.method) && [null, 'metadata', 'lease'].includes(comp)
      : read && [null, 'metadata'].includes(comp) || ['PUT', 'DELETE'].includes(req.method) && [null, 'metadata', 'lease'].includes(comp);
    if (!containerName || !supported) return { ok: false, status: 501, code: 'NotImplemented', message: 'Token authorization for this Blob operation is not implemented.' };
    const target = lower(`${account.resourceId}/blobServices/default/containers/${containerName}`);
    for (const assignment of store?.resources.values() ?? []) {
      if (lower(assignment.type) !== 'microsoft.authorization/roleassignments') continue;
      const properties = assignment.properties ?? {}, scope = lower(properties.scope);
      const role = /^\/subscriptions\/([^/]+)\/providers\/Microsoft.Authorization\/roleDefinitions\/([^/]+)$/i.exec(properties.roleDefinitionId ?? '');
      if (!scope || !(target === scope || target.startsWith(`${scope}/`)) || lower(properties.principalId) !== principal
        || properties.condition || properties.conditionVersion || lower(role?.[1]) !== lower(subscription)) continue;
      if (lower(role?.[2]) === blobDataRoles.reader && read || [blobDataRoles.contributor, blobDataRoles.owner].includes(lower(role?.[2]))) return { ok: true };
    }
    return denied();
  };
}
