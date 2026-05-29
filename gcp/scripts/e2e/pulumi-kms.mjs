import { Buffer } from 'node:buffer';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { decodePlaintext, KmsApi } from '../../src/services/kms/google-api.mjs';
import { runPulumiLocalLifecycle } from './lib/pulumi-local-lifecycle.mjs';

const templateDir = new URL('../../templates/pulumi/kms/', import.meta.url);

await runPulumiLocalLifecycle({
  argv: process.argv.slice(2),
  templateDir,
  runIdPrefix: 'pulumi-kms',
  configure: async ({ runId }) => {
    const runtime = await listen({ port: 0 });
    const keyRingId = `gst-${runId}`.slice(0, 63).replace(/-+$/g, '');
    return {
      runtime,
      keyRingId,
      cryptoKeyId: 'app-config',
      env: {
        GOOGLE_KMS_CUSTOM_ENDPOINT: `${runtime.url}/v1/`,
      },
      config: {
        projectId: 'globalstack-local',
        location: 'global',
        keyRingId,
        cryptoKeyId: 'app-config',
        kmsEndpoint: `${runtime.url}/v1/`,
      },
      cleanup: () => runtime.close(),
    };
  },
  afterUp: async ({ runtime, runId, keyRingId, cryptoKeyId }) => {
    const kms = new KmsApi(new GoogleRestClient({ tokenProvider: async () => null }), {
      kmsRoot: `${runtime.url}/v1`,
    });
    const aad = Buffer.from(`aad:${runId}`).toString('base64');
    const encrypt = await kms.encrypt({
      projectId: 'globalstack-local',
      location: 'global',
      keyRingId,
      cryptoKeyId,
      plaintext: `secret:${runId}`,
      additionalAuthenticatedData: aad,
    });
    const decrypt = await kms.decrypt({
      projectId: 'globalstack-local',
      location: 'global',
      keyRingId,
      cryptoKeyId,
      ciphertext: encrypt.response.body.ciphertext,
      additionalAuthenticatedData: aad,
    });
    if (decodePlaintext(decrypt.response.body) !== `secret:${runId}`) {
      throw new Error(`Pulumi Cloud KMS crypto check failed for ${keyRingId}`);
    }
  },
  report: ({ context }) => ({
    key_ring_id: context?.keyRingId,
    crypto_key_id: context?.cryptoKeyId,
    endpoint: context?.runtime ? `${context.runtime.url}/v1/` : null,
  }),
});
