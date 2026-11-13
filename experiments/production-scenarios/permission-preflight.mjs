import assert from 'node:assert/strict';

export const workloadAssignmentActions = [
  'Microsoft.Authorization/roleAssignments/write',
  'Microsoft.Authorization/roleAssignments/delete',
];

function matches(pattern, action) {
  const expression = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${expression}$`, 'i').test(action);
}

// This is a necessary permission check, not an authorization simulator. Deny
// assignments, role conditions and provider policy still require live validation.
export function assessWorkloadPermissions(response) {
  const incomplete = !response || !Array.isArray(response.value) || Boolean(response.nextLink);
  if (incomplete) return { status: 'unknown', reason: 'Incomplete permission response', actions: [] };
  const valid = response.value.every(item => item && Array.isArray(item.actions) && Array.isArray(item.notActions)
    && [...item.actions, ...item.notActions].every(pattern => typeof pattern === 'string' && pattern.length > 0 && pattern.length <= 1024));
  if (!valid) return { status: 'unknown', reason: 'Malformed permission entry', actions: [] };
  const actions = workloadAssignmentActions.map(action => ({ action,
    listedGrant: response.value.some(item => item.actions.some(pattern => matches(pattern, action))
      && !item.notActions.some(pattern => matches(pattern, action))) }));
  return { status: actions.every(item => item.listedGrant) ? 'requires-live-validation' : 'missing-permission', actions };
}

export function requireWorkloadPermissions(response) {
  const result = assessWorkloadPermissions(response);
  assert.equal(result.status, 'requires-live-validation', 'Workload role creation and cleanup permissions are not established; do not provision the full stack');
  return result;
}
