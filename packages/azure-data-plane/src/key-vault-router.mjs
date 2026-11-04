import {
  constants,
  createHash,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';
import { localIdentity } from '../../azure-control-plane/src/server-support.mjs';

async function readBody(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __invalidJson: true, raw: text.slice(0, 500) };
  }
}

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...(payload ? { 'content-type': 'application/json' } : {}),
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message, headers = {}) {
  sendJson(res, status, {
    error: {
      code,
      message,
    },
  }, headers);
}

function authChallenge(vault) {
  const tenantId = process.env.GLOBALSTACK_ARM_TENANT_ID ?? process.env.ARM_TENANT_ID ?? '00000000-0000-0000-0000-000000000000';
  const authorization = `https://login.windows.net/${tenantId}`;
  const resource = 'https://vault.azure.net';
  return {
    'www-authenticate': `Bearer authorization="${authorization}", resource="${resource}"`,
  };
}

function vaultFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.vault.azure.net')) return null;
  return hostname.split('.')[0] ?? null;
}

function requireApiVersion(url) {
  const apiVersion = url.searchParams.get('api-version');
  if (!apiVersion) {
    return { status: 400, code: 'ApiVersionParameterRequired', message: 'The api-version query parameter is required.' };
  }
  if (!['7.4', '7.5'].includes(apiVersion)) {
    return { status: 400, code: 'UnsupportedApiVersion', message: `The api-version '${apiVersion}' is not supported by this local Key Vault surface.` };
  }
  return null;
}

function requireAuth(req, vault = null) {
  const auth = String(req.headers.authorization ?? '');
  const token = auth.match(/^Bearer[ \t]+(\S+)$/i)?.[1];
  if (token !== localIdentity.accessToken && token !== 'globalstack-local-token') {
    return {
      status: 401,
      code: 'Unauthorized',
      message: 'AKV10000: Request is missing a Bearer authorization token.',
      headers: authChallenge(vault),
    };
  }
  return null;
}

function versionId(seed) {
  return createHash('sha256').update(seed).digest('hex').slice(0, 32);
}

function base64UrlToBuffer(value) {
  return Buffer.from(String(value ?? ''), 'base64url');
}

function bufferToBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function publicJwk(publicKey, kid, keyOps) {
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    kid,
    kty: jwk.kty,
    key_ops: keyOps,
    n: jwk.n,
    e: jwk.e,
  };
}

function rsaOaepOptions(publicOrPrivateKey, alg) {
  if (alg === 'RSA-OAEP') return { key: publicOrPrivateKey, oaepHash: 'sha1' };
  if (alg === 'RSA-OAEP-256') return { key: publicOrPrivateKey, oaepHash: 'sha256' };
  return null;
}

function rsaSignOptions(privateOrPublicKey, alg) {
  if (alg === 'RS256') return { algorithm: 'RSA-SHA256', key: { key: privateOrPublicKey, padding: constants.RSA_PKCS1_PADDING } };
  if (alg === 'RS384') return { algorithm: 'RSA-SHA384', key: { key: privateOrPublicKey, padding: constants.RSA_PKCS1_PADDING } };
  if (alg === 'RS512') return { algorithm: 'RSA-SHA512', key: { key: privateOrPublicKey, padding: constants.RSA_PKCS1_PADDING } };
  if (alg === 'PS256') return { algorithm: 'RSA-SHA256', key: { key: privateOrPublicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 } };
  if (alg === 'PS384') return { algorithm: 'RSA-SHA384', key: { key: privateOrPublicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 } };
  if (alg === 'PS512') return { algorithm: 'RSA-SHA512', key: { key: privateOrPublicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 64 } };
  return null;
}

function requireBase64UrlString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value) || value.length % 4 === 1) {
    return { ok: false, error: `${label} must be a non-empty base64url string.` };
  }
  try {
    return { ok: true, value: base64UrlToBuffer(value) };
  } catch {
    return { ok: false, error: `${label} must be a non-empty base64url string.` };
  }
}

