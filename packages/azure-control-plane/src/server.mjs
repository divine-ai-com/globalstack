import { createServer } from 'node:http';
import { URL } from 'node:url';
import { allCapabilities, capabilityForResourceType, officialEmulatorOptions, tier1Capabilities, tier2Capabilities } from '../../core/src/azure-tier1-capabilities.mjs';
import { buildHybridCoverage, summarizeCapability } from '../../core/src/hybrid-coverage.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { acceptsDeleteMissing, capturedProviderValidation, capturedPutMissingParent, storageAccountNotProvisioned, storagePostDeleteNotFound } from './provider-validation.mjs';

async function readBody(req) {
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

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message, details = []) {
  sendJson(res, status, {
    error: {
      code,
      message,
      details,
    },
  });
}

function facadeOrigin(req) {
  const proto = req.headers['x-forwarded-proto'] ?? (req.socket?.encrypted ? 'https' : 'http');
  return `${proto}://${req.headers.host ?? '127.0.0.1'}`;
}

const localIdentity = {
  subscriptionId: process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000',
  tenantId: process.env.GLOBALSTACK_AZURE_TENANT_ID ?? process.env.ARM_TENANT_ID ?? '00000000-0000-0000-0000-000000000000',
  clientId: process.env.GLOBALSTACK_AZURE_CLIENT_ID ?? process.env.ARM_CLIENT_ID ?? '11111111-1111-1111-1111-111111111111',
  clientSecret: process.env.GLOBALSTACK_AZURE_CLIENT_SECRET ?? process.env.ARM_CLIENT_SECRET ?? 'globalstack',
  accessToken: process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token',
};

function requireGlobalStackAuthToken() {
  const token = process.env.GLOBALSTACK_AUTH_TOKEN;
  if (!token || token.trim() === '') {
    throw new Error('GLOBALSTACK_AUTH_TOKEN must be exported before starting the GlobalStack Azure emulator.');
  }
  return token;
}

function tokenTenant(pathname) {
  const raw = segments(pathname);
  const oauthIndex = raw.findIndex(segment => segment.toLowerCase() === 'oauth2');
  if (oauthIndex <= 0) return localIdentity.tenantId;
  return raw[oauthIndex - 1];
}

function discoveryTenant(pathname) {
  const raw = segments(pathname);
  const wellKnownIndex = raw.findIndex(segment => segment.toLowerCase() === '.well-known');
  if (wellKnownIndex <= 0) return localIdentity.tenantId;
  if (raw[wellKnownIndex - 1]?.toLowerCase() === 'v2.0' && wellKnownIndex >= 2) {
    return raw[wellKnownIndex - 2];
  }
  return raw[wellKnownIndex - 1] ?? localIdentity.tenantId;
}

function isPublicRoute(method, pathname) {
  if (method === 'GET' && pathname === '/_globalstack/health') return true;
  if (method === 'GET' && pathname === '/_globalstack/capabilities') return true;
  if (method === 'GET' && pathname === '/_globalstack/coverage') return true;
  if (method === 'GET' && pathname === '/metadata/endpoints') return true;
  if (method === 'GET' && pathname.endsWith('/.well-known/openid-configuration')) return true;
  if (method === 'GET' && pathname.endsWith('/discovery/v2.0/keys')) return true;
  if (method === 'POST' && (pathname.endsWith('/oauth2/token') || pathname.endsWith('/oauth2/v2.0/token'))) return true;
  return false;
}

