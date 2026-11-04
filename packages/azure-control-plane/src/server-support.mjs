import { URL } from 'node:url';
import { allCapabilities, supportedCapabilities } from '../../core/src/azure-tier1-capabilities.mjs';
import { summarizeCapability } from '../../core/src/hybrid-coverage.mjs';
const requestBodies = new WeakMap();

export function readBody(req) {
  if (!requestBodies.has(req)) requestBodies.set(req, parseRequestBody(req));
  return requestBodies.get(req);
}

export const maxArmBodyBytes = 8 * 1024 * 1024;

function bodyTooLarge(req) {
  req.resume();
  const error = new Error('ARM request body exceeds the 8 MiB limit.');
  error.code = 'GLOBALSTACK_BODY_TOO_LARGE';
  return error;
}

async function parseRequestBody(req) {
  if (Number(req.headers['content-length']) > maxArmBodyBytes) throw bodyTooLarge(req);
  let bytes = 0;
  const chunks = [];
  // Preserve the socket long enough to return 413 when a chunked body exceeds the limit.
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > maxArmBodyBytes) throw bodyTooLarge(req);
    chunks.push(Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString('utf8');
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
  subscriptionId: process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? process.env.ARM_SUBSCRIPTION_ID ?? process.env.AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000',
  tenantId: process.env.GLOBALSTACK_AZURE_TENANT_ID ?? process.env.ARM_TENANT_ID ?? process.env.AZURE_TENANT_ID ?? '00000000-0000-0000-0000-000000000000',
  clientId: process.env.GLOBALSTACK_AZURE_CLIENT_ID ?? process.env.ARM_CLIENT_ID ?? process.env.AZURE_CLIENT_ID ?? '11111111-1111-1111-1111-111111111111',
  objectId: process.env.GLOBALSTACK_AZURE_OBJECT_ID ?? '22222222-2222-2222-2222-222222222222',
  clientSecret: process.env.GLOBALSTACK_AZURE_CLIENT_SECRET ?? process.env.ARM_CLIENT_SECRET ?? process.env.AZURE_CLIENT_SECRET ?? 'globalstack',
};

