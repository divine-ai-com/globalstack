import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAzureLiveApiCatalog } from '../packages/core/src/azure-live-api-catalog.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outRoot = join(root, 'docs', 'conformance');

function markdownFor(catalog) {
  const lines = [
    '# Azure Live API Call Catalog',
    '',
    'This catalog filters candidate Azure management-plane API calls for the Tier 1 and Tier 2 AWS-equivalent GlobalStack capabilities.',
    '',
    'No call in this file is considered Azure-correct until the exact request shape, status code, error body, defaults, and async behavior are captured from real Azure or an official emulator-backed conformance test.',
    '',
    '## Summary',
    '',
    `- Capabilities: ${catalog._meta.capabilityCount}`,
    `- Tier 1 capabilities: ${catalog._meta.tier1CapabilityCount}`,
    `- Tier 2 capabilities: ${catalog._meta.tier2CapabilityCount}`,
    `- Candidate calls: ${catalog._meta.callCount}`,
    `- Create/update calls with parameter variance cases: ${catalog._meta.createOrUpdateCallCount}`,
    '',
    '## Validation Policy',
    '',
    catalog._meta.validationPolicy,
    '',
    'Parameter variance testing starts with `valid-minimal`, `missing-api-version`, `invalid-location`, `empty-body`, and SKU variance where a SKU is present. Provider-specific cases should be added from real Azure captures as each service is validated.',
    '',
    '## 99% Parity Work Queue',
    '',
    'Use `azure-99-parity-checklist.md` as the service-by-service work queue for real Azure emulation depth. It tracks every Tier 1 and Tier 2 capability against live API surface inventory, parameter variance captures, state transitions, error-shape fidelity, identity/RBAC, retry/eventual consistency, IaC-provider behavior, data-plane behavior, repeat captures, and service-specific facade or official emulator integration.',
    '',
    'Generate it with:',
    '',
    '```bash',
    'npm run conformance:parity',
    '```',
    '',
    'Generate the prioritized execution roadmap with:',
    '',
    '```bash',
    'npm run conformance:roadmap',
    '```',
    '',
    'Refresh live Azure provider-operation inventory intentionally with:',
    '',
    '```bash',
    'npm run providers:surface',
    '```',
    '',
    'Provider-operation metadata is inventory input only. It does not prove status codes, defaulting, async behavior, data-plane semantics, or RBAC behavior.',
    '',
  ];

  for (const tier of [1, 2]) {
    lines.push(`## Tier ${tier} Calls`);
    lines.push('');
    lines.push('| Capability | AWS Analogue | Resource Type | Operation | Method | API Version | Variance Cases |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const call of catalog.calls.filter(item => item.tier === tier)) {
      lines.push(`| ${call.capabilityId} | ${call.awsAnalogue} | ${call.resourceType} | ${call.operation} | ${call.method} | ${call.apiVersion} | ${call.varianceCases.length} |`);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });
const catalog = buildAzureLiveApiCatalog();
await writeFile(join(outRoot, 'azure-live-api-catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);
await writeFile(join(outRoot, 'README.md'), markdownFor(catalog));

console.log(`Rendered ${catalog._meta.callCount} candidate Azure API calls to ${outRoot}`);
