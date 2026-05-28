import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { allCapabilities } from '../../packages/core/src/azure-tier1-capabilities.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'docs', 'conformance');
const outJsonPath = join(outRoot, 'azure-99-parity-checklist.json');
const outMdPath = join(outRoot, 'azure-99-parity-checklist.md');
const liveCatalogPath = join(outRoot, 'azure-live-api-catalog.json');
const providerSurfacePath = join(outRoot, 'azure-provider-surface-inventory.json');
const packageJsonPath = join(root, 'package.json');
const capturesRoot = join(root, 'fixtures', 'azure-captures');
const lifecycleRoot = join(root, 'fixtures', 'azure-lifecycle-captures');
const storageDataPlaneExpectationsPath = join(root, 'fixtures', 'local-expectations', 'azure-storage-data-plane-expectations.json');
const distE2eRoot = join(root, 'dist', 'e2e');
const storageHardeningResultsPath = join(distE2eRoot, 'azure-storage-hardening', 'results.json');
const storageNormalizerResultsPath = join(distE2eRoot, 'azure-storage-normalizer', 'results.json');

const platformRunnerNames = azurePlatforms.map(platform => platform.label.replace(/^Azure /, ''));

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
    scope: 'local Key Vault key create/get/list/encrypt/decrypt/sign/verify/wrapKey/unwrapKey/delete and key_ops rejection smoke',
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

function scriptPathFromCommand(command) {
  return command?.match(/\bnode\s+(scripts\/[^\s]+\.mjs)\b/)?.[1] ?? null;
}

