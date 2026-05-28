const defaultKmsRoot = 'https://cloudkms.googleapis.com/v1';

export class KmsApi {
  constructor(client, { kmsRoot = defaultKmsRoot } = {}) {
    this.client = client;
    this.kmsRoot = kmsRoot.replace(/\/+$/g, '');
  }

  async createKeyRing({ projectId, location, keyRingId }) {
    const url = new URL(`${this.kmsRoot}/projects/${projectId}/locations/${location}/keyRings`);
    url.searchParams.set('keyRingId', keyRingId);
    return this.client.requestJson({ method: 'POST', url, body: {} });
  }

  async getKeyRing({ projectId, location, keyRingId }) {
    return this.client.requestJson({
      url: new URL(`${this.kmsRoot}/projects/${projectId}/locations/${location}/keyRings/${keyRingId}`),
    });
  }

  async createCryptoKey({ projectId, location, keyRingId, cryptoKeyId, purpose = 'ENCRYPT_DECRYPT' }) {
    const url = new URL(`${this.kmsRoot}/projects/${projectId}/locations/${location}/keyRings/${keyRingId}/cryptoKeys`);
    url.searchParams.set('cryptoKeyId', cryptoKeyId);
    return this.client.requestJson({
      method: 'POST',
      url,
      body: { purpose },
    });
  }

  async getCryptoKey({ projectId, location, keyRingId, cryptoKeyId }) {
    return this.client.requestJson({
      url: new URL(`${this.kmsRoot}/projects/${projectId}/locations/${location}/keyRings/${keyRingId}/cryptoKeys/${cryptoKeyId}`),
    });
  }

  async encrypt({ projectId, location, keyRingId, cryptoKeyId, plaintext, additionalAuthenticatedData }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.kmsRoot}/projects/${projectId}/locations/${location}/keyRings/${keyRingId}/cryptoKeys/${cryptoKeyId}:encrypt`),
      body: {
        plaintext: Buffer.from(plaintext).toString('base64'),
        additionalAuthenticatedData,
      },
    });
  }

  async decrypt({ projectId, location, keyRingId, cryptoKeyId, ciphertext, additionalAuthenticatedData }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.kmsRoot}/projects/${projectId}/locations/${location}/keyRings/${keyRingId}/cryptoKeys/${cryptoKeyId}:decrypt`),
      body: {
        ciphertext,
        additionalAuthenticatedData,
      },
    });
  }
}

export function decodePlaintext(responseBody) {
  return Buffer.from(responseBody.plaintext, 'base64').toString('utf8');
}
