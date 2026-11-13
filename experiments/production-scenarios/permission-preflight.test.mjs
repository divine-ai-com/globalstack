import test from 'node:test';
import assert from 'node:assert/strict';
import { assessWorkloadPermissions, requireWorkloadPermissions } from './permission-preflight.mjs';

test('Contributor exclusions block workload grants and cleanup before provisioning', () => {
  const response = { value: [{ actions: ['*'], notActions: ['Microsoft.Authorization/*/Write', 'Microsoft.Authorization/*/Delete'] }] };
  assert.equal(assessWorkloadPermissions(response).status, 'missing-permission');
  assert.ok(assessWorkloadPermissions(response).actions.every(item => !item.listedGrant));
  assert.throws(() => requireWorkloadPermissions(response), /do not provision/);
});

test('an additional role can restore excluded actions without claiming effective authorization', () => {
  const response = { value: [{ actions: ['*'], notActions: ['Microsoft.Authorization/*'] },
    { actions: ['microsoft.authorization/roleassignments/*'], notActions: [] }] };
  assert.equal(requireWorkloadPermissions(response).status, 'requires-live-validation');
});

test('write without delete is insufficient for a disposable experiment', () => {
  assert.equal(assessWorkloadPermissions({ value: [{ actions: ['Microsoft.Authorization/roleAssignments/write'], notActions: [] }] }).status, 'missing-permission');
});

test('partial or malformed permission responses cannot pass', () => {
  for (const response of [null, {}, { value: [], nextLink: 'https://example.invalid/page2' },
    { value: [null] }, { value: [{ actions: '*', notActions: [] }] }, { value: [{ actions: ['*'] }] },
    { value: [{ actions: [123], notActions: [] }] }]) {
    assert.equal(assessWorkloadPermissions(response).status, 'unknown');
    assert.throws(() => requireWorkloadPermissions(response));
  }
  assert.equal(assessWorkloadPermissions({ value: [] }).status, 'missing-permission');
});

test('action matching anchors and escapes literals instead of interpreting regular expressions', () => {
  for (const pattern of ['MicrosoftXAuthorization/roleAssignments/*', 'prefix/Microsoft.Authorization/roleAssignments/*', 'Microsoft.Authorization/roleAssignments/(write|delete)']) {
    assert.equal(assessWorkloadPermissions({ value: [{ actions: [pattern], notActions: [] }] }).status, 'missing-permission');
  }
});
