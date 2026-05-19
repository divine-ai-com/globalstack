import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azurePlatforms } from '../src/platforms.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(root, 'dist');
const hybridCoveragePath = join(root, 'docs', 'hybrid', 'azure-hybrid-coverage.json');
const liveApiCatalogPath = join(root, 'docs', 'conformance', 'azure-live-api-catalog.json');
const parityChecklistPath = join(root, 'docs', 'conformance', 'azure-99-parity-checklist.json');
const parityRoadmapPath = join(root, 'docs', 'conformance', 'azure-99-roadmap.json');
const artifactRegistryPath = join(root, 'docs', 'ARTIFACT-REGISTRY.json');
const captureClassificationPath = join(root, 'docs', 'conformance', 'azure-capture-classification.json');
const localExpectationsPath = join(root, 'fixtures', 'local-expectations', 'azure-derived-local-expectations.json');
const storageDataPlaneExpectationsPath = join(root, 'fixtures', 'local-expectations', 'azure-storage-data-plane-expectations.json');
const deploySmokeRoot = join(distRoot, 'deploy-smoke');
const deploySmokeResultsPath = join(deploySmokeRoot, 'results.json');
const iacModelResponseSmokeRoot = join(distRoot, 'iac-model-response-smoke');
const iacModelResponseSmokeResultsPath = join(iacModelResponseSmokeRoot, 'results.json');
const localConformanceResultsPath = join(distRoot, 'conformance', 'azure-api-conformance-local.json');
const storageE2eResultsPath = join(distRoot, 'e2e', 'azure-storage', 'results.json');
const storageHardeningResultsPath = join(distRoot, 'e2e', 'azure-storage-hardening', 'results.json');
const storageNormalizerResultsPath = join(distRoot, 'e2e', 'azure-storage-normalizer', 'results.json');
const storageParityResultsPath = join(distRoot, 'e2e', 'azure-storage-parity', 'results.json');
const serviceBusE2eResultsPath = join(distRoot, 'e2e', 'azure-service-bus', 'results.json');
const serviceBusParityResultsPath = join(distRoot, 'e2e', 'azure-service-bus-parity', 'results.json');
const eventGridParityResultsPath = join(distRoot, 'e2e', 'azure-event-grid-parity', 'results.json');
const apiManagementParityResultsPath = join(distRoot, 'e2e', 'azure-api-management-parity', 'results.json');
const postgresqlParityResultsPath = join(distRoot, 'e2e', 'azure-postgresql-parity', 'results.json');
const cosmosParityResultsPath = join(distRoot, 'e2e', 'azure-cosmos-parity', 'results.json');
const mysqlParityResultsPath = join(distRoot, 'e2e', 'azure-mysql-parity', 'results.json');
const redisParityResultsPath = join(distRoot, 'e2e', 'azure-redis-parity', 'results.json');
const logicWorkflowsParityResultsPath = join(distRoot, 'e2e', 'azure-logic-workflows-parity', 'results.json');
const azureFunctionsParityResultsPath = join(distRoot, 'e2e', 'azure-functions-parity', 'results.json');
const identityRbacParityResultsPath = join(distRoot, 'e2e', 'azure-identity-rbac-parity', 'results.json');
const monitorLogsParityResultsPath = join(distRoot, 'e2e', 'azure-monitor-logs-parity', 'results.json');
const monitorMetricsAlertsParityResultsPath = join(distRoot, 'e2e', 'azure-monitor-metrics-alerts-parity', 'results.json');
const virtualNetworkParityResultsPath = join(distRoot, 'e2e', 'azure-virtual-network-parity', 'results.json');
const dnsZonesParityResultsPath = join(distRoot, 'e2e', 'azure-dns-zones-parity', 'results.json');
const loadBalancingParityResultsPath = join(distRoot, 'e2e', 'azure-load-balancing-parity', 'results.json');
const keyVaultParityResultsPath = join(distRoot, 'e2e', 'azure-key-vault-parity', 'results.json');
const containerRegistryParityResultsPath = join(distRoot, 'e2e', 'azure-container-registry-parity', 'results.json');
const aksMetadataParityResultsPath = join(distRoot, 'e2e', 'azure-aks-metadata-parity', 'results.json');
const storageDataPlaneCapturePath = join(root, 'fixtures', 'azure-storage-data-plane-captures', 'storage-data-plane-blob-queue-wave-1.json');
const forbiddenWriteTargets = ['/home/ubuntu/genex/haawk'];
const requiredTokenText = 'GLOBALSTACK_AUTH_TOKEN';
const modelFacingRuntimeTerms = /\b(GlobalStack|LocalStack|emulator|emulation)\b|local endpoint|local deployment|locally supported|deploy smoke|coverage snapshot|GlobalStack_InvalidSku_For_Conformance/i;
const errors = [];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(abs));
    } else if (entry.isFile()) {
      files.push(abs);
    }
  }
  return files;
}

async function assertNoRuntimeTerms(filePath, label) {
  const text = await readFile(filePath, 'utf8').catch(() => '');
  if (!text) {
    errors.push(`missing model-facing artifact ${label}`);
    return text;
  }
  const match = text.match(modelFacingRuntimeTerms);
  if (match) {
    errors.push(`${label} contains runtime-only term "${match[0]}"`);
  }
  return text;
}

const parityRoadmapText = await readFile(parityRoadmapPath, 'utf8').catch(() => '');
if (!parityRoadmapText) {
  errors.push('missing Azure 99% roadmap; run npm run conformance:roadmap');
} else {
  const parityRoadmap = JSON.parse(parityRoadmapText);
  if (parityRoadmap._meta?.serviceCount !== 30) {
    errors.push('Azure 99% roadmap must cover all 30 Tier 1/Tier 2 services');
  }
  if (parityRoadmap._meta?.waveCount !== 5) {
    errors.push('Azure 99% roadmap must organize services into 5 implementation waves');
  }
  const serviceIds = new Set((parityRoadmap.waves ?? []).flatMap(wave => (wave.services ?? []).map(service => service.serviceId)));
  if (serviceIds.size !== 30) {
    errors.push('Azure 99% roadmap must include each service exactly once');
  }
  for (const required of ['blob-storage', 'queue-storage', 'identity-rbac', 'azure-functions', 'virtual-network']) {
    if (!serviceIds.has(required)) {
      errors.push(`Azure 99% roadmap missing required service ${required}`);
    }
  }
  if ((parityRoadmap._meta?.workItemCount ?? 0) < 250) {
    errors.push('Azure 99% roadmap should track unresolved work items across all services and dimensions');
  }
  const firstWave = parityRoadmap.waves?.find(wave => wave.id === 'wave-1-official-emulator-and-storage-family');
  if (!firstWave?.services?.some(service => service.serviceId === 'blob-storage')) {
    errors.push('Azure 99% roadmap wave 1 must include blob-storage');
  }
  if (!firstWave?.services?.some(service => service.serviceId === 'queue-storage')) {
    errors.push('Azure 99% roadmap wave 1 must include queue-storage');
  }
}

for (const platform of azurePlatforms) {
  const platformDir = join(distRoot, 'platform-images', platform.id);
  try {
    await stat(join(platformDir, 'Dockerfile'));
    await stat(join(platformDir, 'docker-compose.yml'));
    await stat(join(platformDir, 'platform.json'));
  } catch {
    errors.push(`missing generated platform template for ${platform.id}`);
  }

  const compose = await readFile(join(platformDir, 'docker-compose.yml'), 'utf8').catch(() => '');
  if (!compose.includes('globalstack/azure-emulator:local')) {
    errors.push(`${platform.id} compose file does not use the GlobalStack Azure emulator image`);
  }
  if (!compose.includes(requiredTokenText)) {
    errors.push(`${platform.id} compose file does not pass through GLOBALSTACK_AUTH_TOKEN`);
  }
  if (compose.includes('localstack/localstack-azure-alpha') || compose.includes('LOCALSTACK_AUTH_TOKEN')) {
    errors.push(`${platform.id} compose file still contains active LocalStack for Azure runtime wiring`);
  }
  if (!compose.includes('/_globalstack/health')) {
    errors.push(`${platform.id} compose file does not health-check the GlobalStack Azure sidecar`);
  }

  const promptDir = join(distRoot, 'smoke-prompts', platform.id);
  const instruction = await assertNoRuntimeTerms(join(promptDir, 'instruction.md'), `${platform.id} smoke instruction`);
  const metadata = await readFile(join(promptDir, 'metadata.json'), 'utf8').catch(() => '');
  if (!instruction.includes('Azure')) {
    errors.push(`${platform.id} smoke instruction does not describe an Azure deployment`);
  }
  if (!metadata.includes('"cloud": "azure"')) {
    errors.push(`${platform.id} smoke metadata does not mark cloud=azure`);
  }
}

const artifactRegistryText = await readFile(artifactRegistryPath, 'utf8').catch(() => '');
if (!artifactRegistryText) {
  errors.push('missing docs/ARTIFACT-REGISTRY.json; run npm run docs:artifacts');
} else {
  const artifactRegistry = JSON.parse(artifactRegistryText);
  if ((artifactRegistry.artifacts ?? []).length < 25) {
    errors.push('artifact registry should track the major source, evidence, generated, and runtime artifacts');
  }
  const registeredPaths = new Set((artifactRegistry.artifacts ?? []).map(item => item.path));
  for (const required of [
    'docs/ARTIFACT-REGISTRY.md',
    'packages/core/src/azure-tier1-capabilities.mjs',
    'packages/azure-control-plane/src/',
    'packages/azure-data-plane/src/',
    'fixtures/azure-captures/',
    'docs/conformance/azure-99-parity-checklist.md',
    'docs/conformance/azure-99-roadmap.md',
    'dist/platform-images/',
  ]) {
    if (!registeredPaths.has(required)) {
      errors.push(`artifact registry missing required path: ${required}`);
    }
  }
  if (!artifactRegistry.commands?.includes('docs:artifacts')) {
    errors.push('artifact registry command index must include docs:artifacts');
  }
  if ((artifactRegistry.counts?.azureCaptures ?? 0) < 400) {
    errors.push('artifact registry should reflect the current Azure capture fixture count');
  }
}

