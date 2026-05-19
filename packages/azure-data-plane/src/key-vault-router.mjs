import { createHash, generateKeyPairSync, privateDecrypt, publicEncrypt, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';

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

function sendError(res, status, code, message) {
  sendJson(res, status, {
    error: {
      code,
      message,
    },
  });
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

function requireAuth(req) {
  const auth = String(req.headers.authorization ?? '');
  if (!auth.match(/^Bearer\s+.+/i)) {
    return { status: 401, code: 'Unauthorized', message: 'AKV10000: Request is missing a Bearer authorization token.' };
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

export class KeyVaultRouter {
  constructor() {
    this.vaults = new Map();
  }

  registerVault({ vaultName, vaultUri }) {
    const name = String(vaultName);
    this.vaults.set(name.toLowerCase(), {
      vaultName: name,
      vaultUri: vaultUri ?? `https://${name}.vault.azure.net/`,
      secrets: new Map(),
      keys: new Map(),
    });
  }

  unregisterVault(vaultName) {
    this.vaults.delete(String(vaultName).toLowerCase());
  }

  setSecret({ vaultName, secretName, value, contentType, tags = {} }) {
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
  }

  createKey({ vaultName, keyName, kty = 'RSA', keyOps = ['encrypt', 'decrypt'], keySize = 2048, tags = {} }) {
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

      const authError = requireAuth(req);
      if (authError) return sendError(res, authError.status, authError.code, authError.message);

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

      const parts = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
      const [collection, name, action] = parts;

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
          this.setSecret({
            vaultName: vault.vaultName,
            secretName: name,
            value: body.value,
            contentType: body.contentType,
            tags: body.tags ?? {},
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
          return sendJson(res, 200, {
            value: selected.value,
            id: selected.id,
            contentType: selected.contentType,
            attributes: selected.attributes,
            tags: selected.tags,
          });
        }
        if (method === 'DELETE') {
          vault.secrets.delete(name.toLowerCase());
          return sendJson(res, 200, {
            recoveryId: `${vault.vaultUri.replace(/\/$/, '')}/deletedsecrets/${name}`,
            deletedDate: Math.floor(Date.now() / 1000),
            scheduledPurgeDate: Math.floor(Date.now() / 1000) + 7776000,
            id: secret.id,
            attributes: secret.attributes,
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
          if (body?.alg !== 'RSA-OAEP' || typeof body?.value !== 'string') {
            return sendError(res, 400, 'BadParameter', 'Encrypt requires alg RSA-OAEP and base64url value.');
          }
          const encrypted = publicEncrypt({ key: key.publicKey, oaepHash: 'sha1' }, base64UrlToBuffer(body.value));
          return sendJson(res, 200, { kid: key.kid, value: bufferToBase64Url(encrypted) });
        }

        if (method === 'POST' && action === 'decrypt') {
          const body = await readBody(req);
          if (!key.keyOps.includes('decrypt')) return sendError(res, 403, 'Forbidden', `Key '${name}' is not permitted to decrypt.`);
          if (body?.alg !== 'RSA-OAEP' || typeof body?.value !== 'string') {
            return sendError(res, 400, 'BadParameter', 'Decrypt requires alg RSA-OAEP and base64url value.');
          }
          try {
            const decrypted = privateDecrypt({ key: key.privateKey, oaepHash: 'sha1' }, base64UrlToBuffer(body.value));
            return sendJson(res, 200, { kid: key.kid, value: bufferToBase64Url(decrypted) });
          } catch {
            return sendError(res, 400, 'BadParameter', 'Decrypt value is not valid ciphertext for this key.');
          }
        }

        if (method === 'DELETE' && !action) {
          vault.keys.delete(name.toLowerCase());
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

export function createKeyVaultRouter() {
  return new KeyVaultRouter();
}

export function createKeyVaultRouterServer(router = createKeyVaultRouter()) {
  return createServer(router.handler());
}
