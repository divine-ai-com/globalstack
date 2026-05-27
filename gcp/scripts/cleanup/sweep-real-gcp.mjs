import { spawnFileText } from '../../src/util/spawn-json.mjs';

const defaultProjectId = process.env.GOOGLE_CLOUD_PROJECT ?? 'globalstack-conformance-runner';
const labels = {
  purpose: 'globalstack-conformance',
  owner: 'globalstack',
};

function parseArgs(argv) {
  const args = {
    projectId: defaultProjectId,
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
  const token = await getAdcToken();
  const url = new URL('https://storage.googleapis.com/storage/v1/b');
  url.searchParams.set('project', projectId);
  url.searchParams.set('projection', 'full');
  const result = await fetchGoogleJson(url, { token });
  return (result.items ?? []).filter(bucket =>
    bucket.labels?.purpose === labels.purpose &&
    bucket.labels?.owner === labels.owner
  );
}

async function deleteBucket(bucketName) {
  const token = await getAdcToken();
  await deleteBucketObjects(bucketName, token);
  const bucketUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}`);
  await fetchGoogleJson(bucketUrl, { method: 'DELETE', token, allowEmpty: true });
}

async function deleteBucketObjects(bucketName, token) {
  let pageToken = null;
  do {
    const url = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o`);
    url.searchParams.set('versions', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const result = await fetchGoogleJson(url, { token });
    for (const object of result.items ?? []) {
      const deleteUrl = new URL(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(object.name)}`);
      if (object.generation) deleteUrl.searchParams.set('generation', object.generation);
      await fetchGoogleJson(deleteUrl, { method: 'DELETE', token, allowEmpty: true });
    }
    pageToken = result.nextPageToken ?? null;
  } while (pageToken);
}

async function getAdcToken() {
  return (await spawnFileText('gcloud', ['auth', 'application-default', 'print-access-token'])).trim();
}

async function fetchGoogleJson(url, { method = 'GET', token, allowEmpty = false } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${JSON.stringify(json)}`);
  }
  return json ?? (allowEmpty ? null : {});
}

const args = parseArgs(process.argv.slice(2));
const buckets = await listBuckets(args.projectId);
const report = {
  project_id: args.projectId,
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
