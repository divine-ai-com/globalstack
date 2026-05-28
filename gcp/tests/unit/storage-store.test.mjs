import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { crc32cBase64 } from '../../src/services/storage/checksums.mjs';
import { StorageStore } from '../../src/services/storage/store.mjs';

test('Cloud Storage CRC32C metadata uses Google-compatible base64 encoding', () => {
  assert.equal(crc32cBase64(''), 'AAAAAA==');
  assert.equal(crc32cBase64('abc'), 'Nks/tw==');
});

test('storage store persists bucket/object metadata and enforces duplicate bucket names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'globalstack-gcp-storage-'));
  try {
    const store = new StorageStore({ root });
    const created = await store.createBucket({
      projectId: 'globalstack-test',
      name: 'gst-capture-test',
      location: 'US',
      labels: {
        owner: 'globalstack',
      },
      versioning: {
        enabled: true,
      },
      iamConfiguration: {
        uniformBucketLevelAccess: {
          enabled: true,
        },
      },
    });
    assert.equal(created.name, 'gst-capture-test');
    assert.equal(created.iamConfiguration.uniformBucketLevelAccess.enabled, true);
    assert.deepEqual(store.getBucketStorageLayout('gst-capture-test'), {
      kind: 'storage#storageLayout',
      bucket: 'gst-capture-test',
      location: 'US',
      locationType: 'multi-region',
      hierarchicalNamespace: {
        enabled: false,
      },
    });
    assert.equal(await store.createBucket({
      projectId: 'globalstack-test',
      name: 'gst-capture-test',
      location: 'US',
    }), null);

    const object = await store.insertObject({
      bucketName: 'gst-capture-test',
      objectName: 'artifacts/sample.json',
      content: { ok: true },
      contentType: 'application/json',
    });
    assert.equal(object.bucket, 'gst-capture-test');
    assert.equal(store.listObjects('gst-capture-test').length, 1);

    assert.deepEqual(await store.deleteObject({
      bucketName: 'gst-capture-test',
      objectName: 'artifacts/sample.json',
    }), {
      bucketFound: true,
      deleted: true,
    });
    assert.deepEqual(await store.deleteBucket('gst-capture-test'), {
      found: true,
      deleted: true,
      notEmpty: false,
    });
    assert.equal(store.getBucket('gst-capture-test'), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
