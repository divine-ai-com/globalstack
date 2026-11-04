import assert from 'node:assert/strict';
import test from 'node:test';
import { securityFindings } from './check-sarif.mjs';

test('blocks high security findings while retaining lower severity results for review', () => {
  const report = { runs: [{ tool: { driver: { rules: [{ id: 'danger', properties: { 'security-severity': '8.1' } }, { id: 'review', properties: { 'security-severity': '6.1' } }] } }, results: [{ ruleId: 'danger' }, { ruleId: 'review' }] }] };
  assert.equal(securityFindings(report).length, 1);
  assert.equal(securityFindings(report)[0].rule, 'danger');
});
test('missing and failed static-analysis output cannot pass', () => {
  assert.throws(() => securityFindings({ runs: [] }));
  assert.throws(() => securityFindings({ runs: [{}] }));
  assert.throws(() => securityFindings({ runs: [{ invocations: [{ executionSuccessful: false }], results: [] }] }));
});
