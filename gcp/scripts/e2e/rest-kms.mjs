import assert from 'node:assert/strict';
import { runLocalRestGate, expectStatus } from './lib/local-rest-gate.mjs';
import { decodePlaintext, KmsApi } from '../../src/services/kms/google-api.mjs';

await runLocalRestGate({
  gate: 'rest-kms',
  service: 'kms',
  execute: async ({ client, endpoint, runId, step }) => {
    const projectId = 'globalstack-local';
    const location = 'global';
    const keyRingId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
    const cryptoKeyId = 'app-config';
    const aad = Buffer.from(`aad:${runId}`).toString('base64');
    const kms = new KmsApi(client, {
      kmsRoot: `${endpoint}/v1`,
    });

    await step('create key ring', () => kms.createKeyRing({
      projectId,
      location,
      keyRingId,
    }), expectStatus(200));
    await step('reject duplicate key ring', () => kms.createKeyRing({
      projectId,
      location,
      keyRingId,
    }), exchange => {
      expectStatus(409)(exchange);
      assert.equal(exchange.response.body.error.status, 'ALREADY_EXISTS');
    });
    await step('get key ring', () => kms.getKeyRing({ projectId, location, keyRingId }), expectStatus(200));
    await step('create crypto key', () => kms.createCryptoKey({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
    }), exchange => {
      expectStatus(200)(exchange);
      assert.equal(exchange.response.body.purpose, 'ENCRYPT_DECRYPT');
      assert.equal(exchange.response.body.primary.state, 'ENABLED');
    });
    await step('get crypto key', () => kms.getCryptoKey({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
    }), expectStatus(200));

    const encrypt = await step('encrypt with aad', () => kms.encrypt({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      plaintext: `secret:${runId}`,
      additionalAuthenticatedData: aad,
    }), exchange => {
      expectStatus(200)(exchange);
      assert.match(exchange.response.body.ciphertext, /\S/);
    });

    await step('decrypt with matching aad', () => kms.decrypt({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      ciphertext: encrypt.response.body.ciphertext,
      additionalAuthenticatedData: aad,
    }), exchange => {
      expectStatus(200)(exchange);
      assert.equal(decodePlaintext(exchange.response.body), `secret:${runId}`);
    });
    await step('reject decrypt with wrong aad', () => kms.decrypt({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      ciphertext: encrypt.response.body.ciphertext,
      additionalAuthenticatedData: Buffer.from('wrong-aad').toString('base64'),
    }), exchange => {
      expectStatus(400)(exchange);
      assert.equal(exchange.response.body.error.status, 'INVALID_ARGUMENT');
    });

    return {
      project_id: projectId,
      location,
      key_ring_id: keyRingId,
      crypto_key_id: cryptoKeyId,
      operations_verified: ['create', 'get', 'encrypt', 'decrypt', 'aad-error'],
    };
  },
});
