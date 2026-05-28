import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { decodeSecretPayload, SecretManagerApi } from '../../src/services/secret-manager/google-api.mjs';

test('Secret Manager local runtime stores versions and enforces destroyed version access', async () => {
  const runtime = await listen({ port: 0 });
  const runId = createRunId('secret-runtime');
  const projectId = 'globalstack-local';
  const secretId = `gst-${runId}`.slice(0, 255).replace(/-+$/g, '');
  const api = new SecretManagerApi(new GoogleRestClient({
    tokenProvider: async () => null,
  }), {
    secretManagerRoot: `${runtime.url}/v1`,
  });

  try {
    const create = await api.createSecret({
      projectId,
      secretId,
      labels: {
        purpose: 'globalstack-conformance',
        run_id: runId,
      },
    });
    assert.equal(create.response.status, 200);
    assert.match(create.response.body.name, new RegExp(`/secrets/${secretId}$`));

    const duplicate = await api.createSecret({ projectId, secretId, labels: {} });
    assert.equal(duplicate.response.status, 409);
    assert.equal(duplicate.response.body.error.status, 'ALREADY_EXISTS');

    const get = await api.getSecret({ projectId, secretId });
    assert.equal(get.response.status, 200);

    const list = await api.listSecrets(projectId);
    assert.equal(list.response.status, 200);
    assert.ok(list.response.body.secrets.some(secret => secret.name.endsWith(`/secrets/${secretId}`)));

    const firstVersion = await api.addVersion({ projectId, secretId, data: `first:${runId}` });
    assert.equal(firstVersion.response.status, 200);
    assert.equal(firstVersion.response.body.state, 'ENABLED');
    const secondVersion = await api.addVersion({ projectId, secretId, data: `second:${runId}` });
    assert.equal(secondVersion.response.status, 200);

    const accessLatest = await api.accessVersion({ projectId, secretId });
    assert.equal(accessLatest.response.status, 200);
    assert.equal(decodeSecretPayload(accessLatest.response.body), `second:${runId}`);

    const accessFirst = await api.accessVersion({ projectId, secretId, versionId: '1' });
    assert.equal(accessFirst.response.status, 200);
    assert.equal(decodeSecretPayload(accessFirst.response.body), `first:${runId}`);

    const destroyFirst = await api.destroyVersion({ projectId, secretId, versionId: '1' });
    assert.equal(destroyFirst.response.status, 200);
    assert.equal(destroyFirst.response.body.state, 'DESTROYED');

    const accessDestroyed = await api.accessVersion({ projectId, secretId, versionId: '1' });
    assert.equal(accessDestroyed.response.status, 404);
    assert.equal(accessDestroyed.response.body.error.status, 'NOT_FOUND');

    const deleted = await api.deleteSecret({ projectId, secretId });
    assert.equal(deleted.response.status, 200);
    const missing = await api.getSecret({ projectId, secretId });
    assert.equal(missing.response.status, 404);
  } finally {
    await api.deleteSecret({ projectId, secretId }).catch(() => {});
    await runtime.close();
  }
});
