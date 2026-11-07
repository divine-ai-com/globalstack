import { createHmac, timingSafeEqual } from 'node:crypto';

const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const tag = (name, value) => `<${name}>${escape(value)}</${name}>`;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

// Retained versions do not share mutable metadata or lease state with the root.
// Body buffers are immutable after publication by the router.
export function publishBlob(account, key, blob) {
  delete blob.versionId;
  if (account.versioningEnabled) {
    const now = BigInt(Date.now()) * 10000n;
    const ticks = now > account.versionClock ? now : account.versionClock + 1n;
    account.versionClock = ticks;
    const date = new Date(Number(ticks / 10000n)).toISOString();
    blob.versionId = date.replace('Z', `${String(ticks % 10000n).padStart(4, '0')}Z`);
    const versions = account.blobVersions.get(key) ?? new Map();
    const retained = { ...blob, metadata: { ...blob.metadata } };
    delete retained.lease;
    versions.set(blob.versionId, retained);
    account.blobVersions.set(key, versions);
  }
  account.blobs.set(key, blob);
  return blob;
}

export function versionHeaders(blob, selected = false) {
  return blob.versionId ? { 'x-ms-version-id': blob.versionId,
    ...(selected ? {} : { 'x-ms-is-current-version': 'true' }) } : {};
}

export function validVersionId(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{7}Z$/.test(value)) return false;
  const millis = value.slice(0, 23) + 'Z';
  const parsed = Date.parse(millis);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === millis;
}

function cursor(account, scope, after) {
  const payload = Buffer.from(JSON.stringify({ scope, after })).toString('base64url');
  const signature = createHmac('sha256', Buffer.from(account.accountKey, 'base64')).update(payload).digest('base64url');
  return `gsb1.${payload}.${signature}`;
}

function readCursor(account, token, scope) {
  if (token.length > 16384 || !/^gsb1\.[\w-]+\.[\w-]+$/.test(token)) throw new Error('Invalid marker');
  const [, payload, signature] = token.split('.');
  const expected = createHmac('sha256', Buffer.from(account.accountKey, 'base64')).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('Invalid marker');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (JSON.stringify(decoded.scope) !== JSON.stringify(scope) || !Array.isArray(decoded.after)
    || decoded.after.length !== 2 || decoded.after.some(part => typeof part !== 'string')) throw new Error('Invalid marker');
  return decoded.after;
}

export function listBlobs(account, containerName, params) {
  const unsupported = [...params.keys()].some(key => !['restype', 'comp', 'include', 'prefix', 'maxresults', 'marker', 'timeout'].includes(key));
  const include = params.get('include')?.split(',') ?? [];
  if (unsupported || include.some(value => !['versions', 'metadata'].includes(value))) {
    return { status: 501, code: 'NotImplemented', message: 'Only flat Blob listing with versions, metadata and prefix is implemented.' };
  }
  const rawMax = params.get('maxresults');
  if (rawMax !== null && (!/^\d+$/.test(rawMax) || !Number.isSafeInteger(Number(rawMax)) || Number(rawMax) < 1)) {
    return { status: 400, code: 'OutOfRangeQueryParameterValue', message: 'The specified maxresults value is out of range.' };
  }
  const limit = Math.min(rawMax === null ? 5000 : Number(rawMax), 5000);
  const prefix = params.get('prefix') ?? '', versions = include.includes('versions');
  const scope = [account.accountName, containerName, prefix, [...include].sort()];
  let after;
  try { if (params.get('marker')) after = readCursor(account, params.get('marker'), scope); }
  catch { return { status: 400, code: 'InvalidQueryParameterValue', message: 'The continuation marker is invalid for this listing.' }; }
  const root = `${containerName.toLowerCase()}\0`;
  const entries = [];
  if (versions) {
    for (const [key, history] of account.blobVersions) {
      if (!key.startsWith(root)) continue;
      for (const blob of history.values()) entries.push({ blob, current: account.blobs.get(key)?.versionId === blob.versionId });
    }
  }
  for (const [key, blob] of account.blobs) {
    if (key.startsWith(root) && (!versions || !blob.versionId)) entries.push({ blob, current: true });
  }
  const identity = item => [item.blob.blobName, item.blob.versionId ?? ''];
  const order = (a, b) => compare(a[0], b[0]) || compare(a[1], b[1]);
  const eligible = entries.filter(item => item.blob.blobName.startsWith(prefix) && (!after || order(identity(item), after) > 0))
    .sort((a, b) => order(identity(a), identity(b)));
  const page = eligible.slice(0, limit);
  const next = eligible.length > limit ? cursor(account, scope, identity(page.at(-1))) : '';
  const items = page.map(({ blob, current }) => {
    const metadata = include.includes('metadata') ? `<Metadata>${Object.entries(blob.metadata)
      .map(([name, value]) => tag(name.slice('x-ms-meta-'.length), value)).join('')}</Metadata>` : '';
    return `<Blob>${tag('Name', blob.blobName)}${versions && blob.versionId ? tag('VersionId', blob.versionId) + (current ? tag('IsCurrentVersion', 'true') : '') : ''}`
      + `<Properties>${tag('Last-Modified', blob.lastModified)}${tag('Etag', blob.etag.replaceAll('"', ''))}${tag('Content-Length', blob.body.length)}`
      + `${tag('Content-Type', blob.contentType)}${tag('BlobType', 'BlockBlob')}</Properties>${metadata}</Blob>`;
  }).join('');
  return { status: 200, body: `<?xml version="1.0" encoding="utf-8"?><EnumerationResults ServiceEndpoint="https://${escape(account.accountName)}.blob.core.windows.net/" ContainerName="${escape(containerName)}">`
    + `${params.has('prefix') ? tag('Prefix', prefix) : ''}${params.has('marker') ? tag('Marker', params.get('marker')) : ''}${rawMax !== null ? tag('MaxResults', limit) : ''}`
    + `<Blobs>${items}</Blobs>${tag('NextMarker', next)}</EnumerationResults>` };
}