function base64UrlEncodeJson(value) {
  return Buffer.from(JSON.stringify(value))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function deterministicJwtAccessToken() {
  if (process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN) {
    return process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN;
  }
  const header = {
    alg: 'none',
    typ: 'JWT',
  };
  const payload = {
    aud: 'https://management.azure.com/',
    iss: `https://sts.windows.net/${localIdentity.tenantId}/`,
    iat: 1704067200,
    nbf: 1704067200,
    exp: 4070908800,
    aio: 'globalstack-local-token',
    app_displayname: 'GlobalStack Local Identity',
    appid: localIdentity.clientId,
    appidacr: '1',
    idtyp: 'app',
    oid: localIdentity.objectId,
    rh: 'globalstack-local-identity',
    sub: localIdentity.objectId,
    tid: localIdentity.tenantId,
    uti: 'globalstack-local-uti',
    ver: '1.0',
    xms_tcdt: '1704067200',
  };
  return `${base64UrlEncodeJson(header)}.${base64UrlEncodeJson(payload)}.`;
}

localIdentity.accessToken = deterministicJwtAccessToken();

function activeSubscriptionId() {
  return process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID
    ?? process.env.ARM_SUBSCRIPTION_ID
    ?? process.env.AZURE_SUBSCRIPTION_ID
    ?? localIdentity.subscriptionId;
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
          message: `Use the deterministic local Azure identity for this emulator: subscription ${activeSubscriptionId()}, tenant ${localIdentity.tenantId}.`,
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
          message: `GlobalStack Azure accepts only local subscription ${activeSubscriptionId()} unless GLOBALSTACK_AZURE_SUBSCRIPTION_ID is changed.`,
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
  const presentedToken = match[1];
  const acceptedTokens = new Set([localIdentity.accessToken, 'globalstack-local-token']);
  if (!acceptedTokens.has(presentedToken)) {
    return authenticationFailure('The access token is not valid for the GlobalStack Azure local identity.');
  }
  const subscriptionId = requestSubscriptionId(pathname);
  if (subscriptionId && subscriptionId !== activeSubscriptionId()) return authorizationFailure(subscriptionId);
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
  return {
    token_type: 'Bearer',
    expires_in: 3600,
    ext_expires_in: 3600,
    expires_on: '4070908800',
    access_token: localIdentity.accessToken,
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
    claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'auth_time', 'acr', 'nonce', 'preferred_username', 'name', 'tid', 'ver', 'at_hash', 'oid', 'appid', 'idtyp'],
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
  return supportedCapabilities.find(capability =>
    capability.resourceTypes.some(resourceType => resourceType.toLowerCase() === normalized)
  ) ?? null;
}

function stripParentQualifiedName(name, parentName) {
  const rawName = String(name ?? '');
  const rawParentName = String(parentName ?? '');
  if (!rawName || !rawParentName) return rawName;
  return rawName.startsWith(`${rawParentName}/`) ? rawName.slice(rawParentName.length + 1) : rawName;
}

export function normalizeProviderRoute(providerRoute) {
  if (!providerRoute?.typePath) return providerRoute;
  const parts = providerRoute.typePath.split('/');

  if (providerRoute.providerNamespace === 'Microsoft.Storage') {
    if (parts[0] !== 'storageAccounts') return providerRoute;
    const normalizeStorageChild = (serviceType, childType) => {
      if (parts.length !== 6 || parts[1] !== serviceType || parts[2] !== childType || !parts[3] || !parts[4] || !parts[5]) return null;
      return {
        ...providerRoute,
        typePath: `storageAccounts/${parts[3]}/${serviceType}/${parts[4]}/${childType}/${parts[5]}`,
      };
    };
    return normalizeStorageChild('blobServices', 'containers')
      ?? normalizeStorageChild('queueServices', 'queues')
      ?? normalizeStorageChild('fileServices', 'shares')
      ?? normalizeStorageChild('tableServices', 'tables')
      ?? providerRoute;
  }

  if (providerRoute.providerNamespace === 'Microsoft.DocumentDB') {
    if (parts[0] !== 'databaseAccounts' || !parts[1]) return providerRoute;
    const accountName = parts[1];
    const sqlDatabasesIndex = parts.indexOf('sqlDatabases');
    if (sqlDatabasesIndex < 0) return providerRoute;
    const containersIndex = parts.indexOf('containers', sqlDatabasesIndex + 1);
    const rawDatabaseName = parts
      .slice(sqlDatabasesIndex + 1, containersIndex < 0 ? parts.length : containersIndex)
      .join('/');
    const databaseName = stripParentQualifiedName(rawDatabaseName, accountName);
    if (!databaseName) return providerRoute;

    if (containersIndex < 0) {
      return {
        ...providerRoute,
        typePath: `databaseAccounts/${accountName}/sqlDatabases/${databaseName}`,
      };
    }

    const rawContainerName = parts.slice(containersIndex + 1).join('/');
    const containerName = stripParentQualifiedName(
      stripParentQualifiedName(rawContainerName, `${accountName}/${databaseName}`),
      databaseName,
    );
    if (!containerName) return providerRoute;
    return {
      ...providerRoute,
      typePath: `databaseAccounts/${accountName}/sqlDatabases/${databaseName}/containers/${containerName}`,
    };
  }

  if (providerRoute.providerNamespace === 'Microsoft.Cdn') {
    if (parts[0] !== 'profiles' || !parts[1]) return providerRoute;
    const profileName = parts[1];

    if (parts[2] === 'afdEndpoints' && parts[3]) {
      const routesIndex = parts.indexOf('routes', 3);
      const rawEndpointName = parts.slice(3, routesIndex < 0 ? parts.length : routesIndex).join('/');
      const endpointName = stripParentQualifiedName(rawEndpointName, profileName);
      if (!endpointName) return providerRoute;
      if (routesIndex < 0) {
        return {
          ...providerRoute,
          typePath: `profiles/${profileName}/afdEndpoints/${endpointName}`,
        };
      }
      const rawRouteName = parts.slice(routesIndex + 1).join('/');
      const routeName = stripParentQualifiedName(rawRouteName, endpointName);
      if (!routeName) return providerRoute;
      return {
        ...providerRoute,
        typePath: `profiles/${profileName}/afdEndpoints/${endpointName}/routes/${routeName}`,
      };
    }

    if (parts[2] === 'endpoints' && parts[3]) {
      const endpointName = stripParentQualifiedName(parts.slice(3).join('/'), profileName);
      if (!endpointName) return providerRoute;
      return {
        ...providerRoute,
        typePath: `profiles/${profileName}/endpoints/${endpointName}`,
      };
    }

    if (parts[2] === 'originGroups' && parts[3]) {
      const originsIndex = parts.indexOf('origins', 3);
      const rawOriginGroupName = parts.slice(3, originsIndex < 0 ? parts.length : originsIndex).join('/');
      const originGroupName = stripParentQualifiedName(rawOriginGroupName, profileName);
      if (!originGroupName) return providerRoute;
      if (originsIndex < 0) {
        return {
          ...providerRoute,
          typePath: `profiles/${profileName}/originGroups/${originGroupName}`,
        };
      }
      const rawOriginName = parts.slice(originsIndex + 1).join('/');
      const originName = stripParentQualifiedName(rawOriginName, originGroupName);
      if (!originName) return providerRoute;
      return {
        ...providerRoute,
        typePath: `profiles/${profileName}/originGroups/${originGroupName}/origins/${originName}`,
      };
    }

    if (parts[2] === 'securityPolicies' && parts[3]) {
      const securityPolicyName = stripParentQualifiedName(parts.slice(3).join('/'), profileName);
      if (!securityPolicyName) return providerRoute;
      return {
        ...providerRoute,
        typePath: `profiles/${profileName}/securityPolicies/${securityPolicyName}`,
      };
    }
  }

  if (providerRoute.providerNamespace === 'Microsoft.EventHub') {
    if (parts[0] !== 'namespaces' || !parts[1]) return providerRoute;

    if (parts.length === 4 && parts[1] === 'eventhubs' && parts[2] && parts[3]) {
      return {
        ...providerRoute,
        typePath: `namespaces/${parts[2]}/eventhubs/${parts[3]}`,
      };
    }

    const namespaceName = parts[1];
    if (parts.length === 4 && parts[2] === 'eventhubs' && parts[3]) {
      return {
        ...providerRoute,
        typePath: `namespaces/${namespaceName}/eventhubs/${stripParentQualifiedName(parts[3], namespaceName)}`,
      };
    }

    if (parts.length === 5 && parts[2] === 'eventhubs' && parts[3] && parts[4]) {
      return {
        ...providerRoute,
        typePath: `namespaces/${namespaceName}/eventhubs/${stripParentQualifiedName(`${parts[3]}/${parts[4]}`, namespaceName)}`,
      };
    }

    return providerRoute;
  }

  if (providerRoute.providerNamespace !== 'Microsoft.ServiceBus') return providerRoute;
  if (parts[0] !== 'namespaces' || !parts[1]) return providerRoute;

  if (parts.length === 4 && ['queues', 'topics'].includes(parts[1]) && parts[2] && parts[3]) {
    return {
      ...providerRoute,
      typePath: `namespaces/${parts[2]}/${parts[1]}/${parts[3]}`,
    };
  }

  if (parts.length === 6 && parts[1] === 'topics' && parts[2] === 'subscriptions' && parts[3] && parts[4] && parts[5]) {
    return {
      ...providerRoute,
      typePath: `namespaces/${parts[3]}/topics/${parts[4]}/subscriptions/${parts[5]}`,
    };
  }

  const namespaceName = parts[1];

  if (parts.length === 4 && parts[2] === 'queues' && parts[3]) {
    return {
      ...providerRoute,
      typePath: `namespaces/${namespaceName}/queues/${stripParentQualifiedName(parts[3], namespaceName)}`,
    };
  }

  if (parts.length === 5 && parts[2] === 'queues' && parts[3] && parts[4]) {
    return {
      ...providerRoute,
      typePath: `namespaces/${namespaceName}/queues/${stripParentQualifiedName(`${parts[3]}/${parts[4]}`, namespaceName)}`,
    };
  }

  if (parts.length === 4 && parts[2] === 'topics' && parts[3]) {
    return {
      ...providerRoute,
      typePath: `namespaces/${namespaceName}/topics/${stripParentQualifiedName(parts[3], namespaceName)}`,
    };
  }

  if (parts.length === 5 && parts[2] === 'topics' && parts[3] && parts[4]) {
    return {
      ...providerRoute,
      typePath: `namespaces/${namespaceName}/topics/${stripParentQualifiedName(`${parts[3]}/${parts[4]}`, namespaceName)}`,
    };
  }

  if (parts.length === 6 && parts[2] === 'topics' && parts[4] === 'subscriptions' && parts[3] && parts[5]) {
    const topicName = stripParentQualifiedName(parts[3], namespaceName);
    return {
      ...providerRoute,
      typePath: `namespaces/${namespaceName}/topics/${topicName}/subscriptions/${stripParentQualifiedName(parts[5], topicName)}`,
    };
  }

  if (parts.length === 7 && parts[2] === 'topics' && parts[5] === 'subscriptions' && parts[3] && parts[4] && parts[6]) {
    const topicName = stripParentQualifiedName(`${parts[3]}/${parts[4]}`, namespaceName);
    return {
      ...providerRoute,
      typePath: `namespaces/${namespaceName}/topics/${topicName}/subscriptions/${stripParentQualifiedName(parts[6], topicName)}`,
    };
  }

  return providerRoute;
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

export function apiManagementProductApiLinkedApiRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ApiManagement') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 6) return null;
  if (parts[0] !== 'service' || parts[2] !== 'products' || parts[4] !== 'apis') return null;
  if (!parts[1] || !parts[3] || !parts[5]) return null;
  return {
    ...providerRoute,
    typePath: `service/${parts[1]}/apis/${parts[5]}`,
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

export function storageAccountListServiceSasRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Storage') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'storageAccounts' || parts[2].toLowerCase() !== 'listservicesas') return null;
  return {
    ...providerRoute,
    typePath: `storageAccounts/${parts[1]}`,
  };
}

export function operationalInsightsWorkspaceSharedKeysRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.OperationalInsights') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'workspaces' || parts[2].toLowerCase() !== 'sharedkeys') return null;
  return {
    ...providerRoute,
    typePath: `workspaces/${parts[1]}`,
  };
}

export function serviceBusNamespaceAuthorizationRuleListKeysRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ServiceBus') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length < 5 || parts[0] !== 'namespaces' || !parts[1]) return null;
  const authorizationIndex = parts.findIndex((part, index) => index > 1 && part.toLowerCase() === 'authorizationrules');
  if (authorizationIndex !== 2 || parts.at(-1)?.toLowerCase() !== 'listkeys') return null;
  const namespaceName = parts[1];
  const rawAuthorizationRuleName = parts.slice(authorizationIndex + 1, -1).join('/');
  if (!rawAuthorizationRuleName) return null;
  const authorizationRuleName = rawAuthorizationRuleName.startsWith(`${namespaceName}/`)
    ? rawAuthorizationRuleName.slice(namespaceName.length + 1)
    : rawAuthorizationRuleName;
  if (!authorizationRuleName) return null;
  return {
    namespaceRoute: {
      ...providerRoute,
      typePath: `namespaces/${namespaceName}`,
    },
    authorizationRuleRoute: {
      subscriptionId: providerRoute.subscriptionId,
      resourceGroupName: providerRoute.resourceGroupName,
      providerNamespace: providerRoute.providerNamespace,
      typePath: `namespaces/${namespaceName}/AuthorizationRules/${authorizationRuleName}`,
    },
    namespaceName,
    authorizationRuleName,
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

export function scopedEventGridEventSubscriptionRoute(providerRoute) {
  const marker = '/providers/Microsoft.EventGrid/eventSubscriptions/';
  const index = providerRoute.typePath.indexOf(marker);
  if (index < 0) return null;
  const scopeTypePath = providerRoute.typePath.slice(0, index);
  const subscriptionName = providerRoute.typePath.slice(index + marker.length);
  if (!scopeTypePath || !subscriptionName) return null;
  return {
    scopeRoute: {
      ...providerRoute,
      typePath: scopeTypePath,
    },
    subscriptionRoute: {
      subscriptionId: providerRoute.subscriptionId,
      resourceGroupName: providerRoute.resourceGroupName,
      providerNamespace: 'Microsoft.EventGrid',
      typePath: `eventSubscriptions/${subscriptionName}`,
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

export function aksManagedClusterActionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ContainerService') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'managedClusters') return null;
  const action = parts[2]?.toLowerCase();
  if (!['resetserviceprincipalprofile', 'rotateclustercertificates'].includes(action)) return null;
  return {
    route: {
      ...providerRoute,
      typePath: `managedClusters/${parts[1]}`,
    },
    action,
  };
}

export function aksUpgradeProfileRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ContainerService') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 4 || parts[0] !== 'managedClusters' || parts[2].toLowerCase() !== 'upgradeprofiles' || parts[3].toLowerCase() !== 'default') return null;
  return {
    route: {
      ...providerRoute,
      typePath: `managedClusters/${parts[1]}`,
    },
  };
}

export function aksAgentPoolActionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ContainerService') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'managedClusters' || parts[2] !== 'agentPools') return null;
  const action = parts[4]?.toLowerCase();
  if (action !== 'upgradenodeimageversion') return null;
  return {
    clusterRoute: {
      ...providerRoute,
      typePath: `managedClusters/${parts[1]}`,
    },
    agentPoolRoute: {
      ...providerRoute,
      typePath: `managedClusters/${parts[1]}/agentPools/${parts[3]}`,
    },
    poolName: parts[3],
    action,
  };
}

export function aksRunCommandRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ContainerService') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'managedClusters' || parts[2].toLowerCase() !== 'runcommand') return null;
  return {
    route: {
      ...providerRoute,
      typePath: `managedClusters/${parts[1]}`,
    },
  };
}

export function aksCommandResultRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.ContainerService') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 4 || parts[0] !== 'managedClusters' || parts[2] !== 'commandResults' || !parts[3]) return null;
  return {
    route: {
      ...providerRoute,
      typePath: `managedClusters/${parts[1]}`,
    },
    commandId: parts[3],
  };
}

