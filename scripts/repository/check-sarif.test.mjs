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


test('reads CodeQL query-pack extension metadata instead of treating findings as zero severity', () => {
  const report = { runs: [{ tool: { driver: { name: 'CodeQL', rules: [] }, extensions: [
    { name: 'codeql/javascript-queries', rules: [{ id: 'request-forgery', properties: { 'security-severity': '9.1', tags: ['security'] } }] },
  ] }, results: [{ ruleId: 'request-forgery', rule: { id: 'request-forgery', index: 0, toolComponent: { index: 0 } } }] }] };
  assert.deepEqual(securityFindings(report).map(({ rule, severity }) => ({ rule, severity })), [{ rule: 'request-forgery', severity: 9.1 }]);
});

test('unresolved rule metadata and invalid security scores fail closed', () => {
  const result = { ruleId: 'unknown' };
  assert.throws(() => securityFindings({ runs: [{ tool: { driver: { rules: [] } }, results: [result] }] }), /metadata/);
  for (const properties of [{ tags: ['security'] }, { 'security-severity': 'not-a-score' }]) {
    assert.throws(() => securityFindings({ runs: [{ tool: { driver: { rules: [{ id: 'unknown', properties }] } }, results: [result] }] }), /severity/);
  }
});
