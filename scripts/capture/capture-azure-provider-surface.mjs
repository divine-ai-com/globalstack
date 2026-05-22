import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { allCapabilities } from '../../packages/core/src/azure-tier1-capabilities.mjs';

const execFileAsync = promisify(execFile);
const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'docs', 'conformance');
const jsonPath = join(outRoot, 'azure-provider-surface-inventory.json');
const mdPath = join(outRoot, 'azure-provider-surface-inventory.md');

function providerNamespace(resourceType) {
  return String(resourceType).split('/')[0];
}

function operationName(operation) {
  return operation?.name ?? operation?.display?.operation ?? '';
}

function flattenProviderOperations(providerDocument) {
  const operations = [];
  if (Array.isArray(providerDocument)) return providerDocument;
  if (Array.isArray(providerDocument?.operations)) operations.push(...providerDocument.operations);
  for (const resourceType of providerDocument?.resourceTypes ?? []) {
    for (const operation of resourceType.operations ?? []) {
      operations.push({
        ...operation,
        providerResourceType: resourceType.name ?? null,
      });
    }
  }
  return operations;
}

function normalized(value) {
  return String(value ?? '').toLowerCase();
}

function operationMatchesResourceType(operation, resourceType) {
  const name = normalized(operationName(operation));
  const type = normalized(resourceType);
  return name.startsWith(`${type}/`) || name === `${type}/read` || name === `${type}/write` || name === `${type}/delete`;
}

function operationKind(operation) {
  const name = normalized(operationName(operation));
  if (name.endsWith('/read')) return 'read';
  if (name.endsWith('/write')) return 'write';
  if (name.endsWith('/delete')) return 'delete';
  if (name.endsWith('/action')) return 'action';
  return 'other';
}

function markdown(inventory) {
  const lines = [
    '# Azure Provider Surface Inventory',
    '',
    'This file is generated from Azure ARM provider operation metadata. It is a live surface inventory input, not proof that GlobalStack emulates the behavior.',
    '',
    `Generated: ${inventory._meta.generatedAt}`,
    `Provider namespaces queried: ${inventory._meta.providerCount}`,
    `Capabilities: ${inventory._meta.capabilityCount}`,
    '',
    '| Capability | Tier | Provider Resource Types | Matched Provider Operations | Read | Write | Delete | Action | Other |',
    '|---|---:|---|---:|---:|---:|---:|---:|---:|',
  ];

  for (const item of inventory.capabilities) {
    const counts = item.operationKindCounts;
    lines.push([
      item.capabilityId,
      item.tier,
      item.resourceTypes.join('<br>'),
      item.operationCount,
      counts.read ?? 0,
      counts.write ?? 0,
      counts.delete ?? 0,
      counts.action ?? 0,
      counts.other ?? 0,
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'));
  }

  lines.push('');
  lines.push('## Policy');
  lines.push('');
  lines.push('- A capability is not considered API-complete until its provider-operation inventory has been reconciled with ARM REST specs, SDK/IaC provider behavior, and real Azure captures.');
  lines.push('- Provider operation metadata does not include every data-plane operation and does not prove status codes, error shapes, defaults, async behavior, RBAC behavior, or eventual consistency.');
  lines.push('- Unknown or unreconciled operations must fail closed locally.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

const namespaces = [...new Set(allCapabilities.flatMap(capability => capability.resourceTypes.map(providerNamespace)))].sort();
const operationsByNamespace = {};

for (const namespace of namespaces) {
  const { stdout } = await execFileAsync('az', ['provider', 'operation', 'show', '--namespace', namespace, '-o', 'json'], {
    cwd: root,
    maxBuffer: 128 * 1024 * 1024,
  });
  operationsByNamespace[namespace] = flattenProviderOperations(JSON.parse(stdout));
}

const capabilities = allCapabilities.map(capability => {
  const matches = [];
  for (const resourceType of capability.resourceTypes) {
    const namespace = providerNamespace(resourceType);
    for (const operation of operationsByNamespace[namespace] ?? []) {
      if (!operationMatchesResourceType(operation, resourceType)) continue;
      matches.push({
        resourceType,
        name: operationName(operation),
        kind: operationKind(operation),
        display: operation.display ?? null,
        origin: operation.origin ?? null,
      });
    }
  }

  matches.sort((a, b) => a.name.localeCompare(b.name));
  const operationKindCounts = {};
  for (const item of matches) {
    operationKindCounts[item.kind] = (operationKindCounts[item.kind] ?? 0) + 1;
  }

  return {
    capabilityId: capability.id,
    tier: capability.tier,
    awsAnalogue: capability.awsAnalogue,
    azureEquivalent: capability.azureEquivalent,
    resourceTypes: capability.resourceTypes,
    operationCount: matches.length,
    operationKindCounts,
    operations: matches,
    caveat: 'Provider-operation inventory only; behavior still requires REST/spec reconciliation and real Azure conformance captures.',
  };
});

const inventory = {
  _meta: {
    generatedAt: new Date().toISOString(),
    generatedBy: 'npm run providers:surface',
    source: 'az provider operation show',
    providerNamespaces: namespaces,
    providerCount: namespaces.length,
    capabilityCount: allCapabilities.length,
    policy: 'Provider-operation inventory is required input for 99% parity planning but is not itself parity evidence.',
  },
  capabilities,
};

await mkdir(outRoot, { recursive: true });
await writeFile(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`);
await writeFile(mdPath, markdown(inventory));

console.log(`Captured Azure provider surface inventory for ${capabilities.length} capabilities from ${namespaces.length} provider namespaces`);
