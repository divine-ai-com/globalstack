import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHybridCoverage } from '../packages/core/src/hybrid-coverage.mjs';
import { renderOfficialEmulatorCompose, officialEmulatorEnvironment, renderServiceBusEmulatorConfig } from '../packages/azure-data-plane/src/official-emulator-compose.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const docsRoot = join(root, 'docs', 'hybrid');
const distRoot = join(root, 'dist', 'hybrid');

function markdownFor(coverage) {
  const lines = [
    '# GlobalStack Azure Hybrid Coverage',
    '',
    'This coverage file is generated from the GlobalStack Tier 1 and Tier 2 capability registry.',
    'It intentionally separates local implementation, official emulator backing, contract tests, and real Azure validation.',
    '',
    '## Claim Policy',
    '',
    coverage._meta.claimPolicy,
    '',
    coverage._meta.strictSurfacePolicy,
    '',
    '## Official Emulator Options',
    '',
    '| Emulator | Covers | Image / Runtime | Notes |',
    '|---|---|---|---|',
  ];

  for (const emulator of coverage.officialEmulators) {
    lines.push(`| ${emulator.label} | ${emulator.covers.join(', ')} | ${emulator.image ?? 'local tool'} | ${emulator.notes} |`);
  }

  for (const tier of [1, 2]) {
    lines.push('');
    lines.push(`## Tier ${tier} Capabilities`);
    lines.push('');
    lines.push('| Capability | AWS Analogue | Azure Equivalent | Implementation Kind | Cloud Validated | Known Gaps |');
    lines.push('|---|---|---|---|---|---|');
    for (const capability of coverage.capabilities.filter(item => item.tier === tier)) {
      lines.push(`| ${capability.id} | ${capability.awsAnalogue} | ${capability.azureEquivalent} | ${capability.primaryModes.includes('official-emulator') ? 'official-emulator-backed-local' : 'metadata-only-control-plane'} | ${capability.cloudValidated ? 'yes' : 'no'} | ${capability.knownGaps.length} |`);
    }
  }

  lines.push('');
  lines.push('## Real Azure Capture Rule');
  lines.push('');
  lines.push('Any unclear validation, default, error, async, auth, or side-effect behavior must be captured from a disposable real Azure resource before it can be marked `cloudValidated`.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(docsRoot, { recursive: true });
await mkdir(distRoot, { recursive: true });

const coverage = buildHybridCoverage();
await writeFile(join(docsRoot, 'azure-hybrid-coverage.json'), `${JSON.stringify(coverage, null, 2)}\n`);
await writeFile(join(docsRoot, 'README.md'), markdownFor(coverage));
await writeFile(join(distRoot, 'docker-compose.official-emulators.yml'), renderOfficialEmulatorCompose());
await writeFile(join(distRoot, 'official-emulator-env.json'), `${JSON.stringify(officialEmulatorEnvironment(), null, 2)}\n`);
await writeFile(join(distRoot, 'service-bus-config.json'), `${renderServiceBusEmulatorConfig()}\n`);

console.log(`Rendered hybrid coverage and official emulator artifacts to ${docsRoot} and ${distRoot}`);
