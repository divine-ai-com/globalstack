import assert from 'node:assert/strict';
import { extractSeedFiling } from './extract-seed-filing.mjs';
import { calculateFinancialMetric } from './calculation.mjs';

// This boundary verifies the committed synthetic corpus. It does not parse
// general filings or establish the identity of an external document source.
export function createVerifiedSeedFacts({ manifest, files }) {
  assert.equal(manifest?.schemaVersion, 1);
  assert.ok(Array.isArray(manifest.documents) && manifest.documents.length > 0);
  const latest = new Map();
  const revisions = new Set();
  for (const entry of manifest.documents) {
    assert.match(entry.id, /^[a-z0-9-]+$/);
    assert.match(entry.company, /^[a-z0-9]+$/);
    assert.equal(entry.tenant, `tenant-${entry.company}`, 'Seed company and tenant must agree');
    assert.ok(entry.id.startsWith(`${entry.company}-`), 'Seed document ID must match its company');
    assert.equal(entry.file, `${entry.id}.txt`, 'Seed file name must match its document ID');
    const bytes = files[entry.file];
    assert.ok(Buffer.isBuffer(bytes), `Missing seed bytes for ${entry.id}`);
    const parsed = extractSeedFiling(bytes);
    assert.equal(parsed.sourceSha256, entry.sha256, `Seed hash mismatch for ${entry.id}`);
    assert.equal(parsed.documentId, entry.id);
    assert.equal(parsed.tenant, entry.tenant);
    assert.equal(parsed.period, `FY${entry.year} ${entry.period}`);
    assert.equal(parsed.revision, entry.revision);
    for (const fact of parsed.facts) assert.equal(fact.value, entry[fact.metric]);
    const key = `${parsed.tenant}:${entry.company}:${parsed.period}`;
    const revisionKey = `${key}:${parsed.revision}`;
    assert.ok(!revisions.has(revisionKey), `Duplicate seed revision ${revisionKey}`);
    revisions.add(revisionKey);
    if (!latest.has(key) || parsed.revision > latest.get(key).revision) latest.set(key, parsed);
  }

  function fact({ tenant, company, period, metric }) {
    assert.match(tenant, /^tenant-[a-z0-9-]+$/);
    assert.match(company, /^[a-z0-9-]+$/);
    assert.match(period, /^FY20\d\d H[12]$/);
    assert.match(metric, /^[A-Za-z][A-Za-z0-9]*$/);
    const filing = latest.get(`${tenant}:${company}:${period}`);
    const value = filing?.facts.find(item => item.metric === metric);
    return value ? { ...value, sourceSha256: filing.sourceSha256, revision: filing.revision } : null;
  }

  function calculate({ tenant, operation, selectors }) {
    assert.ok(Array.isArray(selectors) && selectors.length === 2, 'Exactly two source selectors are required');
    const sources = selectors.map(selector => fact({ ...selector, tenant }));
    assert.ok(sources.every(Boolean), 'A requested fact is absent from the verified tenant corpus');
    const result = calculateFinancialMetric({ operation, operands: sources });
    return { ...result, sourceSha256: sources.map(source => source.sourceSha256) };
  }

  return { fact, calculate };
}
