import { allCapabilities, officialEmulatorOptions, tier1Capabilities, tier2Capabilities } from './azure-tier1-capabilities.mjs';

function implementationKind(capability) {
  if (capability.cloudValidated) return 'cloud-validated';
  if (capability.primaryModes.includes('official-emulator')) return 'official-emulator-backed-local';
  return 'metadata-only-control-plane';
}

function enrichCapability(capability) {
  return {
    ...capability,
    implementationKind: implementationKind(capability),
    realAzureApiComplete: false,
  };
}

export function buildHybridCoverage() {
  const generatedAt = new Date().toISOString();
  const operations = {};

  for (const capability of allCapabilities) {
    operations[capability.id] = {};
    for (const operation of capability.implementedOperations) {
      operations[capability.id][operation] = {
        implemented: true,
        implementationKind: implementationKind(capability),
        realAzureApiComplete: false,
        contractTested: capability.contractTested,
        cloudValidated: capability.cloudValidated,
        backingEngines: capability.backingEngines,
        knownGaps: capability.knownGaps,
      };
    }
  }

  return {
    _meta: {
      generatedAt,
      source: 'globalstack-hybrid-registry',
      tiers: [1, 2],
      capabilityCount: allCapabilities.length,
      tier1CapabilityCount: tier1Capabilities.length,
      tier2CapabilityCount: tier2Capabilities.length,
      officialEmulatorCount: officialEmulatorOptions.length,
      claimPolicy: 'No service is considered fully supported unless implemented, contractTested, cloudValidated, and knownGaps is empty.',
      strictSurfacePolicy: 'Unknown Azure resource types and incomplete ARM requests must fail closed rather than returning fabricated success.',
    },
    officialEmulators: officialEmulatorOptions,
    capabilities: allCapabilities.map(enrichCapability),
    operations,
  };
}

export function summarizeCapability(capability) {
  return {
    id: capability.id,
    tier: capability.tier,
    awsAnalogue: capability.awsAnalogue,
    azureEquivalent: capability.azureEquivalent,
    resourceTypes: capability.resourceTypes,
    modes: capability.primaryModes,
    backingEngines: capability.backingEngines,
    implementedOperationCount: capability.implementedOperations.length,
    implementationKind: implementationKind(capability),
    realAzureApiComplete: false,
    contractTested: capability.contractTested,
    cloudValidated: capability.cloudValidated,
    knownGapCount: capability.knownGaps.length,
  };
}
