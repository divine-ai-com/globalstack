import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { listen } from '../../src/server/server.mjs';
import { createService as createStorageService } from '../../src/services/storage/service.mjs';
import { StorageApi } from '../../src/services/storage/google-api.mjs';
import { StorageStore } from '../../src/services/storage/store.mjs';

const capturePath = new URL('../../fixtures/captures/cloud-storage/cloud-storage-20260528113308-9ce4a0/capture.json', import.meta.url);

test('Cloud Storage local runtime replays captured bucket/object lifecycle semantics', async () => {
  const capture = JSON.parse(await readFile(capturePath, 'utf8'));
  const expectedStatus = new Map(capture.events.map(event => [event.name, event.exchange.response.status]));
  const dataRoot = await mkdtemp(join(tmpdir(), 'globalstack-gcp-storage-'));
  const store = new StorageStore({ root: dataRoot });
  const runtime = await listen({
    port: 0,
    services: [
      createStorageService({ store }),
    ],
  });

  try {
    const storage = new StorageApi(new GoogleRestClient({
      tokenProvider: async () => 'local-test-token',
    }), {
      storageRoot: `${runtime.url}/storage/v1`,
      uploadRoot: `${runtime.url}/upload/storage/v1`,
    });

    const { project_id: projectId, bucket_location: location, labels, resources } = capture.context;
    const bucketName = resources.bucket_name;
    const objectName = resources.object_name;

    const missingBucket = await storage.getBucket(bucketName);
    assert.equal(missingBucket.response.status, expectedStatus.get('get-missing-bucket-before-create'));
    assert.equal(missingBucket.response.body.error.errors[0].reason, 'notFound');

    const createBucket = await storage.createBucket({
      projectId,
      bucketName,
      location,
      labels,
    });
    assert.equal(createBucket.response.status, expectedStatus.get('create-bucket'));
    assert.equal(createBucket.response.body.name, bucketName);
    assert.equal(createBucket.response.body.versioning.enabled, true);
    assert.equal(createBucket.response.body.iamConfiguration.uniformBucketLevelAccess.enabled, true);

    const insertObject = await storage.insertObject({
      bucketName,
      objectName,
      content: {
        run_id: capture.context.run_id,
        purpose: 'globalstack gcp storage capture',
      },
    });
    assert.equal(insertObject.response.status, expectedStatus.get('insert-object'));
    assert.equal(insertObject.response.body.name, objectName);

    const multipartObject = await fetch(`${runtime.url}/upload/storage/v1/b/${bucketName}/o?uploadType=multipart&name=artifacts%2Fmultipart%2Fsample.json`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer local-test-token',
        'content-type': 'multipart/related; boundary=globalstack-boundary',
      },
      body: [
        '--globalstack-boundary',
        'content-type: application/json; charset=UTF-8',
        '',
        '{"name":"artifacts/multipart/sample.json","contentType":"application/json"}',
        '--globalstack-boundary',
        'content-type: application/json',
        '',
        '{"ok":true}',
        '--globalstack-boundary--',
        '',
      ].join('\r\n'),
    });
    assert.equal(multipartObject.status, 200);
    assert.equal((await multipartObject.json()).name, 'artifacts/multipart/sample.json');

    const getBucket = await storage.getBucket(bucketName);
    assert.equal(getBucket.response.status, expectedStatus.get('get-bucket-after-create'));
    assert.equal(getBucket.response.body.labels.owner, 'globalstack');

    const listBuckets = await storage.listBuckets(projectId);
    assert.equal(listBuckets.response.status, expectedStatus.get('list-buckets-after-create'));
    assert.ok(listBuckets.response.body.items.some(bucket => bucket.name === bucketName));

    const getObject = await storage.getObject({ bucketName, objectName });
    assert.equal(getObject.response.status, expectedStatus.get('get-object-after-insert'));
    assert.equal(getObject.response.body.bucket, bucketName);

    const listObjects = await storage.listObjects(bucketName);
    assert.equal(listObjects.response.status, expectedStatus.get('list-objects-after-insert'));
    assert.ok(listObjects.response.body.items.some(object => object.name === objectName));

    const duplicateCreate = await storage.createBucket({
      projectId,
      bucketName,
      location,
      labels,
    });
    assert.equal(duplicateCreate.response.status, expectedStatus.get('create-duplicate-bucket-error'));
    assert.equal(duplicateCreate.response.body.error.errors[0].reason, 'conflict');

    const patchBucket = await storage.patchBucketLabels({
      bucketName,
      labels: {
        ...labels,
        capture_stage: 'patched',
      },
    });
    assert.equal(patchBucket.response.status, expectedStatus.get('patch-bucket-labels'));
    assert.equal(patchBucket.response.body.labels.capture_stage, 'patched');

    const deleteObject = await storage.deleteObject({ bucketName, objectName });
    assert.equal(deleteObject.response.status, 204);

    const deleteMultipartObject = await storage.deleteObject({
      bucketName,
      objectName: 'artifacts/multipart/sample.json',
    });
    assert.equal(deleteMultipartObject.response.status, 204);

    const deleteBucket = await storage.deleteBucket(bucketName);
    assert.equal(deleteBucket.response.status, 204);

    const getAfterCleanup = await storage.getBucket(bucketName);
    assert.equal(getAfterCleanup.response.status, expectedStatus.get('get-bucket-after-cleanup'));
  } finally {
    await runtime.close();
    await rm(dataRoot, { recursive: true, force: true });
  }
});
