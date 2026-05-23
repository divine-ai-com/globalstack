import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { request } from 'node:http';
import { test } from 'node:test';
import { createBlobStorageServer, createStorageDataPlaneRouter } from '../../azure-data-plane/src/storage-router.mjs';

function canonicalizedHeaders(headers) {
  return Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), String(value).trim().replace(/\s+/g, ' ')])
    .filter(([key]) => key.startsWith('x-ms-'))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}\n`)
    .join('');
}

function canonicalizedResource(url, accountName) {
  const parts = [`/${accountName}${url.pathname}`];
  const grouped = new Map();
  for (const [key, value] of url.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (!grouped.has(lower)) grouped.set(lower, []);
    grouped.get(lower).push(value);
  }
  for (const [key, values] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${key}:${values.sort().join(',')}`);
  }
  return parts.join('\n');
}

function sharedKeySignature({ method, url, headers, bodyLength = 0, accountName, accountKey }) {
  const contentLengthHeader = headers['content-length'] ?? headers['Content-Length'] ?? '';
  const contentLength = String(contentLengthHeader || bodyLength || '') === '0'
    ? ''
    : String(contentLengthHeader || bodyLength || '');
  const stringToSign = [
    method.toUpperCase(),
    headers['content-encoding'] ?? '',
    headers['content-language'] ?? '',
    contentLength,
    headers['content-md5'] ?? '',
    headers['content-type'] ?? '',
    headers.date ?? '',
    headers['if-modified-since'] ?? '',
    headers['if-match'] ?? '',
    headers['if-none-match'] ?? '',
    headers['if-unmodified-since'] ?? '',
    headers.range ?? '',
    `${canonicalizedHeaders(headers)}${canonicalizedResource(url, accountName)}`,
  ].join('\n');
  return createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

function sharedKeyLiteSignature({ url, headers, accountName, accountKey }) {
  const stringToSign = [
    headers['x-ms-date'] ?? headers.date ?? '',
    canonicalizedResource(url, accountName),
  ].join('\n');
  return createHmac('sha256', Buffer.from(accountKey, 'base64'))
    .update(stringToSign, 'utf8')
    .digest('base64');
}

function storageRequest(port, { method, host, path, accountName, accountKey, authScheme = 'SharedKey', body = Buffer.alloc(0), extraHeaders = {} }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const url = new URL(`http://${host}${path}`);
    const headers = {
      host,
      'x-ms-date': new Date().toUTCString(),
      'x-ms-version': '2023-11-03',
      ...extraHeaders,
    };
    if (payload.length > 0) {
      headers['content-length'] = String(payload.length);
    }
    const signature = authScheme === 'SharedKeyLite'
      ? sharedKeyLiteSignature({ url, headers, accountName, accountKey })
      : sharedKeySignature({
          method,
          url,
          headers,
          bodyLength: payload.length,
          accountName,
          accountKey,
        });
    headers.authorization = `${authScheme} ${accountName}:${signature}`;
    const req = request({
      hostname: '127.0.0.1',
      port,
      method,
      path,
      headers,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    if (payload.length > 0) req.write(payload);
    req.end();
  });
}

test('blob server accepts host-style package deployment paths with account/default prefix and HEAD reads', async () => {
  const router = createStorageDataPlaneRouter();
  const accountName = 'packagestore123';
  const accountKey = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
  router.registerStorageAccount({ accountName, accountKey });
  router.registerContainer({ accountName, containerName: 'deployments' });
  const server = createBlobStorageServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const put = await storageRequest(port, {
      method: 'PUT',
      host: `${accountName}.blob.core.windows.net`,
      path: `/${accountName}/default/deployments/functionapp.zip`,
      accountName,
      accountKey,
      body: Buffer.from('zip-data'),
      extraHeaders: {
        'content-type': 'application/zip',
        'x-ms-blob-type': 'BlockBlob',
      },
    });
    assert.equal(put.status, 201);

    const head = await storageRequest(port, {
      method: 'HEAD',
      host: `${accountName}.blob.core.windows.net`,
      path: `/${accountName}/default/deployments/functionapp.zip`,
      accountName,
      accountKey,
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers['x-ms-blob-type'], 'BlockBlob');
    assert.equal(head.headers['content-length'], '8');

    const get = await storageRequest(port, {
      method: 'GET',
      host: `${accountName}.blob.core.windows.net`,
      path: `/${accountName}/default/deployments/functionapp.zip`,
      accountName,
      accountKey,
    });
    assert.equal(get.status, 200);
    assert.equal(get.body.toString('utf8'), 'zip-data');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('blob server accepts SharedKeyLite HEAD on host-style package paths', async () => {
  const router = createStorageDataPlaneRouter();
  const accountName = 'packagestorelite';
  const accountKey = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
  router.registerStorageAccount({ accountName, accountKey });
  router.registerContainer({ accountName, containerName: 'deployments' });
  const server = createBlobStorageServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const missing = await storageRequest(port, {
      method: 'HEAD',
      host: `${accountName}.blob.core.windows.net`,
      path: `/${accountName}/default/deployments/functionapp.zip`,
      accountName,
      accountKey,
      authScheme: 'SharedKeyLite',
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.headers['x-ms-error-code'], 'BlobNotFound');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('blob server accepts service SAS reads on host-style package paths', async () => {
  const router = createStorageDataPlaneRouter();
  const accountName = 'packagestoresas';
  const accountKey = 'Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==';
  router.registerStorageAccount({ accountName, accountKey });
  router.registerContainer({ accountName, containerName: 'deployments' });
  const server = createBlobStorageServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    await storageRequest(port, {
      method: 'PUT',
      host: `${accountName}.blob.core.windows.net`,
      path: `/${accountName}/default/deployments/functionapp.zip`,
      accountName,
      accountKey,
      body: Buffer.from('zip-data'),
      extraHeaders: {
        'content-type': 'application/zip',
        'x-ms-blob-type': 'BlockBlob',
      },
    });

    const sasFields = {
      permissions: 'r',
      startTime: '2024-01-01T00:00:00Z',
      expiryTime: '2099-01-01T00:00:00Z',
      canonicalizedResource: `/blob/${accountName}/deployments/functionapp.zip`,
      protocols: 'https',
      version: '2024-11-04',
      resource: 'b',
      cacheControl: '',
      contentDisposition: '',
      contentEncoding: '',
      contentLanguage: '',
      contentType: 'application/zip',
    };
    const sig = createHmac('sha256', Buffer.from(accountKey, 'base64'))
      .update([
        sasFields.permissions,
        sasFields.startTime,
        sasFields.expiryTime,
        sasFields.canonicalizedResource,
        sasFields.protocols,
        sasFields.version,
        sasFields.resource,
        sasFields.cacheControl,
        sasFields.contentDisposition,
        sasFields.contentEncoding,
        sasFields.contentLanguage,
        sasFields.contentType,
      ].join('\n'), 'utf8')
      .digest('base64');
    const sasPath = `/${accountName}/default/deployments/functionapp.zip?sv=${encodeURIComponent(sasFields.version)}&spr=${encodeURIComponent(sasFields.protocols)}&st=${encodeURIComponent(sasFields.startTime)}&se=${encodeURIComponent(sasFields.expiryTime)}&sp=${encodeURIComponent(sasFields.permissions)}&sr=${encodeURIComponent(sasFields.resource)}&rsct=${encodeURIComponent(sasFields.contentType)}&sig=${encodeURIComponent(sig)}`;

    const head = await new Promise((resolve, reject) => {
      const req = request({
        hostname: '127.0.0.1',
        port,
        method: 'HEAD',
        path: sasPath,
        headers: { host: `${accountName}.blob.core.windows.net` },
      }, res => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(head.status, 200);
    assert.equal(head.headers['x-ms-blob-type'], 'BlockBlob');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
