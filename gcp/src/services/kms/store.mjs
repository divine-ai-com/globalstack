import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class KmsStore {
  constructor() {
    this.keyRings = new Map();
    this.cryptoKeys = new Map();
  }

  createKeyRing({ projectId, location, keyRingId }) {
    const name = keyRingName(projectId, location, keyRingId);
    if (this.keyRings.has(name)) return null;
    const keyRing = { name, createTime: new Date().toISOString() };
    this.keyRings.set(name, keyRing);
    return keyRing;
  }

  getKeyRing({ projectId, location, keyRingId }) {
    return this.keyRings.get(keyRingName(projectId, location, keyRingId)) ?? null;
  }

  createCryptoKey({ projectId, location, keyRingId, cryptoKeyId, purpose = 'ENCRYPT_DECRYPT', labels = {} }) {
    const ringName = keyRingName(projectId, location, keyRingId);
    if (!this.keyRings.has(ringName)) return { missingKeyRing: true };
    const name = cryptoKeyName(projectId, location, keyRingId, cryptoKeyId);
    if (this.cryptoKeys.has(name)) return { duplicate: true };
    const now = new Date().toISOString();
    const cryptoKey = {
      name,
      purpose,
      labels,
      createTime: now,
      primary: {
        name: `${name}/cryptoKeyVersions/1`,
        state: 'ENABLED',
        createTime: now,
      },
      material: randomBytes(32),
    };
    this.cryptoKeys.set(name, cryptoKey);
    return { cryptoKey: publicCryptoKey(cryptoKey) };
  }

  getCryptoKey({ projectId, location, keyRingId, cryptoKeyId }) {
    const cryptoKey = this.cryptoKeys.get(cryptoKeyName(projectId, location, keyRingId, cryptoKeyId));
    return cryptoKey ? publicCryptoKey(cryptoKey) : null;
  }

  encrypt({ projectId, location, keyRingId, cryptoKeyId, plaintext, additionalAuthenticatedData = '' }) {
    const cryptoKey = this.cryptoKeys.get(cryptoKeyName(projectId, location, keyRingId, cryptoKeyId));
    if (!cryptoKey) return null;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', cryptoKey.material, iv);
    if (additionalAuthenticatedData) cipher.setAAD(Buffer.from(additionalAuthenticatedData, 'base64'));
    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(plaintext, 'base64')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      name: cryptoKey.name,
      ciphertext: Buffer.concat([iv, tag, encrypted]).toString('base64'),
    };
  }

  decrypt({ projectId, location, keyRingId, cryptoKeyId, ciphertext, additionalAuthenticatedData = '' }) {
    const cryptoKey = this.cryptoKeys.get(cryptoKeyName(projectId, location, keyRingId, cryptoKeyId));
    if (!cryptoKey) return null;
    const input = Buffer.from(ciphertext, 'base64');
    const iv = input.subarray(0, 12);
    const tag = input.subarray(12, 28);
    const encrypted = input.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', cryptoKey.material, iv);
    if (additionalAuthenticatedData) decipher.setAAD(Buffer.from(additionalAuthenticatedData, 'base64'));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return {
      plaintext: plaintext.toString('base64'),
    };
  }

  listCryptoKeyVersions({ projectId, location, keyRingId, cryptoKeyId }) {
    const cryptoKey = this.cryptoKeys.get(cryptoKeyName(projectId, location, keyRingId, cryptoKeyId));
    if (!cryptoKey) return null;
    return [cryptoKey.primary];
  }

  destroyCryptoKeyVersion({ projectId, location, keyRingId, cryptoKeyId, versionId }) {
    const cryptoKey = this.cryptoKeys.get(cryptoKeyName(projectId, location, keyRingId, cryptoKeyId));
    if (!cryptoKey || !cryptoKey.primary.name.endsWith(`/cryptoKeyVersions/${versionId}`)) return null;
    cryptoKey.primary = {
      ...cryptoKey.primary,
      state: 'DESTROY_SCHEDULED',
      destroyTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    return cryptoKey.primary;
  }
}

export function keyRingName(projectId, location, keyRingId) {
  return `projects/${projectId}/locations/${location}/keyRings/${keyRingId}`;
}

export function cryptoKeyName(projectId, location, keyRingId, cryptoKeyId) {
  return `${keyRingName(projectId, location, keyRingId)}/cryptoKeys/${cryptoKeyId}`;
}

function publicCryptoKey(cryptoKey) {
  return {
    name: cryptoKey.name,
    purpose: cryptoKey.purpose,
    labels: cryptoKey.labels,
    createTime: cryptoKey.createTime,
    primary: cryptoKey.primary,
  };
}