const hybridCoverageText = await readFile(hybridCoveragePath, 'utf8').catch(() => '');
if (!hybridCoverageText) {
  errors.push('missing docs/hybrid/azure-hybrid-coverage.json; run npm run hybrid:render');
} else {
  const hybridCoverage = JSON.parse(hybridCoverageText);
  if ((hybridCoverage._meta?.capabilityCount ?? 0) < 30) {
    errors.push('hybrid coverage should include the Tier 1 and Tier 2 capability registries');
  }
  if (hybridCoverage._meta?.tier1CapabilityCount !== 15) {
    errors.push('hybrid coverage should include 15 Tier 1 capabilities');
  }
  if (hybridCoverage._meta?.tier2CapabilityCount !== 15) {
    errors.push('hybrid coverage should include 15 Tier 2 capabilities');
  }
  for (const capability of hybridCoverage.capabilities ?? []) {
    if (capability.realAzureApiComplete !== false) {
      errors.push(`${capability.id} must not claim realAzureApiComplete until every relevant live Azure API call is conformance-proven`);
    }
    if (!['official-emulator-backed-local', 'metadata-only-control-plane', 'cloud-validated'].includes(capability.implementationKind)) {
      errors.push(`${capability.id} has an unknown implementation kind`);
    }
    if (capability.cloudValidated === true && capability.knownGaps?.length > 0) {
      errors.push(`${capability.id} is cloudValidated while still declaring known gaps`);
    }
    if (!capability.knownGaps || capability.knownGaps.length === 0) {
      errors.push(`${capability.id} must declare explicit known gaps until exact parity is proven`);
    }
  }
  if (!hybridCoverage._meta?.strictSurfacePolicy?.includes('fail closed')) {
    errors.push('hybrid coverage must document the fail-closed strict surface policy');
  }
  for (const [capabilityId, operations] of Object.entries(hybridCoverage.operations ?? {})) {
    for (const [operationName, operation] of Object.entries(operations ?? {})) {
      if (operation.realAzureApiComplete !== false) {
        errors.push(`${capabilityId}.${operationName} must not claim realAzureApiComplete`);
      }
    }
  }
  const officialCompose = await readFile(join(distRoot, 'hybrid', 'docker-compose.official-emulators.yml'), 'utf8').catch(() => '');
  for (const requiredImage of [
    'mcr.microsoft.com/azure-storage/azurite',
    'mcr.microsoft.com/azure-messaging/servicebus-emulator:latest',
    'mcr.microsoft.com/azure-messaging/eventhubs-emulator:latest',
  ]) {
    if (!officialCompose.includes(requiredImage)) {
      errors.push(`official emulator compose is missing ${requiredImage}`);
    }
  }
  const tier2Analogues = [
    'RDS MySQL',
    'SQS',
    'ElastiCache Redis',
    'Step Functions',
    'Route 53',
    'ALB/NLB',
    'CloudFront',
    'WAF',
    'CloudTrail',
    'EFS',
    'Kinesis Data Streams',
    'Redshift',
    'SSM Parameter Store',
    'DMS',
    'Service Discovery / Cloud Map',
  ];
  for (const awsAnalogue of tier2Analogues) {
    if (!hybridCoverage.capabilities?.some(capability => capability.tier === 2 && capability.awsAnalogue === awsAnalogue)) {
      errors.push(`hybrid coverage missing Tier 2 AWS analogue: ${awsAnalogue}`);
    }
  }
}

const deployManifestText = await readFile(join(deploySmokeRoot, 'manifest.json'), 'utf8').catch(() => '');
if (deployManifestText) {
  const deployManifest = JSON.parse(deployManifestText);
  if (deployManifest.length < 4) {
    errors.push('deploy smoke manifest should include at least four Azure use cases including Tier 2');
  }
  for (const item of deployManifest) {
    const instruction = await assertNoRuntimeTerms(join(deploySmokeRoot, item.id, 'instruction.md'), `${item.id} deploy instruction`);
    const metadata = await readFile(join(deploySmokeRoot, item.id, 'metadata.json'), 'utf8').catch(() => '');
    if (!instruction.includes('Azure')) {
      errors.push(`${item.id} deploy instruction does not describe Azure resources`);
    }
    if (!metadata.includes('"cloud": "azure"')) {
      errors.push(`${item.id} deploy-smoke metadata does not mark cloud=azure`);
    }
  }
}

const deploySmokeResultsText = await readFile(deploySmokeResultsPath, 'utf8').catch(() => '');
if (!deploySmokeResultsText) {
  errors.push('missing Azure deploy-smoke results; run npm run smoke:deploy');
} else {
  const deploySmokeResults = JSON.parse(deploySmokeResultsText);
  if (!['hybrid', 'globalstack-sidecar'].includes(deploySmokeResults.backend)) {
    errors.push('Azure deploy-smoke results must identify the tested backend');
  }
  const results = deploySmokeResults.results ?? [];
  if (results.length < 4) {
    errors.push('Azure deploy-smoke should execute at least four use cases including Tier 2');
  }
  if (!results.some(result => result.id === 'tier2-resilience-edge-foundation' && result.ok === true)) {
    errors.push('Azure deploy-smoke should pass the Tier 2 resilience use case');
  }
  for (const result of results) {
    if (result.ok !== true) {
      errors.push(`Azure deploy-smoke use case failed: ${result.id}`);
    }
  }
}

const iacModelResponseSmokeResultsText = await readFile(iacModelResponseSmokeResultsPath, 'utf8').catch(() => '');
if (!iacModelResponseSmokeResultsText) {
  errors.push('missing Azure IaC model-response smoke results; run npm run smoke:iac-model-responses');
} else {
  const iacModelResponseSmokeResults = JSON.parse(iacModelResponseSmokeResultsText);
  if (!iacModelResponseSmokeResults.executionMode?.includes('adapter-extracted-arm-plan')) {
    errors.push('IaC model-response smoke must explicitly disclose that it replays an extracted ARM plan');
  }
  if (!iacModelResponseSmokeResults.executionMode?.includes('native-provider-execution-covered-by-platform-lifecycle-smoke')) {
    errors.push('IaC model-response smoke must point native provider execution claims to platform lifecycle smoke');
  }
  const results = iacModelResponseSmokeResults.results ?? [];
  if (results.length !== azurePlatforms.length * 2) {
    errors.push('IaC model-response smoke must run one correct and one incorrect case for every Azure platform');
  }
  for (const platform of azurePlatforms) {
    const platformResults = results.filter(result => result.platformId === platform.id);
    if (!platformResults.some(result => result.variant === 'correct' && result.ok === true && result.deployStatus === 'PASS')) {
      errors.push(`IaC model-response smoke missing successful correct deployment for ${platform.id}`);
    }
    if (!platformResults.some(result => result.variant === 'incorrect-invalid-storage-sku' && result.ok === true && result.deployStatus === 'FAIL')) {
      errors.push(`IaC model-response smoke missing expected invalid-SKU failure for ${platform.id}`);
    }
    for (const variant of ['correct', 'incorrect-invalid-storage-sku']) {
      const variantDir = join(iacModelResponseSmokeRoot, platform.id, variant);
      await assertNoRuntimeTerms(join(variantDir, 'prompt.txt'), `${platform.id}/${variant} prompt`);
      await assertNoRuntimeTerms(join(variantDir, 'MODEL_RESPONSE.md'), `${platform.id}/${variant} model response`);
      const solutionDir = join(variantDir, 'solution');
      const solutionFiles = await walk(solutionDir).catch(() => []);
      for (const solutionFile of solutionFiles) {
        await assertNoRuntimeTerms(solutionFile, `${platform.id}/${variant} solution ${relative(solutionDir, solutionFile)}`);
      }
    }
  }
}

const liveApiCatalogText = await readFile(liveApiCatalogPath, 'utf8').catch(() => '');
if (!liveApiCatalogText) {
  errors.push('missing Azure live API catalog; run npm run conformance:catalog');
} else {
  const liveApiCatalog = JSON.parse(liveApiCatalogText);
  if (liveApiCatalog._meta?.capabilityCount !== 30) {
    errors.push('Azure live API catalog should include all 30 Tier 1/Tier 2 capabilities');
  }
  if ((liveApiCatalog._meta?.callCount ?? 0) < 120) {
    errors.push('Azure live API catalog should include lifecycle calls for each registered resource type');
  }
  for (const call of liveApiCatalog.calls ?? []) {
    if (call.validationState !== 'candidate-until-live-azure-captured') {
      errors.push(`${call.id} must remain candidate until live Azure capture is normalized`);
    }
    if (call.operation === 'CreateOrUpdate') {
      const varianceIds = (call.varianceCases ?? []).map(item => item.id);
      for (const required of ['valid-minimal', 'missing-api-version', 'invalid-location', 'empty-body']) {
        if (!varianceIds.includes(required)) errors.push(`${call.id} missing variance case ${required}`);
      }
    }
  }
}

