import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { decodePlaintext, KmsApi } from '../../src/services/kms/google-api.mjs';

test('Cloud KMS local runtime creates keys and performs authenticated encrypt/decrypt', async () => {
  const runtime = await listen({ port: 0 });
  const runId = createRunId('kms-runtime');
  const projectId = 'globalstack-local';
  const location = 'global';
  const keyRingId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
  const cryptoKeyId = 'app-config';
  const aad = Buffer.from(`aad:${runId}`).toString('base64');
  const kms = new KmsApi(new GoogleRestClient({
    tokenProvider: async () => null,
  }), {
    kmsRoot: `${runtime.url}/v1`,
  });

  try {
    const createRing = await kms.createKeyRing({ projectId, location, keyRingId });
    assert.equal(createRing.response.status, 200);
    assert.match(createRing.response.body.name, new RegExp(`/keyRings/${keyRingId}$`));

    const duplicateRing = await kms.createKeyRing({ projectId, location, keyRingId });
    assert.equal(duplicateRing.response.status, 409);
    assert.equal(duplicateRing.response.body.error.status, 'ALREADY_EXISTS');

    const getRing = await kms.getKeyRing({ projectId, location, keyRingId });
    assert.equal(getRing.response.status, 200);

    const createKey = await kms.createCryptoKey({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      labels: {
        purpose: 'globalstack-conformance',
        run_id: runId,
      },
    });
    assert.equal(createKey.response.status, 200);
    assert.equal(createKey.response.body.purpose, 'ENCRYPT_DECRYPT');
    assert.equal(createKey.response.body.primary.state, 'ENABLED');
    assert.equal(createKey.response.body.labels.run_id, runId);

    const getKey = await kms.getCryptoKey({ projectId, location, keyRingId, cryptoKeyId });
    assert.equal(getKey.response.status, 200);

    const versions = await kms.listCryptoKeyVersions({ projectId, location, keyRingId, cryptoKeyId });
    assert.equal(versions.response.status, 200);
    assert.equal(versions.response.body.cryptoKeyVersions.length, 1);
    assert.equal(versions.response.body.cryptoKeyVersions[0].state, 'ENABLED');

    const encrypt = await kms.encrypt({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      plaintext: `secret:${runId}`,
      additionalAuthenticatedData: aad,
    });
    assert.equal(encrypt.response.status, 200);
    assert.match(encrypt.response.body.name, new RegExp(`/cryptoKeys/${cryptoKeyId}$`));
    assert.match(encrypt.response.body.ciphertext, /\S/);

    const decrypt = await kms.decrypt({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      ciphertext: encrypt.response.body.ciphertext,
      additionalAuthenticatedData: aad,
    });
    assert.equal(decrypt.response.status, 200);
    assert.equal(decodePlaintext(decrypt.response.body), `secret:${runId}`);

    const badAad = await kms.decrypt({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      ciphertext: encrypt.response.body.ciphertext,
      additionalAuthenticatedData: Buffer.from('wrong-aad').toString('base64'),
    });
    assert.equal(badAad.response.status, 400);
    assert.equal(badAad.response.body.error.status, 'INVALID_ARGUMENT');

    const destroyVersion = await kms.destroyCryptoKeyVersion({
      projectId,
      location,
      keyRingId,
      cryptoKeyId,
      versionId: '1',
    });
    assert.equal(destroyVersion.response.status, 200);
    assert.equal(destroyVersion.response.body.state, 'DESTROY_SCHEDULED');
  } finally {
    await runtime.close();
  }
});