function authenticationFailure(message = 'Authentication failed. The Authorization header is missing or invalid.') {
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

function authorizationFailure(subscriptionId) {
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

function requestSubscriptionId(pathname) {
  const raw = segments(pathname);
  const index = raw.findIndex(segment => segment.toLowerCase() === 'subscriptions');
  return index >= 0 ? raw[index + 1] : null;
}

function authorizeRequest(req, method, pathname) {
  if (isPublicRoute(method, pathname)) return null;
  const auth = String(req.headers.authorization ?? '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return authenticationFailure();
  if (match[1] !== localIdentity.accessToken) return authenticationFailure('The access token is not valid for the GlobalStack Azure local identity.');
  const subscriptionId = requestSubscriptionId(pathname);
  if (subscriptionId && subscriptionId !== localIdentity.subscriptionId) return authorizationFailure(subscriptionId);
  return null;
}

function segments(pathname) {
  return pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
}

function lowerSegments(pathname) {
  return segments(pathname).map(segment => segment.toLowerCase());
}

function parseResourceGroupRoute(pathname) {
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

function parseProviderRoute(pathname) {
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

function providerOperations() {
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

function providerNamespaces() {
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

function providerNamespace(namespace) {
  return providerNamespaces().find(item => item.namespace.toLowerCase() === String(namespace).toLowerCase()) ?? {
    namespace,
    registrationState: 'Registered',
    resourceTypes: [],
  };
}

function azureEnvironmentMetadata(origin) {
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

function tokenResponse() {
  const now = Math.floor(Date.now() / 1000);
  return {
    token_type: 'Bearer',
    expires_in: 3600,
    ext_expires_in: 3600,
    expires_on: String(now + 3600),
    access_token: 'globalstack-local-token',
  };
}

function openIdConfiguration(req, pathname) {
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

function validateTokenRequest(pathname, body) {
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

function exactCapabilityForResourceType(type) {
  const normalized = String(type ?? '').toLowerCase();
  return allCapabilities.find(capability =>
    capability.resourceTypes.some(resourceType => resourceType.toLowerCase() === normalized)
  ) ?? null;
}

function parentResourceTypes(resourceType) {
  const parts = resourceType.split('/');
  const provider = parts[0];
  const types = parts.slice(1);
  const parents = [];
  for (let length = types.length - 1; length >= 1; length -= 1) {
    parents.push(`${provider}/${types.slice(0, length).join('/')}`);
  }
  return parents;
}

function parentRoute(providerRoute) {
  const parts = providerRoute.typePath.split('/');
  if (parts.length <= 2) return null;
  return {
    ...providerRoute,
    typePath: parts.slice(0, -2).join('/'),
  };
}

function nearestCapabilityParentRoute(providerRoute) {
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

function isCollectionRoute(providerRoute) {
  return providerRoute.typePath.split('/').length % 2 === 1;
}

function storageAccountParentRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.Storage') return null;
  const parts = providerRoute.typePath.split('/');
  const index = parts.indexOf('storageAccounts');
  if (index < 0 || !parts[index + 1]) return null;
  return {
    ...providerRoute,
    typePath: `storageAccounts/${parts[index + 1]}`,
  };
}

function eventGridTopicListKeysRoute(providerRoute) {
  if (providerRoute.providerNamespace !== 'Microsoft.EventGrid') return null;
  const parts = providerRoute.typePath.split('/');
  if (parts.length !== 3 || parts[0] !== 'topics' || parts[2].toLowerCase() !== 'listkeys') return null;
  return {
    ...providerRoute,
    typePath: `topics/${parts[1]}`,
  };
}

function aksCredentialActionRoute(providerRoute) {
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

function serverFarmRouteFromId(serverFarmId) {
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

function siteReferencesExistingServerFarm(store, resourceType, body) {
  if (resourceType !== 'Microsoft.Web/sites' || !body.properties?.serverFarmId) return false;
  const route = serverFarmRouteFromId(body.properties.serverFarmId);
  return Boolean(route && store.getResource(route));
}

function providerRouteFromResourceId(resourceId) {
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

function parseSubscriptionDeploymentRoute(pathname) {
  const raw = segments(pathname);
  const lower = raw.map(segment => segment.toLowerCase());
  if (lower[0] !== 'subscriptions' || !raw[1]) return null;
  if (lower[2] !== 'providers' || lower[3] !== 'microsoft.resources' || lower[4] !== 'deployments' || !raw[5]) return null;
  return {
    subscriptionId: raw[1],
    deploymentName: raw[5],
  };
}

function parseResourceGroupDeploymentRoute(pathname) {
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

function splitArmArgs(text) {
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

function unquoteArm(text) {
  const trimmed = String(text).trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parameterContext(template, deploymentParameters = {}, inherited = {}) {
  const parameters = { ...inherited };
  for (const [name, definition] of Object.entries(template?.parameters ?? {})) {
    if (definition.defaultValue !== undefined) parameters[name] = definition.defaultValue;
  }
  for (const [name, definition] of Object.entries(deploymentParameters ?? {})) {
    if (definition?.value !== undefined) parameters[name] = definition.value;
  }
  return parameters;
}

function deploymentResourceId(subscriptionId, resourceGroupName, name) {
  return resourceGroupName
    ? `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${name}`
    : `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/${name}`;
}

function templateOutputs(template, context) {
  return Object.fromEntries(Object.entries(template.outputs ?? {}).map(([name, output]) => [
    name,
    {
      type: output.type ?? 'string',
      value: evaluateArmValue(output.value, context),
    },
  ]));
}

function addTemplateVariables(template, context) {
  const variables = {};
  const variableContext = { ...context, __variables: variables };
  for (const [name, value] of Object.entries(template?.variables ?? {})) {
    variables[name] = evaluateArmValue(value, variableContext);
  }
  context.__variables = variables;
  return context;
}

function evaluateArmExpression(expression, parameters) {
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

function evaluateArmValue(value, parameters) {
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

function sortDeploymentOperations(operations) {
  return operations.sort((left, right) => {
    if (left.kind === 'resourceGroup' && right.kind !== 'resourceGroup') return -1;
    if (right.kind === 'resourceGroup' && left.kind !== 'resourceGroup') return 1;
    if (left.kind !== 'resource' || right.kind !== 'resource') return 0;
    const leftSegments = left.providerRoute.typePath.split('/').length;
    const rightSegments = right.providerRoute.typePath.split('/').length;
    return leftSegments - rightSegments;
  });
}

function expandDeploymentTemplate({
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

function azureNotFoundFor({ method, resourceType, providerRoute, store }) {
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

export function createArmRequestHandler({ store = new ResourceStore(), persist = false } = {}) {
  void persist;

  function putProviderResource({ providerRoute, apiVersion, body }) {
    const resourceType = `${providerRoute.providerNamespace}/${providerRoute.typePath.split('/').filter((_, index) => index % 2 === 0).join('/')}`;
    const capability = capabilityForResourceType(resourceType);
    if (!apiVersion) {
      return {
        status: 400,
        body: {
          error: {
            code: 'MissingApiVersionParameter',
            message: 'The api-version query parameter (?api-version=) is required for all requests.',
            details: [{
              code: 'GlobalStackStrictAzureSurface',
              message: 'GlobalStack rejects incomplete ARM-shaped requests instead of inventing a successful response.',
            }],
          },
        },
      };
    }
    if (!capability) {
      return {
        status: 501,
        body: {
          error: {
            code: 'GlobalStackResourceTypeNotEmulated',
            message: `GlobalStack does not emulate Azure resource type ${resourceType}.`,
            details: [{
              code: 'ExplicitGap',
              message: 'Add this exact resource type to the capability registry, bind a real emulator or metadata facade, and add conformance tests before returning success.',
            }],
          },
        },
      };
    }

    if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
      return {
        status: 404,
        body: {
          error: {
            code: 'ResourceGroupNotFound',
            message: `Resource group '${providerRoute.resourceGroupName}' could not be found.`,
            details: [],
          },
        },
      };
    }

    const validationBeforeParentTypes = new Set([
      'Microsoft.DataMigration/services/projects',
      'Microsoft.NetApp/netAppAccounts/capacityPools/volumes',
      'Microsoft.Synapse/workspaces/sqlPools',
    ]);
    const referencesExistingServerFarm = siteReferencesExistingServerFarm(store, resourceType, body);
    const validationBeforeParent = validationBeforeParentTypes.has(resourceType)
      ? capturedProviderValidation({ method: 'PUT', resourceType, body, providerRoute, referencesExistingServerFarm })
      : null;
    if (validationBeforeParent) return validationBeforeParent;

    if (resourceType === 'Microsoft.Cdn/profiles/afdEndpoints' || resourceType === 'Microsoft.Cdn/profiles/endpoints') {
      const parentIndependentValidation = capturedProviderValidation({ method: 'PUT', resourceType, body, providerRoute, referencesExistingServerFarm });
      if (['LocationRequired', 'InvalidResourceLocation', 'InvalidResourceName'].includes(parentIndependentValidation?.body?.error?.code)) {
        return parentIndependentValidation;
      }
    }

    const putMissingParent = capturedPutMissingParent(resourceType);
    const parent = nearestCapabilityParentRoute(providerRoute);
    if (putMissingParent && (!parent || !store.getResource(parent))) return putMissingParent;

    const storageParent = storageAccountParentRoute(providerRoute);
    const storageParentState = storageParent ? store.resourceProvisioningState(storageParent) : null;
    if (storageParent && resourceType !== 'Microsoft.Storage/storageAccounts' && storageParentState && storageParentState !== 'Succeeded') {
      return storageAccountNotProvisioned();
    }

    if (resourceType === 'Microsoft.App/containerApps' && body.properties?.managedEnvironmentId) {
      const environmentRoute = providerRouteFromResourceId(body.properties.managedEnvironmentId);
      if (!environmentRoute || !store.getResource(environmentRoute)) {
        return {
          status: 404,
          body: {
            error: {
              code: 'ManagedEnvironmentNotFound',
              message: `The managed environment '${body.properties.managedEnvironmentId}' was not found.`,
              details: [],
            },
          },
        };
      }
    }

    const validation = capturedProviderValidation({ method: 'PUT', resourceType, body, providerRoute, referencesExistingServerFarm });
    if (validation) return validation;

    const result = store.putResource({
      ...providerRoute,
      body,
      apiVersion,
      capability,
    });
    const storageCreatedOkTypes = new Set([
      'Microsoft.Storage/storageAccounts/queueServices/queues',
      'Microsoft.Storage/storageAccounts/tableServices/tables',
    ]);
    const createdStatus = storageCreatedOkTypes.has(resourceType) ? 200 : 201;
    const asyncBodyTypes = new Set([
      'Microsoft.ApiManagement/service',
      'Microsoft.Web/serverfarms',
      'Microsoft.Web/sites',
      'Microsoft.ServiceBus/namespaces',
    ]);
    return {
      status: result.asyncAccepted && !asyncBodyTypes.has(resourceType) ? 202 : result.created ? createdStatus : 200,
      body: result.asyncAccepted && !asyncBodyTypes.has(resourceType) ? undefined : result.resource,
      asyncOperation: result.asyncAccepted,
    };
  }

  function applyDeployment({ subscriptionId, resourceGroupName, body }) {
    const template = body.properties?.template;
    if (!template) {
      return {
        status: 400,
        body: {
          error: {
            code: 'InvalidTemplate',
            message: 'Deployment request must include properties.template.',
            details: [],
          },
        },
      };
    }
    const expanded = expandDeploymentTemplate({
      template,
      parameters: body.properties?.parameters ?? {},
      subscriptionId,
      resourceGroupName,
      deploymentName: body.name ?? 'deployment',
    });
    const operations = expanded.operations;
    const steps = [];
    for (const operation of operations) {
      if (operation.kind === 'error') {
        return {
          status: operation.status,
          body: {
            error: {
              code: operation.code,
              message: operation.message,
              details: steps,
            },
          },
        };
      }
      if (operation.kind === 'resourceGroup') {
        const result = store.putResourceGroup(operation.subscriptionId, operation.name, operation.body);
        steps.push({
          operation: 'PUT',
          id: result.resourceGroup.id,
          status: result.created ? 201 : 200,
        });
        continue;
      }
      const result = putProviderResource(operation);
      if (result.status === 202 || result.asyncOperation) {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const ready = store.getResource(operation.providerRoute);
          if (ready?.properties?.provisioningState === 'Succeeded') break;
        }
      }
      steps.push({
        operation: 'PUT',
        id: `/subscriptions/${operation.providerRoute.subscriptionId}/resourceGroups/${operation.providerRoute.resourceGroupName}/providers/${operation.providerRoute.providerNamespace}/${operation.providerRoute.typePath}`,
        status: result.status,
        error: result.body?.error,
      });
      if (![200, 201, 202].includes(result.status)) {
        return {
          status: result.status,
          body: result.body,
        };
      }
    }
    return {
      status: 201,
      body: {
        id: resourceGroupName
          ? `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Resources/deployments/${body.name ?? 'deployment'}`
          : `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/deployments/${body.name ?? 'deployment'}`,
        name: body.name ?? 'deployment',
        type: 'Microsoft.Resources/deployments',
        location: body.location,
        properties: {
          provisioningState: 'Succeeded',
          mode: body.properties?.mode ?? 'Incremental',
          timestamp: new Date().toISOString(),
          duration: 'PT0S',
          outputs: expanded.outputs,
          globalstackDeploymentSteps: steps,
        },
      },
    };
  }

  return async (req, res) => {
    const startedAt = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const method = req.method.toUpperCase();

    try {
      const authError = authorizeRequest(req, method, pathname);
      if (authError) return sendJson(res, authError.status, authError.body, authError.headers);

      if (method === 'GET' && pathname === '/_globalstack/health') {
        return sendJson(res, 200, {
          status: 'ok',
          service: 'globalstack-azure-control-plane',
          time: new Date().toISOString(),
        });
      }

      if (method === 'GET' && pathname === '/_globalstack/capabilities') {
        return sendJson(res, 200, {
          tier1: tier1Capabilities.map(summarizeCapability),
          tier2: tier2Capabilities.map(summarizeCapability),
          all: allCapabilities.map(summarizeCapability),
          officialEmulators: officialEmulatorOptions,
        });
      }

      if (method === 'GET' && pathname === '/_globalstack/coverage') {
        return sendJson(res, 200, buildHybridCoverage());
      }

      if (method === 'GET' && pathname === '/metadata/endpoints') {
        return sendJson(res, 200, azureEnvironmentMetadata(facadeOrigin(req)));
      }

      if (method === 'GET' && pathname.endsWith('/.well-known/openid-configuration')) {
        return sendJson(res, 200, openIdConfiguration(req, pathname));
      }

      if (method === 'GET' && pathname.endsWith('/discovery/v2.0/keys')) {
        return sendJson(res, 200, { keys: [] });
      }

      if (method === 'POST' && (pathname.endsWith('/oauth2/token') || pathname.endsWith('/oauth2/v2.0/token'))) {
        const body = await readBody(req);
        const tokenError = validateTokenRequest(pathname, body);
        if (tokenError) return sendJson(res, tokenError.status, tokenError.body);
        return sendJson(res, 200, tokenResponse());
      }

      if (method === 'GET' && lowerSegments(pathname).join('/') === 'tenants') {
        return sendJson(res, 200, {
          value: [
            {
              id: '/tenants/00000000-0000-0000-0000-000000000000',
              tenantId: '00000000-0000-0000-0000-000000000000',
            },
          ],
        });
      }

      if (method === 'GET' && lowerSegments(pathname).includes('operationstatuses')) {
        store.completeAsyncProvisioning();
        return sendJson(res, 200, {
          status: 'Succeeded',
          properties: {
            provisioningState: 'Succeeded',
          },
        });
      }

      if (method === 'GET' && lowerSegments(pathname).join('/') === 'subscriptions/providers/microsoft.resources/operations') {
        return sendJson(res, 200, providerOperations());
      }

      const rawSegments = segments(pathname);
      const lowered = rawSegments.map(segment => segment.toLowerCase());
      if (lowered[0] === 'subscriptions' && rawSegments[1] && rawSegments.length === 2 && method === 'GET') {
        return sendJson(res, 200, {
          id: `/subscriptions/${rawSegments[1]}`,
          subscriptionId: rawSegments[1],
          tenantId: '00000000-0000-0000-0000-000000000000',
          displayName: 'GlobalStack Local Subscription',
          state: 'Enabled',
        });
      }

      if (lowered[0] === 'subscriptions' && rawSegments[1] && lowered[2] === 'locations' && method === 'GET') {
        return sendJson(res, 200, {
          value: ['eastus', 'eastus2', 'westus2', 'westeurope'].map(name => ({
            id: `/subscriptions/${rawSegments[1]}/locations/${name}`,
            name,
            displayName: name,
            regionalDisplayName: name,
          })),
        });
      }

      if (lowered[0] === 'subscriptions' && rawSegments[1] && lowered[2] === 'providers' && !rawSegments[3] && method === 'GET') {
        return sendJson(res, 200, {
          value: providerNamespaces(),
        });
      }

      if (lowered[0] === 'subscriptions' && rawSegments[1] && lowered[2] === 'providers' && rawSegments[3] && !rawSegments[4] && method === 'GET') {
        return sendJson(res, 200, providerNamespace(rawSegments[3]));
      }

      if (lowered[0] === 'subscriptions' && rawSegments[1] && lowered[2] === 'providers' && rawSegments[3] && lowered[4] === 'register' && method === 'POST') {
        return sendJson(res, 200, providerNamespace(rawSegments[3]));
      }

      const subscriptionDeploymentRoute = parseSubscriptionDeploymentRoute(pathname);
      if (subscriptionDeploymentRoute && method === 'PUT') {
        const body = await readBody(req);
        const result = applyDeployment({
          subscriptionId: subscriptionDeploymentRoute.subscriptionId,
          resourceGroupName: null,
          body: {
            ...body,
            name: subscriptionDeploymentRoute.deploymentName,
          },
        });
        return sendJson(res, result.status, result.body);
      }

      const resourceGroupDeploymentRoute = parseResourceGroupDeploymentRoute(pathname);
      if (resourceGroupDeploymentRoute && method === 'PUT') {
        const body = await readBody(req);
        const result = applyDeployment({
          subscriptionId: resourceGroupDeploymentRoute.subscriptionId,
          resourceGroupName: resourceGroupDeploymentRoute.resourceGroupName,
          body: {
            ...body,
            name: resourceGroupDeploymentRoute.deploymentName,
          },
        });
        return sendJson(res, result.status, result.body);
      }

      const rgRoute = parseResourceGroupRoute(pathname);
      if (rgRoute && rgRoute.rest.length === 0) {
        if (!rgRoute.resourceGroupName && method === 'GET') {
          return sendJson(res, 200, {
            value: store.listResourceGroups(rgRoute.subscriptionId),
          });
        }

        if (rgRoute.resourceGroupName && method === 'PUT') {
          const body = await readBody(req);
          const result = store.putResourceGroup(rgRoute.subscriptionId, rgRoute.resourceGroupName, body);
          return sendJson(res, result.created ? 201 : 200, result.resourceGroup);
        }

        if (rgRoute.resourceGroupName && method === 'GET') {
          const resourceGroup = store.getResourceGroup(rgRoute.subscriptionId, rgRoute.resourceGroupName);
          if (!resourceGroup) return sendError(res, 404, 'ResourceGroupNotFound', `Resource group ${rgRoute.resourceGroupName} was not found.`);
          return sendJson(res, 200, resourceGroup);
        }

        if (rgRoute.resourceGroupName && method === 'DELETE') {
          store.deleteResourceGroup(rgRoute.subscriptionId, rgRoute.resourceGroupName);
          return sendJson(res, 200, {
            status: 'Deleted',
            id: `/subscriptions/${rgRoute.subscriptionId}/resourceGroups/${rgRoute.resourceGroupName}`,
          });
        }
      }

      const providerRoute = parseProviderRoute(pathname);
      if (providerRoute && providerRoute.typePath) {
        const apiVersion = url.searchParams.get('api-version');
        const resourceType = `${providerRoute.providerNamespace}/${providerRoute.typePath.split('/').filter((_, index) => index % 2 === 0).join('/')}`;
        const capability = capabilityForResourceType(resourceType);

        if (!apiVersion) {
          return sendError(res, 400, 'MissingApiVersionParameter', 'The api-version query parameter (?api-version=) is required for all requests.', [
            {
              code: 'GlobalStackStrictAzureSurface',
              message: 'GlobalStack rejects incomplete ARM-shaped requests instead of inventing a successful response.',
            },
          ]);
        }

        const eventGridListKeysRoute = eventGridTopicListKeysRoute(providerRoute);
        if (eventGridListKeysRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const keys = store.listEventGridTopicKeys(eventGridListKeysRoute);
          if (!keys) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${eventGridListKeysRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          return sendJson(res, 200, keys);
        }

        const aksCredentialRoute = aksCredentialActionRoute(providerRoute);
        if (aksCredentialRoute) {
          if (method !== 'POST') return sendError(res, 405, 'MethodNotAllowed', 'AKS credential actions support POST.');
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const credentials = store.listAksCredentials(aksCredentialRoute.route, aksCredentialRoute.role);
          if (!credentials) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${aksCredentialRoute.route.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          return sendJson(res, 200, credentials);
        }

        if (!capability) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Add this exact resource type to the capability registry, bind a real emulator or metadata facade, and add conformance tests before returning success.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.Insights'
          && (
            resourceType.startsWith('Microsoft.Insights/metricAlerts/')
            || resourceType.startsWith('Microsoft.Insights/actionGroups/')
            || resourceType.startsWith('Microsoft.Insights/diagnosticSettings/')
          )
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Monitor child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.EventGrid'
          && (
            resourceType.startsWith('Microsoft.EventGrid/systemTopics/')
            || resourceType.startsWith('Microsoft.EventGrid/topics/')
            || resourceType.startsWith('Microsoft.EventGrid/eventSubscriptions/')
          )
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Event Grid child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.Network'
          && (
            (resourceType.startsWith('Microsoft.Network/virtualNetworks/') && resourceType !== 'Microsoft.Network/virtualNetworks/subnets')
            || resourceType.startsWith('Microsoft.Network/privateEndpoints/')
            || resourceType.startsWith('Microsoft.Network/dnsZones/')
            || resourceType.startsWith('Microsoft.Network/privateDnsZones/')
            || resourceType.startsWith('Microsoft.Network/applicationGateways/')
            || resourceType.startsWith('Microsoft.Network/loadBalancers/')
            || resourceType.startsWith('Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies/')
          )
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Network child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.DBforPostgreSQL'
          && resourceType.startsWith('Microsoft.DBforPostgreSQL/flexibleServers/')
          && resourceType !== 'Microsoft.DBforPostgreSQL/flexibleServers/databases'
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure PostgreSQL child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.DBforMySQL'
          && resourceType.startsWith('Microsoft.DBforMySQL/flexibleServers/')
          && resourceType !== 'Microsoft.DBforMySQL/flexibleServers/databases'
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure MySQL child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.DocumentDB'
          && resourceType.startsWith('Microsoft.DocumentDB/databaseAccounts/')
          && ![
            'Microsoft.DocumentDB/databaseAccounts/sqlDatabases',
            'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers',
          ].includes(resourceType)
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Cosmos DB child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.Cache'
          && resourceType.startsWith('Microsoft.Cache/redis/')
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Redis child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.Logic'
          && resourceType.startsWith('Microsoft.Logic/workflows/')
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Logic workflow child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.Cdn'
          && (
            resourceType.startsWith('Microsoft.Cdn/profiles/')
            || resourceType.startsWith('Microsoft.Cdn/operationResults')
            || resourceType.startsWith('Microsoft.Cdn/operationStatus')
          )
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure CDN and Front Door child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.AppConfiguration'
          && resourceType.startsWith('Microsoft.AppConfiguration/configurationStores/')
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure App Configuration child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.App'
          && (
            resourceType.startsWith('Microsoft.App/managedEnvironments/')
            || resourceType.startsWith('Microsoft.App/containerApps/')
          )
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Container Apps child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.EventHub'
          && resourceType.startsWith('Microsoft.EventHub/namespaces/')
          && resourceType !== 'Microsoft.EventHub/namespaces/eventhubs'
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Event Hubs child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.Storage'
          && resourceType.startsWith('Microsoft.Storage/storageAccounts/fileServices/shares/')
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Files child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.NetApp'
          && resourceType.startsWith('Microsoft.NetApp/netAppAccounts/capacityPools/volumes/')
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure NetApp Files child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.Synapse'
          && resourceType.startsWith('Microsoft.Synapse/workspaces/')
          && resourceType !== 'Microsoft.Synapse/workspaces/sqlPools'
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Synapse workspace child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.DataMigration'
          && resourceType.startsWith('Microsoft.DataMigration/services/')
          && resourceType !== 'Microsoft.DataMigration/services/projects'
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Database Migration Service child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (method === 'PUT') {
          const body = await readBody(req);
          const result = putProviderResource({ providerRoute, apiVersion, body });
          const operationId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
          const operationUrl = `${facadeOrigin(req)}/subscriptions/${providerRoute.subscriptionId}/providers/Microsoft.Resources/operationStatuses/${operationId}?api-version=2022-09-01`;
          return sendJson(res, result.status, result.body, result.asyncOperation ? {
            'azure-asyncoperation': operationUrl,
            location: operationUrl,
            'retry-after': '0',
          } : {});
        }

        if (method === 'GET') {
          const validation = capturedProviderValidation({ method, resourceType, providerRoute });
          if (validation) return sendJson(res, validation.status, validation.body);
          const storageParent = storageAccountParentRoute(providerRoute);
          const storageParentState = storageParent ? store.resourceProvisioningState(storageParent) : null;
          if (storageParent && resourceType !== 'Microsoft.Storage/storageAccounts' && storageParentState && storageParentState !== 'Succeeded') {
            return sendJson(res, 409, storageAccountNotProvisioned().body);
          }
          if (isCollectionRoute(providerRoute)) {
            const parent = nearestCapabilityParentRoute(providerRoute);
            if ((resourceType === 'Microsoft.NetApp/netAppAccounts/capacityPools/volumes' && !parent) || (parent && !store.getResource(parent))) {
              const notFound = azureNotFoundFor({ method, resourceType, providerRoute, store });
              return sendError(res, notFound.status, notFound.code, notFound.message);
            }
            return sendJson(res, 200, {
              value: store.listResourcesByType(providerRoute),
            });
          }
          const resource = store.getResource(providerRoute);
          if (!resource) {
            const storageParent = storageAccountParentRoute(providerRoute);
            const storageNotFound = storageParent && store.resourceProvisioningState(storageParent) === 'Succeeded'
              ? storagePostDeleteNotFound(resourceType)
              : null;
            if (storageNotFound) return sendJson(res, storageNotFound.status, storageNotFound.body);
            const notFound = azureNotFoundFor({ method, resourceType, providerRoute, store });
            return sendError(res, notFound.status, notFound.code, notFound.message);
          }
          return sendJson(res, 200, resource);
        }

        if (method === 'DELETE') {
          const validation = capturedProviderValidation({ method, resourceType, providerRoute });
          if (validation) return sendJson(res, validation.status, validation.body);
          const storageParent = storageAccountParentRoute(providerRoute);
          const storageParentState = storageParent ? store.resourceProvisioningState(storageParent) : null;
          if (storageParent && resourceType !== 'Microsoft.Storage/storageAccounts' && storageParentState && storageParentState !== 'Succeeded') {
            return sendJson(res, 409, storageAccountNotProvisioned().body);
          }
          const existed = store.deleteResource(providerRoute);
          if (!existed) {
            if (acceptsDeleteMissing(resourceType)) return sendJson(res, 204);
            const notFound = azureNotFoundFor({ method, resourceType, providerRoute, store });
            if (notFound.body === undefined && notFound.status === 204) return sendJson(res, 204);
            return sendError(res, notFound.status, notFound.code, notFound.message);
          }
          if (resourceType === 'Microsoft.ServiceBus/namespaces') return sendJson(res, 202);
          if (resourceType === 'Microsoft.Storage/storageAccounts') return sendJson(res, 200);
          if (resourceType.startsWith('Microsoft.Storage/storageAccounts/')) {
            const storageDeleteNoContentTypes = new Set([
              'Microsoft.Storage/storageAccounts/queueServices/queues',
              'Microsoft.Storage/storageAccounts/tableServices/tables',
            ]);
            return sendJson(res, storageDeleteNoContentTypes.has(resourceType) ? 204 : 200);
          }
          return sendJson(res, 200, {
            status: 'Deleted',
            id: `/subscriptions/${providerRoute.subscriptionId}/resourceGroups/${providerRoute.resourceGroupName}/providers/${providerRoute.providerNamespace}/${providerRoute.typePath}`,
          });
        }
      }

      if (rgRoute && rgRoute.resourceGroupName && rgRoute.rest.length === 0 && method === 'GET') {
        return sendJson(res, 200, {
          value: store.listResources(rgRoute.subscriptionId, rgRoute.resourceGroupName),
        });
      }

      return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No GlobalStack Azure route handles ${method} ${pathname}.`, [
        {
          code: 'ExplicitGap',
          message: 'Add this route through the capability registry and conformance tests before claiming support.',
        },
      ]);
    } catch (error) {
      return sendError(res, 500, 'GlobalStackInternalError', error instanceof Error ? error.message : String(error));
    } finally {
      store.recordCall({
        method,
        path: pathname,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      });
    }
  };
}

export function createArmServer(options = {}) {
  return createServer(createArmRequestHandler(options));
}

export function startArmServer({
  port = Number(process.env.GLOBALSTACK_ARM_PORT ?? 4570),
  host = process.env.GLOBALSTACK_ARM_HOST ?? '127.0.0.1',
  requireProductAuth = true,
} = {}) {
  if (requireProductAuth) requireGlobalStackAuthToken();
  const server = createArmServer();
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`GlobalStack Azure ARM facade listening on http://${host}:${actualPort}`);
  });
  return server;
}