const parityChecklistText = await readFile(parityChecklistPath, 'utf8').catch(() => '');
if (!parityChecklistText) {
  errors.push('missing Azure 99% parity checklist; run npm run conformance:parity');
} else {
  const parityChecklist = JSON.parse(parityChecklistText);
  if (parityChecklist._meta?.serviceCount !== 30) {
    errors.push('Azure 99% parity checklist must cover all 30 Tier 1/Tier 2 services');
  }
  if (parityChecklist._meta?.dimensionCount !== 10) {
    errors.push('Azure 99% parity checklist must track the 10 required parity dimensions');
  }
  if (parityChecklist.services?.some(service => service.currentStatus === '99-ready')) {
    errors.push('No Azure service may be marked 99-ready until every parity dimension is complete');
  }
  const storage = parityChecklist.services?.find(service => service.capabilityId === 'blob-storage');
  if (!storage?.dimensions?.dataPlaneBehavior?.evidence?.some(item => item.includes('Blob/Queue data-plane expectations'))) {
    errors.push('Azure 99% parity checklist must reflect current Blob/Queue data-plane evidence');
  }
  for (const service of parityChecklist.services ?? []) {
    for (const required of [
      'liveApiSurfaceInventory',
      'parameterVarianceCaptures',
      'stateTransitionCaptures',
      'errorShapeFidelity',
      'identityRbacBehavior',
      'retryEventualConsistency',
      'iacProviderBehavior',
      'dataPlaneBehavior',
      'ambiguousRepeatCaptures',
      'serviceSpecificFacade',
    ]) {
      if (!service.dimensions?.[required]) {
        errors.push(`${service.capabilityId} parity checklist missing dimension ${required}`);
      }
    }
  }
}

const localConformanceText = await readFile(localConformanceResultsPath, 'utf8').catch(() => '');
if (!localConformanceText) {
  errors.push('missing local Azure API conformance results; run npm run conformance:local');
} else {
  const localConformance = JSON.parse(localConformanceText);
  if (localConformance.ok !== true) {
    errors.push('local Azure API conformance did not pass');
  }
  if ((localConformance.results ?? []).length < 100) {
    errors.push('local Azure API conformance should execute parameter variance cases across the catalog');
  }
  if (!localConformance.results?.some(item => item.varianceId === 'missing-api-version' && item.classification === 'pass')) {
    errors.push('local Azure API conformance must verify missing api-version rejection');
  }
  if (!localConformance.results?.some(item => item.classification === 'local-gap-needs-azure-capture')) {
    errors.push('local Azure API conformance must record provider-specific Azure-capture gaps');
  }
}

const captureClassificationText = await readFile(captureClassificationPath, 'utf8').catch(() => '');
if (!captureClassificationText) {
  errors.push('missing Azure capture classification; run npm run conformance:classify');
} else {
  const captureClassification = JSON.parse(captureClassificationText);
  if ((captureClassification.fixtureCount ?? 0) !== 448) {
    errors.push('Azure capture classification should include 448 current real-Azure fixtures');
  }
  if (captureClassification.cleanupVerifiedCount !== captureClassification.fixtureCount) {
    errors.push('all Azure capture fixtures must have verified cleanup');
  }
  if (captureClassification.cloudValidatedCount !== 0) {
    errors.push('raw Azure captures must not be counted as cloudValidated operations');
  }
  if (!captureClassification.byValidationDepth?.['provider-validation']) {
    errors.push('Azure capture classification must include provider-validation evidence');
  }
  if ((captureClassification.byValidationDepth?.['subscription-or-provider-readiness'] ?? 0) < 0) {
    errors.push('Azure capture classification has an invalid provider-readiness count');
  }
}

const localExpectationsText = await readFile(localExpectationsPath, 'utf8').catch(() => '');
if (!localExpectationsText) {
  errors.push('missing Azure-derived local expectations; run npm run conformance:expectations');
} else {
  const localExpectations = JSON.parse(localExpectationsText);
  if ((localExpectations.expectationCount ?? 0) < 100) {
    errors.push('Azure-derived local expectations should include safe ARM/routing captures');
  }
  if (localExpectations.expectations?.some(item => item.validationDepth === 'subscription-or-provider-readiness')) {
    errors.push('local expectations must not be generated from subscription/provider-readiness captures');
  }
}

const storageDataPlaneExpectationsText = await readFile(storageDataPlaneExpectationsPath, 'utf8').catch(() => '');
if (!storageDataPlaneExpectationsText) {
  errors.push('missing Azure Storage data-plane expectations; run npm run storage:expectations');
} else {
  const storageDataPlaneExpectations = JSON.parse(storageDataPlaneExpectationsText);
  if (storageDataPlaneExpectations.expectationCount !== 32) {
    errors.push('Azure Storage data-plane expectations should include 32 Blob/Queue cases');
  }
  const storageStates = new Set((storageDataPlaneExpectations.expectations ?? []).map(item => item.localSupportState));
  for (const required of ['azurite-matches-azure', 'azurite-status-match-error-code-gap', 'azurite-behavior-gap']) {
    if (!storageStates.has(required)) {
      errors.push(`Azure Storage data-plane expectations must preserve ${required}`);
    }
  }
  const gapCases = new Set((storageDataPlaneExpectations.expectations ?? [])
    .filter(item => item.localSupportState !== 'azurite-matches-azure')
    .map(item => item.caseId));
  for (const required of ['blob-get-without-authorization', 'queue-peek-after-delete']) {
    if (!gapCases.has(required)) {
      errors.push(`Azure Storage data-plane expectations must preserve gap case ${required}`);
    }
  }
  for (const required of ['blob-missing-blob-type-header', 'blob-get-without-authorization', 'queue-malformed-message']) {
    const item = storageDataPlaneExpectations.expectations?.find(expectation => expectation.caseId === required);
    if (item?.globalstackNormalization?.status !== 'implemented') {
      errors.push(`Azure Storage data-plane expectation must mark ${required} as implemented by the GlobalStack normalizer`);
    }
  }
  const postDelete = storageDataPlaneExpectations.expectations?.find(expectation => expectation.caseId === 'queue-peek-after-delete');
  if (postDelete?.globalstackNormalization?.status !== 'needs-repeat-capture') {
    errors.push('Azure Storage data-plane expectation must keep queue-peek-after-delete as needs-repeat-capture');
  }
}

const storageE2eText = await readFile(storageE2eResultsPath, 'utf8').catch(() => '');
if (!storageE2eText) {
  errors.push('missing Azure Storage E2E results; run npm run e2e:storage');
} else {
  const storageE2e = JSON.parse(storageE2eText);
  if (storageE2e.ok !== true) {
    errors.push('Azure Storage E2E did not pass');
  }
  const requiredSteps = [
    'arm create storage account',
    'azurite put blob',
    'azurite get blob',
    'azurite put queue message',
    'azurite create table',
    'azurite insert table entity',
    'azurite get table entity',
    'coverage explicit gaps',
  ];
  for (const step of requiredSteps) {
    if (!storageE2e.steps?.some(item => item.name === step && item.ok === true)) {
      errors.push(`Azure Storage E2E missing passing step: ${step}`);
    }
  }
}

const storageHardeningText = await readFile(storageHardeningResultsPath, 'utf8').catch(() => '');
if (!storageHardeningText) {
  errors.push('missing Azure Storage hardening E2E results; run npm run e2e:storage-hardening');
} else {
  const storageHardening = JSON.parse(storageHardeningText);
  if (storageHardening.ok !== true) {
    errors.push('Azure Storage hardening E2E did not pass');
  }
  const requiredHardeningSteps = [
    'blob duplicate container create rejected',
    'blob missing container rejected',
    'blob get without authorization rejected',
    'blob get after delete rejected',
    'queue duplicate create is idempotent',
    'queue malformed message rejected',
    'queue peek after delete rejected',
    'table duplicate create rejected',
    'table insert entity',
    'table duplicate entity insert rejected',
    'table get without authorization rejected',
    'table get entity after delete rejected',
    'table insert after delete rejected',
  ];
  for (const step of requiredHardeningSteps) {
    if (!storageHardening.steps?.some(item => item.name === step && item.ok === true)) {
      errors.push(`Azure Storage hardening E2E missing passing step: ${step}`);
    }
  }
  if ((storageHardening.steps ?? []).length < 40) {
    errors.push('Azure Storage hardening E2E should cover at least 40 Blob/Queue/Table behavior checks');
  }
  if (!storageHardening.caveat?.includes('Official-emulator evidence only')) {
    errors.push('Azure Storage hardening E2E must preserve the official-emulator evidence caveat');
  }
}

const storageNormalizerText = await readFile(storageNormalizerResultsPath, 'utf8').catch(() => '');
if (!storageNormalizerText) {
  errors.push('missing Azure Storage normalizer E2E results; run npm run e2e:storage-normalizer');
} else {
  const storageNormalizer = JSON.parse(storageNormalizerText);
  if (storageNormalizer.ok !== true) {
    errors.push('Azure Storage normalizer E2E did not pass');
  }
  const requiredNormalizerSteps = [
    'proxy normalizes missing blob type to Azure',
    'proxy normalizes unauthenticated blob get to Azure',
    'proxy normalizes malformed queue XML to Azure',
    'queue peek after delete remains unnormalized gap',
  ];
  for (const step of requiredNormalizerSteps) {
    if (!storageNormalizer.steps?.some(item => item.name === step && item.ok === true)) {
      errors.push(`Azure Storage normalizer E2E missing passing step: ${step}`);
    }
  }
  if (!storageNormalizer.caveat?.includes('Queue peek-after-delete is deliberately unnormalized')) {
    errors.push('Azure Storage normalizer E2E must preserve the repeat-capture caveat');
  }
}

