import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCapabilities } from '../packages/core/src/azure-tier1-capabilities.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'docs', 'conformance');
const outJsonPath = join(outRoot, 'azure-99-parity-checklist.json');
const outMdPath = join(outRoot, 'azure-99-parity-checklist.md');
const liveCatalogPath = join(outRoot, 'azure-live-api-catalog.json');
const providerSurfacePath = join(outRoot, 'azure-provider-surface-inventory.json');
const packageJsonPath = join(root, 'package.json');
const capturesRoot = join(root, 'fixtures', 'azure-captures');
const lifecycleRoot = join(root, 'fixtures', 'azure-lifecycle-captures');
const storageDataPlaneExpectationsPath = join(root, 'fixtures', 'local-expectations', 'azure-storage-data-plane-expectations.json');

const platformRunnerNames = [
  'Terraform HCL',
  'OpenTofu HCL',
  'Pulumi TypeScript',
  'Pulumi Python',
  'Pulumi YAML',
  'Ansible YAML',
  'Bicep',
  'ARM JSON',
];

const iacScriptByCapability = new Map([
  ['activity-log-audit', 'e2e:activity-log-audit-parity'],
  ['aks-metadata', 'e2e:aks-metadata-parity'],
  ['api-management', 'e2e:api-management-parity'],
  ['app-configuration-parameters', 'e2e:app-configuration-parity'],
  ['azure-files', 'e2e:azure-files-parity'],
  ['azure-functions', 'e2e:azure-functions-parity'],
  ['blob-storage', 'e2e:storage-parity'],
  ['container-registry', 'e2e:container-registry-parity'],
  ['cosmos-nosql-table', 'e2e:cosmos-parity'],
  ['database-migration-service', 'e2e:database-migration-service-parity'],
  ['dns-zones', 'e2e:dns-zones-parity'],
  ['event-grid', 'e2e:event-grid-parity'],
  ['event-hubs-streams', 'e2e:event-hubs-parity'],
  ['front-door-cdn', 'e2e:front-door-cdn-parity'],
  ['identity-rbac', 'e2e:identity-rbac-parity'],
  ['key-vault-keys', 'e2e:key-vault-parity'],
  ['key-vault-secrets', 'e2e:key-vault-parity'],
  ['load-balancing', 'e2e:load-balancing-parity'],
  ['logic-workflows', 'e2e:logic-workflows-parity'],
  ['monitor-logs', 'e2e:monitor-logs-parity'],
  ['monitor-metrics-alerts', 'e2e:monitor-metrics-alerts-parity'],
  ['mysql-flexible-server', 'e2e:mysql-parity'],
  ['postgresql-flexible-server', 'e2e:postgresql-parity'],
  ['queue-storage', 'e2e:storage-parity'],
  ['redis-cache', 'e2e:redis-parity'],
  ['service-bus-topics', 'e2e:service-bus-parity'],
  ['service-discovery', 'e2e:service-discovery-parity'],
  ['synapse-warehouse', 'e2e:synapse-warehouse-parity'],
  ['virtual-network', 'e2e:virtual-network-parity'],
  ['waf-policy', 'e2e:waf-policy-parity'],
]);

const dataPlaneEvidenceByCapability = new Map([
  ['api-management', {
    script: 'e2e:api-management-parity',
    scope: 'local gateway host/path/subscription-key rejection and route smoke',
  }],
  ['azure-functions', {
    script: 'e2e:azure-functions-parity',
    scope: 'local HTTP-trigger routing, function-key rejection, and post-delete route rejection',
  }],
  ['container-registry', {
    script: 'e2e:container-registry-parity',
    scope: 'local ACR/Docker Registry bearer challenge, token, catalog, tag, manifest, and post-delete rejection smoke',
  }],
  ['event-grid', {
    script: 'e2e:event-grid-parity',
    scope: 'Event Grid topic publish URL, key auth, malformed publish rejection, and local event capture',
  }],
  ['key-vault-keys', {
    script: 'e2e:key-vault-parity',
    scope: 'local Key Vault key create/get/list/encrypt/decrypt/delete and key_ops rejection smoke',
  }],
  ['key-vault-secrets', {
    script: 'e2e:key-vault-parity',
    scope: 'local Key Vault secret set/get/version-list/delete and malformed secret rejection smoke',
  }],
  ['service-bus-topics', {
    script: 'e2e:service-bus-parity',
    scope: 'official Service Bus emulator queue/topic send, receive, complete, and missing-entity rejection smoke',
  }],
]);

