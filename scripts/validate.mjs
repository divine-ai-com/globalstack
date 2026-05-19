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
const azureFunctionsParityResultsPath = join(distRoot, 'e2e', 'azure-functions-parity', 'results.json');
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
    'topic publish and subscription receive configured entity',
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
  if ((serviceBusParity.controlPlane?.total ?? 0) < 30) {
    errors.push('Azure Service Bus parity control-plane matrix should exercise at least 30 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'namespace create requires an existing resource group',
    'namespace invalid sku is rejected',
    'namespace invalid name is rejected by official naming rules',
    'valid namespace create returns async Azure shape',
    'namespace get reaches Succeeded',
    'topic create succeeds',
    'subscription create succeeds',
    'queue create succeeds',
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
  if ((eventGridParity.controlAndDataPlane?.total ?? 0) < 25) {
    errors.push('Azure Event Grid parity control/data-plane matrix should exercise at least 25 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'topic create requires an existing resource group',
    'topic invalid location is rejected',
    'topic invalid name is rejected by Azure naming rules',
    'valid topic create succeeds with endpoint metadata',
    'topic listKeys returns shared access keys',
    'publish with missing key is rejected',
    'publish invalid EventGridEvent schema is rejected',
    'publish EventGridEvent succeeds',
    'publish customEvent succeeds',
    'top-level event subscription create preserves captured rejection',
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
  if ((apiManagementParity.controlAndGatewayPlane?.total ?? 0) < 30) {
    errors.push('Azure API Management parity control/gateway matrix should exercise at least 30 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'service create requires an existing resource group',
    'service missing sku preserves captured rejection',
    'valid service create returns async Azure shape',
    'service get reaches Succeeded',
    'api create with missing parent preserves captured ResourceNotFound',
    'api missing path is rejected',
    'api create succeeds with documented path shape',
    'gateway unknown api path is rejected',
    'gateway subscription-required api rejects missing key',
    'gateway routes configured api locally',
    'ARM template deployment can create service and api',
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
  if ((azureFunctionsParity.controlAndDataPlane?.total ?? 0) < 35) {
    errors.push('Azure Functions parity control/data-plane matrix should exercise at least 35 cases');
  }
  for (const required of [
    'unauthenticated ARM request is rejected',
    'server farm create requires an existing resource group',
    'server farm minimal body preserves captured quota rejection',
    'valid server farm create returns async Azure shape',
    'server farm get reaches Succeeded',
    'function app create with missing server farm preserves captured NotFound',
    'function app missing serverFarmId is rejected',
    'valid function app create returns async Azure shape',
    'function app get reaches Succeeded and registers local host',
    'function route rejects disallowed method',
    'secured function rejects missing key',
    'anonymous HTTP trigger succeeds',
    'secured HTTP trigger accepts x-functions-key header',
    'ARM template deployment can create server farm and function app',
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
  if ((keyVaultParity.controlAndDataPlane?.total ?? 0) < 50) {
    errors.push('Azure Key Vault parity control/data-plane matrix should exercise at least 50 cases');
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
    'data-plane secret set succeeds',
    'data-plane secret get after delete is not found',
    'data-plane key create succeeds',
    'data-plane key encrypt succeeds',
    'data-plane key decrypt succeeds',
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
