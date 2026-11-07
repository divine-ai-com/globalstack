import assert from 'node:assert/strict';

export async function storageRangeCases(exchange) {
  const call = (id, method, path, headers = {}, body = '') => exchange({ id, surface: 'blob', method, path, headers, body });
  const path = '/range-probe/document.txt';
  assert.ok([201, 409].includes((await call('range-container', 'PUT', '/range-probe?restype=container')).status));
  const first = await call('range-first-write', 'PUT', path, { 'x-ms-blob-type': 'BlockBlob' }, '0123456789');
  assert.equal(first.status, 201);
  const cases = [
    ['bounded', { range: 'bytes=2-5' }], ['open', { range: 'bytes=7-' }],
    ['clamped', { range: 'bytes=7-99' }], ['all', { range: 'bytes=0-9' }],
    ['past-end', { range: 'bytes=10-' }], ['reversed', { range: 'bytes=7-2' }],
    ['malformed', { range: 'not-a-range' }], ['suffix', { range: 'bytes=-3' }],
    ['multiple', { range: 'bytes=0-1,4-5' }], ['large-end', { range: 'bytes=0-99999999999999999999' }],
    ['native-header', { 'x-ms-range': 'bytes=1-3' }],
    ['precedence', { range: 'bytes=0-1', 'x-ms-range': 'bytes=6-8' }],
    ['conditional', { range: 'bytes=2-5', 'if-match': '"wrong"' }],
    ['md5', { range: 'bytes=2-5', 'x-ms-range-get-content-md5': 'true' }],
  ];
  for (const [id, headers] of cases) await call(`range-${id}`, 'GET', path, headers);
  await call('range-head', 'HEAD', path, { range: 'bytes=2-5' });
  await call('range-overwrite', 'PUT', path, { 'x-ms-blob-type': 'BlockBlob' }, 'replacement');
  if (first.headers['x-ms-version-id']) await call('range-historical', 'GET', `${path}?versionid=${encodeURIComponent(first.headers['x-ms-version-id'])}`, { range: 'bytes=2-5' });
  await call('range-empty-write', 'PUT', '/range-probe/empty', { 'x-ms-blob-type': 'BlockBlob' });
  await call('range-empty-get', 'GET', '/range-probe/empty', { range: 'bytes=0-' });
}