export class KeyVaultRouter {
  constructor({ onSecretSet, onSecretDelete, onKeyCreate, onKeyDelete } = {}) {
    this.vaults = new Map();
    this.onSecretSet = onSecretSet ?? null;
    this.onSecretDelete = onSecretDelete ?? null;
    this.onKeyCreate = onKeyCreate ?? null;
    this.onKeyDelete = onKeyDelete ?? null;
  }

  registerVault({ vaultName, vaultUri, subscriptionId = null, resourceGroupName = null }) {
    const name = String(vaultName);
    this.vaults.set(name.toLowerCase(), {
      vaultName: name,
      vaultUri: vaultUri ?? `https://${name}.vault.azure.net/`,
      subscriptionId,
      resourceGroupName,
      secrets: new Map(),
      deletedSecrets: new Map(),
      keys: new Map(),
    });
  }

  unregisterVault(vaultName) {
    this.vaults.delete(String(vaultName).toLowerCase());
  }

  setSecret({ vaultName, secretName, value, contentType, tags = {}, attributes = {}, emitHook = true }) {
    const vault = this.vaults.get(String(vaultName).toLowerCase());
    if (!vault) throw new Error(`Key Vault ${vaultName} is not registered in the local router.`);
    const version = versionId(`${vault.vaultName}:secret:${secretName}:${Date.now()}:${randomUUID()}`);
    const id = `${vault.vaultUri.replace(/\/$/, '')}/secrets/${secretName}/${version}`;
    const existing = vault.secrets.get(String(secretName).toLowerCase());
    const record = {
      id,
      name: secretName,
      version,
      value,
      contentType: contentType ?? null,
      tags,
      attributes: {
        enabled: true,
        ...attributes,
        created: Math.floor(Date.now() / 1000),
        updated: Math.floor(Date.now() / 1000),
      },
    };
    const versions = existing?.versions ?? new Map();
    versions.set(version, record);
    vault.secrets.set(String(secretName).toLowerCase(), {
      ...record,
      versions,
    });
    if (emitHook && this.onSecretSet) {
      this.onSecretSet({
        subscriptionId: vault.subscriptionId,
        resourceGroupName: vault.resourceGroupName,
        vaultName: vault.vaultName,
        vaultUri: vault.vaultUri,
        secretName,
        value,
        contentType: contentType ?? null,
        tags,
        attributes: {
          enabled: record.attributes.enabled,
        },
      });
    }
  }

  removeSecret({ vaultName, secretName }) {
    const vault = this.vaults.get(String(vaultName).toLowerCase());
    if (!vault) return null;
    vault.deletedSecrets.delete(String(secretName).toLowerCase());
    return vault.secrets.delete(String(secretName).toLowerCase());
  }