function scriptSource(script, packageJson, scriptSources) {
  const command = packageJson?.scripts?.[script];
  const relativePath = scriptPathFromCommand(command);
  return relativePath ? scriptSources.get(relativePath) : null;
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

function storageStepMatchers(capabilityId) {
  if (capabilityId === 'blob-storage') {
    return [/^blob /i, /blob /i, /unauthenticated blob/i];
  }
  if (capabilityId === 'queue-storage') {
    return [/^queue /i, /queue /i];
  }
  return [];
}

function storageRelevantSteps(capabilityId, ...results) {
  const matchers = storageStepMatchers(capabilityId);
  if (!matchers.length) return [];
  return results.flatMap(result => (result?.steps ?? []).filter(step => {
    const name = String(step?.name ?? '');
    return matchers.some(pattern => pattern.test(name));
  }));
}

function storageEvidenceSummary(capabilityId, hardeningResult, normalizerResult) {
  if (!['blob-storage', 'queue-storage'].includes(capabilityId)) return null;
  const hardeningSteps = storageRelevantSteps(capabilityId, hardeningResult);
  const normalizerSteps = storageRelevantSteps(capabilityId, normalizerResult);
  const allSteps = [...hardeningSteps, ...normalizerSteps];
  if (!allSteps.length) return null;

  const caseNames = allSteps.map(step => String(step.name).toLowerCase());
  const hasName = pattern => caseNames.some(name => pattern.test(name));
  const hardeningOk = hardeningSteps.length > 0 && hardeningSteps.every(step => step.ok === true);
  const normalizerOk = normalizerSteps.length > 0 ? normalizerSteps.every(step => step.ok === true) : true;
  const queueRepeatGap = /queue peek-after-delete/i.test(String(normalizerResult?.caveat ?? ''));

  const complete = capabilityId === 'blob-storage'
    ? hardeningOk
      && normalizerOk
      && hasName(/blob create container/)
      && hasName(/blob get payload/)
      && hasName(/blob delete blob/)
      && hasName(/blob get after delete rejected/)
      && (hasName(/blob get without authorization rejected/) || hasName(/unauthenticated blob get/))
      && hasName(/normalizes missing blob type/)
    : hardeningOk
      && normalizerOk
      && hasName(/^queue create$/)
      && hasName(/queue put message/)
      && hasName(/queue peek message/)
      && hasName(/queue delete/)
      && hasName(/queue peek after delete rejected/)
      && hasName(/queue metadata without authorization rejected/)
      && hasName(/normalizes malformed queue xml/);

  return {
    script: 'e2e:storage-parity',
    scope: capabilityId === 'blob-storage'
      ? 'official-emulator Blob data-plane create/get/delete/auth plus GlobalStack normalization coverage'
      : 'official-emulator Queue data-plane create/peek/delete/auth plus GlobalStack normalization coverage',
    hardeningCount: hardeningSteps.length,
    normalizerCount: normalizerSteps.length,
    complete,
    authRejectCovered: capabilityId === 'blob-storage'
      ? hasName(/blob get without authorization rejected/) || hasName(/unauthenticated blob get/)
      : hasName(/queue metadata without authorization rejected/),
    repeatGap: capabilityId === 'queue-storage' && queueRepeatGap,
    repeatComplete: capabilityId === 'blob-storage' || (capabilityId === 'queue-storage' && !queueRepeatGap),
    evidence: [
      `${hardeningSteps.length} official-emulator data-plane hardening checks`,
      normalizerSteps.length ? `${normalizerSteps.length} normalization checks` : null,
      capabilityId === 'queue-storage' && queueRepeatGap
        ? 'queue peek-after-delete remains an explicit normalization/repeat gap'
        : 'no service-specific repeat caveat is currently recorded for this storage surface',
    ].filter(Boolean),
  };
}

function resultDirForScript(script) {
  const bare = String(script ?? '').replace(/^e2e:/, '');
  return bare.startsWith('azure-') ? bare : `azure-${bare}`;
}

function collectCaseNames(node, names = []) {
  if (!node || typeof node !== 'object') return names;
  if (Array.isArray(node)) {
    for (const item of node) collectCaseNames(item, names);
    return names;
  }
  if (Array.isArray(node.cases)) {
    for (const item of node.cases) {
      if (item?.name) names.push(String(item.name).toLowerCase());
    }
  }
  if (Array.isArray(node.steps)) {
    for (const item of node.steps) {
      if (item?.name) names.push(String(item.name).toLowerCase());
    }
  }
  for (const value of Object.values(node)) collectCaseNames(value, names);
  return names;
}

function paritySectionNames(result) {
  if (!result || typeof result !== 'object') return [];
  return Object.entries(result)
    .filter(([, value]) => value && typeof value === 'object' && Array.isArray(value.cases))
    .map(([key]) => key);
}

function parityPlatformMatrixComplete(result) {
  const matrix = result?.platformMatrix;
  return matrix?.ok === true
    && matrix?.expectedPlatforms === platformRunnerNames.length
    && matrix?.passedCount === platformRunnerNames.length
    && Array.isArray(matrix?.results)
    && matrix.results.length === platformRunnerNames.length
    && matrix.results.every(item => item.ok === true && item.finalStatus === 'PASS' && (item.providerLifecycleOk === true || item.providerLifecycleOk == null));
}

function parityStateMarkers(caseNames) {
  return {
    update: caseNames.some(name => /\bupdate\b|\bpreserves\b|\bcan change\b/.test(name)),
    postDelete: caseNames.some(name => /after delete|delete after delete/.test(name)),
    asyncOrTransitional: caseNames.some(name => /async operation status|transitional provisioning state|returns async azure shape|returns async accepted|creating/.test(name)),
    parentReadiness: caseNames.some(name => /missing parent|reports missing parent|requires an existing resource group|before .*readiness/.test(name)),
    syncLifecycle: caseNames.some(name => /create succeeds|create returns 201|create returns 200/.test(name)),
  };
}

function hasDataPlaneCoverage(caseNames, sectionNames) {
  if (sectionNames.some(section => ['dataPlane', 'controlAndDataPlane', 'controlAndGatewayPlane', 'officialEmulator'].includes(section))) {
    return true;
  }
  const markers = [
    /data-plane /,
    /gateway /,
    /local redis backing/,
    /local postgres backing/,
    /local mysql backing/,
    /local key vault/,
    /http-trigger/,
    /service bus emulator/,
    /queue send and receive configured entity/,
    /topic publish and subscription receive configured entity/,
    /dead-lettered queue message/,
    /event grid publish/,
    /local workflow runner/,
    /workflow trigger/,
    /trigger callback url/,
    /openid configuration/,
    /jwks route/,
    /token request/,
    /local private dns registry/,
    /local container app registry/,
    /query returns created document/,
    /table entity/,
    /sql query/,
    /docker registry/,
    /partitions list succeeds/,
    /workspace query|log analytics/,
    /local network model/,
  ];
  return markers.some(pattern => caseNames.some(name => pattern.test(name)));
}

function repeatCaptureMarkers(caseNames) {
  return {
    repeatedBehavior: caseNames.some(name => /across repeated|repeated|repeat capture|remains .* across|stays .* across/.test(name)),
  };
}

function authEvidenceMarkers(caseNames) {
  return {
    armRejects: [
      /unauthenticated arm request is rejected/,
      /malformed bearer token is rejected/,
      /wrong bearer token is rejected/,
      /subscription mismatch is rejected/,
    ].every(pattern => caseNames.some(name => pattern.test(name))),
    dataPlaneRejects: caseNames.some(name => /without auth|missing key|malformed bearer token|access denied|unauthorized/.test(name)),
  };
}

function hasDataPlaneScope(capability, storageDataPlaneRelevant, dataPlaneEvidenceItem, hasOfficialEmulator) {
  return storageDataPlaneRelevant
    || !!dataPlaneEvidenceItem
    || hasOfficialEmulator
    || capability.backingEngines?.some(engine => /emulator|runtime|router/i.test(engine))
    || capability.primaryModes?.some(mode => /emulator|hybrid/i.test(mode));
}

const genericVarianceIds = new Set([
  'valid-minimal',
  'empty-list',
  'empty-body',
  'invalid-location',
  'invalid-tags-shape',
  'missing-api-version',
  'null-properties',
  'unsupported-api-version',
  'missing-location',
  'not-found',
]);

function parameterVarianceSummary(calls, capabilityCaptures, varianceCounts) {
  const varianceIds = Object.keys(varianceCounts);
  const serviceSpecificNegativeIds = varianceIds.filter(id => !genericVarianceIds.has(id));
  const negativeVarianceIds = varianceIds.filter(id => !['valid-minimal', 'empty-list'].includes(id));
  const complete = capabilityCaptures.length >= Math.max(calls.length, 6)
    && Number(varianceCounts['valid-minimal'] ?? 0) > 0
    && negativeVarianceIds.length >= 4
    && serviceSpecificNegativeIds.length >= 1;
  return {
    complete,
    serviceSpecificNegativeIds,
    negativeVarianceIds,
  };
}

function errorShapeEvidence(capabilityId, packageJson, scriptSources) {
  const script = iacScriptByCapability.get(capabilityId);
  if (!scriptEvidence(script, packageJson)) return null;
  const source = scriptSource(script, packageJson, scriptSources);
  if (!source) return null;

  const statusAssertions = (source.match(/assert\.equal\([^,\n]+\.status/g) ?? []).length;
  const errorAssertions = (source.match(/assert\.equal\(errorCode\(/g) ?? []).length;
  const headerAssertions = (source.match(/retry-after|azure-asyncoperation|www-authenticate/gi) ?? []).length;
  if (!statusAssertions && !errorAssertions && !headerAssertions) return null;

  return {
    script,
    statusAssertions,
    errorAssertions,
    headerAssertions,
  };
}

function identityEvidence(capabilityId, packageJson, scriptSources) {
  const script = iacScriptByCapability.get(capabilityId);
  if (!scriptEvidence(script, packageJson)) return null;
  const source = scriptSource(script, packageJson, scriptSources);
  if (!source?.includes('InvalidAuthenticationToken')) return null;

  const evidence = [
    `${script} is wired into npm run smoke`,
    'ARM InvalidAuthenticationToken rejection is asserted by the service parity pack',
  ];
  if (source.includes('AuthorizationFailed')) {
    evidence.push('subscription-scope AuthorizationFailed rejection is asserted by the service parity pack');
  }
  if (capabilityId === 'identity-rbac') {
    evidence.push('local token facade, OpenID discovery, Managed Identity, role assignment, and role definition rejection paths are covered by the identity/RBAC parity pack');
  }
  return evidence;
}

function retryConsistencyEvidence(capabilityId, packageJson, scriptSources) {
  const script = iacScriptByCapability.get(capabilityId);
  if (!scriptEvidence(script, packageJson)) return null;
  const source = scriptSource(script, packageJson, scriptSources);
  if (!source) return null;

  const evidence = [];
  if (/azure-asyncoperation/i.test(source)) evidence.push('async-operation header behavior is asserted');
  if (/retry-after/i.test(source)) evidence.push('retry-after header behavior is asserted');
  if (/Creating|provisioning/i.test(source)) evidence.push('transitional/provisioning state behavior is asserted');
  if (/post-delete|get after delete|list after delete|delete after delete|after .*delete/i.test(source)) evidence.push('post-delete behavior is asserted');
  if (!evidence.length) return null;
  return {
    script,
    evidence,
  };
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
  storageHardeningResult,
  storageNormalizerResult,
] = await Promise.all([
  loadJson(liveCatalogPath, { calls: [] }),
  loadJson(providerSurfacePath, null),
  loadJson(packageJsonPath, { scripts: {} }),
  loadJson(storageDataPlaneExpectationsPath, { expectations: [] }),
  loadJson(storageHardeningResultsPath, null),
  loadJson(storageNormalizerResultsPath, null),
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
const scriptPaths = [...new Set(Object.values(packageJson.scripts ?? {}).map(scriptPathFromCommand).filter(Boolean))];
const scriptSources = new Map(await Promise.all(scriptPaths.map(async relativePath => [
  relativePath,
  await readFile(join(root, relativePath), 'utf8').catch(() => ''),
])));
const parityResultByScript = new Map(await Promise.all(
  [...new Set(iacScriptByCapability.values())].map(async script => [
    script,
    await loadJson(join(distE2eRoot, resultDirForScript(script), 'results.json'), null),
  ]),
));

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
  const varianceSummary = parameterVarianceSummary(calls, capabilityCaptures, varianceCounts);
  const hasLocalFacade = capability.implementedOperations.length > 0;
  const hasOfficialEmulator = capability.primaryModes.includes('official-emulator');
  const storageDataPlaneRelevant = ['blob-storage', 'queue-storage'].includes(capability.id);
  const storageEvidenceItem = storageEvidenceSummary(capability.id, storageHardeningResult, storageNormalizerResult);
  const iacEvidence = iacProviderEvidence(capability.id, packageJson);
  const dataPlaneEvidenceItem = storageEvidenceItem ?? dataPlaneEvidence(capability.id, packageJson);
  const baseIdentityEvidenceItems = identityEvidence(capability.id, packageJson, scriptSources);
  const identityEvidenceItems = storageEvidenceItem?.authRejectCovered
    ? [
        ...(baseIdentityEvidenceItems ?? []),
        `${storageEvidenceItem.scope} includes explicit data-plane authorization rejection coverage`,
      ]
    : baseIdentityEvidenceItems;
  const retryEvidenceItem = retryConsistencyEvidence(capability.id, packageJson, scriptSources);
  const errorShapeItem = errorShapeEvidence(capability.id, packageJson, scriptSources);
  const parityResult = parityResultByScript.get(iacScriptByCapability.get(capability.id)) ?? null;
  const parityCaseNames = [...new Set(collectCaseNames(parityResult))];
  const paritySections = paritySectionNames(parityResult);
  const platformMatrixComplete = parityPlatformMatrixComplete(parityResult);
  const stateMarkers = parityStateMarkers(parityCaseNames);
  const repeatMarkers = repeatCaptureMarkers(parityCaseNames);
  const authMarkers = authEvidenceMarkers(parityCaseNames);
  const dataPlaneScoped = hasDataPlaneScope(capability, storageDataPlaneRelevant, dataPlaneEvidenceItem, hasOfficialEmulator);
  const stateTransitionComplete = hasCreate
    && hasGet
    && hasList
    && hasDelete
    && stateMarkers.update
    && stateMarkers.postDelete
    && (stateMarkers.asyncOrTransitional || stateMarkers.syncLifecycle)
    && stateMarkers.parentReadiness;
  const dataPlaneComplete = hasDataPlaneCoverage(parityCaseNames, paritySections);
  const facadeComplete = hasLocalFacade && parityResult?.ok === true;
  const retryConsistencyComplete = !!retryEvidenceItem
    && stateMarkers.asyncOrTransitional
    && stateMarkers.postDelete
    && retryEvidenceItem.evidence.some(item => /async-operation|retry-after|transitional\/provisioning/i.test(item));
  const syncRepeatConsistencyComplete = !stateMarkers.asyncOrTransitional
    && repeatMarkers.repeatedBehavior
    && stateMarkers.postDelete;
  const identityRetryComplete = capability.id === 'identity-rbac'
    && parityCaseNames.some(name => /token request issues stable local access token across repeated requests/.test(name))
    && stateMarkers.postDelete;
  const errorShapeComplete = capabilityCaptures.length >= Math.max(calls.length, 6)
    && !!errorShapeItem
    && errorShapeItem.statusAssertions >= 8
    && errorShapeItem.errorAssertions >= 4
    && (errorShapeItem.headerAssertions > 0 || hasNegativeVariance);
  const effectiveDataPlaneComplete = storageEvidenceItem?.complete ?? dataPlaneComplete;
  const identityComplete = capability.id === 'identity-rbac'
    ? !!identityEvidenceItems
      && parityCaseNames.some(name => /openid configuration exposes local token endpoint/.test(name))
      && parityCaseNames.some(name => /jwks route exposes deterministic empty key set/.test(name))
      && parityCaseNames.some(name => /token request issues local access token/.test(name))
      && parityCaseNames.some(name => /managed identity create succeeds/.test(name))
      && parityCaseNames.some(name => /role assignment .*rejection|role definition .*rejection/.test(name))
    : !!identityEvidenceItems
      && authMarkers.armRejects
      && (!effectiveDataPlaneComplete || storageEvidenceItem?.authRejectCovered || authMarkers.dataPlaneRejects);
  const liveApiInventoryComplete = calls.length > 0
    && !!provider?.operationCount
    && (!dataPlaneScoped || effectiveDataPlaneComplete);

  const serviceDimensions = {
    liveApiSurfaceInventory: status({
      partial: calls.length > 0 || !!provider,
      complete: liveApiInventoryComplete,
      evidence: [
        calls.length ? `${calls.length} candidate catalog calls` : null,
        provider ? `${provider.operationCount} provider operations matched` : null,
        liveApiInventoryComplete ? 'ARM/provider inventory is reconciled and any scoped data-plane inventory is present' : null,
      ].filter(Boolean),
      gaps: liveApiInventoryComplete
        ? []
        : [
          'Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.',
          'Add data-plane surface inventory where the service has data-plane APIs.',
        ],
    }),
    parameterVarianceCaptures: status({
      partial: capabilityCaptures.length > 0 && hasNegativeVariance,
      complete: varianceSummary.complete,
      evidence: [
        `${capabilityCaptures.length} live ARM captures`,
        `variance cases: ${Object.entries(varianceCounts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
        varianceSummary.serviceSpecificNegativeIds.length
          ? `service-specific negative variance ids: ${varianceSummary.serviceSpecificNegativeIds.join(', ')}`
          : null,
      ],
      gaps: varianceSummary.complete
        ? []
        : ['Expand service-specific positive and negative parameter matrix beyond the current generic variance cases.'],
    }),
    stateTransitionCaptures: status({
      partial: hasCreate && hasGet && hasList && hasDelete,
      complete: stateTransitionComplete,
      evidence: [
        hasCreate ? 'create captured' : null,
        hasGet ? 'get captured' : null,
        hasList ? 'list captured' : null,
        hasDelete ? 'delete captured' : null,
        isStorageCapability(capability.id) && lifecycleCaptureCount ? `${lifecycleCaptureCount} storage lifecycle capture files exist` : null,
        stateMarkers.update ? 'update behavior is asserted by the parity pack' : null,
        stateMarkers.postDelete ? 'post-delete behavior is asserted by the parity pack' : null,
        stateMarkers.asyncOrTransitional ? 'async or transitional provisioning behavior is asserted by the parity pack' : null,
        !stateMarkers.asyncOrTransitional && stateMarkers.syncLifecycle ? 'synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack' : null,
        stateMarkers.parentReadiness ? 'parent readiness and missing-parent behavior is asserted by the parity pack' : null,
      ].filter(Boolean),
      gaps: stateTransitionComplete
        ? []
        : ['Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service.'],
    }),
    errorShapeFidelity: status({
      partial: capabilityCaptures.length > 0,
      complete: errorShapeComplete,
      evidence: [
        `validation depths: ${Object.entries(validationDepthCounts).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`,
        errorShapeItem ? `${errorShapeItem.script} asserts ${errorShapeItem.statusAssertions} status checks, ${errorShapeItem.errorAssertions} error-code checks, ${errorShapeItem.headerAssertions} header checks` : null,
      ].filter(Boolean),
      gaps: errorShapeComplete
        ? []
        : ['Promote captured status/error/body/header assertions into local replay tests for every service-specific case.'],
    }),
    identityRbacBehavior: status({
      partial: !!identityEvidenceItems,
      complete: identityComplete,
      evidence: identityEvidenceItems ?? [],
      gaps: identityComplete
        ? []
        : identityEvidenceItems
        ? [
          'Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.',
          'Implement service-specific data-plane RBAC denials and propagation timing where applicable.',
          'Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured.',
        ]
        : ['Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials.'],
    }),
    retryEventualConsistency: status({
      partial: (isStorageCapability(capability.id) && lifecycleCaptureCount > 0) || !!retryEvidenceItem,
      complete: retryConsistencyComplete || identityRetryComplete || syncRepeatConsistencyComplete,
      evidence: [
        isStorageCapability(capability.id) ? `${lifecycleCaptureCount} storage lifecycle capture files` : null,
        retryEvidenceItem ? `${retryEvidenceItem.script} is wired into npm run smoke` : null,
        ...(retryEvidenceItem?.evidence ?? []),
        identityRetryComplete ? 'identity token issuance remains stable across repeated requests while post-delete identity reads remain not found' : null,
        syncRepeatConsistencyComplete ? 'parity pack covers repeated stability and post-delete behavior for synchronous service paths' : null,
        retryConsistencyComplete ? 'parity pack covers async/transitional and post-delete timing behavior' : null,
      ].filter(Boolean),
      gaps: (retryConsistencyComplete || identityRetryComplete || syncRepeatConsistencyComplete)
        ? []
        : [
          'Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.',
          'Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate.',
        ],
    }),
    iacProviderBehavior: status({
      partial: !!iacEvidence,
      complete: platformMatrixComplete,
      evidence: iacEvidence
        ? [
          `${iacEvidence.script} is wired into npm run smoke`,
          `${iacEvidence.platforms.length} platform lifecycle runners: ${iacEvidence.platforms.join(', ')}`,
          platformMatrixComplete ? 'all platform lifecycle runners passed provider lifecycle validation for this service' : null,
        ]
        : platformMatrixComplete
          ? ['all platform lifecycle runners passed provider lifecycle validation for this service']
          : [],
      gaps: platformMatrixComplete
        ? []
        : iacEvidence
        ? [
          'Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.',
          'Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity.',
        ]
        : ['Wire a dedicated parity pack into npm run smoke with Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible GlobalStack lifecycle coverage.'],
    }),
    dataPlaneBehavior: status({
      partial: (storageDataPlaneRelevant && storageDataPlaneExpectationCount > 0) || !!dataPlaneEvidenceItem,
      complete: storageEvidenceItem?.complete ?? dataPlaneComplete,
      evidence: [
        storageDataPlaneRelevant ? `${storageDataPlaneExpectationCount} Blob/Queue data-plane expectations` : null,
        dataPlaneEvidenceItem ? `${dataPlaneEvidenceItem.script} is wired into npm run smoke` : null,
        dataPlaneEvidenceItem ? dataPlaneEvidenceItem.scope : null,
        ...(storageEvidenceItem?.evidence ?? []),
        effectiveDataPlaneComplete ? `parity result sections: ${paritySections.join(', ') || 'case-derived data-plane coverage'}` : null,
      ].filter(Boolean),
      gaps: effectiveDataPlaneComplete
        ? []
        : storageDataPlaneRelevant
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
      partial: capability.id === 'queue-storage'
        ? !!storageEvidenceItem || repeatMarkers.repeatedBehavior
        : storageDataPlaneRelevant || repeatMarkers.repeatedBehavior,
      complete: storageEvidenceItem ? storageEvidenceItem.repeatComplete : repeatMarkers.repeatedBehavior,
      evidence: [
        capability.id === 'queue-storage' && storageEvidenceItem?.repeatGap
          ? 'queue-peek-after-delete is explicitly marked needs-repeat-capture'
          : null,
        capability.id === 'blob-storage' && storageEvidenceItem?.repeatComplete
          ? 'no blob-specific repeat gap remains in the storage normalizer caveat set'
          : null,
        repeatMarkers.repeatedBehavior ? 'parity pack asserts repeated or timing-sensitive behavior remains stable across reruns' : null,
      ].filter(Boolean),
      gaps: (storageEvidenceItem ? storageEvidenceItem.repeatComplete : repeatMarkers.repeatedBehavior)
        ? []
        : ['Repeat timing-sensitive captures and record stabilization rules before normalization.'],
    }),
    serviceSpecificFacade: status({
      partial: hasLocalFacade,
      complete: facadeComplete,
      evidence: [
        `${capability.implementedOperations.length} registry operations declared`,
        capability.backingEngines.length ? `backing engines: ${capability.backingEngines.join(', ')}` : null,
        facadeComplete ? 'dedicated parity pack passed against the local facade/runtime path' : null,
      ].filter(Boolean),
      gaps: facadeComplete
        ? []
        : ['Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed.'],
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