const storageParityText = await readFile(storageParityResultsPath, 'utf8').catch(() => '');
if (!storageParityText) {
  errors.push('missing Azure Storage parity E2E results; run npm run e2e:storage-parity');
} else {
  const storageParity = JSON.parse(storageParityText);
  if (storageParity.ok !== true) {
    errors.push('Azure Storage parity E2E did not pass');
  }
  if (storageParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Storage parity control-plane matrix has failures');
  }
  if ((storageParity.controlPlane?.total ?? 0) < 35) {
    errors.push('Azure Storage parity control-plane matrix should exercise at least 35 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'storage account create requires an existing resource group',
    'invalid storage account name is rejected',
    'invalid storage account sku is rejected',
    'valid storage account create is async accepted',
    'child create before storage readiness is rejected',
    'invalid blob container name is rejected',
    'invalid queue name is rejected',
    'invalid file share name is rejected',
    'invalid table name is rejected',
    'blob container get after delete is Azure-shaped 404',
    'queue get after delete is Azure-shaped 404',
    'file share get after delete is Azure-shaped 404',
    'table get after delete is Azure-shaped 404',
    'ARM template deployment can create storage account and child resources',
  ]) {
    if (!storageParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Storage parity E2E missing passing case: ${required}`);
    }
  }
  if (storageParity.platformMatrix?.skipped === true) {
    errors.push('Azure Storage parity E2E must include the platform matrix during validation');
  }
  if (storageParity.platformMatrix?.ok !== true || storageParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Storage parity E2E must pass all Azure platform runner lifecycles');
  }
}

const serviceBusE2eText = await readFile(serviceBusE2eResultsPath, 'utf8').catch(() => '');
if (!serviceBusE2eText) {
  errors.push('missing Azure Service Bus emulator E2E results; run npm run e2e:service-bus');
} else {
  const serviceBusE2e = JSON.parse(serviceBusE2eText);
  if (serviceBusE2e.ok !== true) {
    errors.push('Azure Service Bus emulator E2E did not pass');
  }
  const requiredServiceBusSteps = [
    'wait for service bus health endpoint',
    'queue send and receive configured entity',
    'completed queue message is removed from active delivery',
    'topic publish and subscription receive configured entity',
    'missing topic is rejected by emulator',
    'missing subscription is rejected by emulator',
    'missing queue is rejected by emulator',
    'cleanup service bus emulator compose profile',
  ];
  for (const step of requiredServiceBusSteps) {
    if (!serviceBusE2e.steps?.some(item => item.name === step && item.ok === true)) {
      errors.push(`Azure Service Bus emulator E2E missing passing step: ${step}`);
    }
  }
  if (!serviceBusE2e.caveat?.includes('Official-emulator evidence only')) {
    errors.push('Azure Service Bus emulator E2E must preserve the official-emulator evidence caveat');
  }
}

const serviceBusParityText = await readFile(serviceBusParityResultsPath, 'utf8').catch(() => '');
if (!serviceBusParityText) {
  errors.push('missing Azure Service Bus parity E2E results; run npm run e2e:service-bus-parity');
} else {
  const serviceBusParity = JSON.parse(serviceBusParityText);
  if (serviceBusParity.ok !== true) {
    errors.push('Azure Service Bus parity E2E did not pass');
  }
  if (serviceBusParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Service Bus parity control-plane matrix has failures');
  }
  if ((serviceBusParity.controlPlane?.total ?? 0) < 45) {
    errors.push('Azure Service Bus parity control-plane matrix should exercise at least 45 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'namespace create requires an existing resource group',
    'namespace delete not-found preserves Azure no-content shape',
    'topic create before namespace reports missing parent',
    'queue create before namespace reports missing parent',
    'namespace invalid sku is rejected',
    'namespace invalid name is rejected by official naming rules',
    'valid namespace create returns async Azure shape',
    'namespace get reaches Succeeded',
    'subscription create before topic reports missing parent',
    'topic create succeeds',
    'subscription create succeeds',
    'queue create succeeds',
    'unsupported authorization rule action fails closed',
    'ARM template deployment can create namespace topic subscription and queue',
    'child create after namespace delete reports missing parent',
  ]) {
    if (!serviceBusParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Service Bus parity E2E missing passing case: ${required}`);
    }
  }
  if (serviceBusParity.officialEmulator?.skipped === true || serviceBusParity.officialEmulator?.ok !== true) {
    errors.push('Azure Service Bus parity E2E must include the official emulator matrix during validation');
  }
  if (serviceBusParity.platformMatrix?.skipped === true) {
    errors.push('Azure Service Bus parity E2E must include the platform matrix during validation');
  }
  if (serviceBusParity.platformMatrix?.ok !== true || serviceBusParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Service Bus parity E2E must pass all Azure platform runner lifecycles');
  }
}

const eventGridParityText = await readFile(eventGridParityResultsPath, 'utf8').catch(() => '');
if (!eventGridParityText) {
  errors.push('missing Azure Event Grid parity E2E results; run npm run e2e:event-grid-parity');
} else {
  const eventGridParity = JSON.parse(eventGridParityText);
  if (eventGridParity.ok !== true) {
    errors.push('Azure Event Grid parity E2E did not pass');
  }
  if (eventGridParity.controlAndDataPlane?.failedCount !== 0) {
    errors.push('Azure Event Grid parity control/data-plane matrix has failures');
  }
  if ((eventGridParity.controlAndDataPlane?.total ?? 0) < 40) {
    errors.push('Azure Event Grid parity control/data-plane matrix should exercise at least 40 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'topic create requires an existing resource group',
    'topic delete not-found preserves Azure no-content shape',
    'topic invalid location is rejected',
    'topic invalid name is rejected by Azure naming rules',
    'valid topic create succeeds with endpoint metadata',
    'unsupported topic action fails closed',
    'topic listKeys returns shared access keys',
    'publish with missing key is rejected',
    'publish with invalid key is rejected',
    'publish with wrong method is rejected',
    'publish with wrong path is rejected',
    'publish malformed JSON is rejected',
    'publish empty event batch is rejected',
    'publish invalid EventGridEvent schema is rejected',
    'publish invalid customEvent schema is rejected',
    'publish unsupported overload is rejected',
    'publish EventGridEvent succeeds',
    'publish customEvent succeeds',
    'top-level event subscription create preserves captured rejection',
    'ARM template deployment can create Event Grid topic',
    'publish after topic delete is rejected',
  ]) {
    if (!eventGridParity.controlAndDataPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Event Grid parity E2E missing passing case: ${required}`);
    }
  }
  if (eventGridParity.platformMatrix?.skipped === true) {
    errors.push('Azure Event Grid parity E2E must include the platform matrix during validation');
  }
  if (eventGridParity.platformMatrix?.ok !== true || eventGridParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Event Grid parity E2E must pass all Azure platform runner lifecycles');
  }
}

const apiManagementParityText = await readFile(apiManagementParityResultsPath, 'utf8').catch(() => '');
if (!apiManagementParityText) {
  errors.push('missing Azure API Management parity E2E results; run npm run e2e:api-management-parity');
} else {
  const apiManagementParity = JSON.parse(apiManagementParityText);
  if (apiManagementParity.ok !== true) {
    errors.push('Azure API Management parity E2E did not pass');
  }
  if (apiManagementParity.controlAndGatewayPlane?.failedCount !== 0) {
    errors.push('Azure API Management parity control/gateway matrix has failures');
  }
  if ((apiManagementParity.controlAndGatewayPlane?.total ?? 0) < 50) {
    errors.push('Azure API Management parity control/gateway matrix should exercise at least 50 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'service create requires an existing resource group',
    'service collection list is empty before create',
    'service delete missing returns no content',
    'service missing sku preserves captured rejection',
    'service missing publisher metadata is rejected',
    'valid service create returns async Azure shape',
    'service get reaches Succeeded',
    'api collection list is empty before child create',
    'api create with missing parent preserves captured ResourceNotFound',
    'api list with missing parent is rejected',
    'api missing path is rejected',
    'api protocols must be an array',
    'api create succeeds with documented path shape',
    'service unsupported subscription action fails closed',
    'gateway unknown host is rejected',
    'gateway unknown api path is rejected',
    'gateway subscription-required api rejects missing key',
    'gateway subscription-required api accepts provided local key',
    'gateway routes configured api locally',
    'inspection route rejects unknown service',
    'ARM template deployment can create service and api',
    'secure api gateway route after delete is rejected',
    'api gateway route after delete is rejected',
    'gateway after service delete is rejected',
    'api create after service delete reports missing parent',
  ]) {
    if (!apiManagementParity.controlAndGatewayPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure API Management parity E2E missing passing case: ${required}`);
    }
  }
  if (apiManagementParity.platformMatrix?.skipped === true) {
    errors.push('Azure API Management parity E2E must include the platform matrix during validation');
  }
  if (apiManagementParity.platformMatrix?.ok !== true || apiManagementParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure API Management parity E2E must pass all Azure platform runner lifecycles');
  }
}

