import { validateWebPlan } from './web-plan-validation.mjs';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  addTemplateVariables, copyContexts, deploymentResourceId, evaluateArmValue, expandDeploymentTemplate, isDeferredArmReference,
  parameterContext,
} from './server-support.mjs';
import { validateSearchServiceName } from './search-validation.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value, key) => Object.hasOwn(value, key);

class ValidationFailure extends Error {
  constructor(code, message, path, status = 400) {
    super(message);
    this.code = code;
    this.path = path;
    this.status = status;
  }
}

function invalid(message, path) {
  throw new ValidationFailure('InvalidTemplate', message, path);
}

function unsupported(message, path) {
  throw new ValidationFailure('GlobalStackValidationNotImplemented', message, path, 501);
}

function validateDocumentPostgres(type, route, body) {
  const path = 'properties.template.resources';
  const parts = route.typePath.split('/');
  const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
  if (type === 'Microsoft.DBforPostgreSQL/flexibleServers') {
    const properties = body.properties ?? {};
    if (!/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(parts[1] ?? '') || !body.location) {
      invalid('A PostgreSQL server requires a valid name and location.', path);
    }
    if (body.sku?.name !== 'Standard_B1ms' || body.sku?.tier !== 'Burstable'
      || properties.version !== '16' || properties.storage?.storageSizeGB !== 32
      || properties.backup?.backupRetentionDays !== 7 || properties.backup?.geoRedundantBackup !== 'Disabled'
      || properties.highAvailability?.mode !== 'Disabled'
      || properties.authConfig?.activeDirectoryAuth !== 'Enabled' || properties.authConfig?.passwordAuth !== 'Disabled'
      || !uuid.test(properties.authConfig?.tenantId ?? '') || properties.administratorLogin !== undefined
      || properties.administratorLoginPassword !== undefined || properties.network?.publicNetworkAccess !== 'Enabled') {
      unsupported('PostgreSQL provider validation outside the captured Entra-only pilot shape is not implemented.', path);
    }
    return;
  }
  if (type === 'Microsoft.DBforPostgreSQL/flexibleServers/administrators') {
    if (!uuid.test(parts[3] ?? '') || body.properties?.principalType !== 'ServicePrincipal'
      || !body.properties?.principalName || !uuid.test(body.properties?.tenantId ?? '')) {
      unsupported('PostgreSQL administrator validation outside the captured service-principal shape is not implemented.', path);
    }
    return;
  }
  if (type === 'Microsoft.DBforPostgreSQL/flexibleServers/databases') {
    if (parts[3] !== 'documents' || body.properties?.charset !== 'UTF8' || body.properties?.collation !== 'en_US.utf8') {
      unsupported('PostgreSQL database validation outside the captured documents shape is not implemented.', path);
    }
    return;
  }
  unsupported(`PostgreSQL provider validation for ${type} is not implemented.`, path);
}

function parameterMatches(type, value) {
  switch (type.toLowerCase()) {
    case 'string': case 'securestring': return typeof value === 'string';
    case 'int': return Number.isSafeInteger(value);
    case 'bool': return typeof value === 'boolean';
    case 'array': return Array.isArray(value);
    case 'object': case 'secureobject': return object(value);
    default: return false;
  }
}

