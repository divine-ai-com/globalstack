import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableFilter } from '../../azure-data-plane/src/storage-table-filter.mjs';

test('compound Table filters preserve parentheses, precedence and partition isolation', () => {
  const predicate = tableFilter("PartitionKey eq 'other-run' and (RowKey eq 'sentinel' or ExecutionId eq 'active')");
  assert.equal(predicate({ PartitionKey: 'other-run', RowKey: 'sentinel' }), true);
  assert.equal(predicate({ PartitionKey: 'other-run', RowKey: 'event-1', ExecutionId: 'active' }), true);
  assert.equal(predicate({ PartitionKey: 'other-run', RowKey: 'event-1', ExecutionId: 'old' }), false);
  assert.equal(predicate({ PartitionKey: 'foreign', RowKey: 'sentinel', ExecutionId: 'active' }), false);
  const precedence = tableFilter("A eq 'yes' or B eq 'yes' and C eq 'yes'");
  assert.equal(precedence({ A: 'yes' }), true);
  assert.equal(precedence({ B: 'yes', C: 'no' }), false);
  assert.equal(tableFilter("Name eq 'O''Brien'")({ Name: "O'Brien" }), true);
  assert.equal(tableFilter("Missing eq ''")({}), false);
  assert.equal(tableFilter("toString eq 'value'")({}), false);
});

test('unsupported operators and malformed filters fail instead of returning every entity', () => {
  for (const source of ["Value gt 'x'", "Count eq 1", "A eq 'x' trailing", "A eq 'x' or", "(A eq 'x'", "A eq 'x')", "A eq 'unterminated", "A eq 'x'; process.exit()", "A eq 'x' and (B eq 'y' or )", ' '.repeat(9000)]) {
    assert.throws(() => tableFilter(source));
  }
  assert.throws(() => tableFilter(Array(16).fill("A eq 'x'").join(' or ')));
  assert.throws(() => tableFilter('('.repeat(18) + "A eq 'x'" + ')'.repeat(18)));
});