const postgresqlParityText = await readFile(postgresqlParityResultsPath, 'utf8').catch(() => '');
if (!postgresqlParityText) {
  errors.push('missing Azure PostgreSQL parity E2E results; run npm run e2e:postgresql-parity');
} else {
  const postgresqlParity = JSON.parse(postgresqlParityText);
  if (postgresqlParity.ok !== true) {
    errors.push('Azure PostgreSQL parity E2E did not pass');
  }
  if (postgresqlParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure PostgreSQL parity control-plane matrix has failures');
  }
  if ((postgresqlParity.controlPlane?.total ?? 0) < 35) {
    errors.push('Azure PostgreSQL parity control-plane matrix should exercise at least 35 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'server create requires an existing resource group',
    'resource group create succeeds',
    'database create with missing server reports resource not found',
    'server collection list is empty before create',
    'server delete missing returns no content',
    'server empty body is rejected',
    'server invalid location is rejected',
    'server invalid name is rejected',
    'server invalid sku is rejected',
    'server missing administrator login is rejected',
    'server missing administrator password is rejected',
    'server weak administrator password is rejected',
    'server invalid version is rejected',
    'server create succeeds',
    'server get succeeds',
    'server update preserves metadata',
    'database missing charset is rejected',
    'database missing collation is rejected',
    'database invalid name is rejected',
    'database create succeeds',
    'database get succeeds',
    'database list includes created resource',
    'server list includes created resource',
    'unsupported firewall rule route fails closed',
    'unsupported server configuration route fails closed',
    'ARM template deployment can create postgresql resources',
    'database get after delete is not found',
    'database delete after delete returns no content',
    'server get after delete is not found',
    'server delete after delete returns no content',
    'database create after server delete reports resource not found',
  ]) {
    if (!postgresqlParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure PostgreSQL parity E2E missing passing case: ${required}`);
    }
  }
  if (postgresqlParity.platformMatrix?.skipped === true) {
    errors.push('Azure PostgreSQL parity E2E must include the platform matrix during validation');
  }
  if (postgresqlParity.platformMatrix?.ok !== true || postgresqlParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure PostgreSQL parity E2E must pass all Azure platform runner lifecycles');
  }
}

const cosmosParityText = await readFile(cosmosParityResultsPath, 'utf8').catch(() => '');
if (!cosmosParityText) {
  errors.push('missing Azure Cosmos DB parity E2E results; run npm run e2e:cosmos-parity');
} else {
  const cosmosParity = JSON.parse(cosmosParityText);
  if (cosmosParity.ok !== true) {
    errors.push('Azure Cosmos DB parity E2E did not pass');
  }
  if (cosmosParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Cosmos DB parity control-plane matrix has failures');
  }
  if ((cosmosParity.controlPlane?.total ?? 0) < 40) {
    errors.push('Azure Cosmos DB parity control-plane matrix should exercise at least 40 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'cosmos account create requires an existing resource group',
    'resource group create succeeds',
    'sql database create with missing account reports resource not found',
    'cosmos account collection list is empty before create',
    'cosmos account delete missing returns no content',
    'cosmos account empty body is rejected',
    'cosmos account invalid location is rejected',
    'cosmos account invalid name is rejected',
    'cosmos account missing offer type is rejected',
    'cosmos account missing locations is rejected',
    'cosmos account invalid consistency is rejected',
    'cosmos account create returns async Azure shape',
    'cosmos account get reaches Succeeded with endpoint metadata',
    'sql database name mismatch is rejected',
    'sql database invalid throughput is rejected',
    'sql database create succeeds',
    'sql database get succeeds',
    'sql database list includes created resource',
    'sql container create with missing database reports resource not found',
    'sql container missing partition key is rejected',
    'sql container invalid partition key kind is rejected',
    'sql container create succeeds',
    'sql container get succeeds',
    'sql container list includes created resource',
    'storage table invalid name is rejected',
    'storage table create succeeds',
    'unsupported mongodb database route fails closed',
    'unsupported stored procedure route fails closed',
    'ARM template deployment can create cosmos and table resources',
    'storage table get after delete is not found',
    'sql container get after delete is not found',
    'sql container delete after delete returns no content',
    'sql database get after delete is not found',
    'cosmos account get after delete is not found',
    'sql database create after account delete reports resource not found',
  ]) {
    if (!cosmosParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Cosmos DB parity E2E missing passing case: ${required}`);
    }
  }
  if (cosmosParity.platformMatrix?.skipped === true) {
    errors.push('Azure Cosmos DB parity E2E must include the platform matrix during validation');
  }
  if (cosmosParity.platformMatrix?.ok !== true || cosmosParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Cosmos DB parity E2E must pass all Azure platform runner lifecycles');
  }
}

const mysqlParityText = await readFile(mysqlParityResultsPath, 'utf8').catch(() => '');
if (!mysqlParityText) {
  errors.push('missing Azure MySQL parity E2E results; run npm run e2e:mysql-parity');
} else {
  const mysqlParity = JSON.parse(mysqlParityText);
  if (mysqlParity.ok !== true) {
    errors.push('Azure MySQL parity E2E did not pass');
  }
  if (mysqlParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure MySQL parity control-plane matrix has failures');
  }
  if ((mysqlParity.controlPlane?.total ?? 0) < 35) {
    errors.push('Azure MySQL parity control-plane matrix should exercise at least 35 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'server create requires an existing resource group',
    'resource group create succeeds',
    'database create with missing server reports resource not found',
    'server collection list is empty before create',
    'server delete missing returns no content',
    'server empty body is rejected',
    'server invalid location is rejected',
    'server invalid name is rejected',
    'server invalid sku is rejected',
    'server missing administrator login is rejected',
    'server missing administrator password is rejected',
    'server weak administrator password is rejected',
    'server invalid version is rejected',
    'server create succeeds',
    'server get succeeds',
    'server update preserves metadata',
    'database missing charset is rejected',
    'database missing collation is rejected',
    'database invalid name is rejected',
    'database create succeeds',
    'database get succeeds',
    'database list includes created resource',
    'server list includes created resource',
    'unsupported firewall rule route fails closed',
    'unsupported server configuration route fails closed',
    'ARM template deployment can create mysql resources',
    'database get after delete is not found',
    'database delete after delete returns no content',
    'server get after delete is not found',
    'server delete after delete returns no content',
    'database create after server delete reports resource not found',
  ]) {
    if (!mysqlParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure MySQL parity E2E missing passing case: ${required}`);
    }
  }
  if (mysqlParity.platformMatrix?.skipped === true) {
    errors.push('Azure MySQL parity E2E must include the platform matrix during validation');
  }
  if (mysqlParity.platformMatrix?.ok !== true || mysqlParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure MySQL parity E2E must pass all Azure platform runner lifecycles');
  }
}

const redisParityText = await readFile(redisParityResultsPath, 'utf8').catch(() => '');
if (!redisParityText) {
  errors.push('missing Azure Redis parity E2E results; run npm run e2e:redis-parity');
} else {
  const redisParity = JSON.parse(redisParityText);
  if (redisParity.ok !== true) {
    errors.push('Azure Redis parity E2E did not pass');
  }
  if (redisParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Redis parity control-plane matrix has failures');
  }
  if ((redisParity.controlPlane?.total ?? 0) < 25) {
    errors.push('Azure Redis parity control-plane matrix should exercise at least 25 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'redis create requires an existing resource group',
    'resource group create succeeds',
    'redis collection list is empty before create',
    'redis delete missing returns no content',
    'redis empty body is rejected',
    'redis invalid location is rejected',
    'redis invalid name is rejected',
    'redis invalid sku name is rejected',
    'redis invalid sku family is rejected',
    'redis invalid sku capacity is rejected',
    'redis invalid non-ssl flag is rejected',
    'redis create returns async Azure shape',
    'redis get reaches Succeeded with endpoint metadata',
    'redis update preserves metadata',
    'redis list includes created resource',
    'unsupported redis firewall rule route fails closed',
    'unsupported redis linked server route fails closed',
    'ARM template deployment can create redis resource',
    'redis get after delete is not found',
    'redis delete after delete returns no content',
  ]) {
    if (!redisParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Redis parity E2E missing passing case: ${required}`);
    }
  }
  if (redisParity.platformMatrix?.skipped === true) {
    errors.push('Azure Redis parity E2E must include the platform matrix during validation');
  }
  if (redisParity.platformMatrix?.ok !== true || redisParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Redis parity E2E must pass all Azure platform runner lifecycles');
  }
}

