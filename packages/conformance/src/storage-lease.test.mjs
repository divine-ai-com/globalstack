import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leaseState, leaseGuard, operateLease } from '../../azure-data-plane/src/storage-lease.mjs';
const id = '12345678-1234-4321-8123-123456789abc';
const other = '22345678-1234-4321-8123-123456789abc';
const acquire = { 'x-ms-lease-action': 'acquire', 'x-ms-lease-duration': '15', 'x-ms-proposed-lease-id': id };

test('expired leases can renew until replaced; released and broken leases cannot', () => {
  const resource = {};
  assert.equal(operateLease(resource, acquire, 'Blob', 0).status, 201);
  assert.equal(leaseState(resource, 15001), 'expired');
  assert.equal(leaseGuard(resource, {}, 'Blob', true, 15001), null);
  assert.equal(operateLease(resource, { 'x-ms-lease-action': 'renew', 'x-ms-lease-id': id }, 'Blob', 16000).status, 200);
  assert.equal(leaseState(resource, 30000), 'leased');
  assert.equal(operateLease(resource, { ...acquire, 'x-ms-proposed-lease-id': other }, 'Blob', 32000).status, 201);
  assert.equal(operateLease(resource, { 'x-ms-lease-action': 'renew', 'x-ms-lease-id': id }, 'Blob', 33000).code, 'LeaseIdMismatchWithLeaseOperation');
  assert.equal(operateLease(resource, { 'x-ms-lease-action': 'release', 'x-ms-lease-id': other }, 'Blob', 34000).status, 200);
  assert.equal(operateLease(resource, { 'x-ms-lease-action': 'renew', 'x-ms-lease-id': other }, 'Blob', 35000).code, 'LeaseNotPresentWithLeaseOperation');
  operateLease(resource, acquire, 'Blob', 36000);
  assert.equal(operateLease(resource, { 'x-ms-lease-action': 'break', 'x-ms-lease-break-period': '2' }, 'Blob', 37000).headers['x-ms-lease-time'], '2');
  assert.equal(leaseState(resource, 38000), 'breaking');
  assert.equal(operateLease(resource, acquire, 'Blob', 38000).code, 'LeaseIsBreakingAndCannotBeAcquired');
  assert.equal(leaseState(resource, 39000), 'broken');
  assert.equal(operateLease(resource, { 'x-ms-lease-action': 'renew', 'x-ms-lease-id': id }, 'Blob', 39000).code, 'LeaseIsBrokenAndCannotBeRenewed');
  assert.equal(operateLease(resource, acquire, 'Blob', 39000).status, 201);
});

test('lease validation rejects invalid durations and preserves the active holder', () => {
  const resource = {};
  for (const duration of ['0', '14', '61', '15.1', 'invalid']) assert.equal(operateLease(resource, { ...acquire, 'x-ms-lease-duration': duration }, 'Container', 0).status, 400);
  assert.equal(resource.lease, undefined);
  operateLease(resource, { ...acquire, 'x-ms-lease-duration': '-1' }, 'Container', 0);
  assert.equal(leaseGuard(resource, {}, 'Container', true, 100000).code, 'LeaseIdMissing');
  assert.equal(leaseGuard(resource, {}, 'Container', false, 100000), null);
  assert.equal(operateLease(resource, { ...acquire, 'x-ms-proposed-lease-id': other }, 'Container', 100000).code, 'LeaseAlreadyPresent');
  assert.equal(resource.lease.id, id);
  assert.equal(operateLease(resource, { 'x-ms-lease-action': 'change', 'x-ms-lease-id': id, 'x-ms-proposed-lease-id': other }, 'Container', 100000).status, 200);
  assert.equal(leaseGuard(resource, { 'x-ms-lease-id': id }, 'Container', true, 100000).code, 'LeaseIdMismatchWithContainerOperation');
});
