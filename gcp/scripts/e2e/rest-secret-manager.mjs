import assert from 'node:assert/strict';
import { runLocalRestGate, expectStatus } from './lib/local-rest-gate.mjs';
import { decodeSecretPayload, SecretManagerApi } from '../../src/services/secret-manager/google-api.mjs';

await runLocalRestGate({
  gate: 'rest-secret-manager',
  service: 'secret-manager',
  execute: async ({ client, endpoint, runId, step }) => {
    const projectId = 'globalstack-local';
    const secretId = `gst-${runId}`.slice(0, 255).replace(/-+$/g, '');
    const secrets = new SecretManagerApi(client, {
      secretManagerRoot: `${endpoint}/v1`,
    });

    await step('create secret', () => secrets.createSecret({
      projectId,
      secretId,
      labels: {
        purpose: 'globalstack-conformance',
        run_id: runId,
      },
    }), expectStatus(200));

    await step('reject duplicate secret', () => secrets.createSecret({
      projectId,
      secretId,
      labels: {},
    }), exchange => {
      expectStatus(409)(exchange);
      assert.equal(exchange.response.body.error.status, 'ALREADY_EXISTS');
    });

    await step('get secret metadata', () => secrets.getSecret({ projectId, secretId }), expectStatus(200));
    await step('list secret metadata', () => secrets.listSecrets(projectId), exchange => {
      expectStatus(200)(exchange);
      assert.ok(exchange.response.body.secrets.some(secret => secret.name.endsWith(`/secrets/${secretId}`)));
    });

    await step('add first version', () => secrets.addVersion({
      projectId,
      secretId,
      data: `first:${runId}`,
    }), expectStatus(200));
    await step('add second version', () => secrets.addVersion({
      projectId,
      secretId,
      data: `second:${runId}`,
    }), expectStatus(200));

    await step('access latest version', () => secrets.accessVersion({ projectId, secretId }), exchange => {
      expectStatus(200)(exchange);
      assert.equal(decodeSecretPayload(exchange.response.body), `second:${runId}`);
    });
    await step('access numbered version', () => secrets.accessVersion({
      projectId,
      secretId,
      versionId: '1',
    }), exchange => {
      expectStatus(200)(exchange);
      assert.equal(decodeSecretPayload(exchange.response.body), `first:${runId}`);
    });
    await step('destroy first version', () => secrets.destroyVersion({
      projectId,
      secretId,
      versionId: '1',
    }), exchange => {
      expectStatus(200)(exchange);
      assert.equal(exchange.response.body.state, 'DESTROYED');
    });
    await step('reject destroyed version access', () => secrets.accessVersion({
      projectId,
      secretId,
      versionId: '1',
    }), exchange => {
      expectStatus(404)(exchange);
      assert.equal(exchange.response.body.error.status, 'NOT_FOUND');
    });
    await step('delete secret', () => secrets.deleteSecret({ projectId, secretId }), expectStatus(200));

    return {
      project_id: projectId,
      secret_id: secretId,
      versions_verified: 2,
      error_shapes_verified: ['ALREADY_EXISTS', 'NOT_FOUND'],
    };
  },
});