function checkParameters(template, supplied, context, path) {
  const definitions = template.parameters ?? {};
  if (!object(definitions) || !object(supplied)) invalid('Template parameters must be objects.', `${path}.parameters`);
  for (const name of Object.keys(supplied)) {
    if (!has(definitions, name)) invalid(`The template parameter '${name}' is not defined.`, `${path}.parameters`);
  }
  for (const [name, definition] of Object.entries(definitions)) {
    const parameterPath = `${path}.parameters.${name}`;
    if (!object(definition) || typeof definition.type !== 'string') invalid(`Parameter '${name}' requires a type.`, parameterPath);
    if (has(supplied, name) && (!object(supplied[name]) || !has(supplied[name], 'value'))) {
      unsupported('Only inline parameter values are currently validated.', parameterPath);
    }
    if (!has(supplied, name) && !has(definition, 'defaultValue')) invalid(`The value for the template parameter '${name}' is not provided.`, parameterPath);
    const value = has(supplied, name) ? supplied[name].value : evaluateArmValue(definition.defaultValue, context);
    if (!parameterMatches(definition.type, value)) invalid(`The value for parameter '${name}' does not match its declared type.`, parameterPath);
    const candidates = definition.type.toLowerCase() === 'array' ? value : [value];
    if (definition.allowedValues !== undefined && (!Array.isArray(definition.allowedValues) || !candidates.every(candidate => definition.allowedValues.some(item => isDeepStrictEqual(item, candidate))))) {
      invalid(`The value for parameter '${name}' is not in its allowed values.`, parameterPath);
    }
    for (const [constraint, actual, predicate] of [
      ['minLength', value?.length, (a, b) => a >= b], ['maxLength', value?.length, (a, b) => a <= b],
      ['minValue', value, (a, b) => a >= b], ['maxValue', value, (a, b) => a <= b],
    ]) {
      if (has(definition, constraint) && (!Number.isSafeInteger(definition[constraint]) || !predicate(actual, definition[constraint]))) {
        invalid(`The value for parameter '${name}' does not satisfy ${constraint}.`, parameterPath);
      }
    }
  }
}

function resources(template, path) {
  if (template.resources === undefined) return [];
  if (Array.isArray(template.resources)) return template.resources.map((resource, index) => [index, resource]);
  if (object(template.resources) && template.languageVersion === '2.0') return Object.entries(template.resources);
  invalid('Template resources must be an array, or a symbolic object with languageVersion 2.0.', `${path}.resources`);
}

function checkTemplate(template, parameters, scope, path, depth = 0) {
  if (!object(template)) invalid('Deployment request must include an inline template object.', path);
  if (depth > 32) unsupported('Nested validation exceeds the supported depth.', path);
  for (const feature of ['functions', 'imports', 'extensions', 'definitions']) {
    if (has(template, feature)) unsupported(`Template ${feature} validation is not implemented.`, `${path}.${feature}`);
  }
  if (!object(template.parameters ?? {}) || !object(parameters)) invalid('Template parameters must be objects.', `${path}.parameters`);
  for (const [name, definition] of Object.entries(template.parameters ?? {})) {
    if (!object(definition) || typeof definition.type !== 'string') invalid(`Parameter '${name}' requires a type.`, `${path}.parameters.${name}`);
  }
  const context = parameterContext(template, parameters, { ...scope, __strictValidation: true, __validationReferences: true });
  checkParameters(template, parameters, context, path);
  if (!object(template.variables ?? {}) || !object(template.outputs ?? {})) invalid('Template variables and outputs must be objects.', path);
  addTemplateVariables(template, context);
  for (const [key, resource] of resources(template, path)) {
    const resourcePath = `${path}.resources.${key}`;
    if (!object(resource)) invalid('A resource must be an object.', resourcePath);
    for (const feature of ['condition', 'existing']) {
      if (has(resource, feature)) unsupported(`Resource ${feature} validation is not implemented.`, resourcePath);
    }
    if (typeof resource.type !== 'string' || !resource.type.includes('/')) invalid('A resource requires its type.', resourcePath);
    if (typeof resource.apiVersion !== 'string' || !resource.apiVersion) invalid('A resource requires its apiVersion.', resourcePath);
    // Resource groups and nested deployments keep their own scope rules, so
    // their loops remain outside this pass.
    if (has(resource, 'copy') && ['Microsoft.Resources/deployments', 'Microsoft.Resources/resourceGroups'].includes(resource.type)) {
      unsupported('Resource copy validation is not implemented for this resource type.', resourcePath);
    }
    const iterations = has(resource, 'copy') ? copyIterations(resource.copy, context, resourcePath) : [context];
    for (const iteration of iterations) checkResource(resource, iteration, scope, resourcePath, depth);
  }
  evaluateArmValue(template.outputs ?? {}, context);
}

