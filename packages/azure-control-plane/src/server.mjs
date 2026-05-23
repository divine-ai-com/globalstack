import { createServer } from 'node:http';
import { URL } from 'node:url';
import { allCapabilities, capabilityForResourceType, officialEmulatorOptions, tier1Capabilities, tier2Capabilities } from '../../core/src/azure-tier1-capabilities.mjs';
import { buildHybridCoverage, summarizeCapability } from '../../core/src/hybrid-coverage.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { deterministicFunctionKey, deterministicHostKey } from '../../azure-data-plane/src/functions-router.mjs';
import { acceptsDeleteMissing, capturedProviderValidation, capturedPutMissingParent, storageAccountNotProvisioned, storagePostDeleteNotFound } from './provider-validation.mjs';
import {
  authorizeRequest,
  apiManagementProductApiLinkedApiRoute,
  azureEnvironmentMetadata,
  azureNotFoundFor,
  exactCapabilityForResourceType,
  eventGridTopicListKeysRoute,
  expandDeploymentTemplate,
  facadeOrigin,
  isCollectionRoute,
  lowerSegments,
  nearestCapabilityParentRoute,
  normalizeProviderRoute,
  openIdConfiguration,
  parseProviderRoute,
  parseResourceGroupRoute,
  parseResourceGroupDeploymentRoute,
  parseSubscriptionDeploymentRoute,
  providerNamespace,
  providerNamespaces,
  providerOperations,
  providerRouteFromResourceId,
  readBody,
  requireGlobalStackAuthToken,
  scopedDiagnosticSettingsRoute,
  scopedEventGridEventSubscriptionRoute,
  segments,
  sendError,
  sendJson,
  serviceBusNamespaceAuthorizationRuleListKeysRoute,
  operationalInsightsWorkspaceSharedKeysRoute,
  siteReferencesExistingServerFarm,
  storageAccountListServiceSasRoute,
  storageAccountListKeysRoute,
  storageAccountParentRoute,
  synthesizeWebAppConfig,
  tokenResponse,
  validateTokenRequest,
  webFunctionListKeysRoute,
  webFunctionListSecretsRoute,
  webFunctionRoute,
  webHostListKeysRoute,
  webListSyncFunctionTriggerStatusRoute,
  webSyncFunctionTriggersRoute,
  workflowRunActionRoute,
  workflowRunActionsCollectionRoute,
  workflowRunActionItemRoute,
  workflowRunRoute,
  workflowRunsCollectionRoute,
  workflowTriggerActionRoute,
  workflowTriggerHistoriesRoute,
  workflowTriggerHistoryActionRoute,
  workflowTriggerHistoryItemRoute,
  workflowTriggerReadRoute,
  workflowTriggerRunRoute,
  aksCredentialActionRoute,
  webAppConfigRoute,
} from './server-support.mjs';

function apiManagementApiContract(resource, { idOverride = null } = {}) {
  if (!resource) return null;
  const properties = resource.properties ?? {};
  const apiId = resource.apiId ?? String(resource.name ?? '').split('/').at(-1);
  const displayName = resource.displayName ?? properties.displayName ?? apiId;
  const apiRevision = properties.apiRevision ?? '1';
  const serviceUrl = resource.serviceUrl ?? properties.serviceUrl ?? '';
  const path = resource.path ?? properties.path ?? '';
  const protocols = resource.protocols ?? properties.protocols ?? ['https'];
  const subscriptionRequired = resource.subscriptionRequired ?? properties.subscriptionRequired ?? false;
  const subscriptionKeyParameterNames = properties.subscriptionKeyParameterNames ?? {
    header: 'Ocp-Apim-Subscription-Key',
    query: 'subscription-key',
  };
  const isCurrent = properties.isCurrent ?? true;
  const isOnline = properties.isOnline ?? true;
  return {
    id: idOverride ?? resource.id,
    name: apiId,
    type: 'Microsoft.ApiManagement/service/apis',
    apiRevision,
    apiRevisionDescription: properties.apiRevisionDescription ?? null,
    apiType: properties.apiType ?? null,
    apiVersion: properties.apiVersion ?? null,
    apiVersionDescription: properties.apiVersionDescription ?? null,
    apiVersionSet: properties.apiVersionSet ?? null,
    apiVersionSetId: properties.apiVersionSetId ?? null,
    authenticationSettings: properties.authenticationSettings ?? null,
    contact: properties.contact ?? null,
    description: properties.description ?? null,
    displayName,
    isCurrent,
    isOnline,
    license: properties.license ?? null,
    path,
    protocols,
    provisioningState: properties.provisioningState ?? 'Succeeded',
    serviceUrl,
    sourceApiId: properties.sourceApiId ?? null,
    subscriptionKeyParameterNames,
    subscriptionRequired,
    termsOfServiceUrl: properties.termsOfServiceUrl ?? null,
    properties: {
      provisioningState: properties.provisioningState ?? 'Succeeded',
      displayName,
      apiRevision,
      apiRevisionDescription: properties.apiRevisionDescription ?? null,
      apiType: properties.apiType ?? null,
      apiVersion: properties.apiVersion ?? null,
      apiVersionDescription: properties.apiVersionDescription ?? null,
      apiVersionSet: properties.apiVersionSet ?? null,
      apiVersionSetId: properties.apiVersionSetId ?? null,
      authenticationSettings: properties.authenticationSettings ?? null,
      contact: properties.contact ?? null,
      description: properties.description ?? null,
      isCurrent,
      isOnline,
      license: properties.license ?? null,
      serviceUrl,
      path,
      protocols,
      sourceApiId: properties.sourceApiId ?? null,
      subscriptionKeyParameterNames,
      subscriptionRequired,
      termsOfServiceUrl: properties.termsOfServiceUrl ?? null,
    },
  };
}

