import { createWorkloadTokenVerifier } from './workload-token-auth.mjs';

export const keyVaultSecretsUserRole = '4633458b-17de-408a-b874-0445c86b69e6'; // gitleaks:allow Public Azure built-in role ID.
const lower = value => String(value ?? '').toLowerCase();
const error = (status, code, message) => ({ status, code, message });

export function keyVaultTokenAuthorizer({ store, trusts = [] } = {}) {
  const verify = createWorkloadTokenVerifier({ trusts, audiences: ['https://vault.azure.net', 'https://vault.azure.net/'] });
  return async ({ req, url, vault }) => {
    const id = `/subscriptions/${vault.subscriptionId}/resourceGroups/${vault.resourceGroupName}/providers/Microsoft.KeyVault/vaults/${vault.vaultName}`;
    const resource = store?.resources.get(lower(id));
    const principal = await verify({ authorization: req.headers.authorization, subscription: vault.subscriptionId, tenantId: resource?.properties?.tenantId });
    if (!principal) return error(401, 'Unauthorized', 'The workload token could not be authenticated.');
    if (!resource || resource.properties?.enableRbacAuthorization !== true) {
      return error(501, 'NotImplemented', 'Workload tokens require an explicitly configured RBAC vault.');
    }
    if (lower(resource.properties.publicNetworkAccess) === 'disabled' || lower(resource.properties.networkAcls?.defaultAction) === 'deny') {
      return error(501, 'NotImplemented', 'Private network authorization for workload Key Vault requests is not implemented.');
    }
    // Only secret-value GET is implemented here. Listing, mutation and crypto
    // operations need their own permission mapping before they can be allowed.
    const match = /^\/secrets\/([a-z0-9-]{1,127})(?:\/([a-f0-9]{32}))?\/?$/i.exec(url.pathname);
    if (req.method !== 'GET' || !match) return error(501, 'NotImplemented', 'This Key Vault operation is not implemented for workload tokens.');
    const target = lower(`${id}/secrets/${match[1]}`);
    for (const assignment of store.resources.values()) {
      if (lower(assignment.type) !== 'microsoft.authorization/roleassignments') continue;
      const properties = assignment.properties ?? {}, scope = lower(properties.scope);
      const role = /^\/subscriptions\/([^/]+)\/providers\/Microsoft.Authorization\/roleDefinitions\/([^/]+)$/i.exec(properties.roleDefinitionId ?? '');
      if (!scope || !(scope === target || target.startsWith(`${scope}/`)) || lower(properties.principalId) !== principal
        || properties.condition || properties.conditionVersion || lower(role?.[1]) !== lower(vault.subscriptionId)) continue;
      if (lower(role?.[2]) === keyVaultSecretsUserRole) return null;
    }
    return error(403, 'Forbidden', 'The workload does not have a supported role permitting this secret read.');
  };
}