const logicWorkflowsParityText = await readFile(logicWorkflowsParityResultsPath, 'utf8').catch(() => '');
if (!logicWorkflowsParityText) {
  errors.push('missing Azure Logic Workflows parity E2E results; run npm run e2e:logic-workflows-parity');
} else {
  const logicWorkflowsParity = JSON.parse(logicWorkflowsParityText);
  if (logicWorkflowsParity.ok !== true) {
    errors.push('Azure Logic Workflows parity E2E did not pass');
  }
  if (logicWorkflowsParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Logic Workflows parity control-plane matrix has failures');
  }
  if ((logicWorkflowsParity.controlPlane?.total ?? 0) < 25) {
    errors.push('Azure Logic Workflows parity control-plane matrix should exercise at least 25 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'workflow create requires an existing resource group',
    'resource group create succeeds',
    'workflow collection list is empty before create',
    'workflow delete missing returns no content',
    'workflow empty body is rejected',
    'workflow invalid location is rejected',
    'workflow invalid name is rejected',
    'workflow missing definition is rejected',
    'workflow missing triggers is rejected',
    'workflow missing actions is rejected',
    'workflow invalid state is rejected',
    'workflow create succeeds',
    'workflow get succeeds',
    'workflow update can disable workflow',
    'workflow list includes created resource',
    'unsupported workflow trigger route fails closed',
    'unsupported workflow versions route fails closed',
    'ARM template deployment can create workflow resource',
    'workflow get after delete is not found',
    'workflow delete after delete returns no content',
  ]) {
    if (!logicWorkflowsParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Logic Workflows parity E2E missing passing case: ${required}`);
    }
  }
  if (logicWorkflowsParity.platformMatrix?.skipped === true) {
    errors.push('Azure Logic Workflows parity E2E must include the platform matrix during validation');
  }
  if (logicWorkflowsParity.platformMatrix?.ok !== true || logicWorkflowsParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Logic Workflows parity E2E must pass all Azure platform runner lifecycles');
  }
}

const azureFunctionsParityText = await readFile(azureFunctionsParityResultsPath, 'utf8').catch(() => '');
if (!azureFunctionsParityText) {
  errors.push('missing Azure Functions parity E2E results; run npm run e2e:azure-functions-parity');
} else {
  const azureFunctionsParity = JSON.parse(azureFunctionsParityText);
  if (azureFunctionsParity.ok !== true) {
    errors.push('Azure Functions parity E2E did not pass');
  }
  if (azureFunctionsParity.controlAndDataPlane?.failedCount !== 0) {
    errors.push('Azure Functions parity control/data-plane matrix has failures');
  }
  if ((azureFunctionsParity.controlAndDataPlane?.total ?? 0) < 57) {
    errors.push('Azure Functions parity control/data-plane matrix should exercise at least 57 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'server farm create requires an existing resource group',
    'server farm collection list is empty before create',
    'server farm delete missing returns no content',
    'server farm minimal body preserves captured quota rejection',
    'valid server farm create returns async Azure shape',
    'server farm get reaches Succeeded',
    'function app collection list is empty before create',
    'function app delete missing returns no content',
    'function app create with missing server farm preserves captured NotFound',
    'function app missing serverFarmId is rejected',
    'valid function app create returns async Azure shape',
    'function app get reaches Succeeded and registers local host',
    'function app unsupported function action fails closed',
    'function route rejects disallowed method',
    'secured function rejects missing key',
    'secured function rejects wrong query key',
    'secured function rejects wrong header key',
    'anonymous HTTP trigger succeeds',
    'anonymous HTTP trigger succeeds without api prefix',
    'secured HTTP trigger accepts x-functions-key header',
    'inspection route rejects unknown app',
    'ARM template deployment can create server farm and function app',
    'function app list after delete is empty',
    'server farm get after delete is not found',
    'server farm delete after delete returns no content',
    'function app create after server farm delete reports missing parent',
  ]) {
    if (!azureFunctionsParity.controlAndDataPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Functions parity E2E missing passing case: ${required}`);
    }
  }
  if (azureFunctionsParity.platformMatrix?.skipped === true) {
    errors.push('Azure Functions parity E2E must include the platform matrix during validation');
  }
  if (azureFunctionsParity.platformMatrix?.ok !== true || azureFunctionsParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Functions parity E2E must pass all Azure platform runner lifecycles');
  }
}

const identityRbacParityText = await readFile(identityRbacParityResultsPath, 'utf8').catch(() => '');
if (!identityRbacParityText) {
  errors.push('missing Azure identity/RBAC parity E2E results; run npm run e2e:identity-rbac-parity');
} else {
  const identityRbacParity = JSON.parse(identityRbacParityText);
  if (identityRbacParity.ok !== true) {
    errors.push('Azure identity/RBAC parity E2E did not pass');
  }
  if (identityRbacParity.controlAndTokenPlane?.failedCount !== 0) {
    errors.push('Azure identity/RBAC parity control/token-plane matrix has failures');
  }
  if ((identityRbacParity.controlAndTokenPlane?.total ?? 0) < 42) {
    errors.push('Azure identity/RBAC parity control/token-plane matrix should exercise at least 42 cases');
  }
  for (const required of [
    'openid configuration exposes local token endpoint',
    'token request missing credentials is rejected',
    'token request with wrong secret is rejected',
    'token request with unsupported grant is rejected',
    'token request for unknown tenant is rejected',
    'token request issues local access token',
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'managed identity create requires an existing resource group',
    'managed identity collection list is empty before create',
    'managed identity delete missing returns no content',
    'managed identity empty body is rejected',
    'managed identity invalid location is rejected',
    'managed identity create succeeds',
    'managed identity get succeeds',
    'managed identity update preserves metadata',
    'managed identity unsupported associated resources action fails closed',
    'role assignment collection list preserves captured not found',
    'role assignment get preserves captured not found',
    'role assignment empty body is rejected',
    'role assignment populated body remains capture-required rejection',
    'role definition collection list preserves captured not found',
    'role definition get preserves captured not found',
    'role definition empty body is rejected',
    'role definition populated body remains capture-required rejection',
    'ARM template deployment can create managed identity',
    'managed identity get after delete is not found',
    'managed identity delete after delete returns no content',
  ]) {
    if (!identityRbacParity.controlAndTokenPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure identity/RBAC parity E2E missing passing case: ${required}`);
    }
  }
  if (identityRbacParity.platformMatrix?.skipped === true) {
    errors.push('Azure identity/RBAC parity E2E must include the platform matrix during validation');
  }
  if (identityRbacParity.platformMatrix?.ok !== true || identityRbacParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure identity/RBAC parity E2E must pass all Azure platform runner lifecycles');
  }
}

const monitorLogsParityText = await readFile(monitorLogsParityResultsPath, 'utf8').catch(() => '');
if (!monitorLogsParityText) {
  errors.push('missing Azure Monitor Logs parity E2E results; run npm run e2e:monitor-logs-parity');
} else {
  const monitorLogsParity = JSON.parse(monitorLogsParityText);
  if (monitorLogsParity.ok !== true) {
    errors.push('Azure Monitor Logs parity E2E did not pass');
  }
  if (monitorLogsParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Monitor Logs parity control-plane matrix has failures');
  }
  if ((monitorLogsParity.controlPlane?.total ?? 0) < 29) {
    errors.push('Azure Monitor Logs parity control-plane matrix should exercise at least 29 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'workspace create requires an existing resource group',
    'workspace collection list is empty before create',
    'workspace delete missing returns no content',
    'workspace empty body is rejected',
    'workspace invalid location is rejected',
    'workspace create succeeds',
    'workspace get succeeds',
    'workspace update preserves metadata',
    'workspace list includes created resource',
    'workspace unsupported shared keys action fails closed',
    'workspace unsupported search action fails closed',
    'diagnostic setting create preserves captured unsupported resource type',
    'diagnostic setting empty body is rejected',
    'diagnostic setting get preserves captured unsupported resource type',
    'diagnostic setting list preserves captured unsupported resource type',
    'diagnostic setting delete preserves captured unsupported resource type',
    'ARM template deployment can create workspace',
    'workspace get after delete is not found',
    'workspace delete after delete returns no content',
  ]) {
    if (!monitorLogsParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Monitor Logs parity E2E missing passing case: ${required}`);
    }
  }
  if (monitorLogsParity.platformMatrix?.skipped === true) {
    errors.push('Azure Monitor Logs parity E2E must include the platform matrix during validation');
  }
  if (monitorLogsParity.platformMatrix?.ok !== true || monitorLogsParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Monitor Logs parity E2E must pass all Azure platform runner lifecycles');
  }
}

