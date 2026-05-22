import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { normalizationRuleById } from '../../packages/azure-data-plane/src/storage-normalizer.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-storage-data-plane-captures');
const outRoot = join(root, 'fixtures', 'local-expectations');
const outPath = join(outRoot, 'azure-storage-data-plane-expectations.json');

function localSupportState(caseId, comparison) {
  if (!comparison) return 'azure-only-no-local-comparison';
  if (comparison.matchesStatus === true && comparison.matchesErrorCode === true) return 'azurite-matches-azure';
  if (comparison.matchesStatus === true && comparison.matchesErrorCode === false) return 'azurite-status-match-error-code-gap';
  return 'azurite-behavior-gap';
}

const entries = await readdir(fixtureRoot).catch(() => []);
const expectations = [];
const fixtureSummaries = [];

for (const entry of entries.filter(name => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(await readFile(join(fixtureRoot, entry), 'utf8'));
  if (fixture.globalstack?.validationDepth !== 'live-data-plane') continue;
  if (fixture.cleanup?.verifiedDeleted !== true) continue;

  const comparisonById = new Map((fixture.comparison ?? []).map(item => [item.id, item]));
  fixtureSummaries.push({
    id: fixture.id,
    capturedAt: fixture.capturedAt,
    caseCount: fixture.cases?.length ?? 0,
    mismatchCount: (fixture.comparison ?? []).filter(item => item.matchesStatus === false || item.matchesErrorCode === false).length,
    cleanupVerified: true,
  });

  for (const item of fixture.cases ?? []) {
    const comparison = comparisonById.get(item.id) ?? null;
    const normalizationRule = normalizationRuleById(item.id);
    expectations.push({
      id: `${fixture.id}.${item.id}`,
      fixtureId: fixture.id,
      caseId: item.id,
      description: item.description,
      service: item.id.startsWith('blob-') ? 'blob' : item.id.startsWith('queue-') ? 'queue' : 'unknown',
      expected: {
        status: item.response?.status,
        errorCode: item.response?.errorCode ?? null,
      },
      localSupportState: localSupportState(item.id, comparison),
      azurite: comparison
        ? {
            status: comparison.azuriteStatus,
            errorCode: comparison.azuriteErrorCode ?? null,
            matchesStatus: comparison.matchesStatus,
            matchesErrorCode: comparison.matchesErrorCode,
          }
        : null,
      globalstackNormalization: normalizationRule
        ? {
            status: normalizationRule.status,
            sourceFixture: normalizationRule.sourceFixture,
            azureStatus: normalizationRule.azureStatus,
            azureErrorCode: normalizationRule.azureErrorCode,
            azuriteStatus: normalizationRule.azuriteStatus,
            azuriteErrorCode: normalizationRule.azuriteErrorCode,
          }
        : null,
    });
  }
}

const summary = {
  generatedBy: 'npm run storage:expectations',
  source: 'fixtures/azure-storage-data-plane-captures',
  expectationCount: expectations.length,
  fixtureSummaries,
  expectations,
  caveat: 'These are real Azure data-plane expectations. They are not all locally replayable until GlobalStack has a data-plane proxy/facade in front of official emulators.',
};

await mkdir(outRoot, { recursive: true });
await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Rendered ${expectations.length} Azure Storage data-plane expectations`);