function apiManagementProductApiContract(associationResource, linkedApi) {
  if (!associationResource || !linkedApi) return null;
  return apiManagementApiContract(linkedApi);
}

function sendHeadStatus(res, status, headers = {}) {
  res.writeHead(status, {
    'content-length': 0,
    ...headers,
  });
  res.end();
}

export function createArmRequestHandler({
  store = new ResourceStore(),
  persist = false,
  onResourcePut = null,
  onResourceDelete = null,
  workflowRunner = null,
} = {}) {
  void persist;

  function putProviderResource({ providerRoute, apiVersion, body }) {
    providerRoute = normalizeProviderRoute(providerRoute);
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
    if (typeof onResourcePut === 'function') {
      onResourcePut({
        store,
        providerRoute,
        resourceType,
        body,
        apiVersion,
        capability,
        resource: result.resource,
      });
    }
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
    const deploymentBody = {
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
    };
    store.putDeployment({
      subscriptionId,
      resourceGroupName,
      deploymentName: body.name ?? 'deployment',
      body: deploymentBody,
    });
    return {
      status: 201,
      body: deploymentBody,
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
      if (subscriptionDeploymentRoute && method === 'GET') {
        const deployment = store.getDeployment({
          subscriptionId: subscriptionDeploymentRoute.subscriptionId,
          resourceGroupName: null,
          deploymentName: subscriptionDeploymentRoute.deploymentName,
        });
        if (!deployment) return sendError(res, 404, 'DeploymentNotFound', `Deployment '${subscriptionDeploymentRoute.deploymentName}' could not be found.`);
        return sendJson(res, 200, deployment);
      }

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
      if (resourceGroupDeploymentRoute && method === 'GET') {
        const deployment = store.getDeployment({
          subscriptionId: resourceGroupDeploymentRoute.subscriptionId,
          resourceGroupName: resourceGroupDeploymentRoute.resourceGroupName,
          deploymentName: resourceGroupDeploymentRoute.deploymentName,
        });
        if (!deployment) return sendError(res, 404, 'DeploymentNotFound', `Deployment '${resourceGroupDeploymentRoute.deploymentName}' could not be found.`);
        return sendJson(res, 200, deployment);
      }

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

      const providerRoute = normalizeProviderRoute(parseProviderRoute(pathname));
      if (providerRoute && providerRoute.typePath) {
        const apiVersion = url.searchParams.get('api-version');
        const resourceType = `${providerRoute.providerNamespace}/${providerRoute.typePath.split('/').filter((_, index) => index % 2 === 0).join('/')}`;
        const productApiLinkedApiRoute = apiManagementProductApiLinkedApiRoute(providerRoute);
        const webAppConfig = synthesizeWebAppConfig({ providerRoute, apiVersion, store });
        const capability = capabilityForResourceType(resourceType);

        if (!apiVersion) {
          return sendError(res, 400, 'MissingApiVersionParameter', 'The api-version query parameter (?api-version=) is required for all requests.', [
            {
              code: 'GlobalStackStrictAzureSurface',
              message: 'GlobalStack rejects incomplete ARM-shaped requests instead of inventing a successful response.',
            },
          ]);
        }

        if (apiVersion === '1900-01-01') {
          return sendError(res, 400, 'NoRegisteredProviderFound', `No registered resource provider found for location 'eastus' and API version '${apiVersion}' for type '${resourceType}'.`);
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

        const storageListKeysRoute = storageAccountListKeysRoute(providerRoute);
        if (storageListKeysRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const keys = store.listStorageAccountKeys(storageListKeysRoute);
          if (!keys) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${storageListKeysRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          return sendJson(res, 200, keys);
        }

        const storageListServiceSas = storageAccountListServiceSasRoute(providerRoute);
        if (storageListServiceSas && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const account = store.getResource(storageListServiceSas);
          if (!account) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${storageListServiceSas.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          const body = await readBody(req);
          const sas = store.listStorageAccountServiceSas(storageListServiceSas, body);
          return sendJson(res, 200, sas);
        }

        const workspaceSharedKeysRoute = operationalInsightsWorkspaceSharedKeysRoute(providerRoute);
        if (workspaceSharedKeysRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const keys = store.listOperationalInsightsWorkspaceSharedKeys(workspaceSharedKeysRoute);
          if (!keys) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${workspaceSharedKeysRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          return sendJson(res, 200, keys);
        }

        const serviceBusListKeysRoute = serviceBusNamespaceAuthorizationRuleListKeysRoute(providerRoute);
        if (serviceBusListKeysRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!store.getResource(serviceBusListKeysRoute.namespaceRoute)) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${serviceBusListKeysRoute.namespaceRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          if (!store.getResource(serviceBusListKeysRoute.authorizationRuleRoute)) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${serviceBusListKeysRoute.authorizationRuleRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          const keys = store.listServiceBusNamespaceKeys(
            serviceBusListKeysRoute.namespaceRoute,
            serviceBusListKeysRoute.authorizationRuleName,
          );
          if (!keys) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${serviceBusListKeysRoute.namespaceRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          return sendJson(res, 200, keys);
        }

        const scopedDiagnosticRoute = scopedDiagnosticSettingsRoute(providerRoute);
        if (scopedDiagnosticRoute) {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const scopeResource = store.getResource(scopedDiagnosticRoute.scopeRoute);
          if (!scopeResource) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${scopedDiagnosticRoute.scopeRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          const scopedDiagnosticIdentity = {
            ...scopedDiagnosticRoute.diagnosticRoute,
            scopeId: scopeResource.id,
          };
          const capability = exactCapabilityForResourceType('Microsoft.Insights/diagnosticSettings');
          if (method === 'PUT') {
            const body = await readBody(req);
            const validation = capturedProviderValidation({
              method,
              resourceType: 'Microsoft.Insights/diagnosticSettings',
              body,
              providerRoute: scopedDiagnosticIdentity,
            });
            if (validation) return sendJson(res, validation.status, validation.body);
            const { resource, created } = store.putResource({
              ...scopedDiagnosticIdentity,
              body: {
                ...body,
                properties: {
                  ...(body.properties ?? {}),
                  scope: scopeResource.id,
                },
              },
              apiVersion,
              capability,
            });
            return sendJson(res, created ? 201 : 200, resource);
          }
          if (method === 'GET') {
            const resource = store.getResource(scopedDiagnosticIdentity);
            if (!resource) {
              return sendError(res, 404, 'ResourceNotFound', `The Resource '${scopedDiagnosticRoute.diagnosticRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
            }
            return sendJson(res, 200, resource);
          }
          if (method === 'DELETE') {
            const existed = store.deleteResource(scopedDiagnosticIdentity);
            if (!existed) {
              return sendError(res, 404, 'ResourceNotFound', `The Resource '${scopedDiagnosticRoute.diagnosticRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
            }
            return sendJson(res, 200, {
              status: 'Deleted',
              id: `${scopeResource.id}/providers/Microsoft.Insights/${scopedDiagnosticRoute.diagnosticRoute.typePath}`,
            });
          }
        }

        const scopedEventSubscriptionRoute = scopedEventGridEventSubscriptionRoute(providerRoute);
        if (scopedEventSubscriptionRoute) {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const scopeResource = store.getResource(scopedEventSubscriptionRoute.scopeRoute);
          if (!scopeResource) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${scopedEventSubscriptionRoute.scopeRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          const scopedSubscriptionIdentity = {
            ...scopedEventSubscriptionRoute.subscriptionRoute,
            scopeId: scopeResource.id,
          };
          const capability = exactCapabilityForResourceType('Microsoft.EventGrid/eventSubscriptions');
          if (method === 'PUT') {
            const body = await readBody(req);
            const validation = capturedProviderValidation({
              method,
              resourceType: 'Microsoft.EventGrid/eventSubscriptions',
              body,
              providerRoute: scopedSubscriptionIdentity,
            });
            if (validation) return sendJson(res, validation.status, validation.body);
            const { resource, created } = store.putResource({
              ...scopedSubscriptionIdentity,
              body: {
                ...body,
                properties: {
                  ...(body.properties ?? {}),
                  scope: scopeResource.id,
                },
              },
              apiVersion,
              capability,
            });
            return sendJson(res, created ? 201 : 200, resource);
          }
          if (method === 'GET') {
            const resource = store.getResource(scopedSubscriptionIdentity);
            if (!resource) {
              return sendError(res, 404, 'ResourceNotFound', `The Resource '${scopedEventSubscriptionRoute.subscriptionRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
            }
            return sendJson(res, 200, resource);
          }
          if (method === 'DELETE') {
            const existed = store.deleteResource(scopedSubscriptionIdentity);
            if (!existed) {
              return sendError(res, 404, 'ResourceNotFound', `The Resource '${scopedEventSubscriptionRoute.subscriptionRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
            }
            return sendJson(res, 200, {
              status: 'Deleted',
              id: `${scopeResource.id}/providers/Microsoft.EventGrid/${scopedEventSubscriptionRoute.subscriptionRoute.typePath}`,
            });
          }
        }

        const webHostKeysRoute = webHostListKeysRoute(providerRoute);
        if (webHostKeysRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const site = store.getResource(webHostKeysRoute);
          if (!site) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${webHostKeysRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          return sendJson(res, 200, {
            masterKey: deterministicHostKey(site.name, 'master'),
            functionKeys: {
              default: deterministicHostKey(site.name, 'function-default'),
            },
            systemKeys: {},
          });
        }

        const webFunctionKeysRoute = webFunctionListKeysRoute(providerRoute);
        if (webFunctionKeysRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const app = store.getResource(webFunctionKeysRoute.appRoute);
          if (!app) {
            return sendError(res, 404, 'ParentResourceNotFound', `The parent resource for ${providerRoute.typePath} was not found.`);
          }
          const fn = store.getResource(webFunctionKeysRoute.functionRoute);
          if (!fn) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${webFunctionKeysRoute.functionRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          return sendJson(res, 200, {
            keys: {
              default: deterministicFunctionKey(webFunctionKeysRoute.appName, webFunctionKeysRoute.functionName),
            },
          });
        }

        const webFunctionSecretsRoute = webFunctionListSecretsRoute(providerRoute);
        if (webFunctionSecretsRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const app = store.getResource(webFunctionSecretsRoute.appRoute);
          if (!app) {
            return sendError(res, 404, 'ParentResourceNotFound', `The parent resource for ${providerRoute.typePath} was not found.`);
          }
          const fn = store.getResource(webFunctionSecretsRoute.functionRoute);
          if (!fn) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${webFunctionSecretsRoute.functionRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          const bindings = Array.isArray(fn.properties?.config?.bindings) ? fn.properties.config.bindings : [];
          const httpTrigger = bindings.find(binding => String(binding?.type ?? '').toLowerCase() === 'httptrigger');
          const route = String(httpTrigger?.route ?? webFunctionSecretsRoute.functionName).replace(/^\/+/, '');
          const key = deterministicFunctionKey(webFunctionSecretsRoute.appName, webFunctionSecretsRoute.functionName);
          const appHostName = app.properties?.defaultHostName ?? `${webFunctionSecretsRoute.appName}.azurewebsites.net`;
          return sendJson(res, 200, {
            key,
            trigger_url: `https://${appHostName}/api/${route}?code=${encodeURIComponent(key)}`,
          });
        }

        const webSyncTriggersRoute = webSyncFunctionTriggersRoute(providerRoute);
        if (webSyncTriggersRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const site = store.getResource(webSyncTriggersRoute);
          if (!site) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${webSyncTriggersRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          res.writeHead(204, { 'content-length': 0 });
          return res.end();
        }

        const webSyncTriggerStatusRoute = webListSyncFunctionTriggerStatusRoute(providerRoute);
        if (webSyncTriggerStatusRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const site = store.getResource(webSyncTriggerStatusRoute);
          if (!site) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${webSyncTriggerStatusRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          const functions = store.listResourcesByType({
            subscriptionId: providerRoute.subscriptionId,
            resourceGroupName: providerRoute.resourceGroupName,
            providerNamespace: 'Microsoft.Web',
            typePath: `sites/${webSyncTriggerStatusRoute.appName}/functions`,
          });
          return sendJson(res, 200, {
            value: functions.map(fn => ({
              functionName: String(fn.name ?? '').split('/').at(-1),
              triggerName: String(fn.name ?? '').split('/').at(-1),
              status: 'Success',
              details: null,
            })),
          });
        }

        const workflowTriggerInfoRoute = workflowTriggerReadRoute(providerRoute);
        if (workflowTriggerInfoRoute && method === 'GET') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          const workflow = store.getResource(workflowTriggerInfoRoute.workflowRoute);
          if (!workflow) {
            return sendError(res, 404, 'ResourceNotFound', `The Resource '${workflowTriggerInfoRoute.workflowRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
          }
          const trigger = workflow.properties?.definition?.triggers?.[workflowTriggerInfoRoute.triggerName];
          if (!trigger) {
            return sendError(res, 404, 'TriggerNotFound', `The workflow trigger '${workflowTriggerInfoRoute.triggerName}' was not found.`);
          }
          return sendJson(res, 200, {
            id: `${workflow.id}/triggers/${workflowTriggerInfoRoute.triggerName}`,
            name: workflowTriggerInfoRoute.triggerName,
            type: 'Microsoft.Logic/workflows/triggers',
            properties: {
              type: trigger.type,
              kind: trigger.kind ?? null,
              provisioningState: 'Succeeded',
              state: workflow.properties?.state ?? 'Enabled',
            },
          });
        }

        const workflowTriggerMgmtRoute = workflowTriggerActionRoute(providerRoute);
        if (workflowTriggerMgmtRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local trigger execution.');
          }
          if (workflowTriggerMgmtRoute.action === 'listcallbackurl') {
            const result = workflowRunner.listCallbackUrl({
              workflowName: workflowTriggerMgmtRoute.workflowName,
              triggerName: workflowTriggerMgmtRoute.triggerName,
              origin: facadeOrigin(req),
              subscriptionId: providerRoute.subscriptionId,
              resourceGroupName: providerRoute.resourceGroupName,
              apiVersion,
            });
            if (result.error) {
              return sendError(res, result.error.status, result.error.code, result.error.message);
            }
            return sendJson(res, 200, result.body);
          }
          if (workflowTriggerMgmtRoute.action === 'reset') {
            const result = workflowRunner.resetTrigger({
              workflowName: workflowTriggerMgmtRoute.workflowName,
              triggerName: workflowTriggerMgmtRoute.triggerName,
            });
            if (result.error) {
              return sendError(res, result.error.status, result.error.code, result.error.message);
            }
            return sendJson(res, 200, result.body);
          }
        }

        const workflowTriggerHistoryRoute = workflowTriggerHistoriesRoute(providerRoute);
        if (workflowTriggerHistoryRoute && method === 'GET') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local run inspection.');
          }
          const result = workflowRunner.listTriggerHistories({
            workflowName: workflowTriggerHistoryRoute.workflowName,
            triggerName: workflowTriggerHistoryRoute.triggerName,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          return sendJson(res, 200, result.body);
        }

        const workflowTriggerHistoryItem = workflowTriggerHistoryItemRoute(providerRoute);
        if (workflowTriggerHistoryItem && method === 'GET') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local run inspection.');
          }
          const result = workflowRunner.getTriggerHistory({
            workflowName: workflowTriggerHistoryItem.workflowName,
            triggerName: workflowTriggerHistoryItem.triggerName,
            historyName: workflowTriggerHistoryItem.historyName,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          return sendJson(res, 200, result.body);
        }

        const workflowTriggerHistoryAction = workflowTriggerHistoryActionRoute(providerRoute);
        if (workflowTriggerHistoryAction && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local trigger execution.');
          }
          const result = await workflowRunner.resubmitTriggerHistory({
            workflowName: workflowTriggerHistoryAction.workflowName,
            triggerName: workflowTriggerHistoryAction.triggerName,
            historyName: workflowTriggerHistoryAction.historyName,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          const runLocation = `${facadeOrigin(req)}/subscriptions/${providerRoute.subscriptionId}/resourceGroups/${providerRoute.resourceGroupName}/providers/Microsoft.Logic/workflows/${workflowTriggerHistoryAction.workflowName}/runs/${result.body.id}?api-version=${apiVersion}`;
          return sendJson(res, 202, result.body, {
            location: runLocation,
          });
        }

        const workflowTriggerRoute = workflowTriggerRunRoute(providerRoute);
        if (workflowTriggerRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local trigger execution.');
          }
          const body = await readBody(req);
          const result = await workflowRunner.invoke({
            workflowName: workflowTriggerRoute.workflowName,
            triggerName: workflowTriggerRoute.triggerName,
            body,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          const runLocation = `${facadeOrigin(req)}/subscriptions/${providerRoute.subscriptionId}/resourceGroups/${providerRoute.resourceGroupName}/providers/Microsoft.Logic/workflows/${workflowTriggerRoute.workflowName}/runs/${result.body.id}?api-version=${apiVersion}`;
          return sendJson(res, 202, result.body, {
            location: runLocation,
          });
        }

        const workflowRunItemRoute = workflowRunRoute(providerRoute);
        if (workflowRunItemRoute && method === 'GET') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local run inspection.');
          }
          const result = await workflowRunner.getRun({
            workflowName: workflowRunItemRoute.workflowName,
            runId: workflowRunItemRoute.runId,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          return sendJson(res, 200, result.body);
        }

        const workflowRunMgmtRoute = workflowRunActionRoute(providerRoute);
        if (workflowRunMgmtRoute && method === 'POST') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local run inspection.');
          }
          const result = await workflowRunner.cancelRun({
            workflowName: workflowRunMgmtRoute.workflowName,
            runId: workflowRunMgmtRoute.runId,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          return sendJson(res, 200, result.body);
        }

        const workflowRunActionsRoute = workflowRunActionsCollectionRoute(providerRoute);
        if (workflowRunActionsRoute && method === 'GET') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local run inspection.');
          }
          const result = await workflowRunner.listRunActions({
            workflowName: workflowRunActionsRoute.workflowName,
            runId: workflowRunActionsRoute.runId,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          return sendJson(res, 200, result.body);
        }

        const workflowRunActionItem = workflowRunActionItemRoute(providerRoute);
        if (workflowRunActionItem && method === 'GET') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local run inspection.');
          }
          const result = await workflowRunner.getRunAction({
            workflowName: workflowRunActionItem.workflowName,
            runId: workflowRunActionItem.runId,
            actionName: workflowRunActionItem.actionName,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          return sendJson(res, 200, result.body);
        }

        const workflowRunsRoute = workflowRunsCollectionRoute(providerRoute);
        if (workflowRunsRoute && method === 'GET') {
          if (!store.getResourceGroup(providerRoute.subscriptionId, providerRoute.resourceGroupName)) {
            return sendError(res, 404, 'ResourceGroupNotFound', `Resource group '${providerRoute.resourceGroupName}' could not be found.`);
          }
          if (!workflowRunner) {
            return sendError(res, 501, 'GlobalStackRouteNotImplemented', 'No workflow runner is configured for local run inspection.');
          }
          const result = await workflowRunner.listRuns({
            workflowName: workflowRunsRoute.workflowName,
          });
          if (result.error) {
            return sendError(res, result.error.status, result.error.code, result.error.message);
          }
          return sendJson(res, 200, result.body);
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
          if (webAppConfig && method === 'GET') {
            return sendJson(res, 200, webAppConfig);
          }
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
            || resourceType.startsWith('Microsoft.Insights/activityLogAlerts/')
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
          providerRoute.providerNamespace === 'Microsoft.Devices'
          && resourceType.startsWith('Microsoft.Devices/IotHubs/')
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure IoT Hub child and action routes must fail closed until captured and implemented.',
            },
          ]);
        }

        if (
          providerRoute.providerNamespace === 'Microsoft.DigitalTwins'
          && resourceType.startsWith('Microsoft.DigitalTwins/digitalTwinsInstances/')
          && !exactCapabilityForResourceType(resourceType)
        ) {
          return sendError(res, 501, 'GlobalStackResourceTypeNotEmulated', `GlobalStack does not emulate Azure resource type ${resourceType}.`, [
            {
              code: 'ExplicitGap',
              message: 'Unsupported Azure Digital Twins child and action routes must fail closed until captured and implemented.',
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
          if (productApiLinkedApiRoute && result.status < 400 && result.body) {
            const linkedApi = store.getResource(productApiLinkedApiRoute);
            if (!linkedApi) {
              return sendError(res, 404, 'ResourceNotFound', `The Resource '${productApiLinkedApiRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
            }
            result.body = apiManagementProductApiContract(result.body, linkedApi);
          }
          const operationId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
          const operationUrl = `${facadeOrigin(req)}/subscriptions/${providerRoute.subscriptionId}/providers/Microsoft.Resources/operationStatuses/${operationId}?api-version=2022-09-01`;
          return sendJson(res, result.status, result.body, result.asyncOperation ? {
            'azure-asyncoperation': operationUrl,
            location: operationUrl,
            'retry-after': '0',
          } : {});
        }

        if (method === 'GET') {
          if (webAppConfig) {
            return sendJson(res, 200, webAppConfig);
          }
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
          if (productApiLinkedApiRoute) {
            const linkedApi = store.getResource(productApiLinkedApiRoute);
            if (!linkedApi) {
              return sendError(res, 404, 'ResourceNotFound', `The Resource '${productApiLinkedApiRoute.typePath}' under resource group '${providerRoute.resourceGroupName}' was not found.`);
            }
            return sendJson(res, 200, apiManagementProductApiContract(resource, linkedApi));
          }
          return sendJson(res, 200, resource);
        }

        if (method === 'HEAD') {
          const validation = capturedProviderValidation({ method, resourceType, providerRoute });
          if (validation) {
            sendHeadStatus(res, validation.status);
            return;
          }
          const resource = store.getResource(providerRoute);
          if (!resource) {
            const notFound = azureNotFoundFor({ method, resourceType, providerRoute, store }) ?? { status: 404 };
            sendHeadStatus(res, notFound.status);
            return;
          }
          if (productApiLinkedApiRoute && !store.getResource(productApiLinkedApiRoute)) {
            sendHeadStatus(res, 404);
            return;
          }
          sendHeadStatus(res, 204);
          return;
        }

        if (method === 'DELETE') {
          const validation = capturedProviderValidation({ method, resourceType, providerRoute });
          if (validation) return sendJson(res, validation.status, validation.body);
          const storageParent = storageAccountParentRoute(providerRoute);
          const storageParentState = storageParent ? store.resourceProvisioningState(storageParent) : null;
          if (storageParent && resourceType !== 'Microsoft.Storage/storageAccounts' && storageParentState && storageParentState !== 'Succeeded') {
            return sendJson(res, 409, storageAccountNotProvisioned().body);
          }
          const deletedResource = store.getResource(providerRoute);
          const existed = store.deleteResource(providerRoute);
          if (!existed) {
            if (acceptsDeleteMissing(resourceType)) return sendJson(res, 204);
            const notFound = azureNotFoundFor({ method, resourceType, providerRoute, store });
            if (notFound.body === undefined && notFound.status === 204) return sendJson(res, 204);
            return sendError(res, notFound.status, notFound.code, notFound.message);
          }
          if (typeof onResourceDelete === 'function') {
            onResourceDelete({
              store,
              providerRoute,
              resourceType,
              resource: deletedResource,
            });
          }
          if (resourceType === 'Microsoft.ServiceBus/namespaces') {
            const operationId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            const operationUrl = `${facadeOrigin(req)}/subscriptions/${providerRoute.subscriptionId}/providers/Microsoft.Resources/operationStatuses/${operationId}?api-version=2022-09-01`;
            return sendJson(res, 202, {
              status: 'Deleting',
              id: `/subscriptions/${providerRoute.subscriptionId}/resourceGroups/${providerRoute.resourceGroupName}/providers/${providerRoute.providerNamespace}/${providerRoute.typePath}`,
            }, {
              'azure-asyncoperation': operationUrl,
              location: operationUrl,
              'retry-after': '0',
            });
          }
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
      console.error('[globalstack:azure-control-plane] unhandled request error', {
        method,
        pathname,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
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
