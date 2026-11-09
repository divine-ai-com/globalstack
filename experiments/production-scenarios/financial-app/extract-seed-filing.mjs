import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { calculateFinancialMetric } from './calculation.mjs';

function uniqueLine(text, label, pattern) {
  const matches = [...text.matchAll(pattern)];
  assert.equal(matches.length, 1, `Expected one ${label} line`);
  return matches[0][1];
}

// This parser is confined to the published synthetic plain-text fixture shape.
// Production filing formats and PDF/OCR extraction need separate evidence.
export function extractSeedFiling(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  assert.ok(buffer.length > 0 && buffer.length <= 64 * 1024, 'Seed filing size is out of bounds');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  assert.ok(text.startsWith('SYNTHETIC REGULATORY-STYLE FILING. NOT A REAL COMPANY OR SEC SUBMISSION.\n'));
  const page1Marker = '\nPage 1 of 2\n';
  const page2Marker = '\nPage 2 of 2\n';
  const page1Start = text.indexOf(page1Marker);
  const page2Start = text.indexOf(page2Marker);
  assert.ok(page1Start > 0 && page2Start > page1Start, 'Expected ordered page markers');
  const header = text.slice(0, page1Start);
  const page1 = text.slice(page1Start + page1Marker.length, page2Start);
  const documentId = uniqueLine(header, 'document ID', /^Document ID: ([a-z0-9-]{1,80})$/gm);
  const issuer = uniqueLine(header, 'issuer', /^Issuer: ([A-Za-z][A-Za-z ]{1,79})$/gm);
  const tenant = uniqueLine(header, 'tenant', /^Tenant: ([a-z0-9-]{1,80})$/gm);
  const period = uniqueLine(header, 'period', /^Reporting period: (FY20\d\d H[12])$/gm);
  const revision = Number(uniqueLine(header, 'revision', /^Revision: ([1-9]\d?)$/gm));
  assert.match(page1, /^Consolidated operating results \(USD millions\)\n/);
  const values = {};
  for (const [label, key] of [['Revenue', 'revenue'], ['Operating expenses', 'expenses'], ['Operating income', 'operatingIncome']]) {
    values[key] = uniqueLine(page1, label, new RegExp(`^${label} \\| (-?(?:0|[1-9]\\d{0,23})(?:\\.\\d{1,6})?)$`, 'gm'));
  }
  const citation = { documentId, page: 1 };
  const calculated = calculateFinancialMetric({ operation: 'subtract', operands: [
    { value: values.revenue, period, currency: 'USD', unit: 'millions', citation },
    { value: values.expenses, period, currency: 'USD', unit: 'millions', citation },
  ] });
  assert.equal(values.operatingIncome, calculated.value, 'Operating income must reconcile');
  return { documentId, issuer, tenant, period, revision,
    sourceSha256: createHash('sha256').update(buffer).digest('hex'),
    facts: Object.entries(values).map(([metric, value]) => ({ metric, value, currency: 'USD', unit: 'millions',
      period, citation })) };
}
