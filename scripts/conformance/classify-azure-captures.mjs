import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { azureError, classifyAzureCapture } from '../../packages/conformance/src/azure-capture-classification.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const outRoot = join(root, 'docs', 'conformance');

const entries = await readdir(fixtureRoot).catch(() => []);
const classified = [];
for (const entry of entries.filter(name => name.endsWith('.json')).sort()) {
  const path = join(fixtureRoot, entry);
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  const classification = classifyAzureCapture(fixture);
  fixture.globalstack = {
    ...(fixture.globalstack ?? {}),
    validationDepth: classification.depth,
    cloudValidated: classification.cloudValidated,
    providerRegistered: classification.providerRegistered,
    caveat: classification.caveat,
  };
  await writeFile(path, `${JSON.stringify(fixture, null, 2)}\n`);
  classified.push({
    id: fixture.id,
    capabilityId: fixture.capabilityId,
    resourceType: fixture.resourceType,
    operation: fixture.operation,
    varianceId: fixture.varianceId,
    status: fixture.response?.status,
    errorCode: azureError(fixture)?.code ?? null,
    cleanupVerified: fixture.cleanup?.verifiedDeleted === true,
    validationDepth: classification.depth,
    cloudValidated: classification.cloudValidated,
    caveat: classification.caveat,
  });
}

function countBy(items, key) {
  const out = {};
  for (const item of items) {
    const value = item[key] ?? 'null';
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

const summary = {
  generatedAt: new Date().toISOString(),
  fixtureCount: classified.length,
  cleanupVerifiedCount: classified.filter(item => item.cleanupVerified).length,
  cloudValidatedCount: classified.filter(item => item.cloudValidated).length,
  byValidationDepth: countBy(classified, 'validationDepth'),
  byErrorCode: countBy(classified, 'errorCode'),
  captures: classified,
};

const lines = [
  '# Azure Capture Classification',
  '',
  'This report prevents shallow real-Azure captures from being interpreted as service parity.',
  '',
  `- Fixtures: ${summary.fixtureCount}`,
  `- Cleanup verified: ${summary.cleanupVerifiedCount}`,
  `- Cloud-validated operations: ${summary.cloudValidatedCount}`,
  '',
  '## Validation Depth',
  '',
  '| Depth | Count |',
  '|---|---:|',
];
for (const [depth, count] of Object.entries(summary.byValidationDepth).sort()) {
  lines.push(`| ${depth} | ${count} |`);
}
lines.push('');
lines.push('## Caveat');
lines.push('');
lines.push('`subscription-or-provider-readiness` captures, such as `MissingSubscriptionRegistration`, are useful evidence but do not prove provider-level semantics. Register the provider or enable the service, then rerun those cases before using them for emulator parity.');
lines.push('');

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, 'azure-capture-classification.json'), `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(join(outRoot, 'azure-capture-classification.md'), `${lines.join('\n')}\n`);
console.log(`Classified ${summary.fixtureCount} Azure captures`);
