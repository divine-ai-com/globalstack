import assert from 'node:assert/strict';
import { request } from 'node:http';
import { test } from 'node:test';
import { createKeyVaultRouter, createKeyVaultRouterServer } from '../../azure-data-plane/src/key-vault-router.mjs';
import { ResourceStore } from '../../core/src/resource-store.mjs';
import { capabilityForResourceType } from '../../core/src/azure-tier1-capabilities.mjs';

function httpJson(port, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        host: 'vaultsync.vault.azure.net',
        authorization: 'Bearer globalstack-local-token',
        'content-type': 'application/json',
        ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        text += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('key vault data-plane secret lifecycle stays in sync with ARM resource store', async () => {
  const store = new ResourceStore();
  const subscriptionId = '00000000-0000-0000-0000-000000000000';
  const resourceGroupName = 'rg-kv-sync';
  const secretCapability = capabilityForResourceType('Microsoft.KeyVault/vaults/secrets');
  const router = createKeyVaultRouter({
    onSecretSet({ vaultName, secretName, value, contentType, tags, attributes }) {
      store.putResource({
        subscriptionId,
        resourceGroupName,
        providerNamespace: 'Microsoft.KeyVault',
        typePath: `vaults/${vaultName}/secrets/${secretName}`,
        body: {
          properties: {
            value,
            ...(contentType ? { contentType } : {}),
            ...(attributes ? { attributes } : {}),
          },
          ...(tags ? { tags } : {}),
        },
        apiVersion: '2023-07-01',
        capability: secretCapability,
      });
    },
    onSecretDelete({ vaultName, secretName }) {
      store.deleteResource({
        subscriptionId,
        resourceGroupName,
        providerNamespace: 'Microsoft.KeyVault',
        typePath: `vaults/${vaultName}/secrets/${secretName}`,
      });
    },
  });
  router.registerVault({
    vaultName: 'vaultsync',
    vaultUri: 'https://vaultsync.vault.azure.net/',
    subscriptionId,
    resourceGroupName,
  });

  const server = createKeyVaultRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const put = await httpJson(port, 'PUT', '/secrets/test-secret?api-version=7.5', {
      value: 'super-secret',
      contentType: 'text/plain',
    });
    assert.equal(put.status, 200);

    const stored = store.getResource({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.KeyVault',
      typePath: 'vaults/vaultsync/secrets/test-secret',
    });
    assert.ok(stored);
    assert.equal(stored.name, 'vaultsync/test-secret');
    assert.equal(stored.properties.value, 'super-secret');

    const del = await httpJson(port, 'DELETE', '/secrets/test-secret?api-version=7.5');
    assert.equal(del.status, 200);

    const afterDelete = store.getResource({
      subscriptionId,
      resourceGroupName,
      providerNamespace: 'Microsoft.KeyVault',
      typePath: 'vaults/vaultsync/secrets/test-secret',
    });
    assert.equal(afterDelete, null);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('key vault data-plane missing bearer token returns a bearer challenge', async () => {
  const router = createKeyVaultRouter();
  router.registerVault({
    vaultName: 'vaultsync',
    vaultUri: 'https://vaultsync.vault.azure.net/',
  });
  const server = createKeyVaultRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const response = await httpJson(port, 'GET', '/secrets/test-secret?api-version=7.5', undefined, {
      authorization: '',
    });
    assert.equal(response.status, 401);
    const challenge = String(response.headers['www-authenticate'] ?? '');
    assert.match(challenge, /^Bearer /);
    assert.match(challenge, /resource="https:\/\/vault\.azure\.net"/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('key vault data-plane RSA operations use the local crypto backend', async () => {
  const router = createKeyVaultRouter();
  router.registerVault({
    vaultName: 'vaultsync',
    vaultUri: 'https://vaultsync.vault.azure.net/',
  });
  const server = createKeyVaultRouterServer(router);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const createSigningKey = await httpJson(port, 'POST', '/keys/signing-key/create?api-version=7.5', {
      kty: 'RSA',
      key_size: 2048,
      key_ops: ['sign', 'verify'],
    });
    assert.equal(createSigningKey.status, 200);

    const digest = Buffer.from('payload-to-sign').toString('base64url');
    const sign = await httpJson(port, 'POST', '/keys/signing-key/sign?api-version=7.5', {
      alg: 'RS256',
      value: digest,
    });
    assert.equal(sign.status, 200);
    assert.ok(sign.body.value);

    const verify = await httpJson(port, 'POST', '/keys/signing-key/verify?api-version=7.5', {
      alg: 'RS256',
      digest,
      value: sign.body.value,
    });
    assert.equal(verify.status, 200);
    assert.equal(verify.body.value, true);

    const createWrapKey = await httpJson(port, 'POST', '/keys/wrap-key/create?api-version=7.5', {
      kty: 'RSA',
      key_size: 2048,
      key_ops: ['wrapKey', 'unwrapKey'],
    });
    assert.equal(createWrapKey.status, 200);

    const secretMaterial = Buffer.from('secret-material').toString('base64url');
    const wrap = await httpJson(port, 'POST', '/keys/wrap-key/wrapkey?api-version=7.5', {
      alg: 'RSA-OAEP-256',
      value: secretMaterial,
    });
    assert.equal(wrap.status, 200);
    assert.ok(wrap.body.value);

    const unwrap = await httpJson(port, 'POST', '/keys/wrap-key/unwrapkey?api-version=7.5', {
      alg: 'RSA-OAEP-256',
      value: wrap.body.value,
    });
    assert.equal(unwrap.status, 200);
    assert.equal(Buffer.from(unwrap.body.value, 'base64url').toString('utf8'), 'secret-material');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
