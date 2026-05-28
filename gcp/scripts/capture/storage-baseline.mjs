import { CleanupStack } from '../../src/conformance/cleanup-stack.mjs';
import { CaptureWriter } from '../../src/conformance/capture-writer.mjs';
import { createResourceName, createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { StorageApi } from '../../src/services/storage/google-api.mjs';

function parseArgs(argv) {
  const args = {
    apply: false,
    projectId: undefined,
    location: undefined,
    bucketLocation: undefined,
  };
  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }
    if (arg.startsWith('--project=')) {
      args.projectId = arg.slice('--project='.length);
      continue;
    }
    if (arg.startsWith('--location=')) {
      args.location = arg.slice('--location='.length);
      continue;
    }
    if (arg.startsWith('--bucket-location=')) {
      args.bucketLocation = arg.slice('--bucket-location='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = await createRunContext({
    service: 'cloud-storage',
    projectId: args.projectId,
    location: args.location,
    bucketLocation: args.bucketLocation,
  });
  const bucketName = createResourceName({
    prefix: 'gst-capture',
    runId: context.run_id,
  });
  const objectName = `artifacts/${context.run_id}/sample.json`;
  const writer = new CaptureWriter({
    service: 'cloud-storage',
    runId: context.run_id,
  });

  const plan = {
    apply: args.apply,
    project_id: context.project_id,
    location: context.location,
    bucket_location: context.bucket_location,
    bucket_name: bucketName,
    object_name: objectName,
    labels: context.labels,
  };

  if (!args.apply) {
    console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
    return;
  }

  const cleanup = new CleanupStack();
  const storage = new StorageApi(new GoogleRestClient());
  let status = 'passed';
  let cleanupResults = [];
  let capturePath = null;

  try {
    const getMissingBucket = await storage.getBucket(bucketName);
    writer.record('get-missing-bucket-before-create', getMissingBucket, {
      expected_status: 404,
    });
    requireStatus(getMissingBucket, [404]);

    const createBucket = await storage.createBucket({
      projectId: context.project_id,
      bucketName,
      location: context.bucket_location,
      labels: context.labels,
    });
    writer.record('create-bucket', createBucket, { expected_status: 200 });
    requireStatus(createBucket, [200]);

    cleanup.push(`delete bucket ${bucketName}`, async () => {
      await deleteBucketIfPresent(storage, bucketName);
    });

    const objectContent = {
      run_id: context.run_id,
      purpose: 'globalstack gcp storage capture',
      created_at: new Date().toISOString(),
    };
    const insertObject = await storage.insertObject({
      bucketName,
      objectName,
      content: objectContent,
    });
    writer.record('insert-object', insertObject, { expected_status: 200 });
    requireStatus(insertObject, [200]);

    cleanup.push(`delete object ${objectName}`, async () => {
      await deleteObjectIfPresent(storage, { bucketName, objectName });
    });

    writer.record('get-bucket-after-create', await storage.getBucket(bucketName), {
      expected_status: 200,
    });
    writer.record('list-buckets-after-create', await storage.listBuckets(context.project_id), {
      expected_status: 200,
      expected_bucket_name: bucketName,
    });
    writer.record('get-object-after-insert', await storage.getObject({ bucketName, objectName }), {
      expected_status: 200,
    });
    writer.record('list-objects-after-insert', await storage.listObjects(bucketName), {
      expected_status: 200,
      expected_object_name: objectName,
    });

    const duplicateCreate = await storage.createBucket({
      projectId: context.project_id,
      bucketName,
      location: context.bucket_location,
      labels: context.labels,
    });
    writer.record('create-duplicate-bucket-error', duplicateCreate, {
      expected_status: 409,
    });
    requireStatus(duplicateCreate, [409]);

    const patchedLabels = {
      ...context.labels,
      capture_stage: 'patched',
    };
    const patchBucket = await storage.patchBucketLabels({
      bucketName,
      labels: patchedLabels,
    });
    writer.record('patch-bucket-labels', patchBucket, { expected_status: 200 });
    requireStatus(patchBucket, [200]);
  } catch (error) {
    status = 'failed';
    writer.recordNote('capture-error', {
      error: {
        name: error.name,
        message: error.message,
      },
    });
    process.exitCode = 1;
  } finally {
    cleanupResults = await cleanup.run();
    const verifyDeleted = await storage.getBucket(bucketName).catch(error => ({
      request: null,
      response: {
        ok: false,
        status: 0,
        status_text: error.name,
        headers: {},
        body: {
          message: error.message,
        },
        ended_at: new Date().toISOString(),
      },
    }));
    writer.record('get-bucket-after-cleanup', verifyDeleted, {
      expected_status: 404,
    });
    if (verifyDeleted.response.status !== 404) {
      status = 'failed';
      process.exitCode = 1;
    }
    if (cleanupResults.some(result => result.status === 'failed')) {
      status = 'failed';
      process.exitCode = 1;
    }
    capturePath = await writer.write({
      context: {
        ...context,
        resources: {
          bucket_name: bucketName,
          object_name: objectName,
        },
      },
      cleanup: cleanupResults,
      status,
    });
  }

  console.log(JSON.stringify({
    status,
    capture_path: capturePath,
    cleanup: cleanupResults,
  }, null, 2));
}

function requireStatus(exchange, statuses) {
  if (!statuses.includes(exchange.response.status)) {
    throw new Error(`${exchange.request.method} ${exchange.request.url} returned ${exchange.response.status}; expected ${statuses.join(', ')}`);
  }
}

async function deleteObjectIfPresent(storage, { bucketName, objectName }) {
  const get = await storage.getObject({ bucketName, objectName });
  if (get.response.status === 404) return;
  requireStatus(get, [200]);
  const generation = get.response.body?.generation;
  const deleted = await storage.deleteObject({ bucketName, objectName, generation });
  requireStatus(deleted, [204]);
}

async function deleteBucketIfPresent(storage, bucketName) {
  const get = await storage.getBucket(bucketName);
  if (get.response.status === 404) return;
  requireStatus(get, [200]);
  const deleted = await storage.deleteBucket(bucketName);
  requireStatus(deleted, [204]);
}

await main();
