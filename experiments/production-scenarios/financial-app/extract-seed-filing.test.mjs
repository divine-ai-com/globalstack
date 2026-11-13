import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { extractSeedFiling } from './extract-seed-filing.mjs';

const root = new URL('./corpus/', import.meta.url);

test('seed extraction binds every financial value to the published filing bytes and page', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root)));
  for (const document of manifest.documents) {
    const parsed = extractSeedFiling(await readFile(new URL(document.file, root)));
    assert.equal(parsed.documentId, document.id);
    assert.equal(parsed.sourceSha256, document.sha256);
    assert.equal(parsed.tenant, document.tenant);
    assert.equal(parsed.revision, document.revision);
    assert.equal(parsed.facts.find(fact => fact.metric === 'revenue').value, document.revenue);
    assert.equal(parsed.facts.find(fact => fact.metric === 'expenses').value, document.expenses);
    assert.equal(parsed.facts.find(fact => fact.metric === 'operatingIncome').value, document.operatingIncome);
    assert.ok(parsed.facts.every(fact => fact.citation.documentId === document.id && fact.citation.page === 1));
  }
});

test('seed extraction ignores page-two injection text and rejects changed accounting values', async () => {
  const original = await readFile(new URL('beta-2026-h2-r1.txt', root), 'utf8');
  const parsed = extractSeedFiling(original);
  assert.equal(parsed.facts.find(fact => fact.metric === 'revenue').value, '159');
  assert.throws(() => extractSeedFiling(original.replace('Operating income | 63', 'Operating income | 64')),
    /Operating income must reconcile/);
  assert.throws(() => extractSeedFiling(original.replace('Revenue | 159', 'Revenue | 159\nRevenue | 999')),
    /Unexpected page-one financial row/);
  assert.throws(() => extractSeedFiling(original.replace('Revenue | 159', 'Revenue | 159\nFree cash flow | 50')),
    /Unexpected page-one financial row/);
});