function copyIterations(copy, context, path) {
  try {
    return copyContexts(copy, context, true);
  } catch (error) {
    if (error.code === 'GlobalStackCopyNotImplemented') unsupported(error.message, path);
    if (error.code === 'InvalidTemplate') invalid(error.message, path);
    throw error;
  }
}

function checkResource(rawResource, context, scope, resourcePath, depth) {
  const { copy, ...resource } = rawResource;
  const name = evaluateArmValue(resource.name, context);
  if (typeof name !== 'string' || !name) invalid('A resource requires its name.', resourcePath);
  if (resource.type === 'Microsoft.Resources/deployments') {
    if (resource.properties?.templateLink) unsupported('Linked templates are not fetched during local validation.', resourcePath);
    if (resource.subscriptionId !== undefined || resource.scope !== undefined) unsupported('Cross-scope nested validation is not implemented.', resourcePath);
    if (resource.properties?.expressionEvaluationOptions?.scope === 'outer') unsupported('Outer-scope nested expression validation is not implemented.', resourcePath);
    const nestedParameters = evaluateArmValue(resource.properties?.parameters ?? {}, context);
    checkTemplate(resource.properties?.template, nestedParameters, {
      ...scope, __resourceGroupName: evaluateArmValue(resource.resourceGroup, context) ?? scope.__resourceGroupName,
    }, `${resourcePath}.properties.template`, depth + 1);
    return;
  }
  const evaluated = evaluateArmValue(resource, context);
  if (scope.__level !== 'Template') checkRuntimeValues(resource.type, evaluated, resourcePath);
  if (resource.resources !== undefined) {
    // Child-resource expansion is supported elsewhere; validation must not
    // silently overlook constraints in a shape this pass does not inspect.
    unsupported('Inline child-resource validation is not implemented.', resourcePath);
  }
}

