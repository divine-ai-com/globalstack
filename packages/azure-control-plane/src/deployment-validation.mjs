import { validateWebPlan } from './web-plan-validation.mjs';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  addTemplateVariables, deploymentResourceId, evaluateArmValue, expandDeploymentTemplate, parameterContext,
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
  const context = parameterContext(template, parameters, { ...scope, __strictValidation: true });
  checkParameters(template, parameters, context, path);
  if (!object(template.variables ?? {}) || !object(template.outputs ?? {})) invalid('Template variables and outputs must be objects.', path);
  addTemplateVariables(template, context);
  for (const [key, resource] of resources(template, path)) {
    const resourcePath = `${path}.resources.${key}`;
    if (!object(resource)) invalid('A resource must be an object.', resourcePath);
    for (const feature of ['copy', 'condition', 'existing']) {
      if (has(resource, feature)) unsupported(`Resource ${feature} validation is not implemented.`, resourcePath);
    }
    if (typeof resource.type !== 'string' || !resource.type.includes('/')) invalid('A resource requires its type.', resourcePath);
    if (typeof resource.apiVersion !== 'string' || !resource.apiVersion) invalid('A resource requires its apiVersion.', resourcePath);
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
    } else {
      evaluateArmValue(resource, context);
      if (resource.resources !== undefined) {
        // Child-resource expansion is supported elsewhere; validation must not
        // silently overlook constraints in a shape this pass does not inspect.
        unsupported('Inline child-resource validation is not implemented.', resourcePath);
      }
    }
  }
  evaluateArmValue(template.outputs ?? {}, context);
}

// This pass deliberately has no store, network client or runtime callbacks.
// Unsupported providers return an explicit gap instead of a deployment promise.
export function validateDeployment({ subscriptionId, resourceGroupName = null, deploymentName, body }) {
  try {
    if (!object(body) || !object(body.properties)) invalid('Deployment properties must be an object.', 'properties');
    if (body.properties.templateLink || body.properties.parametersLink) unsupported('Linked templates and parameters are not fetched during local validation.', 'properties');
    const level = body.properties.validationLevel ?? 'Provider';
    if (!['Template', 'Provider', 'ProviderNoRbac'].includes(level)) invalid('Unknown deployment validation level.', 'properties.validationLevel');
    if (!['Incremental', 'Complete'].includes(body.properties.mode)) invalid('Deployment mode must be Incremental or Complete.', 'properties.mode');
    if (!resourceGroupName && body.properties.mode === 'Complete') invalid('Complete mode requires a resource-group deployment.', 'properties.mode');
    const template = body.properties.template;
    const parameters = body.properties.parameters ?? {};
    checkTemplate(template, parameters, { __subscriptionId: subscriptionId, __resourceGroupName: resourceGroupName }, 'properties.template');
    const expanded = expandDeploymentTemplate({
      template, parameters, subscriptionId, resourceGroupName, deploymentName,
      inheritedParameters: { __strictValidation: true },
    });
    const validatedResources = [];
    for (const operation of expanded.operations) {
      if (operation.kind === 'error') throw new ValidationFailure(operation.code, operation.message, 'properties.template.resources', operation.status);
      if (operation.kind === 'resourceGroup') {
        if (typeof operation.body.location !== 'string' || !operation.body.location) invalid('Resource groups require a location.', 'properties.template.resources');
        validatedResources.push({ id: `/subscriptions/${subscriptionId}/resourceGroups/${operation.name}` });
        continue;
      }
      const route = operation.providerRoute;
      const type = `${route.providerNamespace}/${route.typePath.split('/').filter((_, index) => index % 2 === 0).join('/')}`;
      const id = `${route.scopeId ?? `/subscriptions/${subscriptionId}/resourceGroups/${route.resourceGroupName}`}/providers/${route.providerNamespace}/${route.typePath}`;
      if (level !== 'Template') {
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
    if (!(error instanceof ValidationFailure) && error.code !== 'GLOBALSTACK_VALIDATION_EXPRESSION') throw error;
    return { status: error.status ?? 501, body: { error: {
      code: error.code === 'GLOBALSTACK_VALIDATION_EXPRESSION' ? 'GlobalStackValidationNotImplemented' : error.code,
      message: error.message,
      ...(error.path ? { additionalInfo: [{ type: 'TemplateViolation', info: { path: error.path } }] } : {}),
    } } };
  }
}