const monitorMetricsAlertsParityText = await readFile(monitorMetricsAlertsParityResultsPath, 'utf8').catch(() => '');
if (!monitorMetricsAlertsParityText) {
  errors.push('missing Azure Monitor Metrics/Alerts parity E2E results; run npm run e2e:monitor-metrics-alerts-parity');
} else {
  const monitorMetricsAlertsParity = JSON.parse(monitorMetricsAlertsParityText);
  if (monitorMetricsAlertsParity.ok !== true) {
    errors.push('Azure Monitor Metrics/Alerts parity E2E did not pass');
  }
  if (monitorMetricsAlertsParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Monitor Metrics/Alerts parity control-plane matrix has failures');
  }
  if ((monitorMetricsAlertsParity.controlPlane?.total ?? 0) < 42) {
    errors.push('Azure Monitor Metrics/Alerts parity control-plane matrix should exercise at least 42 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'action group create requires an existing resource group',
    'metric alert create requires an existing resource group',
    'action group collection list is empty before create',
    'metric alert collection list is empty before create',
    'action group delete missing returns no content',
    'metric alert delete missing returns no content',
    'action group empty body is rejected',
    'metric alert empty body is rejected',
    'action group missing short name is rejected',
    'action group invalid enabled type is rejected',
    'metric alert missing severity is rejected',
    'metric alert invalid severity is rejected',
    'metric alert missing scopes is rejected',
    'metric alert missing criteria is rejected',
    'metric alert invalid enabled type is rejected',
    'action group create succeeds',
    'action group get succeeds',
    'action group update preserves metadata',
    'metric alert create succeeds',
    'metric alert get succeeds',
    'metric alert update preserves metadata',
    'action group list includes created resource',
    'metric alert list includes created resource',
    'action group unsupported receiver action fails closed',
    'metric alert unsupported status route fails closed',
    'metric query extension route fails closed',
    'ARM template deployment can create action group and metric alert',
    'metric alert get after delete is not found',
    'metric alert delete after delete returns no content',
    'action group get after delete is not found',
    'action group delete after delete returns no content',
  ]) {
    if (!monitorMetricsAlertsParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Monitor Metrics/Alerts parity E2E missing passing case: ${required}`);
    }
  }
  if (monitorMetricsAlertsParity.platformMatrix?.skipped === true) {
    errors.push('Azure Monitor Metrics/Alerts parity E2E must include the platform matrix during validation');
  }
  if (monitorMetricsAlertsParity.platformMatrix?.ok !== true || monitorMetricsAlertsParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Monitor Metrics/Alerts parity E2E must pass all Azure platform runner lifecycles');
  }
}

const virtualNetworkParityText = await readFile(virtualNetworkParityResultsPath, 'utf8').catch(() => '');
if (!virtualNetworkParityText) {
  errors.push('missing Azure Virtual Network parity E2E results; run npm run e2e:virtual-network-parity');
} else {
  const virtualNetworkParity = JSON.parse(virtualNetworkParityText);
  if (virtualNetworkParity.ok !== true) {
    errors.push('Azure Virtual Network parity E2E did not pass');
  }
  if (virtualNetworkParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Virtual Network parity control-plane matrix has failures');
  }
  if ((virtualNetworkParity.controlPlane?.total ?? 0) < 55) {
    errors.push('Azure Virtual Network parity control-plane matrix should exercise at least 55 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'virtual network create requires an existing resource group',
    'private endpoint create requires an existing resource group',
    'private dns zone create requires an existing resource group',
    'virtual network collection list is empty before create',
    'private endpoint collection list is empty before create',
    'private dns zone collection list is empty before create',
    'virtual network delete missing returns no content',
    'private endpoint delete missing returns no content',
    'private dns zone delete missing returns no content',
    'virtual network empty body is rejected',
    'private endpoint empty body is rejected',
    'private dns zone empty body is rejected',
    'virtual network missing address prefixes is rejected',
    'virtual network invalid address prefix is rejected',
    'virtual network subnet missing prefix is rejected',
    'private endpoint missing connection is rejected',
    'private endpoint missing subnet id is rejected',
    'private endpoint missing private link service id is rejected',
    'private endpoint missing group ids is rejected',
    'private dns zone invalid name is rejected',
    'virtual network create succeeds',
    'virtual network get succeeds',
    'virtual network update preserves metadata',
    'subnet create succeeds',
    'subnet get succeeds',
    'subnet list includes created resource',
    'private dns zone create is accepted asynchronously',
    'private dns zone operation status succeeds',
    'private dns zone get succeeds',
    'private endpoint create succeeds',
    'private endpoint get succeeds',
    'private endpoint update preserves metadata',
    'virtual network list includes created resource',
    'private endpoint list includes created resource',
    'private dns zone list includes created resource',
    'virtual network unsupported peerings route fails closed',
    'private endpoint unsupported dns zone group route fails closed',
    'private dns zone unsupported record set route fails closed',
    'ARM template deployment can create network resources',
    'private endpoint get after delete is not found',
    'subnet get after delete is not found',
    'private dns zone get after delete is not found',
    'virtual network get after delete is not found',
    'virtual network delete after delete returns no content',
  ]) {
    if (!virtualNetworkParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Virtual Network parity E2E missing passing case: ${required}`);
    }
  }
  if (virtualNetworkParity.platformMatrix?.skipped === true) {
    errors.push('Azure Virtual Network parity E2E must include the platform matrix during validation');
  }
  if (virtualNetworkParity.platformMatrix?.ok !== true || virtualNetworkParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Virtual Network parity E2E must pass all Azure platform runner lifecycles');
  }
}

const dnsZonesParityText = await readFile(dnsZonesParityResultsPath, 'utf8').catch(() => '');
if (!dnsZonesParityText) {
  errors.push('missing Azure DNS Zones parity E2E results; run npm run e2e:dns-zones-parity');
} else {
  const dnsZonesParity = JSON.parse(dnsZonesParityText);
  if (dnsZonesParity.ok !== true) {
    errors.push('Azure DNS Zones parity E2E did not pass');
  }
  if (dnsZonesParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure DNS Zones parity control-plane matrix has failures');
  }
  if ((dnsZonesParity.controlPlane?.total ?? 0) < 55) {
    errors.push('Azure DNS Zones parity control-plane matrix should exercise at least 55 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'public dns zone create requires an existing resource group',
    'private dns zone create requires an existing resource group',
    'public dns record create with missing zone reports parent not found',
    'private dns vnet link create with missing zone reports parent not found',
    'public dns zone collection list is empty before create',
    'private dns zone collection list is empty before create',
    'public dns zone delete missing returns no content',
    'private dns zone delete missing returns no content',
    'public dns zone empty body is rejected',
    'public dns zone invalid location is rejected',
    'public dns zone non-global location is rejected',
    'public dns zone invalid name is rejected',
    'private dns zone invalid name is rejected',
    'public dns zone create succeeds',
    'private dns zone create is accepted asynchronously',
    'private dns zone operation status succeeds',
    'public dns zone get succeeds',
    'private dns zone get succeeds',
    'public dns record empty body is rejected',
    'public dns record missing ttl is rejected',
    'public dns record invalid ttl is rejected',
    'public dns A record invalid IPv4 is rejected',
    'public dns AAAA record invalid IPv6 is rejected',
    'public dns CNAME record missing cname is rejected',
    'public dns TXT record empty value is rejected',
    'public dns MX record missing exchange is rejected',
    'public dns record invalid relative name is rejected',
    'public dns unsupported record type route fails closed',
    'public dns A record create succeeds',
    'public dns AAAA record create succeeds',
    'public dns CAA record create succeeds',
    'public dns CNAME record create succeeds',
    'public dns MX record create succeeds',
    'public dns NS record create succeeds',
    'public dns PTR record create succeeds',
    'public dns SOA record create succeeds',
    'public dns SRV record create succeeds',
    'public dns TXT record create succeeds',
    'private dns A record create succeeds',
    'private dns AAAA record create succeeds',
    'private dns CNAME record create succeeds',
    'private dns MX record create succeeds',
    'private dns PTR record create succeeds',
    'private dns SOA record create succeeds',
    'private dns SRV record create succeeds',
    'private dns TXT record create succeeds',
    'public dns A record get succeeds',
    'public dns A record update preserves metadata',
    'public dns A record list includes created resource',
    'private dns A record list includes created resource',
    'virtual network create succeeds for private dns link',
    'private dns vnet link missing virtual network id is rejected',
    'private dns vnet link invalid registration flag is rejected',
    'private dns vnet link create succeeds',
    'private dns vnet link get succeeds',
    'private dns vnet link list includes created resource',
    'private dns unsupported resolver policy route fails closed',
    'ARM template deployment can create dns resources',
    'public dns A record delete succeeds',
    'public dns A record get after delete is not found',
    'public dns A record delete after delete returns no content',
    'private dns vnet link delete succeeds',
    'private dns vnet link get after delete is not found',
    'public dns zone get after delete is not found',
    'private dns zone get after delete is not found',
  ]) {
    if (!dnsZonesParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure DNS Zones parity E2E missing passing case: ${required}`);
    }
  }
  if (dnsZonesParity.platformMatrix?.skipped === true) {
    errors.push('Azure DNS Zones parity E2E must include the platform matrix during validation');
  }
  if (dnsZonesParity.platformMatrix?.ok !== true || dnsZonesParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure DNS Zones parity E2E must pass all Azure platform runner lifecycles');
  }
}

const loadBalancingParityText = await readFile(loadBalancingParityResultsPath, 'utf8').catch(() => '');
if (!loadBalancingParityText) {
  errors.push('missing Azure Load Balancing parity E2E results; run npm run e2e:load-balancing-parity');
} else {
  const loadBalancingParity = JSON.parse(loadBalancingParityText);
  if (loadBalancingParity.ok !== true) {
    errors.push('Azure Load Balancing parity E2E did not pass');
  }
  if (loadBalancingParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure Load Balancing parity control-plane matrix has failures');
  }
  if ((loadBalancingParity.controlPlane?.total ?? 0) < 45) {
    errors.push('Azure Load Balancing parity control-plane matrix should exercise at least 45 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'malformed bearer token is rejected',
    'wrong bearer token is rejected',
    'subscription mismatch is rejected',
    'missing api-version is rejected',
    'application gateway create requires an existing resource group',
    'load balancer create requires an existing resource group',
    'resource group create succeeds',
    'application gateway collection list is empty before create',
    'load balancer collection list is empty before create',
    'application gateway delete missing returns no content',
    'load balancer delete missing returns no content',
    'application gateway empty body is rejected',
    'load balancer empty body is rejected',
    'application gateway invalid location is rejected',
    'load balancer invalid location is rejected',
    'application gateway invalid sku is rejected',
    'load balancer invalid sku is rejected',
    'virtual network create succeeds for load balancing references',
    'application gateway missing gateway subnet is rejected',
    'application gateway missing frontend ip is rejected',
    'application gateway invalid frontend port is rejected',
    'application gateway missing backend settings is rejected',
    'application gateway invalid listener is rejected',
    'application gateway invalid routing rule is rejected',
    'load balancer missing frontend ip is rejected',
    'load balancer missing backend pool is rejected',
    'load balancer missing probe is rejected',
    'load balancer invalid probe is rejected',
    'load balancer invalid rule is rejected',
    'application gateway create succeeds',
    'application gateway get succeeds',
    'application gateway update preserves metadata',
    'load balancer create succeeds',
    'load balancer get succeeds',
    'load balancer update preserves metadata',
    'application gateway list includes created resource',
    'load balancer list includes created resource',
    'application gateway backend health route fails closed',
    'application gateway private endpoint connection route fails closed',
    'load balancer backend pool child route fails closed',
    'load balancer health action route fails closed',
    'ARM template deployment can create load balancing resources',
    'load balancer get after delete is not found',
    'load balancer delete after delete returns no content',
    'application gateway get after delete is not found',
    'application gateway delete after delete returns no content',
  ]) {
    if (!loadBalancingParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Load Balancing parity E2E missing passing case: ${required}`);
    }
  }
  if (loadBalancingParity.platformMatrix?.skipped === true) {
    errors.push('Azure Load Balancing parity E2E must include the platform matrix during validation');
  }
  if (loadBalancingParity.platformMatrix?.ok !== true || loadBalancingParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Load Balancing parity E2E must pass all Azure platform runner lifecycles');
  }
}

