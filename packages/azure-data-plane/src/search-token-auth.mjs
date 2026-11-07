import { createWorkloadTokenVerifier } from './workload-token-auth.mjs';

// Public built-in Azure role identifiers, not credentials.
export const searchRoles = {
  service: '7ca78c08-252a-4471-8644-bb5ff32d4ba0',
  writer: '8ebe5a00-799e-43f5-93ac-243d3dce84a7',
  reader: '1407120a-92aa-4202-b7e9-c0e197c71c8f',
};
const lower = value => String(value ?? '').toLowerCase();
const error = (status, code, message) => ({ status, code, message });
export function searchTokenAuthorizer({ store, trusts = [] }) {
  const verify = createWorkloadTokenVerifier({ trusts, audiences: ['https://search.azure.com', 'https://search.azure.com/'] });
  return async ({ req, url, service, indexName }) => {
    const id = service.resourceId;
    const sub = /^\/subscriptions\/([^/]+)\/resourceGroups\/[^/]+\/providers\/Microsoft.Search\/searchServices\/[^/]+$/i.exec(id ?? '')?.[1];
    const principal = await verify({ authorization: req.headers.authorization, subscription: sub });
    if (!principal) return error(401, 'Unauthorized', 'The workload token could not be authenticated.');
    const deployed = store?.resources.get(lower(id));
    if (!deployed || !(deployed.properties?.disableLocalAuth === true || deployed.properties?.authOptions?.aadOrApiKey)) {
      return error(501, 'NotImplemented', 'Workload tokens require a deployed Search service with role-based authentication enabled.');
    }
    if (lower(deployed.properties.publicNetworkAccess) === 'disabled' || deployed.properties.networkRuleSet?.ipRules?.length) {
      return error(501, 'NotImplemented', 'Search workload private-network and IP-rule authorization is not implemented.');
    }
    if (indexName !== null && !/^[a-z0-9][a-z0-9_-]{1,126}[a-z0-9]$/.test(indexName)) {
      return error(501, 'NotImplemented', 'The requested Search index name is outside the supported workload-token subset.');
    }
    const path = url.pathname, method = req.method;
    let roles;
    const schemaPath = /^\/indexes\('[^']+'\)$/.test(path);
    if (method === 'GET' && path === '/indexes' || schemaPath && ['GET', 'PUT', 'POST', 'DELETE'].includes(method)) roles = [searchRoles.service];
    else if (indexName && method === 'POST' && path.endsWith('/docs/search.index')) roles = [searchRoles.writer];
    else if (indexName && (method === 'GET' && path.endsWith('/docs/count') || method === 'POST' && /\/docs\/(search|search\.post\.search)$/.test(path))) roles = [searchRoles.reader, searchRoles.writer];
    else return error(501, 'NotImplemented', 'This Search operation is not implemented for workload tokens.');
    const target = lower(indexName ? `${id}/indexes/${indexName}` : id);
    for (const assignment of store.resources.values()) {
      if (lower(assignment.type) !== 'microsoft.authorization/roleassignments') continue;
      const properties = assignment.properties ?? {}, scope = lower(properties.scope);
      const role = /^\/subscriptions\/([^/]+)\/providers\/Microsoft.Authorization\/roleDefinitions\/([^/]+)$/i.exec(properties.roleDefinitionId ?? '');
      if (!scope || !(scope === target || target.startsWith(scope + '/')) || lower(properties.principalId) !== principal
        || properties.condition || properties.conditionVersion || lower(role?.[1]) !== lower(sub)) continue;
      if (roles.includes(lower(role?.[2]))) return null;
    }
    return error(403, 'Forbidden', 'The workload does not have a supported role permitting this Search operation.');
  };
}
