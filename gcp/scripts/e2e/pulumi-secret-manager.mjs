import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { decodeSecretPayload, SecretManagerApi } from '../../src/services/secret-manager/google-api.mjs';
import { runPulumiLocalLifecycle } from './lib/pulumi-local-lifecycle.mjs';

const templateDir = new URL('../../templates/pulumi/secret-manager/', import.meta.url);

await runPulumiLocalLifecycle({
  argv: process.argv.slice(2),
  templateDir,
  runIdPrefix: 'pulumi-secret',
  configure: async ({ runId }) => {
    const runtime = await listen({ port: 0 });
    const secretId = `gst-${runId}`.slice(0, 255).replace(/-+$/g, '');
    const secretPayload = JSON.stringify({
      run_id: runId,
      purpose: 'globalstack gcp pulumi secret manager',
    });
    return {
      runtime,
      secretId,
      secretPayload,
      env: {
        GOOGLE_SECRET_MANAGER_CUSTOM_ENDPOINT: `${runtime.url}/v1/`,
      },
      config: {
        projectId: 'globalstack-local',
        secretId,
        runId,
        secretPayload,
        secretManagerEndpoint: `${runtime.url}/v1/`,
      },
      cleanup: () => runtime.close(),
    };
  },
  afterUp: async ({ runtime, secretId, secretPayload }) => {
    const api = new SecretManagerApi(new GoogleRestClient({ tokenProvider: async () => null }), {
      secretManagerRoot: `${runtime.url}/v1`,
    });
    const access = await api.accessVersion({ projectId: 'globalstack-local', secretId });
    if (decodeSecretPayload(access.response.body) !== secretPayload) {
      throw new Error(`Pulumi Secret Manager payload check failed for ${secretId}`);
    }
  },
  report: ({ context }) => ({
    secret_id: context?.secretId,
    endpoint: context?.runtime ? `${context.runtime.url}/v1/` : null,
  }),
});
