import { createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { StorageApi } from '../../src/services/storage/google-api.mjs';

const labels = {
  purpose: 'globalstack-conformance',
  owner: 'globalstack',
};

function parseArgs(argv) {
  const args = {
    projectId: undefined,
    apply: false,
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
    throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function listBuckets(projectId) {
  const storage = new StorageApi(new GoogleRestClient());
  const result = await storage.listBuckets(projectId);
  if (!result.response.ok) {
    throw new Error(`Failed to list buckets: ${result.response.status} ${JSON.stringify(result.response.body)}`);
  }
  return (result.response.body.items ?? []).filter(bucket =>
    bucket.labels?.purpose === labels.purpose &&
    bucket.labels?.owner === labels.owner
  );
}

async function deleteBucket(bucketName) {
  const storage = new StorageApi(new GoogleRestClient());
  const objects = await storage.listObjects(bucketName);
  if (objects.response.status !== 404) {
    for (const object of objects.response.body.items ?? []) {
      const deleted = await storage.deleteObject({
        bucketName,
        objectName: object.name,
        generation: object.generation,
      });
      if (![204, 404].includes(deleted.response.status)) {
        throw new Error(`Failed to delete object ${object.name}: ${deleted.response.status}`);
      }
    }
  }
  const deleted = await storage.deleteBucket(bucketName);
  if (![204, 404].includes(deleted.response.status)) {
    throw new Error(`Failed to delete bucket ${bucketName}: ${deleted.response.status}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const context = await createRunContext({
  service: 'cleanup',
  projectId: args.projectId,
});
const buckets = await listBuckets(context.project_id);
const report = {
  project_id: context.project_id,
  apply: args.apply,
  labels,
  buckets: buckets.map(bucket => ({
    name: bucket.name,
    url: bucket.storage_url ?? `gs://${bucket.name}`,
    location: bucket.location ?? null,
  })),
  deleted: [],
};

if (args.apply) {
  for (const bucket of report.buckets) {
    await deleteBucket(bucket.name);
    report.deleted.push(bucket.url);
  }
}

console.log(JSON.stringify(report, null, 2));