const guid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const onlyKeys = (value, keys) => object(value) && Object.keys(value).every(key => keys.includes(key));
// Deployment expansion keeps reference() expressions as text, which cannot be
// told apart from an escaped literal such as '[[reference(x)]'. Fields that may
// hold a reference are therefore checked here, where it is an opaque value, and
// the expanded text is accepted later only for those fields.
const deferred = value => typeof value === 'string' && /^\[.*\breference\(/s.test(value);
const runtimeGuid = value => isDeferredArmReference(value) || (typeof value === 'string' && guid.test(value));

function checkRuntimeValues(type, evaluated, path) {
  if (type === 'Microsoft.Authorization/roleAssignments' && !runtimeGuid(evaluated.properties?.principalId)) {
    unsupported('Role assignment principals outside a GUID or reference() value are not validated locally.', path);
  }
  if (type !== 'Microsoft.Web/sites') return;
  const config = evaluated.properties?.siteConfig ?? {};
  if (config.acrUserManagedIdentityID !== undefined && !runtimeGuid(config.acrUserManagedIdentityID)) {
    unsupported('Registry identity IDs outside a GUID or reference() value are not validated locally.', path);
  }
  const settings = config.appSettings;
  if (settings !== undefined && !(Array.isArray(settings) && settings.every(item => onlyKeys(item, ['name', 'value'])
    && typeof item.name === 'string' && item.name.length > 0 && (typeof item.value === 'string' || isDeferredArmReference(item.value))))) {
    unsupported('Function app settings outside name and string value pairs are not validated locally.', path);
  }
}

// Bounded provider checks for the captured document worker host and app
// templates (#90). Shapes outside them remain explicit validation gaps.
function validateDocumentWorker(type, route, body, { subscriptionId, declaredIds, resourceExists }) {
  const path = 'properties.template.resources';
  const name = route.typePath.split('/').at(-1);
  const tagsOk = body.tags === undefined || (object(body.tags) && Object.values(body.tags).every(value => typeof value === 'string'));
  const located = typeof body.location === 'string' && body.location.length > 0;
  if (type === 'Microsoft.ManagedIdentity/userAssignedIdentities') {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,127}$/.test(name) || !located || !tagsOk || !onlyKeys(body, ['location', 'tags'])) {
      unsupported('Managed identity validation outside the captured worker shape is not implemented.', path);
    }
    return;
  }
  if (type === 'Microsoft.Storage/storageAccounts') {
    const p = body.properties;
    if (!/^[a-z0-9]{3,24}$/.test(name) || !located || !tagsOk || body.kind !== 'StorageV2' || body.sku?.name !== 'Standard_LRS'
      || !onlyKeys(body, ['location', 'tags', 'kind', 'sku', 'properties']) || !onlyKeys(body.sku, ['name'])
      || !onlyKeys(p, ['minimumTlsVersion', 'supportsHttpsTrafficOnly', 'allowBlobPublicAccess', 'allowSharedKeyAccess'])
      || p.minimumTlsVersion !== 'TLS1_2' || p.supportsHttpsTrafficOnly !== true
      || p.allowBlobPublicAccess !== false || p.allowSharedKeyAccess !== false) {
      unsupported('Storage account validation outside the captured worker host shape is not implemented.', path);
    }
    return;
  }
  if (type === 'Microsoft.ContainerRegistry/registries') {
    if (!/^[A-Za-z0-9]{5,50}$/.test(name) || !located || !tagsOk || body.sku?.name !== 'Basic'
      || !onlyKeys(body, ['location', 'tags', 'sku', 'properties']) || !onlyKeys(body.sku, ['name'])
      || !onlyKeys(body.properties, ['adminUserEnabled']) || body.properties.adminUserEnabled !== false) {
      unsupported('Container registry validation outside the captured worker host shape is not implemented.', path);
    }
    return;
  }
  if (type === 'Microsoft.Authorization/roleAssignments') {
    const p = body.properties;
    const definition = String(p?.roleDefinitionId ?? '').match(/^\/subscriptions\/([^/]+)\/providers\/Microsoft\.Authorization\/roleDefinitions\/([^/]+)$/i);
    const groupScope = `/subscriptions/${subscriptionId}/resourceGroups/`.toLowerCase();
    if (!guid.test(name) || !onlyKeys(body, ['properties']) || !onlyKeys(p, ['roleDefinitionId', 'principalId', 'principalType', 'description'])
      || !definition || definition[1].toLowerCase() !== subscriptionId.toLowerCase() || !guid.test(definition[2])
      || !(guid.test(p.principalId ?? '') || deferred(p.principalId)) || p.principalType !== 'ServicePrincipal'
      || (p.description !== undefined && typeof p.description !== 'string')
      || !route.scopeId?.toLowerCase().startsWith(groupScope) || !declaredIds.has(route.scopeId.toLowerCase())) {
      unsupported('Role assignment validation outside the captured worker grants is not implemented.', path);
    }
    return;
  }
  if (type === 'Microsoft.Web/sites') {
    const p = body.properties ?? {};
    const c = p.siteConfig ?? {};
    const identities = body.identity?.userAssignedIdentities;
    const identityIds = object(identities) ? Object.keys(identities) : [];
    const identityPrefix = `/subscriptions/${subscriptionId}/resourceGroups/`.toLowerCase();
    const plan = String(p.serverFarmId ?? '');
    const settingsOk = deferred(c.appSettings) || (Array.isArray(c.appSettings) && c.appSettings.every(item => onlyKeys(item, ['name', 'value'])
      && typeof item.name === 'string' && item.name.length > 0 && (typeof item.value === 'string' || deferred(item.value))));
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,58}[A-Za-z0-9])?$/.test(name) || !located || !tagsOk
      || body.kind !== 'functionapp,linux,container' || !onlyKeys(body, ['location', 'tags', 'kind', 'identity', 'properties'])
      || body.identity?.type !== 'UserAssigned' || identityIds.length !== 1
      || !identityIds.every(id => id.toLowerCase().startsWith(identityPrefix) && /\/providers\/Microsoft\.ManagedIdentity\/userAssignedIdentities\/[^/]+$/i.test(id)
        && onlyKeys(identities[id], []))
      || !onlyKeys(p, ['serverFarmId', 'httpsOnly', 'siteConfig']) || p.httpsOnly !== true
      || !/^\/subscriptions\/[^/]+\/resourceGroups\/[^/]+\/providers\/Microsoft\.Web\/serverfarms\/[^/]+$/i.test(plan)
      || !onlyKeys(c, ['linuxFxVersion', 'acrUseManagedIdentityCreds', 'acrUserManagedIdentityID', 'ftpsState', 'minTlsVersion',
        'minimumElasticInstanceCount', 'functionAppScaleLimit', 'appSettings'])
      || !/^DOCKER\|[^\s|]+$/.test(c.linuxFxVersion ?? '') || c.acrUseManagedIdentityCreds !== true
      || !(guid.test(c.acrUserManagedIdentityID ?? '') || deferred(c.acrUserManagedIdentityID))
      || c.ftpsState !== 'Disabled' || c.minTlsVersion !== '1.2' || c.minimumElasticInstanceCount !== 1 || c.functionAppScaleLimit !== 1
      || !settingsOk) {
      unsupported('Function app validation outside the captured document worker shape is not implemented.', path);
    }
    // Azure's response for a plan or identity that does not exist yet was not captured.
    for (const id of [plan, ...identityIds]) {
      if (!declaredIds.has(id.toLowerCase()) && !resourceExists(id)) {
        unsupported('Function app validation against an absent hosting plan or identity is not implemented.', path);
      }
    }
    return;
  }
  unsupported(`Provider validation for ${type} is not implemented.`, path);
}

