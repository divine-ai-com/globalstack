import { createWorkloadTokenVerifier } from './workload-token-auth.mjs';

const lower = value => String(value ?? '').toLowerCase();
export const blobDataRoles = Object.freeze({
  reader: '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1',
  contributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe',
  owner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b',
});
export const queueDataContributor = '974c5e8b-45b9-4653-ba55-5f855dd0fb88';
export const tableDataContributor = '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3';
const denied = () => ({ ok: false, status: 403, code: 'AuthorizationPermissionMismatch', message: 'This request is not authorized to perform this operation using this permission.' });
const invalid = () => ({ ok: false, status: 401, code: 'InvalidAuthenticationInfo', message: 'The authentication information is not valid.' });

// Only operator-pinned public keys are trusted. Token headers cannot select a
// remote key server, and the emulator never needs the issuer's signing key.
export function storageTokenAuthorizer({ store, trusts = [] } = {}) {
  const verify = createWorkloadTokenVerifier({ trusts, audiences: ['https://storage.azure.com', 'https://storage.azure.com/'] });
  return async ({ req, url, account, containerName, containerRequest, service = 'blob' }) => {
    const subscription = /^\/subscriptions\/([^/]+)\//i.exec(account.resourceId ?? '')?.[1];
    const principal = await verify({ authorization: req.headers.authorization, subscription });
    if (!principal) return invalid();
    // Bound authorization to implemented operations. Future operations need an
    // explicit permission mapping before they can use this token path.
    const comp = url.searchParams.get('comp');
    const read = ['GET', 'HEAD'].includes(req.method);
    let supported = containerRequest
      ? read && [null, 'metadata', 'list'].includes(comp) || ['PUT', 'DELETE'].includes(req.method) && [null, 'metadata', 'lease'].includes(comp)
      : read && [null, 'metadata'].includes(comp) || ['PUT', 'DELETE'].includes(req.method) && [null, 'metadata', 'lease'].includes(comp);
    let target = lower(`${account.resourceId}/blobServices/default/containers/${containerName}`);
    let contributorRoles = [blobDataRoles.contributor, blobDataRoles.owner];
    if (service === 'queue') {
      const segments = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
      const [queue, messages] = segments;
      supported = segments.length === 1 && ((!comp && ['PUT', 'DELETE'].includes(req.method))
        || comp === 'metadata' && ['GET', 'HEAD', 'PUT'].includes(req.method))
        || !comp && messages === 'messages' && (segments.length === 2 && ['GET', 'POST', 'DELETE'].includes(req.method)
          || segments.length === 3 && ['PUT', 'DELETE'].includes(req.method));
      target = lower(`${account.resourceId}/queueServices/default/queues/${queue}`);
      contributorRoles = [queueDataContributor];
    } else if (service === 'table') {
      // Collection creation and batches can name tables in their bodies. Require
      // an account/service grant until per-operation body authorization exists.
      target = lower(`${account.resourceId}/tableServices/default`);
      supported = ['GET', 'POST', 'PUT', 'PATCH', 'MERGE', 'DELETE'].includes(req.method);
      contributorRoles = [tableDataContributor];
    } else if (service !== 'blob') supported = false;
    if ((service === 'blob' && !containerName) || !supported) return { ok: false, status: 501, code: 'NotImplemented', message: `Token authorization for this ${service} operation is not implemented.` };
    for (const assignment of store?.resources.values() ?? []) {
      if (lower(assignment.type) !== 'microsoft.authorization/roleassignments') continue;
      const properties = assignment.properties ?? {}, scope = lower(properties.scope);
      const role = /^\/subscriptions\/([^/]+)\/providers\/Microsoft.Authorization\/roleDefinitions\/([^/]+)$/i.exec(properties.roleDefinitionId ?? '');
      if (!scope || !(target === scope || target.startsWith(`${scope}/`)) || lower(properties.principalId) !== principal
        || properties.condition || properties.conditionVersion || lower(role?.[1]) !== lower(subscription)) continue;
      if ((service === 'blob' && lower(role?.[2]) === blobDataRoles.reader && read) || contributorRoles.includes(lower(role?.[2]))) return { ok: true };
    }
    return denied();
  };
}
