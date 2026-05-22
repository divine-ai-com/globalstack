import { URL } from 'node:url';
import { allCapabilities } from '../../core/src/azure-tier1-capabilities.mjs';
import { summarizeCapability } from '../../core/src/hybrid-coverage.mjs';
export async function readBody(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text) return {};
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text).entries());
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
export function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

export function sendError(res, status, code, message, details = []) {
  sendJson(res, status, {
    error: {
      code,
      message,
      details,
    },
  });
}

export function facadeOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] ?? (req.socket?.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host ?? '127.0.0.1'}`;
}

export const localIdentity = {
  subscriptionId: process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000',
  tenantId: process.env.GLOBALSTACK_AZURE_TENANT_ID ?? process.env.ARM_TENANT_ID ?? '00000000-0000-0000-0000-000000000000',
  clientId: process.env.GLOBALSTACK_AZURE_CLIENT_ID ?? process.env.ARM_CLIENT_ID ?? '11111111-1111-1111-1111-111111111111',
  clientSecret: process.env.GLOBALSTACK_AZURE_CLIENT_SECRET ?? process.env.ARM_CLIENT_SECRET ?? 'globalstack',
  accessToken: process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token',
};

export function requireGlobalStackAuthToken() {
  const token = process.env.GLOBALSTACK_AUTH_TOKEN;
  if (!token || token.trim() === '') {
    throw new Error('GLOBALSTACK_AUTH_TOKEN must be exported before starting the GlobalStack Azure emulator.');
  }
  return token;
}

export function tokenTenant(pathname) {
  const raw = segments(pathname);
  const oauthIndex = raw.findIndex(segment => segment.toLowerCase() === 'oauth2');
  if (oauthIndex <= 0) return localIdentity.tenantId;
  return raw[oauthIndex - 1];
}

export function discoveryTenant(pathname) {
  const raw = segments(pathname);
  const wellKnownIndex = raw.findIndex(segment => segment.toLowerCase() === '.well-known');
  if (wellKnownIndex <= 0) return localIdentity.tenantId;
  if (raw[wellKnownIndex - 1]?.toLowerCase() === 'v2.0' && wellKnownIndex >= 2) {
    return raw[wellKnownIndex - 2];
  }
  return raw[wellKnownIndex - 1] ?? localIdentity.tenantId;
}

export function isPublicRoute(method, pathname) {
  if (method === 'GET' && pathname === '/_globalstack/health') return true;
  if (method === 'GET' && pathname === '/_globalstack/capabilities') return true;
  if (method === 'GET' && pathname === '/_globalstack/coverage') return true;
  if (method === 'GET' && pathname === '/metadata/endpoints') return true;
  if (method === 'GET' && pathname.endsWith('/.well-known/openid-configuration')) return true;
  if (method === 'GET' && pathname.endsWith('/discovery/v2.0/keys')) return true;
  if (method === 'POST' && (pathname.endsWith('/oauth2/token') || pathname.endsWith('/oauth2/v2.0/token'))) return true;
  return false;
}

export function authenticationFailure(message = 'Authentication failed. The Authorization header is missing or invalid.') {
  return {
    status: 401,
    body: {
      error: {
        code: 'InvalidAuthenticationToken',
        message,
        details: [{
          code: 'GlobalStackLocalIdentity',
          message: `Use the deterministic local Azure identity for this emulator: subscription ${localIdentity.subscriptionId}, tenant ${localIdentity.tenantId}.`,
        }],
      },
    },
    headers: {
      'www-authenticate': `Bearer authorization_uri="${localIdentity.tenantId}", resource="https://management.azure.com/"`,
    },
  };
}

export function authorizationFailure(subscriptionId) {
  return {
    status: 403,
    body: {
      error: {
        code: 'AuthorizationFailed',
        message: `The client '${localIdentity.clientId}' with object id '${localIdentity.clientId}' does not have authorization to perform this action over scope '/subscriptions/${subscriptionId}' or the scope is invalid.`,
        details: [{
          code: 'GlobalStackSubscriptionMismatch',
          message: `GlobalStack Azure accepts only local subscription ${localIdentity.subscriptionId} unless GLOBALSTACK_AZURE_SUBSCRIPTION_ID is changed.`,
        }],
      },
    },
  };
}

export function requestSubscriptionId(pathname) {
  const raw = segments(pathname);
  const index = raw.findIndex(segment => segment.toLowerCase() === 'subscriptions');
  return index >= 0 ? raw[index + 1] : null;
}

export function authorizeRequest(req, method, pathname) {
  if (isPublicRoute(method, pathname)) return null;
  const auth = String(req.headers.authorization ?? '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return authenticationFailure();
  if (match[1] !== localIdentity.accessToken) return authenticationFailure('The access token is not valid for the GlobalStack Azure local identity.');
  const subscriptionId = requestSubscriptionId(pathname);
  if (subscriptionId && subscriptionId !== localIdentity.subscriptionId) return authorizationFailure(subscriptionId);
  return null;
}

export function segments(pathname) {
  const normalized = pathname.startsWith('/%2F') || pathname.startsWith('/%2f')
    ? decodeURIComponent(pathname)
    : pathname;
  return normalized.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
}

export function lowerSegments(pathname) {
  return segments(pathname).map(segment => segment.toLowerCase());
}

export function parseResourceGroupRoute(pathname) {
  const raw = segments(pathname);
  const lower = raw.map(segment => segment.toLowerCase());
  if (lower[0] !== 'subscriptions' || !raw[1]) return null;
  if (lower[2] !== 'resourcegroups') return null;
  return {
    subscriptionId: raw[1],
    resourceGroupName: raw[3] ?? null,
    rest: raw.slice(4),
  };
}

export function parseProviderRoute(pathname) {
  const rgRoute = parseResourceGroupRoute(pathname);
  if (!rgRoute || !rgRoute.resourceGroupName) return null;
  const lowerRest = rgRoute.rest.map(segment => segment.toLowerCase());
  if (lowerRest[0] !== 'providers' || !rgRoute.rest[1]) return null;
  return {
    subscriptionId: rgRoute.subscriptionId,
    resourceGroupName: rgRoute.resourceGroupName,
    providerNamespace: rgRoute.rest[1],
    typePath: rgRoute.rest.slice(2).join('/'),
  };
}

export function providerOperations() {
  return {
    value: allCapabilities.flatMap(capability =>
      capability.implementedOperations.map(operation => ({
        name: `GlobalStack.${capability.id}/${operation}`,
        display: {
          provider: 'GlobalStack',
          resource: capability.azureEquivalent,
          operation,
          description: `GlobalStack local operation for ${capability.azureEquivalent}`,
        },
        origin: 'user,system',
        globalstack: summarizeCapability(capability),
      }))
    ),
  };
}

export function providerNamespaces() {
  const grouped = new Map();
  for (const capability of allCapabilities) {
    for (const resourceType of capability.resourceTypes) {
      const [namespace, ...types] = resourceType.split('/');
      const existing = grouped.get(namespace) ?? new Set();
      existing.add(types.join('/'));
      grouped.set(namespace, existing);
    }
  }
  grouped.set('Microsoft.Resources', new Set(['resourceGroups', 'deployments']));
  return [...grouped.entries()].map(([namespace, resourceTypes]) => ({
    namespace,
    registrationState: 'Registered',
    resourceTypes: [...resourceTypes].map(resourceType => ({
      resourceType,
      locations: ['eastus', 'eastus2', 'westus2', 'westeurope'],
      apiVersions: ['2025-04-01', '2024-01-01', '2023-05-01', '2023-03-01', '2023-01-01', '2022-09-01', '2022-06-15', '2021-11-01'],
      capabilities: 'SupportsTags,SupportsLocation',
    })),
  }));
}

export function providerNamespace(namespace) {
  return providerNamespaces().find(item => item.namespace.toLowerCase() === String(namespace).toLowerCase()) ?? {
    namespace,
    registrationState: 'Registered',
    resourceTypes: [],
  };
}

export function azureEnvironmentMetadata(origin) {
  return {
    name: 'GlobalStackAzureCloud',
    portal: `${origin}/`,
    authentication: {
      loginEndpoint: `${origin}/`,
      audiences: [`${origin}/`, 'https://management.azure.com/'],
      tenant: 'common',
    },
    resourceManager: `${origin}/`,
    gallery: `${origin}/`,
    graph: `${origin}/`,
    activeDirectory: `${origin}/`,
    activeDirectoryResourceId: `${origin}/`,
    batch: `${origin}/`,
    media: `${origin}/`,
    sqlManagement: `${origin}/`,
    vmImageAliasDoc: `${origin}/metadata/vm-image-aliases`,
    suffixes: {
      storage: 'core.windows.net',
      keyVaultDns: 'vault.azure.net',
      sqlServerHostname: 'database.windows.net',
      azureDataLakeStoreFileSystem: 'azuredatalakestore.net',
    },
  };
}

export function tokenResponse() {
  const now = Math.floor(Date.now() / 1000);
  return {
    token_type: 'Bearer',
    expires_in: 3600,
    ext_expires_in: 3600,
    expires_on: String(now + 3600),
    access_token: 'globalstack-local-token',
  };
}

export function openIdConfiguration(req, pathname) {
  const tenant = discoveryTenant(pathname);
  const origin = facadeOrigin(req);
  const issuer = `${origin}/${tenant}/v2.0`;
  return {
    token_endpoint: `${origin}/${tenant}/oauth2/v2.0/token`,
    token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
    jwks_uri: `${origin}/${tenant}/discovery/v2.0/keys`,
    response_modes_supported: ['query', 'fragment', 'form_post'],
    subject_types_supported: ['pairwise'],
    id_token_signing_alg_values_supported: ['RS256'],
    response_types_supported: ['code', 'id_token', 'code id_token', 'id_token token'],
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    issuer,
    request_uri_parameter_supported: false,
    userinfo_endpoint: `${origin}/openid/userinfo`,
    authorization_endpoint: `${origin}/${tenant}/oauth2/v2.0/authorize`,
    device_authorization_endpoint: `${origin}/${tenant}/oauth2/v2.0/devicecode`,
    http_logout_supported: true,
    frontchannel_logout_supported: true,
    end_session_endpoint: `${origin}/${tenant}/oauth2/v2.0/logout`,
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'acr', 'nonce', 'preferred_username', 'name', 'tid', 'ver', 'at_hash'],
    tenant_region_scope: 'NA',
    cloud_instance_name: 'microsoftonline.com',
    cloud_graph_host_name: 'graph.windows.net',
    msgraph_host: 'graph.microsoft.com',
    rbac_url: `${origin}`,
  };
}

export function validateTokenRequest(pathname, body) {
  const tenant = tokenTenant(pathname);
  if (tenant !== localIdentity.tenantId && tenant !== 'common' && tenant !== 'organizations') {
    return {
      status: 400,
      body: {
        error: 'invalid_tenant',
        error_description: `Tenant ${tenant} is not configured for GlobalStack Azure local identity.`,
      },
    };
  }
  const clientId = body.client_id ?? body.clientId;
  const clientSecret = body.client_secret ?? body.clientSecret;
  const grantType = body.grant_type ?? body.grantType;
  if (!clientId || !clientSecret) {
    return {
      status: 401,
      body: {
        error: 'invalid_client',
        error_description: 'client_id and client_secret are required for GlobalStack Azure local token issuance.',
      },
    };
  }
  if (clientId !== localIdentity.clientId || clientSecret !== localIdentity.clientSecret) {
    return {
      status: 401,
      body: {
        error: 'invalid_client',
        error_description: 'The supplied client credentials do not match the deterministic GlobalStack Azure local identity.',
      },
    };
  }
  if (grantType && grantType !== 'client_credentials') {
    return {
      status: 400,
      body: {
        error: 'unsupported_grant_type',
        error_description: 'GlobalStack Azure local token issuance currently supports client_credentials.',
      },
    };
  }
  return null;
}

export function exactCapabilityForResourceType(type) {
  const normalized = String(type ?? '').toLowerCase();
  return allCapabilities.find(capability =>
    capability.resourceTypes.some(resourceType => resourceType.toLowerCase() === normalized)
  ) ?? null;
}

export function parentResourceTypes(resourceType) {
  const parts = resourceType.split('/');
  const provider = parts[0];
  const types = parts.slice(1);
  const parents = [];
  for (let length = types.length - 1; length >= 1; length -= 1) {
    parents.push(`${provider}/${types.slice(0, length).join('/')}`);
  }
  return parents;
}

export function parentRoute(providerRoute) {
  const parts = providerRoute.typePath.split('/');
  if (parts.length <= 2) return null;
  return {
    ...providerRoute,
    typePath: parts.slice(0, -2).join('/'),
  };
}

export function nearestCapabilityParentRoute(providerRoute) {
  const parts = providerRoute.typePath.split('/');
  let length = parts.length % 2 === 1 ? parts.length - 1 : parts.length - 2;
  for (; length >= 2; length -= 2) {
    const type = `${providerRoute.providerNamespace}/${parts.slice(0, length).filter((_, index) => index % 2 === 0).join('/')}`;
    if (exactCapabilityForResourceType(type)) {
      return {
        ...providerRoute,
        typePath: parts.slice(0, length).join('/'),
      };
    }
  }
  return null;
}

export function isCollectionRoute(providerRoute) {
  return providerRoute.typePath.split('/').length % 2 === 1;
}

export function storageAccountParentRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Storage') return null;
  const parts = providerRoute.typePath.split('/');
  const index = parts.indexOf('storageAccounts');
  if (index < 0 || !parts[index + 1]) return null;
  return {
    ...providerRoute,
    typePath: `storageAccounts/${parts[index + 1]}`,
  };
}

export function eventGridTopicListKeysRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.EventGrid') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'topics' || parts[2].toLowerCase() !== 'listkeys') return null;
  return {
    ...providerRoute,
    typePath: `topics/${parts[1]}`,
  };
}

export function storageAccountListKeysRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Storage') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'storageAccounts' || parts[2].toLowerCase() !== 'listkeys') return null;
  return {
    ...providerRoute,
    typePath: `storageAccounts/${parts[1]}`,
  };
}

export function scopedDiagnosticSettingsRoute(providerRoute) {
  const marker = '/providers/Microsoft.Insights/diagnosticSettings/';
  const index = providerRoute.typePath.indexOf(marker);
  if (index < 0) return null;
  const scopeTypePath = providerRoute.typePath.slice(0, index);
  const diagnosticName = providerRoute.typePath.slice(index + marker.length);
  if (!scopeTypePath || !diagnosticName) return null;
  return {
    scopeRoute: {
      ...providerRoute,
      typePath: scopeTypePath,
    },
    diagnosticRoute: {
      subscriptionId: providerRoute.subscriptionId,
      resourceGroupName: providerRoute.resourceGroupName,
      providerNamespace: 'Microsoft.Insights',
      typePath: `diagnosticSettings/${diagnosticName}`,
    },
  };
}

export function aksCredentialActionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ContainerService') return null;
  const parts = providerRoute.typePath.split('/');
  const action = parts[2]?.toLowerCase();
  if (parts.length !== 3 || parts[0] !== 'managedClusters') return null;
  if (!['listclusterusercredential', 'listclusteradmincredential'].includes(action)) return null;
  return {
    route: {
      ...providerRoute,
      typePath: `managedClusters/${parts[1]}`,
    },
    role: action === 'listclusteradmincredential' ? 'admin' : 'user',
  };
}

export function webHostListKeysRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Web') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'sites' || parts[2] !== 'host' || parts[3].toLowerCase() !== 'default' || parts[4].toLowerCase() !== 'listkeys') return null;
  return {
    ...providerRoute,
    typePath: `sites/${parts[1]}`,
  };
}

export function webFunctionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Web') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 4 || parts[0] !== 'sites' || parts[2] !== 'functions') return null;
  return {
    appRoute: {
      ...providerRoute,
      typePath: `sites/${parts[1]}`,
    },
    functionRoute: providerRoute,
    appName: parts[1],
    functionName: parts[3],
  };
}

export function webFunctionListKeysRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Web') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'sites' || parts[2] !== 'functions' || parts[4].toLowerCase() !== 'listkeys') return null;
  return {
    appRoute: {
      ...providerRoute,
      typePath: `sites/${parts[1]}`,
    },
    functionRoute: {
      ...providerRoute,
      typePath: `sites/${parts[1]}/functions/${parts[3]}`,
    },
    appName: parts[1],
    functionName: parts[3],
  };
}

export function webFunctionListSecretsRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Web') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'sites' || parts[2] !== 'functions' || parts[4].toLowerCase() !== 'listsecrets') return null;
  return {
    appRoute: {
      ...providerRoute,
      typePath: `sites/${parts[1]}`,
    },
    functionRoute: {
      ...providerRoute,
      typePath: `sites/${parts[1]}/functions/${parts[3]}`,
    },
    appName: parts[1],
    functionName: parts[3],
  };
}

export function webSyncFunctionTriggersRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Web') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'sites' || parts[2].toLowerCase() !== 'syncfunctiontriggers') return null;
  return {
    ...providerRoute,
    typePath: `sites/${parts[1]}`,
    appName: parts[1],
  };
}

export function webListSyncFunctionTriggerStatusRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Web') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'sites' || parts[2].toLowerCase() !== 'listsyncfunctiontriggerstatus') return null;
  return {
    ...providerRoute,
    typePath: `sites/${parts[1]}`,
    appName: parts[1],
  };
}

export function workflowTriggerRunRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'workflows' || parts[2] !== 'triggers' || parts[4].toLowerCase() !== 'run') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    triggerName: parts[3],
  };
}

export function workflowTriggerReadRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 4 || parts[0] !== 'workflows' || parts[2] !== 'triggers') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    triggerName: parts[3],
  };
}

export function workflowTriggerActionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'workflows' || parts[2] !== 'triggers') return null;
  const action = parts[4].toLowerCase();
  if (!['listcallbackurl', 'reset'].includes(action)) return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    triggerName: parts[3],
    action,
  };
}

export function workflowTriggerHistoriesRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'workflows' || parts[2] !== 'triggers' || parts[4] !== 'histories') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    triggerName: parts[3],
  };
}

export function workflowTriggerHistoryItemRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 6 || parts[0] !== 'workflows' || parts[2] !== 'triggers' || parts[4] !== 'histories') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    triggerName: parts[3],
    historyName: parts[5],
  };
}

export function workflowTriggerHistoryActionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 7 || parts[0] !== 'workflows' || parts[2] !== 'triggers' || parts[4] !== 'histories') return null;
  const action = parts[6].toLowerCase();
  if (action !== 'resubmit') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    triggerName: parts[3],
    historyName: parts[5],
    action,
  };
}

export function workflowRunRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 4 || parts[0] !== 'workflows' || parts[2] !== 'runs') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    runId: parts[3],
  };
}

export function workflowRunActionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'workflows' || parts[2] !== 'runs') return null;
  const action = parts[4].toLowerCase();
  if (action !== 'cancel') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    runId: parts[3],
    action,
  };
}

export function workflowRunActionsCollectionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'workflows' || parts[2] !== 'runs' || parts[4] !== 'actions') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    runId: parts[3],
  };
}

export function workflowRunActionItemRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 6 || parts[0] !== 'workflows' || parts[2] !== 'runs' || parts[4] !== 'actions') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
    runId: parts[3],
    actionName: parts[5],
  };
}

export function workflowRunsCollectionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Logic') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'workflows' || parts[2] !== 'runs') return null;
  return {
    workflowRoute: {
      ...providerRoute,
      typePath: `workflows/${parts[1]}`,
    },
    workflowName: parts[1],
  };
}

export function serverFarmRouteFromId(serverFarmId) {
  const raw = String(serverFarmId ?? '').split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
  const lower = raw.map(segment => segment.toLowerCase());
  const subscriptionIndex = lower.indexOf('subscriptions');
  const resourceGroupIndex = lower.indexOf('resourcegroups');
  const providersIndex = lower.indexOf('providers');
  const serverFarmsIndex = lower.indexOf('serverfarms');
  if (
    subscriptionIndex < 0
    || resourceGroupIndex < 0
    || providersIndex < 0
    || serverFarmsIndex < 0
    || lower[providersIndex + 1] !== 'microsoft.web'
    || !raw[subscriptionIndex + 1]
    || !raw[resourceGroupIndex + 1]
    || !raw[serverFarmsIndex + 1]
  ) {
    return null;
  }
  return {
    subscriptionId: raw[subscriptionIndex + 1],
    resourceGroupName: raw[resourceGroupIndex + 1],
    providerNamespace: 'Microsoft.Web',
    typePath: `serverfarms/${raw[serverFarmsIndex + 1]}`,
  };
}

export function siteReferencesExistingServerFarm(store, resourceType, body) {
  if (resourceType !== 'Microsoft.Web/sites' || !body.properties?.serverFarmId) return false;
  const route = serverFarmRouteFromId(body.properties.serverFarmId);
  return Boolean(route && store.getResource(route));
}

export function providerRouteFromResourceId(resourceId) {
  const raw = String(resourceId ?? '').split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
  const lower = raw.map(segment => segment.toLowerCase());
  const subscriptionIndex = lower.indexOf('subscriptions');
  const resourceGroupIndex = lower.indexOf('resourcegroups');
  const providersIndex = lower.indexOf('providers');
  if (
    subscriptionIndex < 0
    || resourceGroupIndex < 0
    || providersIndex < 0
    || !raw[subscriptionIndex + 1]
    || !raw[resourceGroupIndex + 1]
    || !raw[providersIndex + 1]
  ) {
    return null;
  }
  return {
    subscriptionId: raw[subscriptionIndex + 1],
    resourceGroupName: raw[resourceGroupIndex + 1],
    providerNamespace: raw[providersIndex + 1],
    typePath: raw.slice(providersIndex + 2).join('/'),
  };
}

export function parseSubscriptionDeploymentRoute(pathname) {
  const raw = segments(pathname);
  const lower = raw.map(segment => segment.toLowerCase());
  if (lower[0] !== 'subscriptions' || !raw[1]) return null;
  if (lower[2] !== 'providers' || lower[3] !== 'microsoft.resources' || lower[4] !== 'deployments' || !raw[5]) return null;
  return {
    subscriptionId: raw[1],
    deploymentName: raw[5],
  };
}

export function parseResourceGroupDeploymentRoute(pathname) {
  const rgRoute = parseResourceGroupRoute(pathname);
  if (!rgRoute || !rgRoute.resourceGroupName) return null;
  const lowerRest = rgRoute.rest.map(segment => segment.toLowerCase());
  if (lowerRest[0] !== 'providers' || lowerRest[1] !== 'microsoft.resources' || lowerRest[2] !== 'deployments' || !rgRoute.rest[3]) return null;
  return {
    subscriptionId: rgRoute.subscriptionId,
    resourceGroupName: rgRoute.resourceGroupName,
    deploymentName: rgRoute.rest[3],
  };
}

export function splitArmArgs(text) {
  const args = [];
  let current = '';
  let quote = null;
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function unquoteArm(text) {
  const trimmed = String(text).trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parameterContext(template, deploymentParameters = {}, inherited = {}) {
  const parameters = { ...inherited };
  for (const [name, definition] of Object.entries(template?.parameters ?? {})) {
    if (definition.defaultValue !== undefined) parameters[name] = definition.defaultValue;
  }
  for (const [name, definition] of Object.entries(deploymentParameters ?? {})) {
    if (definition?.value !== undefined) parameters[name] = definition.value;
  }
  return parameters;
}

export function deploymentResourceId(subscriptionId, resourceGroupName, name) {
  return resourceGroupName
    ? `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${name}`
    : `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/${name}`;
}

export function templateOutputs(template, context) {
  return Object.fromEntries(Object.entries(template.outputs ?? {}).map(([name, output]) => [
    name,
    {
      type: output.type ?? 'string',
      value: evaluateArmValue(output.value, context),
    },
  ]));
}

export function addTemplateVariables(template, context) {
  const variables = {};
  const variableContext = { ...context, __variables: variables };
  for (const [name, value] of Object.entries(template?.variables ?? {})) {
    variables[name] = evaluateArmValue(value, variableContext);
  }
  context.__variables = variables;
  return context;
}

export function evaluateArmExpression(expression, parameters) {
  const text = expression.trim();
  const parameterMatch = text.match(/^parameters\('([^']+)'\)$/);
  if (parameterMatch) return parameters[parameterMatch[1]];

  const variableMatch = text.match(/^variables\('([^']+)'\)$/);
  if (variableMatch) return parameters.__variables?.[variableMatch[1]];

  if (text === 'subscription().subscriptionId') return parameters.__subscriptionId;
  if (text === 'resourceGroup().name') return parameters.__resourceGroupName;

  const formatMatch = text.match(/^format\((.*)\)$/s);
  if (formatMatch) {
    const [formatString, ...args] = splitArmArgs(formatMatch[1]);
    return args.reduce(
      (acc, arg, index) => acc.replaceAll(`{${index}}`, String(evaluateArmValue(arg, parameters))),
      unquoteArm(formatString),
    );
  }

  const concatMatch = text.match(/^concat\((.*)\)$/s);
  if (concatMatch) return splitArmArgs(concatMatch[1]).map(arg => evaluateArmValue(arg, parameters)).join('');

  const resourceIdMatch = text.match(/^(subscriptionResourceId|resourceId)\((.*)\)$/s);
  if (resourceIdMatch) return splitArmArgs(resourceIdMatch[2]).map(arg => evaluateArmValue(arg, parameters)).join('/');

  const extensionResourceIdMatch = text.match(/^extensionResourceId\((.*)\)$/s);
  if (extensionResourceIdMatch) {
    const [base, type, ...names] = splitArmArgs(extensionResourceIdMatch[1]).map(arg => evaluateArmValue(arg, parameters));
    return `${base}/providers/${type}/${names.join('/')}`;
  }

  const referenceOutputMatch = text.match(/^reference\((.*)\)\.outputs\.([^.\]]+)\.value$/s);
  if (referenceOutputMatch) {
    const [target] = splitArmArgs(referenceOutputMatch[1]);
    const targetId = String(evaluateArmValue(target, parameters));
    const targetName = targetId.split('/').at(-1);
    const outputs =
      parameters.__deploymentOutputs?.[targetId.toLowerCase()] ??
      parameters.__deploymentOutputs?.[targetId] ??
      parameters.__deploymentOutputs?.[targetName] ??
      Object.entries(parameters.__deploymentOutputs ?? {})
        .find(([key]) => key.toLowerCase().endsWith(`/${String(targetName).toLowerCase()}`))?.[1];
    return outputs?.[referenceOutputMatch[2]]?.value ?? `[${text}]`;
  }

  return expression;
}

export function evaluateArmValue(value, parameters) {
  if (Array.isArray(value)) return value.map(item => evaluateArmValue(item, parameters));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluateArmValue(item, parameters)]));
  }
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) return unquoteArm(trimmed);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return evaluateArmExpression(trimmed.slice(1, -1), parameters);
  if (/^parameters\('|^variables\('|^format\(|^concat\(|^resourceId\(|^subscriptionResourceId\(|^extensionResourceId\(|^reference\(|^subscription\(\)\.|^resourceGroup\(\)\./.test(trimmed)) return evaluateArmExpression(trimmed, parameters);
  return value;
}

export function sortDeploymentOperations(operations) {
  return operations.sort((left, right) => {
    if (left.kind === 'resourceGroup' && right.kind !== 'resourceGroup') return -1;
    if (right.kind === 'resourceGroup' && left.kind !== 'resourceGroup') return 1;
    if (left.kind !== 'resource' || right.kind !== 'resource') return 0;
    const leftSegments = left.providerRoute.typePath.split('/').length;
    const rightSegments = right.providerRoute.typePath.split('/').length;
    return leftSegments - rightSegments;
  });
}

export function expandDeploymentTemplate({
  template,
  parameters = {},
  subscriptionId,
  resourceGroupName,
  inheritedParameters = {},
  deploymentOutputs = {},
  deploymentName,
}) {
  const context = addTemplateVariables(template, {
    ...parameterContext(template, parameters, inheritedParameters),
    __subscriptionId: subscriptionId,
    __resourceGroupName: resourceGroupName,
    __deploymentOutputs: deploymentOutputs,
  });
  const operations = [];
  for (const rawResource of template?.resources ?? []) {
    if (rawResource.type === 'Microsoft.Resources/resourceGroups') {
      const resource = evaluateArmValue(rawResource, context);
      operations.push({
        kind: 'resourceGroup',
        subscriptionId,
        name: resource.name,
        body: { location: resource.location, tags: resource.tags ?? {} },
      });
      continue;
    }
    if (rawResource.type === 'Microsoft.Resources/deployments') {
      const resource = {
        type: rawResource.type,
        name: evaluateArmValue(rawResource.name, context),
        resourceGroup: evaluateArmValue(rawResource.resourceGroup, context),
        properties: rawResource.properties ?? {},
      };
      const nestedParameters = {};
      for (const [name, definition] of Object.entries(resource.properties?.parameters ?? {})) {
        nestedParameters[name] = { value: evaluateArmValue(definition.value, context) };
      }
      const nestedResourceGroupName = resource.resourceGroup ?? resourceGroupName;
      const nested = expandDeploymentTemplate({
        template: resource.properties?.template,
        parameters: nestedParameters,
        subscriptionId,
        resourceGroupName: nestedResourceGroupName,
        inheritedParameters: context,
        deploymentOutputs,
        deploymentName: resource.name,
      });
      operations.push(...nested.operations);
      const nestedId = deploymentResourceId(subscriptionId, nestedResourceGroupName, resource.name);
      deploymentOutputs[nestedId.toLowerCase()] = nested.outputs;
      deploymentOutputs[resource.name] = nested.outputs;
      continue;
    }
    const resource = evaluateArmValue(rawResource, context);
    const [providerNamespace, ...types] = resource.type.split('/');
    const names = String(resource.name).split('/');
    if (types.length !== names.length) {
      operations.push({
        kind: 'error',
        status: 400,
        code: 'InvalidTemplate',
        message: `Resource type/name segment mismatch for ${resource.type} ${resource.name}`,
      });
      continue;
    }
    operations.push({
      kind: 'resource',
      providerRoute: {
        subscriptionId,
        resourceGroupName,
        providerNamespace,
        typePath: types.flatMap((type, index) => [type, names[index]]).join('/'),
      },
      apiVersion: resource.apiVersion,
      body: Object.fromEntries(['location', 'sku', 'kind', 'properties', 'identity', 'tags']
        .filter(key => resource[key] !== undefined)
        .map(key => [key, resource[key]])),
    });
  }
  const outputs = templateOutputs(template, context);
  if (deploymentName) deploymentOutputs[deploymentName] = outputs;
  return {
    operations: sortDeploymentOperations(operations),
    outputs,
    deploymentOutputs,
  };
}

export function azureNotFoundFor({ method, resourceType, providerRoute, store }) {
  const providerResourceNotFound = new Set([
    'Microsoft.ApiManagement/service/apis',
    'Microsoft.DBforMySQL/flexibleServers/databases',
    'Microsoft.DBforPostgreSQL/flexibleServers/databases',
    'Microsoft.DocumentDB/databaseAccounts/sqlDatabases',
    'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers',
  ]);
  const getUsesResourceNotFound = new Set([
    'Microsoft.Cdn/profiles/afdEndpoints',
    'Microsoft.Cdn/profiles/endpoints',
    'Microsoft.DataMigration/services/projects',
    'Microsoft.Synapse/workspaces/sqlPools',
  ]);
  const collectionUsesParentNotFound = new Set([
    'Microsoft.NetApp/netAppAccounts/capacityPools/volumes',
  ]);
  const parent = nearestCapabilityParentRoute(providerRoute);
  const isCollection = isCollectionRoute(providerRoute);
  if (isCollection && collectionUsesParentNotFound.has(resourceType) && (!parent || !store.getResource(parent))) {
    return {
      status: 404,
      code: 'ParentResourceNotFound',
      message: `The parent resource for ${providerRoute.typePath} was not found.`,
    };
  }
  if (parent) {
    const parentResource = store.getResource(parent);
    if (!parentResource) {
      if (providerResourceNotFound.has(resourceType) || (method === 'GET' && !isCollection && getUsesResourceNotFound.has(resourceType))) {
        return {
          status: 404,
          code: 'ResourceNotFound',
          message: `The Resource '${providerRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`,
        };
      }
      return {
        status: 404,
        code: 'ParentResourceNotFound',
        message: `The parent resource for ${providerRoute.typePath} was not found.`,
      };
    }
  }

  if (method === 'GET') {
    return {
      status: 404,
      code: 'ResourceNotFound',
      message: `The Resource '${providerRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`,
    };
  }

  if (method === 'DELETE') {
    return {
      status: 204,
      body: undefined,
    };
  }

  return null;
}

export function webAppConfigRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Web') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 4) return null;
  if (parts[0] !== 'sites' || parts[2] !== 'config') return null;
  return {
    siteRoute: {
      subscriptionId: providerRoute.subscriptionId,
      resourceGroupName: providerRoute.resourceGroupName,
      providerNamespace: providerRoute.providerNamespace,
      typePath: `${parts[0]}/${parts[1]}`,
    },
    configName: parts[3],
  };
}

export function synthesizeWebAppConfig({ providerRoute, apiVersion, store }) {
  const configRoute = webAppConfigRoute(providerRoute);
  if (!configRoute || configRoute.configName !== 'web') return null;
  const site = store.getResource(configRoute.siteRoute);
  if (!site) return null;
  return {
    id: `/subscriptions/${providerRoute.subscriptionId}/resourceGroups/${providerRoute.resourceGroupName}/providers/${providerRoute.providerNamespace}/${providerRoute.typePath}`,
    name: `${site.name}/web`,
    type: 'Microsoft.Web/sites/config',
    location: site.location,
    properties: {
      ...(site.properties?.siteConfig ?? {}),
    },
    apiVersion,
  };
}
