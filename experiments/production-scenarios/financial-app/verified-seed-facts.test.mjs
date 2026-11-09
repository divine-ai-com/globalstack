import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createVerifiedSeedFacts } from './verified-seed-facts.mjs';

async function corpus() {
  const root = new URL('./corpus/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
  const files = Object.fromEntries(await Promise.all(manifest.documents.map(async item =>
    [item.file, await readFile(new URL(item.file, root))])));
  return { manifest, files };
}

test('verified seed facts select the latest revision and preserve byte hashes', async () => {
  const { manifest, files } = await corpus();
  const store = createVerifiedSeedFacts({ manifest, files });
  const fact = store.fact({ tenant: 'tenant-alpha', company: 'alpha', period: 'FY2025 H2', metric: 'revenue' });
  const latest = manifest.documents.find(item => item.id === 'alpha-2025-h2-r2');
  assert.equal(fact.value, '120');
  assert.equal(fact.revision, 2);
  assert.deepEqual(fact.citation, { documentId: latest.id, page: 1 });
  assert.equal(fact.sourceSha256, latest.sha256);
  const result = store.calculate({ tenant: 'tenant-alpha', operation: 'percentageChange', selectors: [
    { company: 'alpha', period: 'FY2025 H2', metric: 'revenue' },
    { company: 'alpha', period: 'FY2024 H2', metric: 'revenue' },
  ] });
  assert.equal(result.value, '14.285714');
  assert.deepEqual(result.citations.map(item => item.documentId), ['alpha-2025-h2-r2', 'alpha-2024-h2-r1']);
  assert.deepEqual(result.sourceSha256, [latest.sha256, manifest.documents.find(item => item.id === 'alpha-2024-h2-r1').sha256]);
});

test('verified seed facts reject changed bytes, duplicate revisions and cross-tenant requests', async () => {
  const { manifest, files } = await corpus();
  const changed = { ...files, 'alpha-2025-h2-r2.txt': Buffer.concat([files['alpha-2025-h2-r2.txt'], Buffer.from('\n')]) };
  assert.throws(() => createVerifiedSeedFacts({ manifest, files: changed }), /hash mismatch/);
  assert.throws(() => createVerifiedSeedFacts({ manifest: { ...manifest, documents: [...manifest.documents, manifest.documents[0]] }, files }), /Duplicate seed revision/);
  const mislabeled = { ...manifest, documents: [{ ...manifest.documents[0], company: 'beta' }, ...manifest.documents.slice(1)] };
  assert.throws(() => createVerifiedSeedFacts({ manifest: mislabeled, files }), /company and tenant must agree/);
  const store = createVerifiedSeedFacts({ manifest, files });
  assert.equal(store.fact({ tenant: 'tenant-beta', company: 'alpha', period: 'FY2025 H2', metric: 'revenue' }), null);
  assert.equal(store.fact({ tenant: 'tenant-alpha', company: 'alpha', period: 'FY2025 H2', metric: 'freeCashFlow' }), null);
  assert.throws(() => store.calculate({ tenant: 'tenant-beta', operation: 'add', selectors: [
    { company: 'alpha', period: 'FY2025 H2', metric: 'revenue' },
    { company: 'alpha', period: 'FY2025 H2', metric: 'expenses' },
  ] }), /absent from the verified tenant corpus/);
});
