import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../workspace-utils/src/index.mjs';
import { azurePlatforms, smokeScenarios } from '../../platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'smoke-prompts');

function pickScenario(index) {
  return smokeScenarios[index % smokeScenarios.length];
}

function instructionFor(platform, scenario) {
  return [
    scenario.prompt,
    '',
    platform.implGuidance,
    '',
    'Do not put credentials or auth tokens in source files. Export all created Azure resource identifiers through the platform output mechanism so integration tests can discover them without hardcoded names.',
  ].join('\n');
}

await rm(outRoot, { recursive: true, force: true });
await mkdir(outRoot, { recursive: true });

const manifest = [];
for (const [index, platform] of azurePlatforms.entries()) {
  const scenario = pickScenario(index);
  const dir = join(outRoot, platform.id);
  await mkdir(dir, { recursive: true });

  const metadata = {
    platform: platform.id,
    label: platform.label,
    cloud: 'azure',
    localCloud: 'globalstack-azure',
    iacArea: scenario.title,
    services: scenario.services,
    globalstackCoverage: scenario.globalstackCoverage,
    expectedFiles: {
      solution: platform.solutionFiles,
      tests: platform.testFiles,
    },
  };

  await writeFile(join(dir, 'instruction.md'), instructionFor(platform, scenario));
  await writeFile(join(dir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  manifest.push(metadata);
}

await writeFile(join(outRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${manifest.length} Azure smoke prompt bundles in ${outRoot}`);
