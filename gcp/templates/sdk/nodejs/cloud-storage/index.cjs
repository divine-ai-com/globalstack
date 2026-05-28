const { Storage } = require('@google-cloud/storage');

const runId = requireEnv('RUN_ID');
const bucketName = requireEnv('BUCKET_NAME');
const objectName = requireEnv('OBJECT_NAME');
const apiEndpoint = requireEnv('GLOBALSTACK_GCP_ENDPOINT');
const steps = [];

let bucketCreated = false;
let objectCreated = false;

async function main() {
  const storage = new Storage({
    projectId: 'globalstack-local',
    apiEndpoint,
    useAuthWithCustomEndpoint: false,
  });
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);

  try {
    await step('bucket.create', async () => {
      await bucket.create({
        location: 'US',
        uniformBucketLevelAccess: true,
      });
      bucketCreated = true;
    });
    await step('file.save', async () => {
      await file.save(`${JSON.stringify({ run_id: runId, purpose: 'globalstack gcp sdk node' })}\n`, {
        contentType: 'application/json',
        resumable: false,
      });
      objectCreated = true;
    });
    await step('bucket.exists', async () => {
      const [exists] = await bucket.exists();
      if (!exists) throw new Error(`Bucket ${bucketName} does not exist after create`);
    });
    await step('bucket.getFiles', async () => {
      const [files] = await bucket.getFiles({ prefix: `artifacts/${runId}/` });
      if (!files.some(candidate => candidate.name === objectName)) {
        throw new Error(`Object ${objectName} was not listed by SDK`);
      }
    });
  } finally {
    if (objectCreated) {
      await step('file.delete', async () => {
        await file.delete();
        objectCreated = false;
      });
    }
    if (bucketCreated) {
      await step('bucket.delete', async () => {
        await bucket.delete();
        bucketCreated = false;
      });
    }
  }
}

main()
  .then(() => {
    console.log(JSON.stringify({ status: 'passed', steps }, null, 2));
  })
  .catch(error => {
    console.log(JSON.stringify({
      status: 'failed',
      error: error.message,
      steps,
    }, null, 2));
    process.exitCode = 1;
  });

async function step(name, action) {
  const started = Date.now();
  try {
    await action();
    steps.push({ name, status: 'passed', duration_ms: Date.now() - started });
  } catch (error) {
    steps.push({ name, status: 'failed', duration_ms: Date.now() - started, error: error.message });
    throw error;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}
