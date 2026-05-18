import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { azureError } from '../packages/conformance/src/azure-capture-classification.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const outRoot = join(root, 'fixtures', 'local-expectations');
const allowedDepths = new Set([
  'arm-surface',
  'provider-routing-or-parent-validation',
  'provider-validation',
  'provider-accepted',
]);

function safeProviderAccepted(fixture) {
  if (fixture.globalstack?.validationDepth !== 'provider-accepted') return true;
  if (fixture.operation === 'Delete' && fixture.response?.status === 204) return true;
  if (fixture.operation === 'ListByResourceGroup' && fixture.response?.status === 200) {
    const value = fixture.response?.body?.value;
    return Array.isArray(value) && value.length === 0;
  }
  return false;
}

const entries = await readdir(fixtureRoot).catch(() => []);
const expectations = [];
for (const entry of entries.filter(name => name.endsWith('.json')).sort()) {
  const fixture = JSON.parse(await readFile(join(fixtureRoot, entry), 'utf8'));
  const depth = fixture.globalstack?.validationDepth;
  if (!allowedDepths.has(depth)) continue;
  if (!safeProviderAccepted(fixture)) continue;
  const error = azureError(fixture);
  expectations.push({
    id: fixture.id,
    capabilityId: fixture.capabilityId,
    resourceType: fixture.resourceType,
    operation: fixture.operation,
    varianceId: fixture.varianceId,
    validationDepth: depth,
    expected: {
      status: fixture.response?.status,
      errorCode: error?.code ?? null,
      message: error?.message ?? null,
    },
    request: {
      method: fixture.request?.method,
      path: fixture.request?.path,
      body: fixture.request?.body ?? null,
    },
    caveat: fixture.globalstack?.caveat,
  });
}

const summary = {
  generatedAt: new Date().toISOString(),
  source: 'fixtures/azure-captures',
  expectationCount: expectations.length,
  allowedDepths: [...allowedDepths],
  expectations,
};

await mkdir(outRoot, { recursive: true });
await writeFile(join(outRoot, 'azure-derived-local-expectations.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`Rendered ${expectations.length} Azure-derived local expectations`);
