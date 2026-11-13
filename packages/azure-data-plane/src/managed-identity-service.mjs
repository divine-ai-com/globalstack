import assert from 'node:assert/strict';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const lower = value => String(value ?? '').toLowerCase();
const selectors = ['client_id', 'principal_id', 'object_id', 'mi_res_id'];
const queryNames = new Set(['resource', 'api-version', ...selectors]);
const resourcePattern = /^\/subscriptions\/([a-f0-9-]+)\/resourceGroups\/[^/?#]+\/providers\/(Microsoft\.Web\/sites|Microsoft\.App\/containerApps)\/[^/?#]+$/i;

function reply(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache',
    'content-length': bytes.length });
  res.end(bytes);
}

function safeResource(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['https:', 'api:'].includes(url.protocol) && Boolean(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}

// This broker is a local platform service. Its signing key stays in memory and
// is never handed to the workload or accepted as an Azure/Entra signing key.
export async function createManagedIdentityService({ store, tenantId, subscriptionIds,
  issuer = 'https://identity.globalstack.test/', audiences = ['https://storage.azure.com', 'https://storage.azure.com/'],
  tokenLifetimeSeconds = 300, applicationAudiences = [] } = {}) {
  assert.ok(store?.resources instanceof Map, 'Managed identity needs the live resource store');
  assert.ok(uuid.test(tenantId) && Array.isArray(subscriptionIds) && subscriptionIds.length
    && subscriptionIds.every(id => typeof id === 'string' && uuid.test(id)), 'Tenant and subscription UUIDs are required');
  assert.ok(safeResource(issuer) && issuer.startsWith('https:'), 'An HTTPS issuer is required');
  assert.ok(Array.isArray(audiences) && audiences.length > 0 && audiences.length <= 32 && audiences.every(safeResource),
    'Managed identity audiences must be explicit resource URIs');
  assert.ok(Number.isInteger(tokenLifetimeSeconds) && tokenLifetimeSeconds >= 60 && tokenLifetimeSeconds <= 3600,
    'Token lifetime must be between 60 and 3600 seconds');
  assert.ok(Array.isArray(applicationAudiences) && applicationAudiences.length <= 16 && applicationAudiences.every(value => typeof value === 'string' && uuid.test(value)),
    'Application audiences must be explicit UUIDs');
  const appAudiences = new Map(applicationAudiences.map(value => [`api://${value}`, value]));
  const subscriptions = new Set(subscriptionIds.map(lower)), allowedAudiences = new Set([...audiences, ...appAudiences.keys()]);
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const kid = randomUUID(), jwk = { ...await exportJWK(publicKey), kid, alg: 'RS256', use: 'sig' };
  const trust = { issuer, tenantId, subscriptionIds: [...subscriptions], jwks: { keys: [jwk] } };
  const bindings = new Map(), clientIds = new Map();
  let disposed = false;

  function identityFor(site, params) {
    const type = String(site.identity?.type ?? '').split(',').map(value => value.trim().toLowerCase());
    const selected = selectors.filter(name => params.has(name));
    if (selected.length > 1) return null;
    if (selected.length === 0) {
      if (!type.includes('systemassigned')) return null;
      const { principalId, tenantId: identityTenant } = site.identity;
      if (!uuid.test(principalId) || lower(identityTenant) !== lower(tenantId)) return null;
      // ARM does not return the system identity's application client ID. Keep a
      // runtime-local opaque value stable for this principal's token responses.
      if (!clientIds.has(principalId)) clientIds.set(principalId, randomUUID());
      return { principalId, tenantId: identityTenant, clientId: clientIds.get(principalId) };
    }
    if (!type.includes('userassigned')) return null;
    const selector = selected[0], value = lower(params.get(selector));
    if (!value) return null;
    for (const id of Object.keys(site.identity.userAssignedIdentities ?? {})) {
      const identity = store.resources.get(lower(id));
      if (lower(identity?.type) !== 'microsoft.managedidentity/userassignedidentities') continue;
      const properties = identity.properties ?? {};
      if (!uuid.test(properties.principalId) || !uuid.test(properties.clientId) || lower(properties.tenantId) !== lower(tenantId)) continue;
      const candidate = selector === 'mi_res_id' ? id : selector === 'client_id' ? properties.clientId : properties.principalId;
      if (lower(candidate) === value) return { ...properties, resourceId: id };
    }
    return null;
  }

  function bind(appResourceId) {
    assert.ok(!disposed, 'Managed identity service is disposed');
    const match = resourcePattern.exec(appResourceId);
    assert.ok(match && uuid.test(match[1]) && subscriptions.has(lower(match[1])), 'A workload in an allowed subscription is required');
    const id = lower(appResourceId), site = store.resources.get(id);
    assert.ok(site && ['microsoft.web/sites', 'microsoft.app/containerapps'].includes(lower(site.type)), 'The workload must exist before binding its identity');
    // Binding again rotates the platform header and revokes the older handler.
    bindings.get(id)?.revoke();
    const secret = randomBytes(32).toString('hex'), secretBytes = Buffer.from(secret);
    let revoked = false, inFlight = 0;
    const binding = {
      identityHeader: secret,
      revoke() { revoked = true; if (bindings.get(id) === binding) bindings.delete(id); },
      async handler(req, res) {
        const deny = (status, error) => reply(res, status, { error });
        const supplied = Buffer.from(typeof req.headers['x-identity-header'] === 'string' ? req.headers['x-identity-header'] : '');
        if (disposed || revoked || supplied.length !== secretBytes.length || !timingSafeEqual(supplied, secretBytes)) return deny(403, 'identity_unavailable');
        if (req.method !== 'GET') return deny(405, 'method_not_allowed');
        if (String(req.url).length > 4096) return deny(400, 'invalid_request');
        let url;
        try { url = new URL(req.url, 'http://localhost'); } catch { return deny(400, 'invalid_request'); }
        if (url.pathname !== '/MSI/token') return deny(404, 'not_found');
        if ([...url.searchParams.keys()].some(name => !queryNames.has(name) || url.searchParams.getAll(name).length !== 1)
          || url.searchParams.get('api-version') !== '2019-08-01') return deny(400, 'invalid_request');
        const audience = url.searchParams.get('resource');
        if (!allowedAudiences.has(audience)) return deny(501, 'resource_not_supported');
        const current = store.resources.get(id);
        if (!current || !['microsoft.web/sites', 'microsoft.app/containerapps'].includes(lower(current.type))) return deny(403, 'identity_unavailable');
        const identity = identityFor(current, url.searchParams);
        if (!identity) return deny(400, 'identity_not_found');
        if (inFlight >= 8) return deny(429, 'too_many_requests');
        inFlight++;
        try {
          const now = Math.floor(Date.now() / 1000), expiry = now + tokenLifetimeSeconds;
          const token = await new SignJWT({ iss: issuer, aud: appAudiences.get(audience) ?? audience, tid: tenantId, oid: identity.principalId,
            ...(appAudiences.has(audience) ? { azp: identity.clientId, ver: '2.0' } : {}),
            appid: identity.clientId, idtyp: 'app', xms_mirid: identity.resourceId ?? appResourceId, iat: now, nbf: now, exp: expiry })
            .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' }).sign(privateKey);
          // Signing yields to the event loop. Do not return a token if the
          // workload was removed or the binding revoked while it was in flight.
          const latest = store.resources.get(id), latestIdentity = latest && identityFor(latest, url.searchParams);
          if (disposed || revoked || lower(latestIdentity?.principalId) !== lower(identity.principalId)) return deny(403, 'identity_unavailable');
          reply(res, 200, { access_token: token, expires_on: String(expiry), resource: audience, token_type: 'Bearer', client_id: identity.clientId });
        } catch { deny(500, 'identity_service_error'); }
        finally { inFlight--; }
      },
    };
    bindings.set(id, binding);
    return binding;
  }

  return { trust: structuredClone(trust), bind,
    dispose() { disposed = true; for (const binding of bindings.values()) binding.revoke(); clientIds.clear(); } };
}