  createKey({ vaultName, keyName, kty = 'RSA', keyOps = ['encrypt', 'decrypt'], keySize = 2048, tags = {}, emitHook = true }) {
    const vault = this.vaults.get(String(vaultName).toLowerCase());
    if (!vault) throw new Error(`Key Vault ${vaultName} is not registered in the local router.`);
    const version = versionId(`${vault.vaultName}:key:${keyName}:${Date.now()}`);
    const kid = `${vault.vaultUri.replace(/\/$/, '')}/keys/${keyName}/${version}`;
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: keySize });
    vault.keys.set(String(keyName).toLowerCase(), {
      kid,
      name: keyName,
      kty,
      keyOps,
      keySize,
      publicKey,
      privateKey,
      tags,
      attributes: {
        enabled: true,
        created: Math.floor(Date.now() / 1000),
        updated: Math.floor(Date.now() / 1000),
      },
    });
    if (emitHook && this.onKeyCreate) {
      this.onKeyCreate({
        subscriptionId: vault.subscriptionId,
        resourceGroupName: vault.resourceGroupName,
        vaultName: vault.vaultName,
        vaultUri: vault.vaultUri,
        keyName,
        kty,
        keyOps,
        keySize,
        tags,
      });
    }
  }

  removeKey({ vaultName, keyName }) {
    const vault = this.vaults.get(String(vaultName).toLowerCase());
    if (!vault) return null;
    return vault.keys.delete(String(keyName).toLowerCase());
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();

      if (method === 'GET' && url.pathname.startsWith('/_globalstack/key-vault/vaults/')) {
        const [, , , , vaultName, collection] = url.pathname.split('/');
        const vault = this.vaults.get(decodeURIComponent(vaultName ?? '').toLowerCase());
        if (!vault) return sendError(res, 404, 'VaultNotFound', `The vault '${vaultName}' was not found.`);
        if (collection === 'secrets') return sendJson(res, 200, { value: [...vault.secrets.values()].map(item => ({ id: item.id, name: item.name })) });
        if (collection === 'keys') return sendJson(res, 200, { value: [...vault.keys.values()].map(item => ({ kid: item.kid, name: item.name })) });
        return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Key Vault inspection route handles ${url.pathname}.`);
      }

      const versionError = requireApiVersion(url);
      if (versionError) return sendError(res, versionError.status, versionError.code, versionError.message);

      const vaultName = vaultFromHost(req.headers.host);
      if (!vaultName) {
        return sendError(res, 404, 'VaultNotFound', 'The Key Vault host was not found.');
      }
      const vault = this.vaults.get(vaultName.toLowerCase());
      if (!vault) {
        return sendError(res, 404, 'VaultNotFound', `The vault '${vaultName}' was not found.`);
      }
      const authError = requireAuth(req, vault);
      if (authError) return sendError(res, authError.status, authError.code, authError.message, authError.headers);

      const parts = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
      const [collection, name, action] = parts;

      if (collection === 'deletedsecrets') {
        if (!name) {
          if (method !== 'GET') return sendError(res, 405, 'MethodNotAllowed', 'Deleted secret collection supports GET.');
          return sendJson(res, 200, {
            value: [...vault.deletedSecrets.values()].map(secret => ({
              recoveryId: secret.recoveryId,
              deletedDate: secret.deletedDate,
              scheduledPurgeDate: secret.scheduledPurgeDate,
              id: secret.id,
              attributes: secret.attributes,
              tags: secret.tags,
            })),
          });
        }

        const deleted = vault.deletedSecrets.get(name.toLowerCase());
        if (!deleted) return sendError(res, 404, 'SecretNotFound', `A deleted secret with name '${name}' was not found.`);

        if (method === 'GET' && !action) {
          return sendJson(res, 200, {
            recoveryId: deleted.recoveryId,
            deletedDate: deleted.deletedDate,
            scheduledPurgeDate: deleted.scheduledPurgeDate,
            id: deleted.id,
            attributes: deleted.attributes,
            tags: deleted.tags,
          });
        }

        if (method === 'POST' && action === 'recover') {
          vault.deletedSecrets.delete(name.toLowerCase());
          vault.secrets.set(name.toLowerCase(), deleted.secret);
          if (this.onSecretSet) {
            this.onSecretSet({
              subscriptionId: vault.subscriptionId,
              resourceGroupName: vault.resourceGroupName,
              vaultName: vault.vaultName,
              vaultUri: vault.vaultUri,
              secretName: name,
              value: deleted.secret.value,
              contentType: deleted.secret.contentType,
              tags: deleted.secret.tags ?? {},
              attributes: {
                enabled: deleted.secret.attributes?.enabled ?? true,
              },
            });
          }
          return sendJson(res, 200, {
            value: deleted.secret.value,
            id: deleted.secret.id,
            contentType: deleted.secret.contentType,
            attributes: {
              ...deleted.secret.attributes,
              recovered: Math.floor(Date.now() / 1000),
              updated: Math.floor(Date.now() / 1000),
            },
            tags: deleted.secret.tags,
          });
        }

        if (method === 'DELETE' && !action) {
          vault.deletedSecrets.delete(name.toLowerCase());
          return sendJson(res, 204);
        }

        return sendError(res, 405, 'MethodNotAllowed', `Deleted secret ${name} does not support ${method} ${action ?? ''}`.trim());
      }

      if (collection === 'secrets') {
        if (!name) {
          if (method !== 'GET') return sendError(res, 405, 'MethodNotAllowed', 'Secret collection supports GET.');
          return sendJson(res, 200, {
            value: [...vault.secrets.values()].map(secret => ({
              id: secret.id,
              contentType: secret.contentType,
              attributes: secret.attributes,
              tags: secret.tags,
            })),
          });
        }

        if (method === 'PUT') {
          const body = await readBody(req);
          if (body?.__invalidJson || typeof body?.value !== 'string' || body.value.length === 0) {
            return sendError(res, 400, 'BadParameter', 'Secret value must be a non-empty string.');
          }
          if (Object.hasOwn(body, 'contentType') && typeof body.contentType !== 'string') {
            return sendError(res, 400, 'BadParameter', 'Secret contentType must be a string when provided.');
          }
          if (Object.hasOwn(body, 'tags') && !isObject(body.tags)) {
            return sendError(res, 400, 'BadParameter', 'Secret tags must be an object when provided.');
          }
          if (Object.hasOwn(body, 'attributes') && !isObject(body.attributes)) {
            return sendError(res, 400, 'BadParameter', 'Secret attributes must be an object when provided.');
          }
          if (Object.hasOwn(body?.attributes ?? {}, 'enabled') && typeof body.attributes.enabled !== 'boolean') {
            return sendError(res, 400, 'BadParameter', 'Secret attributes.enabled must be a boolean when provided.');
          }
          this.setSecret({
            vaultName: vault.vaultName,
            secretName: name,
            value: body.value,
            contentType: body.contentType,
            tags: body.tags ?? {},
            attributes: {
              ...(body.attributes?.enabled !== undefined ? { enabled: body.attributes.enabled } : {}),
            },
          });
          const secret = vault.secrets.get(name.toLowerCase());
          return sendJson(res, 200, {
            value: secret.value,
            id: secret.id,
            contentType: secret.contentType,
            attributes: secret.attributes,
            tags: secret.tags,
          });
        }

        const secret = vault.secrets.get(name.toLowerCase());
        if (!secret) return sendError(res, 404, 'SecretNotFound', `A secret with name '${name}' was not found.`);
        if (method === 'GET' && action === 'versions') {
          return sendJson(res, 200, {
            value: [...secret.versions.values()].map(version => ({
              id: version.id,
              contentType: version.contentType,
              attributes: version.attributes,
              tags: version.tags,
            })),
          });
        }
        if (method === 'GET') {
          const selected = action ? secret.versions.get(action) : secret;
          if (!selected) return sendError(res, 404, 'SecretNotFound', `A secret version '${action}' with name '${name}' was not found.`);
          if (selected.attributes.enabled === false) {
            return sendError(res, 403, 'SecretDisabled', `A secret with name '${name}' is disabled.`);
          }
          return sendJson(res, 200, {
            value: selected.value,
            id: selected.id,
            contentType: selected.contentType,
            attributes: selected.attributes,
            tags: selected.tags,
          });
        }
        if (method === 'DELETE') {
          const deletedDate = Math.floor(Date.now() / 1000);
          vault.secrets.delete(name.toLowerCase());
          const deletedRecord = {
            recoveryId: `${vault.vaultUri.replace(/\/$/, '')}/deletedsecrets/${name}`,
            deletedDate,
            scheduledPurgeDate: deletedDate + 7776000,
            id: secret.id,
            attributes: secret.attributes,
            tags: secret.tags,
            secret,
          };
          vault.deletedSecrets.set(name.toLowerCase(), deletedRecord);
          if (this.onSecretDelete) {
            this.onSecretDelete({
              subscriptionId: vault.subscriptionId,
              resourceGroupName: vault.resourceGroupName,
              vaultName: vault.vaultName,
              secretName: name,
            });
          }
          return sendJson(res, 200, {
            recoveryId: deletedRecord.recoveryId,
            deletedDate: deletedRecord.deletedDate,
            scheduledPurgeDate: deletedRecord.scheduledPurgeDate,
            id: deletedRecord.id,
            attributes: deletedRecord.attributes,
            tags: deletedRecord.tags,
          });
        }
        return sendError(res, 405, 'MethodNotAllowed', `Secret ${name} does not support ${method}.`);
      }

      if (collection === 'keys') {
        if (!name) {
          if (method !== 'GET') return sendError(res, 405, 'MethodNotAllowed', 'Key collection supports GET.');
          return sendJson(res, 200, {
            value: [...vault.keys.values()].map(key => ({
              kid: key.kid,
              key: publicJwk(key.publicKey, key.kid, key.keyOps),
              attributes: key.attributes,
              tags: key.tags,
            })),
          });
        }

        if (method === 'POST' && action === 'create') {
          const body = await readBody(req);
          if (body?.__invalidJson || !['RSA'].includes(body?.kty)) {
            return sendError(res, 400, 'BadParameter', 'Key create requires kty RSA for this local cryptographic surface.');
          }
          const keyOps = body.key_ops ?? ['encrypt', 'decrypt'];
          if (!Array.isArray(keyOps)) return sendError(res, 400, 'BadParameter', 'key_ops must be an array when provided.');
          const supportedOps = new Set(['encrypt', 'decrypt', 'sign', 'verify', 'wrapKey', 'unwrapKey']);
          if (keyOps.some(op => !supportedOps.has(op))) return sendError(res, 400, 'BadParameter', 'key_ops contains an unsupported operation.');
          if (body.key_size !== undefined && (!Number.isInteger(body.key_size) || body.key_size < 2048)) {
            return sendError(res, 400, 'BadParameter', 'RSA key_size must be an integer greater than or equal to 2048 when provided.');
          }
          this.createKey({
            vaultName: vault.vaultName,
            keyName: name,
            kty: body.kty,
            keyOps,
            keySize: body.key_size ?? 2048,
            tags: body.tags ?? {},
          });
          const key = vault.keys.get(name.toLowerCase());
          return sendJson(res, 200, {
            key: publicJwk(key.publicKey, key.kid, key.keyOps),
            attributes: key.attributes,
            tags: key.tags,
          });
        }

        const key = vault.keys.get(name.toLowerCase());
        if (!key) return sendError(res, 404, 'KeyNotFound', `A key with name '${name}' was not found.`);

        if (method === 'GET' && !action) {
          return sendJson(res, 200, {
            key: publicJwk(key.publicKey, key.kid, key.keyOps),
            attributes: key.attributes,
            tags: key.tags,
          });
        }

        if (method === 'POST' && action === 'encrypt') {
          const body = await readBody(req);
          if (!key.keyOps.includes('encrypt')) return sendError(res, 403, 'Forbidden', `Key '${name}' is not permitted to encrypt.`);
          const options = rsaOaepOptions(key.publicKey, body?.alg);
          const plain = requireBase64UrlString(body?.value, 'Encrypt value');
          if (!options || !plain.ok) {
            return sendError(res, 400, 'BadParameter', 'Encrypt requires alg RSA-OAEP or RSA-OAEP-256 and base64url value.');
          }
          const encrypted = publicEncrypt(options, plain.value);
          return sendJson(res, 200, { kid: key.kid, value: bufferToBase64Url(encrypted) });
        }

        if (method === 'POST' && action === 'decrypt') {
          const body = await readBody(req);
          if (!key.keyOps.includes('decrypt')) return sendError(res, 403, 'Forbidden', `Key '${name}' is not permitted to decrypt.`);
          const options = rsaOaepOptions(key.privateKey, body?.alg);
          const cipher = requireBase64UrlString(body?.value, 'Decrypt value');
          if (!options || !cipher.ok) {
            return sendError(res, 400, 'BadParameter', 'Decrypt requires alg RSA-OAEP or RSA-OAEP-256 and base64url value.');
          }
          try {
            const decrypted = privateDecrypt(options, cipher.value);
            return sendJson(res, 200, { kid: key.kid, value: bufferToBase64Url(decrypted) });
          } catch {
            return sendError(res, 400, 'BadParameter', 'Decrypt value is not valid ciphertext for this key.');
          }
        }

        if (method === 'POST' && action === 'wrapkey') {
          const body = await readBody(req);
          if (!key.keyOps.includes('wrapKey')) return sendError(res, 403, 'Forbidden', `Key '${name}' is not permitted to wrap keys.`);
          const options = rsaOaepOptions(key.publicKey, body?.alg);
          const plain = requireBase64UrlString(body?.value, 'WrapKey value');
          if (!options || !plain.ok) {
            return sendError(res, 400, 'BadParameter', 'WrapKey requires alg RSA-OAEP or RSA-OAEP-256 and base64url value.');
          }
          const wrapped = publicEncrypt(options, plain.value);
          return sendJson(res, 200, { kid: key.kid, value: bufferToBase64Url(wrapped) });
        }

        if (method === 'POST' && action === 'unwrapkey') {
          const body = await readBody(req);
          if (!key.keyOps.includes('unwrapKey')) return sendError(res, 403, 'Forbidden', `Key '${name}' is not permitted to unwrap keys.`);
          const options = rsaOaepOptions(key.privateKey, body?.alg);
          const wrapped = requireBase64UrlString(body?.value, 'UnwrapKey value');
          if (!options || !wrapped.ok) {
            return sendError(res, 400, 'BadParameter', 'UnwrapKey requires alg RSA-OAEP or RSA-OAEP-256 and base64url value.');
          }
          try {
            const unwrapped = privateDecrypt(options, wrapped.value);
            return sendJson(res, 200, { kid: key.kid, value: bufferToBase64Url(unwrapped) });
          } catch {
            return sendError(res, 400, 'BadParameter', 'UnwrapKey value is not valid ciphertext for this key.');
          }
        }

        if (method === 'POST' && action === 'sign') {
          const body = await readBody(req);
          if (!key.keyOps.includes('sign')) return sendError(res, 403, 'Forbidden', `Key '${name}' is not permitted to sign.`);
          const options = rsaSignOptions(key.privateKey, body?.alg);
          const value = requireBase64UrlString(body?.value, 'Sign value');
          if (!options || !value.ok) {
            return sendError(res, 400, 'BadParameter', 'Sign requires alg RS256, RS384, RS512, PS256, PS384, or PS512 and base64url value.');
          }
          const signature = cryptoSign(options.algorithm, value.value, options.key);
          return sendJson(res, 200, { kid: key.kid, value: bufferToBase64Url(signature) });
        }

        if (method === 'POST' && action === 'verify') {
          const body = await readBody(req);
          if (!key.keyOps.includes('verify')) return sendError(res, 403, 'Forbidden', `Key '${name}' is not permitted to verify.`);
          const options = rsaSignOptions(key.publicKey, body?.alg);
          const value = requireBase64UrlString(body?.digest, 'Verify digest');
          const signature = requireBase64UrlString(body?.value, 'Verify value');
          if (!options || !value.ok || !signature.ok) {
            return sendError(res, 400, 'BadParameter', 'Verify requires alg RS256, RS384, RS512, PS256, PS384, or PS512 plus base64url digest and value.');
          }
          const verified = cryptoVerify(options.algorithm, value.value, options.key, signature.value);
          return sendJson(res, 200, { kid: key.kid, value: verified });
        }

        if (method === 'DELETE' && !action) {
          vault.keys.delete(name.toLowerCase());
          if (this.onKeyDelete) {
            this.onKeyDelete({
              subscriptionId: vault.subscriptionId,
              resourceGroupName: vault.resourceGroupName,
              vaultName: vault.vaultName,
              keyName: name,
            });
          }
          return sendJson(res, 200, {
            recoveryId: `${vault.vaultUri.replace(/\/$/, '')}/deletedkeys/${name}`,
            deletedDate: Math.floor(Date.now() / 1000),
            scheduledPurgeDate: Math.floor(Date.now() / 1000) + 7776000,
            key: publicJwk(key.publicKey, key.kid, key.keyOps),
            attributes: key.attributes,
          });
        }

        return sendError(res, 405, 'MethodNotAllowed', `Key ${name} does not support ${method} ${action ?? ''}`.trim());
      }

      return sendError(res, 404, 'ResourceNotFound', `No Key Vault data-plane route handled ${url.pathname}.`);
    };
  }
}

export function createKeyVaultRouter(options) {
  return new KeyVaultRouter(options);
}

export function createKeyVaultRouterServer(router = createKeyVaultRouter()) {
  return createServer(router.handler());
}
