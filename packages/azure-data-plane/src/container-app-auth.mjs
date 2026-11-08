import { createWorkloadClaimsVerifier } from './workload-token-auth.mjs';

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const list = values => Array.isArray(values) && values.length > 0 && values.length <= 100
  && values.every(value => typeof value === 'string' && uuid.test(value));
const lower = value => String(value).toLowerCase();
const failure = (status, code) => ({ status, code });

// This first supported mode is app-only, worker-restricted Entra authentication.
// An unimplemented login/policy mode never falls back to anonymous forwarding.
export function createContainerAppAuthorizer({ trusts = [] } = {}) {
  return async ({ authorization, configuration, subscription, secure }) => {
    const p = configuration?.properties;
    const aad = p?.identityProviders?.azureActiveDirectory;
    const validation = aad?.validation;
    const policy = validation?.defaultAuthorizationPolicy;
    if (p?.platform?.enabled !== true || p?.globalValidation?.unauthenticatedClientAction !== 'Return401'
      || p?.httpSettings?.requireHttps !== true || aad?.enabled !== true
      || !uuid.test(aad?.registration?.clientId ?? '')
      || !list(validation?.allowedAudiences) || !list(policy?.allowedApplications)
      || !list(policy?.allowedPrincipals?.identities) || !list(validation?.jwtClaimChecks?.allowedClientApplications)
      || (p.globalValidation.excludedPaths?.length ?? 0) > 0
      || (policy.allowedPrincipals.groups?.length ?? 0) > 0
      || (validation.jwtClaimChecks.allowedGroups?.length ?? 0) > 0
      || Object.entries(p.identityProviders).some(([name, provider]) => name !== 'azureActiveDirectory' && provider?.enabled === true)) {
      return failure(501, 'ContainerAppAuthenticationNotImplemented');
    }
    if (!secure) return failure(403, 'HttpsRequired');
    const issuer = /^https:\/\/login\.microsoftonline\.com\/([a-f0-9-]{36})\/v2\.0$/i.exec(aad.registration.openIdIssuer ?? '');
    if (!issuer || !uuid.test(issuer[1])) return failure(501, 'ContainerAppIssuerNotImplemented');
    const verify = createWorkloadClaimsVerifier({ trusts, audiences: validation.allowedAudiences });
    const identity = await verify({ authorization, subscription, tenantId: issuer[1] });
    if (!identity || identity.configurationIssuer !== aad.registration.openIdIssuer) return failure(401, 'Unauthorized');
    if (identity.delegated || identity.applicationType !== 'app'
      || !uuid.test(identity.client ?? '')
      || !policy.allowedApplications.map(lower).includes(lower(identity.client))
      || !validation.jwtClaimChecks.allowedClientApplications.map(lower).includes(lower(identity.client))
      || !policy.allowedPrincipals.identities.map(lower).includes(identity.principal)) return failure(403, 'Forbidden');
    return null;
  };
}