const documentWorkerTypes = new Set(['Microsoft.ManagedIdentity/userAssignedIdentities', 'Microsoft.Storage/storageAccounts',
  'Microsoft.ContainerRegistry/registries', 'Microsoft.Authorization/roleAssignments', 'Microsoft.Web/sites']);

// This pass deliberately has no network client or runtime callbacks; the only
// state it may read is whether a resource referenced by a function app exists.
// Unsupported providers return an explicit gap instead of a deployment promise.
export function validateDeployment({ subscriptionId, resourceGroupName = null, deploymentName, body, resourceExists = () => false }) {
  try {
    if (!object(body) || !object(body.properties)) invalid('Deployment properties must be an object.', 'properties');
    if (body.properties.templateLink || body.properties.parametersLink) unsupported('Linked templates and parameters are not fetched during local validation.', 'properties');
    const level = body.properties.validationLevel ?? 'Provider';
    if (!['Template', 'Provider', 'ProviderNoRbac'].includes(level)) invalid('Unknown deployment validation level.', 'properties.validationLevel');
    if (!['Incremental', 'Complete'].includes(body.properties.mode)) invalid('Deployment mode must be Incremental or Complete.', 'properties.mode');
    if (!resourceGroupName && body.properties.mode === 'Complete') invalid('Complete mode requires a resource-group deployment.', 'properties.mode');
    const template = body.properties.template;
    const parameters = body.properties.parameters ?? {};
    checkTemplate(template, parameters, { __subscriptionId: subscriptionId, __resourceGroupName: resourceGroupName, __level: level }, 'properties.template');
    const expanded = expandDeploymentTemplate({
      template, parameters, subscriptionId, resourceGroupName, deploymentName,
      inheritedParameters: { __strictValidation: true },
    });
    const validatedResources = [];
    const resourceId = route => `${route.scopeId ?? `/subscriptions/${subscriptionId}/resourceGroups/${route.resourceGroupName}`}/providers/${route.providerNamespace}/${route.typePath}`;
    const declaredIds = new Set();
    for (const operation of expanded.operations.filter(item => item.providerRoute)) {
      const id = resourceId(operation.providerRoute);
      if (declaredIds.has(id.toLowerCase())) invalid(`The resource '${id}' is defined multiple times in a template.`, 'properties.template.resources');
      declaredIds.add(id.toLowerCase());
    }
    for (const operation of expanded.operations) {
      if (operation.kind === 'error') throw new ValidationFailure(operation.code, operation.message, 'properties.template.resources', operation.status);
      if (operation.kind === 'resourceGroup') {
        if (typeof operation.body.location !== 'string' || !operation.body.location) invalid('Resource groups require a location.', 'properties.template.resources');
        validatedResources.push({ id: `/subscriptions/${subscriptionId}/resourceGroups/${operation.name}` });
        continue;
      }
      const route = operation.providerRoute;
      const type = `${route.providerNamespace}/${route.typePath.split('/').filter((_, index) => index % 2 === 0).join('/')}`;
      const id = resourceId(route);
      if (level !== 'Template') {
        if (documentWorkerTypes.has(type)) {
          validateDocumentWorker(type, route, operation.body, { subscriptionId, declaredIds, resourceExists });
          validatedResources.push({ id });
          continue;
        }
        if (type.startsWith('Microsoft.DBforPostgreSQL/flexibleServers')) {
          validateDocumentPostgres(type, route, operation.body);
          validatedResources.push({ id });
          continue;
        }
        if (type === 'Microsoft.Web/serverfarms') {
          const planName = route.typePath.split('/').at(-1);
          if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$/.test(planName)) unsupported('Hosting plan name validation is outside the supported subset.', 'properties.template.resources');
          const planError = validateWebPlan(operation.body);
          if (planError) unsupported('Provider validation outside the bounded Linux hosting plan subset is not implemented.', 'properties.template.resources');
          if (typeof operation.body.location !== 'string' || !operation.body.location) invalid('A hosting plan requires a location.', 'properties.template.resources');
          validatedResources.push({ id });
          continue;
        }
        if (type !== 'Microsoft.Search/searchServices') unsupported(`Provider validation for ${type} is not implemented.`, 'properties.template.resources');
        const error = validateSearchServiceName(route.typePath.split('/').at(-1));
        if (error) return { status: 400, body: { error: {
          code: 'InvalidTemplateDeployment',
          message: `The template deployment '${deploymentName}' is not valid according to the validation procedure. See inner errors for details.`,
          details: [error],
        } } };
        if (typeof operation.body.location !== 'string' || !operation.body.location) invalid('A Search service requires a location.', 'properties.template.resources');
      }
      validatedResources.push({ id });
    }
    // Secure parameter values are never returned in validation responses.
    const responseParameters = Object.fromEntries(Object.entries(template.parameters ?? {}).map(([name, definition]) => [name, {
      type: definition.type[0].toUpperCase() + definition.type.slice(1),
      ...(/^secure/i.test(definition.type) ? {} : { value: parameterContext(template, parameters)[name] }),
    }]));
    return { status: 200, body: {
      id: deploymentResourceId(subscriptionId, resourceGroupName, deploymentName),
      name: deploymentName, type: 'Microsoft.Resources/deployments', location: body.location,
      properties: {
        provisioningState: 'Succeeded', validationLevel: level, mode: body.properties.mode,
        parameters: responseParameters, validatedResources, timestamp: new Date().toISOString(),
        duration: 'PT0S', correlationId: randomUUID(),
      },
    } };
  } catch (error) {
    if (!(error instanceof ValidationFailure) && !['GLOBALSTACK_VALIDATION_EXPRESSION', 'InvalidTemplate'].includes(error.code)) throw error;
    return { status: error.status ?? (error.code === 'InvalidTemplate' ? 400 : 501), body: { error: {
      code: error.code === 'GLOBALSTACK_VALIDATION_EXPRESSION' ? 'GlobalStackValidationNotImplemented' : error.code,
      message: error.message,
      ...(error.path ? { additionalInfo: [{ type: 'TemplateViolation', info: { path: error.path } }] } : {}),
    } } };
  }
}