export function metricAlertStatusRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Insights') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'metricAlerts' || parts[2].toLowerCase() !== 'status') return null;
  return {
    alertRoute: {
      ...providerRoute,
      typePath: `metricAlerts/${parts[1]}`,
    },
    alertName: parts[1],
  };
}

export function metricQueryExtensionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Insights') return null;
  const parts = providerRoute.typePath.split('/');
  const extensionIndex = parts.findIndex((part, index) =>
    index > 0
    && part.toLowerCase() === 'providers'
    && parts[index + 1]?.toLowerCase() === 'microsoft.insights'
    && parts[index + 2]?.toLowerCase() === 'metrics'
  );
  if (extensionIndex < 0) return null;
  return {
    scopeRoute: {
      ...providerRoute,
      providerNamespace: providerRoute.providerNamespace,
      typePath: parts.slice(0, extensionIndex).join('/'),
    },
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

export function dataMigrationTaskCollectionRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.DataMigration') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 5 || parts[0] !== 'services' || parts[2] !== 'projects' || parts[4] !== 'tasks') return null;
  return {
    projectRoute: {
      ...providerRoute,
      typePath: `services/${parts[1]}/projects/${parts[3]}`,
    },
    serviceName: parts[1],
    projectName: parts[3],
  };
}

export function dataMigrationTaskItemRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.DataMigration') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 6 || parts[0] !== 'services' || parts[2] !== 'projects' || parts[4] !== 'tasks') return null;
  return {
    projectRoute: {
      ...providerRoute,
      typePath: `services/${parts[1]}/projects/${parts[3]}`,
    },
    taskRoute: {
      ...providerRoute,
      typePath: `services/${parts[1]}/projects/${parts[3]}/tasks/${parts[5]}`,
    },
    serviceName: parts[1],
    projectName: parts[3],
    taskName: parts[5],
  };
}

export function dataMigrationTaskCommandRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.DataMigration') return null;
  const parts = providerRoute.typePath.split('/');
  if (
    parts.length !== 7
    || parts[0] !== 'services'
    || parts[2] !== 'projects'
    || parts[4] !== 'tasks'
    || parts[6].toLowerCase() !== 'command'
  ) return null;
  return {
    taskRoute: {
      ...providerRoute,
      typePath: `services/${parts[1]}/projects/${parts[3]}/tasks/${parts[5]}`,
    },
    serviceName: parts[1],
    projectName: parts[3],
    taskName: parts[5],
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
  for (const [name, definition] of Object.entries(template?.parameters ?? {})) {
    if (deploymentParameters[name]?.value === undefined && definition.defaultValue !== undefined) {
      parameters[name] = evaluateArmValue(definition.defaultValue, parameters);
    }
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

function armResourcePath(resourceType, names) {
  const [namespace, ...types] = String(resourceType).split('/');
  if (!namespace || !types.length || names.length !== types.length) {
    throw new Error('ARM resource ID requires one name for each resource type segment.');
  }
  return `${namespace}/${types.map((type, index) => `${type}/${names[index]}`).join('/')}`;
}

export function evaluateArmExpression(expression, parameters) {
  const text = expression.trim();
  const parameterMatch = text.match(/^parameters\('([^']+)'\)$/);
  if (parameterMatch) return parameters[parameterMatch[1]];

  const variableMatch = text.match(/^variables\('([^']+)'\)$/);
  if (variableMatch) return parameters.__variables?.[variableMatch[1]];

  if (text === 'subscription().subscriptionId') return parameters.__subscriptionId;
  if (text === 'resourceGroup().name') return parameters.__resourceGroupName;
  if (text === 'resourceGroup().location') return parameters.__resourceGroupLocation;
  if (text === 'resourceGroup().id') return `/subscriptions/${parameters.__subscriptionId}/resourceGroups/${parameters.__resourceGroupName}`;
  if (text === 'subscription().tenantId') return localIdentity.tenantId;

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
  if (resourceIdMatch) {
    const args = splitArmArgs(resourceIdMatch[2]).map(arg => evaluateArmValue(arg, parameters));
    const typeIndex = args.findIndex(arg => typeof arg === 'string' && /^[^/]+\.[^/]+\//.test(arg));
    if (typeIndex < 0 || typeIndex > 2) throw new Error('Unsupported ARM resource ID arguments.');
    const path = armResourcePath(args[typeIndex], args.slice(typeIndex + 1));
    if (resourceIdMatch[1] === 'subscriptionResourceId') {
      if (typeIndex > 1) throw new Error('subscriptionResourceId accepts at most one subscription argument.');
      const subscriptionId = typeIndex === 1 ? args[0] : parameters.__subscriptionId;
      if (!subscriptionId) throw new Error('ARM resource ID requires a subscription context.');
      return `/subscriptions/${subscriptionId}/providers/${path}`;
    }
    const subscriptionId = typeIndex === 2 ? args[0] : parameters.__subscriptionId;
    const resourceGroupName = typeIndex > 0 ? args[typeIndex - 1] : parameters.__resourceGroupName;
    if (!subscriptionId) throw new Error('ARM resource ID requires a subscription context.');
    return `/subscriptions/${subscriptionId}${resourceGroupName ? `/resourceGroups/${resourceGroupName}` : ''}/providers/${path}`;
  }

  const extensionResourceIdMatch = text.match(/^extensionResourceId\((.*)\)$/s);
  if (extensionResourceIdMatch) {
    const [base, type, ...names] = splitArmArgs(extensionResourceIdMatch[1]).map(arg => evaluateArmValue(arg, parameters));
    return `${String(base).replace(/\/$/, '')}/providers/${armResourcePath(type, names)}`;
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
    const leftSegments = left.providerRoute.typePath.split('/').length + (left.providerRoute.scopeId?.split('/').length ?? 0);
    const rightSegments = right.providerRoute.typePath.split('/').length + (right.providerRoute.scopeId?.split('/').length ?? 0);
    return leftSegments - rightSegments;
  });
}

function armTemplateResourceEntries(template) {
  const resources = template?.resources ?? [];
  if (Array.isArray(resources)) return resources.map(rawResource => ({ symbolicName: null, rawResource }));
  if (resources && typeof resources === 'object') {
    return Object.entries(resources).map(([symbolicName, rawResource]) => ({ symbolicName, rawResource }));
  }
  return [];
}

export function expandDeploymentTemplate({
  template,
  parameters = {},
  subscriptionId,
  resourceGroupName,
  resourceGroupLocation,
  resourceGroupLocations = {},
  inheritedParameters = {},
  deploymentOutputs = {},
  deploymentName,
}) {
  const groupLocations = { ...resourceGroupLocations };
  if (resourceGroupName && resourceGroupLocation !== undefined) groupLocations[resourceGroupName.toLowerCase()] = resourceGroupLocation;
  const context = addTemplateVariables(template, {
    ...parameterContext(template, parameters, {
      ...inheritedParameters,
      __subscriptionId: subscriptionId,
      __resourceGroupName: resourceGroupName,
      __resourceGroupLocation: groupLocations[resourceGroupName?.toLowerCase()],
    }),
    __subscriptionId: subscriptionId,
    __resourceGroupName: resourceGroupName,
    __deploymentOutputs: deploymentOutputs,
  });
  // Resolve group locations before nested templates, regardless of declaration order.
  for (const { rawResource } of armTemplateResourceEntries(template)) {
    if (rawResource.type !== 'Microsoft.Resources/resourceGroups') continue;
    const group = evaluateArmValue(rawResource, context);
    groupLocations[String(group.name).toLowerCase()] = group.location;
  }
  const operations = [];
  const symbolicResourceNames = new Map();
  function emitResource(rawResource, symbolicName = null, parentResource = null) {
    if (rawResource.type === 'Microsoft.Resources/resourceGroups') {
      const resource = evaluateArmValue(rawResource, context);
      if (symbolicName) symbolicResourceNames.set(symbolicName, resource.name);
      operations.push({
        kind: 'resourceGroup',
        subscriptionId,
        name: resource.name,
        body: { location: resource.location, tags: resource.tags ?? {} },
      });
      return;
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
        resourceGroupLocations: groupLocations,
        inheritedParameters: context,
        deploymentOutputs,
        deploymentName: resource.name,
      });
      operations.push(...nested.operations);
      const nestedId = deploymentResourceId(subscriptionId, nestedResourceGroupName, resource.name);
      deploymentOutputs[nestedId.toLowerCase()] = nested.outputs;
      deploymentOutputs[resource.name] = nested.outputs;
      if (symbolicName) symbolicResourceNames.set(symbolicName, resource.name);
      return;
    }
    const resource = evaluateArmValue(rawResource, context);
    if (parentResource) {
      const childType = String(resource.type);
      const childName = String(resource.name);
      resource.type = childType.startsWith(`${parentResource.type}/`) ? childType : `${parentResource.type}/${childType}`;
      const typeSegments = resource.type.split('/').slice(1);
      const nameSegments = childName.split('/');
      resource.name = nameSegments.length >= typeSegments.length ? childName : `${parentResource.name}/${childName}`;
    }
    if (resource.parent) {
      const parentName = symbolicResourceNames.get(resource.parent) ?? evaluateArmValue(resource.parent, context);
      resource.name = `${parentName}/${resource.name}`;
      delete resource.parent;
    }
    const [providerNamespace, ...types] = resource.type.split('/');
    const names = String(resource.name).split('/');
    if (types.length !== names.length) {
      operations.push({
        kind: 'error',
        status: 400,
        code: 'InvalidTemplate',
        message: `Resource type/name segment mismatch for ${resource.type} ${resource.name}`,
      });
      return;
    }
    let scopeId;
    if (resource.scope !== undefined) {
      const groupId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`;
      scopeId = String(resource.scope).startsWith('/') ? String(resource.scope) : `${groupId}/providers/${resource.scope}`;
      const scopeRoute = providerRouteFromResourceId(scopeId);
      const supported = ['Microsoft.EventGrid/eventSubscriptions', 'Microsoft.Insights/diagnosticSettings'].includes(resource.type);
      if (!supported || !scopeRoute || scopeRoute.subscriptionId !== subscriptionId || scopeRoute.resourceGroupName !== resourceGroupName) {
        operations.push({ kind: 'error', status: 501, code: 'GlobalStackUnsupportedResourceScope', message: 'Only supported resource extensions in the deployment resource group are emulated.' });
        return;
      }
    }
    operations.push({
      kind: 'resource',
      providerRoute: {
        ...(scopeId ? { scopeId } : {}),
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
    if (symbolicName) symbolicResourceNames.set(symbolicName, resource.name);
    for (const { symbolicName: childSymbolicName, rawResource: childRawResource } of armTemplateResourceEntries(rawResource)) {
      emitResource(childRawResource, childSymbolicName, resource);
    }
  }

  for (const { symbolicName, rawResource } of armTemplateResourceEntries(template)) {
    emitResource(rawResource, symbolicName);
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
    'Microsoft.DataMigration/services/projects/tasks',
    'Microsoft.Synapse/workspaces/sqlPools',
  ]);
  const collectionUsesParentNotFound = new Set([
    'Microsoft.NetApp/netAppAccounts/capacityPools/volumes',
    'Microsoft.Network/privateEndpoints/privateDnsZoneGroups',
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
