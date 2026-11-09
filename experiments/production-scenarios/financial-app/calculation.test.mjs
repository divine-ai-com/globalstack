import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateFinancialMetric } from './calculation.mjs';

const cited = (value, period = 'FY2026', overrides = {}) => ({
  value, period, currency: 'USD', unit: 'millions', citation: { documentId: 'filing-2026', page: 7 }, ...overrides,
});

test('exact decimal arithmetic retains the period and both source citations', () => {
  const result = calculateFinancialMetric({ operation: 'subtract', operands: [
    cited('100.10'), cited('0.09', 'FY2026', { citation: { documentId: 'filing-2026', page: 8 } }),
  ] });
  assert.equal(result.value, '100.01');
  assert.equal(result.period, 'FY2026');
  assert.deepEqual(result.citations.map(source => source.page), [7, 8]);
  assert.equal(calculateFinancialMetric({ operation: 'add', operands: [cited('0.1'), cited('0.2')] }).value, '0.3');
});

test('percentage change uses the stated current and previous periods with explicit rounding', () => {
  const previous = cited('3', 'FY2025', { citation: { documentId: 'filing-2025', page: 4 } });
  const growth = calculateFinancialMetric({ operation: 'percentageChange', operands: [cited('4', 'FY2026'), previous] });
  assert.equal(growth.value, '33.333333');
  assert.deepEqual(growth.periods, { current: 'FY2026', previous: 'FY2025' });
  assert.equal(calculateFinancialMetric({ operation: 'percentageChange', operands: [cited('2'),
    cited('4', 'FY2025')] }).value, '-50');
  assert.equal(calculateFinancialMetric({ operation: 'percentageChange', operands: [cited('200.000001'),
    cited('200', 'FY2025')] }).value, '0.000001');
  assert.equal(calculateFinancialMetric({ operation: 'percentageChange', operands: [cited('199.999999'),
    cited('200', 'FY2025')] }).value, '-0.000001');
});

test('mixed context and unsupported or uncited values are rejected', () => {
  const calculate = (operation, left, right) => calculateFinancialMetric({ operation, operands: [left, right] });
  assert.throws(() => calculate('add', cited('1'), cited('2', 'FY2025')), /Periods must match/);
  assert.throws(() => calculate('add', cited('1'), cited('2', 'FY2026', { currency: 'EUR' })), /Currency and unit/);
  assert.throws(() => calculate('add', cited('1'), cited('2', 'FY2026', { unit: 'thousands' })), /Currency and unit/);
  assert.throws(() => calculate('percentageChange', cited('1'), cited('0', 'FY2025')), /nonzero/);
  assert.throws(() => calculate('percentageChange', cited('1'), cited('2')), /must differ/);
  assert.throws(() => calculate('add', cited('1'), cited('2', 'FY2026', { citation: null })), /citation/);
  assert.throws(() => calculate('add', cited('1e9'), cited('2')), /decimal string/);
  assert.throws(() => calculate('divide', cited('1'), cited('2')), /Unsupported/);
});
