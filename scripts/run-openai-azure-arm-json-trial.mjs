import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArmServer } from '../packages/azure-control-plane/src/server.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const model = process.env.OPENAI_MODEL ?? 'gpt-5.5';
const location = process.env.AZURE_LOCATION ?? 'eastus';
const subscriptionId = process.env.ARM_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const replayDirArg = process.argv.find(arg => arg.startsWith('--replay-dir='));
const replayDir = replayDirArg ? replayDirArg.split('=').slice(1).join('=') : null;
const runSuffix = `${Date.now().toString(36).slice(-5)}${process.pid.toString(36)}`.toLowerCase();
const environmentSuffix = replayDir ? replayDir.split('/').filter(Boolean).at(-1).replace(/^trial/, '') : `trial${runSuffix}`;
const outRoot = replayDir ? join(root, replayDir) : join(root, 'dist', 'live-model-trial', 'azure-arm-json', environmentSuffix);
let baseUrl = 'http://127.0.0.1:0';

const requiredSolutionFiles = [
  'lib/azuredeploy.json',
  'lib/azuredeploy.parameters.json',
];

const forbiddenModelFacingTerms = /\b(GlobalStack|LocalStack|emulator|emulation)\b|local endpoint|local deployment|locally supported|deploy smoke|coverage snapshot|GlobalStack_InvalidSku_For_Conformance/i;

function promptText() {
  return `Our platform team needs an Azure storage and messaging foundation for model artifact intake workflows.

Create an Azure ARM JSON deployment that provisions the following resources in ${location}: one StorageV2 storage account, one private blob container named model-artifacts, one queue named model-jobs, one Azure Files share named modelfiles with a 32 GiB quota, one table named modeltable, one Service Bus Standard namespace with a topic named model-events, one Event Grid topic, one Event Hubs Standard namespace with one event hub named model-stream, and one App Configuration store using the free SKU.

Use these exact resource names so the deployment can be tested repeatably:
- Resource group: rg-az-openai-${environmentSuffix}
- Storage account: azopenai${environmentSuffix.replace(/[^a-z0-9]/g, '').slice(0, 13)}
- Service Bus namespace: az-sb-${environmentSuffix}
- Event Grid topic: eg-${environmentSuffix}
- Event Hubs namespace: az-eh-${environmentSuffix}
- App Configuration store: azcfg${environmentSuffix.replace(/[^a-z0-9]/g, '').slice(0, 14)}

The whole solution must live in ARM JSON files under lib/. Return exactly these files as Markdown fenced code blocks with a path attribute:
- lib/azuredeploy.json
- lib/azuredeploy.parameters.json

Every resource must use real Azure ARM resource types and API versions. Do not include credentials or tenant-specific secrets. Export outputs for the storage account name, blob container name, queue name, file share name, table name, Service Bus topic name, Event Grid topic name, Event Hub name, and App Configuration store name.`;
}

function outputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  const parts = [];
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

