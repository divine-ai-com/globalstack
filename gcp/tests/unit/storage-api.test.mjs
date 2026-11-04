import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StorageApi } from '../../src/services/storage/google-api.mjs';

test('storage API wrapper keeps Cloud Storage request construction service-owned', async () => {
  const calls = [];
  const storage = new StorageApi({
    async requestJson(request) {
      calls.push(request);
      return { response: { status: 200, body: {} } };
    },
  });

  await storage.createBucket({
    projectId: 'globalstack-test',
    bucketName: 'gst-capture-test',
    location: 'US',
    labels: {
      purpose: 'globalstack-conformance',
    },
  });
  await storage.insertObject({
    bucketName: 'gst-capture-test',
    objectName: 'artifacts/run/sample.json',
    content: { ok: true },
  });

  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].url.searchParams.get('project'), 'globalstack-test');
  assert.equal(calls[0].body.name, 'gst-capture-test');
  assert.equal(calls[0].body.iamConfiguration.uniformBucketLevelAccess.enabled, true);
  assert.equal(calls[1].url.searchParams.get('uploadType'), 'media');
  assert.equal(calls[1].url.searchParams.get('name'), 'artifacts/run/sample.json');
});