const keyVaultParityText = await readFile(keyVaultParityResultsPath, 'utf8').catch(() => '');
if (!keyVaultParityText) {
  errors.push('missing Azure Key Vault parity E2E results; run npm run e2e:key-vault-parity');
} else {
  const keyVaultParity = JSON.parse(keyVaultParityText);
  if (keyVaultParity.ok !== true) {
    errors.push('Azure Key Vault parity E2E did not pass');
  }
  if (keyVaultParity.controlAndDataPlane?.failedCount !== 0) {
    errors.push('Azure Key Vault parity control/data-plane matrix has failures');
  }
  if ((keyVaultParity.controlAndDataPlane?.total ?? 0) < 65) {
    errors.push('Azure Key Vault parity control/data-plane matrix should exercise at least 65 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'vault create requires an existing resource group',
    'vault invalid name is rejected',
    'valid vault create succeeds with vaultUri metadata',
    'secret create with missing vault preserves captured ParentResourceNotFound',
    'key create with missing vault preserves captured ParentResourceNotFound',
    'valid secret ARM create succeeds',
    'secret ARM delete preserves captured DeleteNotSupported',
    'valid key ARM create succeeds',
    'key ARM delete preserves captured DeleteNotSupported',
    'data-plane request without token is rejected',
    'data-plane malformed bearer token is rejected',
    'data-plane unsupported api-version is rejected',
    'data-plane secret invalid contentType is rejected',
    'data-plane secret set succeeds',
    'data-plane secret second version set succeeds',
    'data-plane secret get explicit first version succeeds',
    'data-plane secret versions list includes both versions',
    'data-plane key create invalid key_ops is rejected',
    'key invalid keyOps value is rejected',
    'data-plane secret get after delete is not found',
    'data-plane key create succeeds',
    'data-plane key list includes created key',
    'data-plane encrypt-only key rejects decrypt operation',
    'data-plane key encrypt succeeds',
    'data-plane key decrypt succeeds',
    'data-plane key decrypt invalid ciphertext is rejected',
    'data-plane unsupported secret action fails closed',
    'ARM template deployment can create vault secret and key',
    'secret create after vault delete reports missing parent',
  ]) {
    if (!keyVaultParity.controlAndDataPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Key Vault parity E2E missing passing case: ${required}`);
    }
  }
  if (keyVaultParity.platformMatrix?.skipped === true) {
    errors.push('Azure Key Vault parity E2E must include the platform matrix during validation');
  }
  if (keyVaultParity.platformMatrix?.ok !== true || keyVaultParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Key Vault parity E2E must pass all Azure platform runner lifecycles');
  }
}

const containerRegistryParityText = await readFile(containerRegistryParityResultsPath, 'utf8').catch(() => '');
if (!containerRegistryParityText) {
  errors.push('missing Azure Container Registry parity E2E results; run npm run e2e:container-registry-parity');
} else {
  const containerRegistryParity = JSON.parse(containerRegistryParityText);
  if (containerRegistryParity.ok !== true) {
    errors.push('Azure Container Registry parity E2E did not pass');
  }
  if (containerRegistryParity.controlAndDataPlane?.failedCount !== 0) {
    errors.push('Azure Container Registry parity control/data-plane matrix has failures');
  }
  if ((containerRegistryParity.controlAndDataPlane?.total ?? 0) < 35) {
    errors.push('Azure Container Registry parity control/data-plane matrix should exercise at least 35 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'registry create requires an existing resource group',
    'registry minimal body without sku preserves captured validation',
    'registry invalid name is rejected',
    'registry invalid sku is rejected',
    'valid registry create succeeds with loginServer metadata',
    'registry update preserves loginServer metadata',
    'registry token endpoint issues local ACR token',
    'data-plane /v2/ without token returns bearer challenge',
    'data-plane /v2/ with bearer succeeds',
    'manifest put invalid body is rejected',
    'manifest put succeeds for robotics controller image',
    'manifest get by tag succeeds',
    'ACR catalog includes repository',
    'ACR tags endpoint includes pushed tag',
    'ARM template deployment can create registry',
    'data-plane request after registry delete is rejected',
  ]) {
    if (!containerRegistryParity.controlAndDataPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure Container Registry parity E2E missing passing case: ${required}`);
    }
  }
  if (containerRegistryParity.platformMatrix?.skipped === true) {
    errors.push('Azure Container Registry parity E2E must include the platform matrix during validation');
  }
  if (containerRegistryParity.platformMatrix?.ok !== true || containerRegistryParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure Container Registry parity E2E must pass all Azure platform runner lifecycles');
  }
}

const aksMetadataParityText = await readFile(aksMetadataParityResultsPath, 'utf8').catch(() => '');
if (!aksMetadataParityText) {
  errors.push('missing Azure AKS metadata parity E2E results; run npm run e2e:aks-metadata-parity');
} else {
  const aksMetadataParity = JSON.parse(aksMetadataParityText);
  if (aksMetadataParity.ok !== true) {
    errors.push('Azure AKS metadata parity E2E did not pass');
  }
  if (aksMetadataParity.controlPlane?.failedCount !== 0) {
    errors.push('Azure AKS metadata parity control-plane matrix has failures');
  }
  if ((aksMetadataParity.controlPlane?.total ?? 0) < 35) {
    errors.push('Azure AKS metadata parity control-plane matrix should exercise at least 35 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'cluster create requires an existing resource group',
    'cluster minimal body preserves captured servicePrincipalProfile validation',
    'cluster invalid name is rejected',
    'cluster invalid dnsPrefix is rejected',
    'cluster missing agentPoolProfiles is rejected',
    'cluster invalid agent pool name is rejected',
    'valid cluster create returns async Azure shape',
    'cluster first get is Creating',
    'cluster async operation reaches Succeeded',
    'cluster get reaches Succeeded with AKS metadata',
    'credential action rejects wrong method',
    'user credential action returns kubeconfig metadata',
    'admin credential action returns kubeconfig metadata',
    'unsupported AKS action fails closed',
    'ARM template deployment can create AKS metadata cluster',
    'credential action after delete is rejected',
  ]) {
    if (!aksMetadataParity.controlPlane?.cases?.some(item => item.name === required && item.ok === true)) {
      errors.push(`Azure AKS metadata parity E2E missing passing case: ${required}`);
    }
  }
  if (aksMetadataParity.platformMatrix?.skipped === true) {
    errors.push('Azure AKS metadata parity E2E must include the platform matrix during validation');
  }
  if (aksMetadataParity.platformMatrix?.ok !== true || aksMetadataParity.platformMatrix?.results?.length !== azurePlatforms.length) {
    errors.push('Azure AKS metadata parity E2E must pass all Azure platform runner lifecycles');
  }
}

const storageDataPlaneCaptureText = await readFile(storageDataPlaneCapturePath, 'utf8').catch(() => '');
if (!storageDataPlaneCaptureText) {
  errors.push('missing Azure Storage data-plane capture wave 1 fixture; run GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane when intentionally capturing real Azure');
} else {
  if (/[?&](?:c|s|h|t)=[A-Za-z0-9_-]{40,}/.test(storageDataPlaneCaptureText)) {
    errors.push('Azure Storage data-plane capture wave 1 contains unredacted signed async-operation query material');
  }
  const storageDataPlaneCapture = JSON.parse(storageDataPlaneCaptureText);
  if (storageDataPlaneCapture.cleanup?.verifiedDeleted !== true) {
    errors.push('Azure Storage data-plane capture wave 1 must have verified cleanup');
  }
  if ((storageDataPlaneCapture.cases ?? []).length !== 32) {
    errors.push('Azure Storage data-plane capture wave 1 should include 32 Blob/Queue cases');
  }
  if (storageDataPlaneCapture.globalstack?.cloudValidated !== false) {
    errors.push('Azure Storage data-plane capture wave 1 must not mark storage cloudValidated');
  }
  const mismatches = (storageDataPlaneCapture.comparison ?? []).filter(item => item.matchesStatus === false || item.matchesErrorCode === false);
  if (mismatches.length < 1) {
    errors.push('Azure Storage data-plane capture wave 1 should preserve Azurite mismatch evidence');
  }
  for (const id of ['blob-get-without-authorization', 'queue-peek-after-delete']) {
    if (!mismatches.some(item => item.id === id)) {
      errors.push(`Azure Storage data-plane capture wave 1 must preserve mismatch: ${id}`);
    }
  }
}

const files = await walk(root);
for (const abs of files) {
  if (abs.includes('/node_modules/') || abs.includes('/.git/')) continue;
  const rel = relative(root, abs);
  const content = await readFile(abs, 'utf8').catch(() => '');
  if (rel.startsWith('fixtures/azure-captures/') && /https:\/\/management\.azure\.com\/[^\s"]+[?&](?:c|s|h)=/.test(content)) {
    errors.push(`${rel} contains unredacted signed Azure async-operation query material`);
  }
  for (const forbidden of forbiddenWriteTargets) {
    if (content.includes(`${forbidden}/docs`) || content.includes(`${forbidden}/factory-agent`) || content.includes(`${forbidden}/packages`)) {
      errors.push(`${rel} contains a hardcoded HAAWK path that could invite writes`);
    }
  }
}

if (errors.length > 0) {
  console.error('Validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validation passed for ${azurePlatforms.length} Azure platform templates.`);