async function callOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required to run the live model trial.');
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: 'medium' },
      text: { verbosity: 'low' },
    }),
  });
  const body = await response.json().catch(async () => ({ raw: await response.text() }));
  if (!response.ok) {
    throw new Error(`OpenAI Responses API failed with HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return {
    response: body,
    text: outputText(body),
  };
}

function extractFiles(markdown) {
  const files = new Map();
  const fencePattern = /```[^\n]*path=["']([^"']+)["'][^\n]*\n([\s\S]*?)```/g;
  for (const match of markdown.matchAll(fencePattern)) {
    files.set(match[1], match[2].trimEnd());
  }
  return files;
}

function validateModelFacing(label, text) {
  const match = text.match(forbiddenModelFacingTerms);
  if (match) throw new Error(`${label} contains runtime-only term "${match[0]}"`);
}

function templateResources(template) {
  if (!Array.isArray(template.resources)) throw new Error('ARM template resources must be an array.');
  return template.resources;
}

function splitArgs(text) {
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

function unquote(text) {
  const trimmed = String(text).trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parameterContext(template, parameterFile = {}, inherited = {}) {
  const parameters = { ...inherited };
  for (const [name, definition] of Object.entries(template.parameters ?? {})) {
    if (definition.defaultValue !== undefined) parameters[name] = definition.defaultValue;
  }
  for (const [name, definition] of Object.entries(parameterFile.parameters ?? {})) {
    if (definition?.value !== undefined) parameters[name] = definition.value;
  }
  return parameters;
}

function evaluateExpression(expression, parameters) {
  const text = expression.trim();
  const parameterMatch = text.match(/^parameters\('([^']+)'\)$/);
  if (parameterMatch) return parameters[parameterMatch[1]];

  const formatMatch = text.match(/^format\((.*)\)$/s);
  if (formatMatch) {
    const [formatString, ...args] = splitArgs(formatMatch[1]);
    return args.reduce(
      (acc, arg, index) => acc.replaceAll(`{${index}}`, String(evaluateArmValue(arg, parameters))),
      unquote(formatString),
    );
  }

  const concatMatch = text.match(/^concat\((.*)\)$/s);
  if (concatMatch) return splitArgs(concatMatch[1]).map(arg => evaluateArmValue(arg, parameters)).join('');

  const resourceIdMatch = text.match(/^(subscriptionResourceId|resourceId)\((.*)\)$/s);
  if (resourceIdMatch) return splitArgs(resourceIdMatch[2]).map(arg => evaluateArmValue(arg, parameters)).join('/');

  return expression;
}

function evaluateArmValue(value, parameters) {
  if (Array.isArray(value)) return value.map(item => evaluateArmValue(item, parameters));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluateArmValue(item, parameters)]));
  }
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return evaluateExpression(trimmed.slice(1, -1), parameters);
  }
  if (/^parameters\('|^format\(|^concat\(/.test(trimmed)) return evaluateExpression(trimmed, parameters);
  return value;
}

function expandArmResources(template, parameterFile, defaultResourceGroupName, inheritedParameters = {}) {
  const parameters = parameterContext(template, parameterFile, inheritedParameters);
  const operations = [];

  for (const rawResource of templateResources(template)) {
    const resource = evaluateArmValue(rawResource, parameters);
    if (resource.type === 'Microsoft.Resources/resourceGroups') {
      operations.push({
        kind: 'resourceGroup',
        name: resource.name,
        body: { location: resource.location ?? location, tags: resource.tags ?? {} },
      });
      continue;
    }

    if (resource.type === 'Microsoft.Resources/deployments') {
      const childParameters = {};
      for (const [name, definition] of Object.entries(resource.properties?.parameters ?? {})) {
        childParameters[name] = { value: evaluateArmValue(definition.value, parameters) };
      }
      operations.push(...expandArmResources(
        resource.properties.template,
        { parameters: childParameters },
        resource.resourceGroup ?? defaultResourceGroupName,
        parameters,
      ));
      continue;
    }

    operations.push({
      kind: 'resource',
      resourceGroupName: resource.resourceGroup ?? defaultResourceGroupName,
      resource,
    });
  }

  return operations;
}

function armTypeToProviderRoute(resource) {
  const [providerNamespace, ...types] = resource.type.split('/');
  const names = resource.name.split('/');
  if (types.length !== names.length) {
    throw new Error(`Resource type/name segment mismatch for ${resource.type} ${resource.name}`);
  }
  return {
    providerNamespace,
    typePath: types.flatMap((type, index) => [type, names[index]]).join('/'),
  };
}

function providerPath(resourceGroup, resource) {
  const route = armTypeToProviderRoute(resource);
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${route.providerNamespace}/${route.typePath}?api-version=${resource.apiVersion}`;
}

function resourceGroupPath(name) {
  return `/subscriptions/${subscriptionId}/resourcegroups/${name}?api-version=2021-04-01`;
}

function deploymentBody(resource) {
  const body = {};
  for (const key of ['location', 'sku', 'kind', 'properties', 'identity', 'tags']) {
    if (resource[key] !== undefined) body[key] = resource[key];
  }
  return body;
}

function deploymentOrder(resources) {
  return [...resources].sort((left, right) => {
    if (left.kind === 'resourceGroup' && right.kind !== 'resourceGroup') return -1;
    if (right.kind === 'resourceGroup' && left.kind !== 'resourceGroup') return 1;
    if (left.kind !== 'resource' || right.kind !== 'resource') return 0;
    const leftSegments = left.resource.type.split('/').length + left.resource.name.split('/').length;
    const rightSegments = right.resource.type.split('/').length + right.resource.name.split('/').length;
    return leftSegments - rightSegments;
  });
}

async function request(step) {
  const response = await fetch(`${baseUrl}${step.path}`, {
    method: step.method,
    headers: {
      authorization: 'Bearer local-test-token',
      'content-type': 'application/json',
    },
    body: step.body === undefined ? undefined : JSON.stringify(step.body),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 500);
  }
  const errorCode = body?.error?.code ?? body?.code ?? null;
  return {
    ...step,
    status: response.status,
    errorCode,
    ok: step.expect.includes(response.status),
    body,
  };
}

async function waitForStorageAccountReady(resourceGroupName, resource) {
  if (resource.type !== 'Microsoft.Storage/storageAccounts') return [];
  const path = providerPath(resourceGroupName, resource);
  const steps = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await request({
      label: `storage readiness ${attempt + 1}`,
      method: 'GET',
      path,
      expect: [200],
    });
    steps.push(result);
    if (result.body?.properties?.provisioningState === 'Succeeded') break;
  }
  return steps;
}