const dimensions = [
  {
    id: 'liveApiSurfaceInventory',
    label: 'Complete live Azure API surface inventory',
    doneWhen: 'Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability.',
  },
  {
    id: 'parameterVarianceCaptures',
    label: 'Parameter variance captures',
    doneWhen: 'Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints.',
  },
  {
    id: 'stateTransitionCaptures',
    label: 'State transition captures',
    doneWhen: 'Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized.',
  },
  {
    id: 'errorShapeFidelity',
    label: 'Error-shape fidelity',
    doneWhen: 'Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior.',
  },
  {
    id: 'identityRbacBehavior',
    label: 'Identity/RBAC behavior',
    doneWhen: 'Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable.',
  },
  {
    id: 'retryEventualConsistency',
    label: 'Retry/eventual consistency behavior',
    doneWhen: 'Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope.',
  },
  {
    id: 'iacProviderBehavior',
    label: 'IaC-provider behavior',
    doneWhen: 'Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack.',
  },
  {
    id: 'dataPlaneBehavior',
    label: 'Data-plane behavior',
    doneWhen: 'Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics.',
  },
  {
    id: 'ambiguousRepeatCaptures',
    label: 'Repeat captures for ambiguous behavior',
    doneWhen: 'Timing-sensitive or inconsistent captures have repeat evidence before normalization.',
  },
  {
    id: 'serviceSpecificFacade',
    label: 'Service-specific local facade/emulator integration',
    doneWhen: 'The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests.',
  },
];

function status({ complete = false, partial = false, evidence = [], gaps = [] } = {}) {
  return {
    status: complete ? 'complete' : partial ? 'partial' : 'not-started',
    evidence,
    gaps,
  };
}

function loadJson(path, fallback = null) {
  return readFile(path, 'utf8').then(text => JSON.parse(text)).catch(() => fallback);
}

function capabilityCapturePrefix(capabilityId) {
  return `${capabilityId}.`;
}

function captureValidationBuckets(captures) {
  const buckets = {};
  for (const capture of captures) {
    const capabilityId = capture.id?.split('.')?.[0];
    if (!capabilityId) continue;
    if (!buckets[capabilityId]) buckets[capabilityId] = [];
    buckets[capabilityId].push(capture);
  }
  return buckets;
}

