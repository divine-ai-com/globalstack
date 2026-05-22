import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { buildAzureLiveApiCatalog } from '../../packages/core/src/azure-live-api-catalog.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const outPath = join(root, 'docs', 'conformance', 'azure-validation-checklist.md');

function fixtureIdFor(call, variance) {
  return `${call.id}.${variance.id}`.replace(/[^a-zA-Z0-9._-]/g, '-');
}

async function loadFixtures() {
  const entries = await readdir(fixtureRoot).catch(() => []);
  const fixtures = new Map();
  for (const entry of entries.filter(name => name.endsWith('.json'))) {
    const parsed = JSON.parse(await readFile(join(fixtureRoot, entry), 'utf8'));
    fixtures.set(parsed.id ?? entry.replace(/\.json$/, ''), parsed);
  }
  return fixtures;
}

function mark(fixture) {
  return fixture?.cleanup?.verifiedDeleted === true ? 'x' : ' ';
}

function statusText(fixture) {
  if (!fixture) return 'pending';
  return `captured HTTP ${fixture.response?.status}; cleanup ${fixture.cleanup?.verifiedDeleted ? 'verified' : 'not verified'}`;
}

const catalog = buildAzureLiveApiCatalog();
const fixtures = await loadFixtures();
const lines = [
  '# Azure Validation Checklist',
  '',
  'This generated checklist tracks real Azure conformance work. An item is checked only when a fixture exists and ephemeral resource-group cleanup was verified.',
  '',
  '## Operating Rules',
  '',
  '- [x] Azure CLI installed and authenticated.',
  '- [x] Real Azure execution remains gated by `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1`.',
  '- [x] Runner supports single capability, resource type, and variance-case targeting.',
  '- [x] Runner verifies ephemeral resource-group deletion after each Azure case.',
  '- [ ] Captured Azure responses are normalized into local emulator expectations for every checked case.',
  '',
  '## Progress',
  '',
  `- Candidate calls: ${catalog._meta.callCount}`,
  `- Candidate create/update calls: ${catalog._meta.createOrUpdateCallCount}`,
  `- Real Azure fixtures with verified cleanup: ${[...fixtures.values()].filter(item => item.cleanup?.verifiedDeleted === true).length}`,
  '',
];

for (const tier of [1, 2]) {
  lines.push(`## Tier ${tier}`);
  lines.push('');
  const calls = catalog.calls.filter(call => call.tier === tier);
  for (const call of calls) {
    lines.push(`### ${call.capabilityId} / ${call.resourceType} / ${call.operation}`);
    lines.push('');
    const variances = call.varianceCases.length > 0 ? call.varianceCases : [{
      id: call.operation === 'ListByResourceGroup' ? 'empty-list' : 'not-found',
    }];
    for (const variance of variances) {
      const fixture = fixtures.get(fixtureIdFor(call, variance));
      lines.push(`- [${mark(fixture)}] \`${variance.id}\`: ${statusText(fixture)}`);
    }
    lines.push('');
  }
}

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, `${lines.join('\n')}\n`);
console.log(`Rendered Azure validation checklist to ${outPath}`);