async function deployTemplate(template, parameterFile = {}) {
  const resourceGroupName = `rg-az-openai-${environmentSuffix}`;
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const steps = [];
  try {
    const operations = deploymentOrder(expandArmResources(template, parameterFile, resourceGroupName));
    if (!operations.some(operation => operation.kind === 'resourceGroup' && operation.name === resourceGroupName)) {
      operations.unshift({
        kind: 'resourceGroup',
        name: resourceGroupName,
        body: { location },
      });
    }

    for (const operation of operations) {
      if (operation.kind === 'resourceGroup') {
        const result = await request({
          label: `resource group ${operation.name}`,
          method: 'PUT',
          path: resourceGroupPath(operation.name),
          body: operation.body,
          expect: [200, 201],
        });
        steps.push(result);
        if (!result.ok) break;
        continue;
      }

      const result = await request({
        label: `${operation.resource.type} ${operation.resource.name}`,
        method: 'PUT',
        path: providerPath(operation.resourceGroupName, operation.resource),
        body: deploymentBody(operation.resource),
        expect: [200, 201, 202],
      });
      steps.push(result);
      if (!result.ok) break;
      steps.push(...await waitForStorageAccountReady(operation.resourceGroupName, operation.resource));
    }
  } finally {
    steps.push(await request({
      label: `cleanup ${resourceGroupName}`,
      method: 'DELETE',
      path: resourceGroupPath(resourceGroupName),
      expect: [200, 202, 204],
    }));
    await new Promise(resolve => server.close(resolve));
  }
  return { endpoint: baseUrl, resourceGroupName, steps };
}

function summarizeDeployment(deployment) {
  const deploySteps = deployment.steps.filter(step => !step.label.startsWith('cleanup '));
  const failed = deploySteps.find(step => !step.ok);
  const cleanup = deployment.steps.find(step => step.label.startsWith('cleanup '));
  return {
    status: failed ? 'FAIL' : 'PASS',
    endpoint: deployment.endpoint,
    resourceGroupName: deployment.resourceGroupName,
    failedStep: failed ? {
      label: failed.label,
      status: failed.status,
      errorCode: failed.errorCode,
      body: failed.body,
    } : null,
    cleanupStatus: cleanup?.ok ? 'PASS' : 'FAIL',
    stepCount: deploySteps.length,
  };
}

let prompt;
let modelResponseText;
let files;

if (replayDir) {
  prompt = await readFile(join(outRoot, 'lib', 'PROMPT.md'), 'utf8');
  modelResponseText = await readFile(join(outRoot, 'lib', 'MODEL_RESPONSE.md'), 'utf8');
  validateModelFacing('PROMPT.md', prompt);
  validateModelFacing('MODEL_RESPONSE.md', modelResponseText);
  files = new Map(await Promise.all(requiredSolutionFiles.map(async file => [
    file,
    await readFile(join(outRoot, file), 'utf8'),
  ])));
} else {
  await rm(outRoot, { recursive: true, force: true });
  await mkdir(join(outRoot, 'lib'), { recursive: true });

  prompt = promptText();
  validateModelFacing('PROMPT.md', prompt);
  await writeFile(join(outRoot, 'lib', 'PROMPT.md'), `${prompt}\n`);

  const modelResult = await callOpenAI(prompt);
  modelResponseText = modelResult.text;
  validateModelFacing('MODEL_RESPONSE.md', modelResponseText);
  await writeFile(join(outRoot, 'lib', 'MODEL_RESPONSE.md'), `${modelResponseText}\n`);

  files = extractFiles(modelResponseText);
}

for (const required of requiredSolutionFiles) {
  if (!files.has(required)) {
    throw new Error(`Model response did not include required file ${required}`);
  }
}
if (!replayDir) {
  for (const [relativePath, content] of files) {
    validateModelFacing(relativePath, content);
    await writeFile(join(outRoot, relativePath), `${content}\n`);
  }
}

const template = JSON.parse(files.get('lib/azuredeploy.json'));
const parameterFile = JSON.parse(files.get('lib/azuredeploy.parameters.json'));
const deployment = await deployTemplate(template, parameterFile);
const summary = summarizeDeployment(deployment);

await writeFile(join(outRoot, 'deployment-report.json'), `${JSON.stringify({ summary, deployment }, null, 2)}\n`);
await writeFile(join(outRoot, 'metadata.json'), `${JSON.stringify({
  model,
  platform: 'azure-arm-json',
  outputRoot: outRoot,
  promptPath: 'lib/PROMPT.md',
  modelResponsePath: 'lib/MODEL_RESPONSE.md',
  deploymentStatus: summary.status,
  cleanupStatus: summary.cleanupStatus,
  executionMode: 'openai-responses-api-to-arm-json-to-globalstack-hybrid-arm-facade',
}, null, 2)}\n`);

console.log(JSON.stringify({
  model,
  outputRoot: outRoot,
  deploymentStatus: summary.status,
  cleanupStatus: summary.cleanupStatus,
  failedStep: summary.failedStep,
}, null, 2));

if (summary.status !== 'PASS' || summary.cleanupStatus !== 'PASS') process.exit(1);
