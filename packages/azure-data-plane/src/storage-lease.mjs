import { randomUUID } from 'node:crypto';

const error = (status, code, message) => ({ status, code, message });
function normalizeId(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^(?:\{(.*)\}|\((.*)\))$/, (_, braces, parens) => braces ?? parens);
  if (/^[a-f0-9]{32}$/i.test(text)) return text.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(text) ? text.toLowerCase() : null;
}

export function leaseState(resource, now = Date.now()) {
  const lease = resource?.lease;
  if (!lease) return 'available';
  if (lease.breakAt !== undefined) return now >= lease.breakAt ? 'broken' : 'breaking';
  return now >= lease.expiresAt ? 'expired' : 'leased';
}

export function leaseHeaders(resource, now = Date.now()) {
  const state = leaseState(resource, now);
  const locked = ['leased', 'breaking'].includes(state);
  return { 'x-ms-lease-state': state, 'x-ms-lease-status': locked ? 'locked' : 'unlocked',
    ...(state === 'leased' ? { 'x-ms-lease-duration': resource.lease.duration === -1 ? 'infinite' : 'fixed' } : {}) };
}

export function leaseGuard(resource, headers, kind, required, now = Date.now()) {
  const state = leaseState(resource, now), id = headers['x-ms-lease-id'];
  const active = ['leased', 'breaking'].includes(state);
  if (!active && !id) return null;
  if (!active && id) return error(412, state === 'expired' ? 'LeaseLost' : `LeaseNotPresentWith${kind}Operation`,
    state === 'expired' ? `A lease ID was specified, but the lease for the ${kind.toLowerCase()} has expired.` : `There is currently no lease on the ${kind.toLowerCase()}.`);
  if (!id && required) return error(412, 'LeaseIdMissing', `There is currently a lease on the ${kind.toLowerCase()} and no lease ID was specified in the request.`);
  if (id && normalizeId(id) !== resource.lease.id) return error(412, `LeaseIdMismatchWith${kind}Operation`, `The lease ID specified did not match the lease ID for the ${kind.toLowerCase()}.`);
  return null;
}

export function operateLease(resource, headers, kind, now = Date.now()) {
  const action = headers['x-ms-lease-action'];
  const id = normalizeId(headers['x-ms-lease-id']);
  const proposed = normalizeId(headers['x-ms-proposed-lease-id']);
  const state = leaseState(resource, now), current = resource.lease;
  if (!action) return error(400, 'MissingRequiredHeader', "An HTTP header that's mandatory for this request is not specified.");
  if ((headers['x-ms-lease-id'] && !id) || (headers['x-ms-proposed-lease-id'] && !proposed)) return error(400, 'InvalidHeaderValue', 'The value for one of the HTTP headers is not in the correct format.');
  if (action === 'acquire') {
    if (headers['x-ms-lease-duration'] === undefined) return error(400, 'MissingRequiredHeader', "An HTTP header that's mandatory for this request is not specified.");
    const duration = Number(headers['x-ms-lease-duration']);
    if (!Number.isInteger(duration) || !(duration === -1 || duration >= 15 && duration <= 60)) return error(400, 'InvalidHeaderValue', 'The value for one of the HTTP headers is not in the correct format.');
    if (state === 'breaking') return error(409, 'LeaseIsBreakingAndCannotBeAcquired', 'The lease is currently in breaking state and cannot be acquired until it is broken.');
    if (state === 'leased' && proposed !== current.id) return error(409, 'LeaseAlreadyPresent', 'There is already a lease present.');
    resource.lease = { id: proposed ?? randomUUID(), duration, expiresAt: duration === -1 ? Infinity : now + duration * 1000 };
    return { status: 201, headers: { 'x-ms-lease-id': resource.lease.id } };
  }
  if (action === 'break') {
    if (!current) return error(409, 'LeaseNotPresentWithLeaseOperation', `There is currently no lease on the ${kind.toLowerCase()}.`);
    const remaining = state === 'leased' ? (current.duration === -1 ? Infinity : Math.max(0, current.expiresAt - now))
      : state === 'breaking' ? Math.max(0, current.breakAt - now) : 0;
    const supplied = headers['x-ms-lease-break-period'];
    const seconds = supplied === undefined ? (remaining === Infinity ? 0 : Math.ceil(remaining / 1000)) : Number(supplied);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 60) return error(400, 'InvalidHeaderValue', 'The value for one of the HTTP headers is not in the correct format.');
    current.breakAt = now + Math.min(remaining, seconds * 1000);
    return { status: 202, headers: { 'x-ms-lease-time': String(Math.ceil((current.breakAt - now) / 1000)) } };
  }
  if (!['renew', 'release', 'change'].includes(action)) return error(400, 'InvalidHeaderValue', 'The value for one of the HTTP headers is not in the correct format.');
  if (!id || action === 'change' && !proposed) return error(400, 'MissingRequiredHeader', "An HTTP header that's mandatory for this request is not specified.");
  if (!current) return error(409, 'LeaseNotPresentWithLeaseOperation', `There is currently no lease on the ${kind.toLowerCase()}.`);
  if (id !== current.id) return error(409, 'LeaseIdMismatchWithLeaseOperation', `The lease ID specified did not match the lease ID for the ${kind.toLowerCase()}.`);
  if (action === 'release') { delete resource.lease; return { status: 200, headers: {} }; }
  if (action === 'renew') {
    if (['breaking', 'broken'].includes(state)) return error(409, 'LeaseIsBrokenAndCannotBeRenewed', 'The lease has been broken explicitly and cannot be renewed.');
    current.expiresAt = current.duration === -1 ? Infinity : now + current.duration * 1000;
    return { status: 200, headers: { 'x-ms-lease-id': current.id } };
  }
  if (state === 'breaking') return error(409, 'LeaseIsBreakingAndCannotBeChanged', 'The lease is currently in breaking state and cannot be changed.');
  if (state !== 'leased') return error(409, 'LeaseNotPresentWithLeaseOperation', `There is currently no lease on the ${kind.toLowerCase()}.`);
  current.id = proposed;
  return { status: 200, headers: { 'x-ms-lease-id': proposed } };
}

export function blobConditions(resource, headers, method) {
  const read = ['GET', 'HEAD'].includes(method);
  const matches = value => value === '*' ? !!resource : value?.split(',').map(x => x.trim()).includes(resource?.etag);
  if (headers['if-match'] && !matches(headers['if-match'])) return error(412, 'ConditionNotMet', 'The condition specified using HTTP conditional header(s) is not met.');
  if (headers['if-none-match'] && matches(headers['if-none-match'])) {
    if (read) return { status: 304 };
    if (method === 'PUT' && headers['if-none-match'] === '*') return error(409, 'BlobAlreadyExists', 'The specified blob already exists.');
    return error(412, 'ConditionNotMet', 'The condition specified using HTTP conditional header(s) is not met.');
  }
  // Fail explicitly until date-condition combinations have a paired contract.
  if (headers['if-modified-since'] || headers['if-unmodified-since']) return error(501, 'NotImplemented', 'Date-based storage conditions are not implemented.');
  return null;
}