function countBy(items, fn) {
  const result = {};
  for (const item of items) {
    const key = fn(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function hasOperation(captures, operation) {
  const normalized = operation.toLowerCase();
  return captures.some(capture => String(capture.operation ?? '').toLowerCase() === normalized || String(capture.id ?? '').toLowerCase().includes(`.${normalized}.`));
}

function isStorageCapability(id) {
  return ['blob-storage', 'queue-storage', 'cosmos-nosql-table', 'azure-files'].includes(id);
}

function iacProviderEvidence(capabilityId, packageJson) {
  const script = iacScriptByCapability.get(capabilityId);
  const scripts = packageJson?.scripts ?? {};
  const smoke = scripts.smoke ?? '';
  if (!script || !scripts[script] || !smoke.includes(`npm run ${script}`)) return null;
  return { script, platforms: platformRunnerNames };
}

function scriptEvidence(script, packageJson) {
  const scripts = packageJson?.scripts ?? {};
  const smoke = scripts.smoke ?? '';
  if (!script || !scripts[script] || !smoke.includes(`npm run ${script}`)) return null;
  return script;
}

function dataPlaneEvidence(capabilityId, packageJson) {
  const evidence = dataPlaneEvidenceByCapability.get(capabilityId);
  if (!evidence || !scriptEvidence(evidence.script, packageJson)) return null;
  return evidence;
}

function markdown(doc) {
  const lines = [
    '# Azure 99% Parity Checklist',
    '',
    'This checklist is the service-by-service work queue for making GlobalStack Azure behave like real Azure for IaC deployments and integration tests.',
    '',
    'A service is not 99%-ready until every dimension below is complete from live Azure, official emulator, or explicitly scoped local conformance evidence. Partial evidence is useful, but it is not a parity claim.',
    '',
    `Generated: ${doc._meta.generatedAt}`,
    '',
    '## Dimensions',
    '',
  ];

  for (const dimension of doc.dimensions) {
    lines.push(`- \`${dimension.id}\`: ${dimension.label}. Done when: ${dimension.doneWhen}`);
  }

  lines.push('');
  lines.push('## Service Summary');
  lines.push('');
  lines.push('| Service | Tier | Current Status | Complete | Partial | Not Started | Candidate Calls | Live Captures | Provider Ops |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---:|---:|');
  for (const service of doc.services) {
    lines.push(`| ${service.capabilityId} | ${service.tier} | ${service.currentStatus} | ${service.dimensionCounts.complete} | ${service.dimensionCounts.partial} | ${service.dimensionCounts.notStarted} | ${service.evidence.candidateCallCount} | ${service.evidence.liveCaptureCount} | ${service.evidence.providerOperationCount ?? 'missing'} |`);
  }

  for (const service of doc.services) {
    lines.push('');
    lines.push(`## ${service.capabilityId}`);
    lines.push('');
    lines.push(`- Tier: ${service.tier}`);
    lines.push(`- AWS analogue: ${service.awsAnalogue}`);
    lines.push(`- Azure equivalent: ${service.azureEquivalent}`);
    lines.push(`- Current status: ${service.currentStatus}`);
    lines.push(`- Resource types: ${service.resourceTypes.join(', ')}`);
    lines.push('');
    lines.push('| Dimension | Status | Evidence | Remaining Gaps |');
    lines.push('|---|---|---|---|');
    for (const dimension of dimensions) {
      const item = service.dimensions[dimension.id];
      lines.push(`| ${dimension.label} | ${item.status} | ${item.evidence.length ? item.evidence.join('<br>') : ''} | ${item.gaps.length ? item.gaps.join('<br>') : ''} |`);
    }
  }

  lines.push('');
  lines.push('## Operating Rule');
  lines.push('');
  lines.push('GlobalStack must deploy resources locally only for modeled surfaces. A modeled surface should match real Azure for captured parameters and states. Unknown surfaces, unmodeled data-plane calls, and unreconciled Azure behavior must fail closed rather than return fabricated success.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

const [
  liveCatalog,
  providerSurface,
  packageJson,
  storageDataPlaneExpectations,
] = await Promise.all([
  loadJson(liveCatalogPath, { calls: [] }),
  loadJson(providerSurfacePath, null),
  loadJson(packageJsonPath, { scripts: {} }),
  loadJson(storageDataPlaneExpectationsPath, { expectations: [] }),
]);

const captureFiles = (await readdir(capturesRoot).catch(() => [])).filter(name => name.endsWith('.json'));
const captures = [];
for (const file of captureFiles) {
  const capture = await loadJson(join(capturesRoot, file), null);
  if (capture) captures.push(capture);
}
const captureBuckets = captureValidationBuckets(captures);

const lifecycleFiles = (await readdir(lifecycleRoot).catch(() => [])).filter(name => name.endsWith('.json'));
const lifecycleCaptureCount = lifecycleFiles.length;
const storageDataPlaneExpectationCount = storageDataPlaneExpectations.expectations?.length ?? 0;
const providerByCapability = new Map((providerSurface?.capabilities ?? []).map(item => [item.capabilityId, item]));

const services = allCapabilities.map(capability => {
  const calls = (liveCatalog.calls ?? []).filter(call => call.capabilityId === capability.id);
  const provider = providerByCapability.get(capability.id) ?? null;
  const capabilityCaptures = captureBuckets[capability.id] ?? captures.filter(capture => String(capture.id ?? '').startsWith(capabilityCapturePrefix(capability.id)));
  const varianceCounts = countBy(capabilityCaptures, capture => capture.varianceId ?? capture.caseId ?? 'unknown');
  const validationDepthCounts = countBy(capabilityCaptures, capture => capture.globalstack?.validationDepth ?? capture.validationDepth ?? 'unknown');
  const hasCreate = hasOperation(capabilityCaptures, 'createOrUpdate') || hasOperation(capabilityCaptures, 'create');
  const hasGet = hasOperation(capabilityCaptures, 'get');
  const hasList = hasOperation(capabilityCaptures, 'listByResourceGroup') || hasOperation(capabilityCaptures, 'list');
  const hasDelete = hasOperation(capabilityCaptures, 'delete');
  const hasNegativeVariance = Object.keys(varianceCounts).some(key => !['valid-minimal', 'empty-list'].includes(key));
  const hasLocalFacade = capability.implementedOperations.length > 0;
  const hasOfficialEmulator = capability.primaryModes.includes('official-emulator');
  const storageDataPlaneRelevant = ['blob-storage', 'queue-storage'].includes(capability.id);
  const iacEvidence = iacProviderEvidence(capability.id, packageJson);
  const dataPlaneEvidenceItem = dataPlaneEvidence(capability.id, packageJson);

  const serviceDimensions = {
    liveApiSurfaceInventory: status({
      partial: calls.length > 0 || !!provider,
      complete: false,
      evidence: [
        calls.length ? `${calls.length} candidate catalog calls` : null,
        provider ? `${provider.operationCount} provider operations matched` : null,
      ].filter(Boolean),
      gaps: [
        'Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.',
        'Add data-plane surface inventory where the service has data-plane APIs.',
      ],
    }),
    parameterVarianceCaptures: status({
      partial: capabilityCaptures.length > 0 && hasNegativeVariance,
      complete: false,
      evidence: [
        `${capabilityCaptures.length} live ARM captures`,
        `variance cases: ${Object.entries(varianceCounts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
      ],
      gaps: ['Expand service-specific positive and negative parameter matrix beyond the current generic variance cases.'],
    }),
    stateTransitionCaptures: status({
      partial: hasCreate && hasGet && hasList && hasDelete,
      complete: false,
      evidence: [
        hasCreate ? 'create captured' : null,
        hasGet ? 'get captured' : null,
        hasList ? 'list captured' : null,
        hasDelete ? 'delete captured' : null,
        isStorageCapability(capability.id) && lifecycleCaptureCount ? `${lifecycleCaptureCount} storage lifecycle capture files exist` : null,
      ].filter(Boolean),
      gaps: ['Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service.'],
    }),
    errorShapeFidelity: status({
      partial: capabilityCaptures.length > 0,
      complete: false,
      evidence: [`validation depths: ${Object.entries(validationDepthCounts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`],
      gaps: ['Promote captured status/error/body/header assertions into local replay tests for every service-specific case.'],
    }),
    identityRbacBehavior: status({
      partial: capability.id === 'identity-rbac',
      complete: false,
      evidence: capability.id === 'identity-rbac' ? ['identity-rbac capability exists in Tier 1 registry'] : [],
      gaps: ['Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials.'],
    }),
    retryEventualConsistency: status({
      partial: isStorageCapability(capability.id) && lifecycleCaptureCount > 0,
      complete: false,
      evidence: isStorageCapability(capability.id) ? [`${lifecycleCaptureCount} storage lifecycle capture files`] : [],
      gaps: ['Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service.'],
    }),
    iacProviderBehavior: status({
      partial: !!iacEvidence,
      complete: false,
      evidence: iacEvidence
        ? [
          `${iacEvidence.script} is wired into npm run smoke`,
          `${iacEvidence.platforms.length} platform lifecycle runners: ${iacEvidence.platforms.join(', ')}`,
        ]
        : [],
      gaps: iacEvidence
        ? [
          'Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.',
          'Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity.',
        ]
        : ['Wire a dedicated parity pack into npm run smoke with Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible GlobalStack lifecycle coverage.'],
    }),
    dataPlaneBehavior: status({
      partial: (storageDataPlaneRelevant && storageDataPlaneExpectationCount > 0) || !!dataPlaneEvidenceItem,
      complete: false,
      evidence: [
        storageDataPlaneRelevant ? `${storageDataPlaneExpectationCount} Blob/Queue data-plane expectations` : null,
        dataPlaneEvidenceItem ? `${dataPlaneEvidenceItem.script} is wired into npm run smoke` : null,
        dataPlaneEvidenceItem ? dataPlaneEvidenceItem.scope : null,
      ].filter(Boolean),
      gaps: storageDataPlaneRelevant
        ? ['Expand Blob/Queue captures and local normalization beyond Wave 1.']
        : dataPlaneEvidenceItem
          ? [
            'Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.',
            'Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out.',
          ]
          : [
            hasOfficialEmulator ? `Official/local backing option declared: ${capability.backingEngines.join(', ')}` : 'No durable local data-plane evidence is recorded yet.',
            'Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability.',
          ],
    }),
    ambiguousRepeatCaptures: status({
      partial: storageDataPlaneRelevant,
      complete: false,
      evidence: storageDataPlaneRelevant ? ['queue-peek-after-delete is explicitly marked needs-repeat-capture'] : [],
      gaps: ['Repeat timing-sensitive captures and record stabilization rules before normalization.'],
    }),
    serviceSpecificFacade: status({
      partial: hasLocalFacade,
      complete: false,
      evidence: [
        `${capability.implementedOperations.length} registry operations declared`,
        capability.backingEngines.length ? `backing engines: ${capability.backingEngines.join(', ')}` : null,
      ].filter(Boolean),
      gaps: ['Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed.'],
    }),
  };

  const dimensionCounts = {
    complete: Object.values(serviceDimensions).filter(item => item.status === 'complete').length,
    partial: Object.values(serviceDimensions).filter(item => item.status === 'partial').length,
    notStarted: Object.values(serviceDimensions).filter(item => item.status === 'not-started').length,
  };
  const currentStatus = dimensionCounts.complete === dimensions.length
    ? '99-ready'
    : dimensionCounts.partial > 0
      ? 'in-progress'
      : 'not-started';

  return {
    capabilityId: capability.id,
    tier: capability.tier,
    awsAnalogue: capability.awsAnalogue,
    azureEquivalent: capability.azureEquivalent,
    resourceTypes: capability.resourceTypes,
    currentStatus,
    evidence: {
      candidateCallCount: calls.length,
      providerOperationCount: provider?.operationCount ?? null,
      liveCaptureCount: capabilityCaptures.length,
      validationDepthCounts,
    },
    dimensionCounts,
    dimensions: serviceDimensions,
  };
});

const doc = {
  _meta: {
    generatedAt: new Date().toISOString(),
    generatedBy: 'npm run conformance:parity',
    policy: 'No capability is 99%-ready until every dimension is complete. Partial evidence must remain visible.',
    serviceCount: services.length,
    dimensionCount: dimensions.length,
  },
  dimensions,
  services,
};

await mkdir(outRoot, { recursive: true });
await writeFile(outJsonPath, `${JSON.stringify(doc, null, 2)}\n`);
await writeFile(outMdPath, markdown(doc));

console.log(`Rendered Azure 99% parity checklist for ${services.length} services`);
