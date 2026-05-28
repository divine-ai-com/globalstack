import { createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { PubSubApi } from '../../src/services/pubsub/google-api.mjs';
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

async function listPubSubResources(projectId) {
  const pubsub = new PubSubApi(new GoogleRestClient());
  const [topics, subscriptions, snapshots, schemas] = await Promise.all([
    pubsub.listTopics(projectId),
    pubsub.listSubscriptions(projectId),
    pubsub.listSnapshots(projectId),
    pubsub.listSchemas(projectId),
  ]);
  for (const [kind, result] of Object.entries({ topics, subscriptions, snapshots, schemas })) {
    if (!result.response.ok) {
      throw new Error(`Failed to list Pub/Sub ${kind}: ${result.response.status} ${JSON.stringify(result.response.body)}`);
    }
  }
  return {
    topics: (topics.response.body.topics ?? []).filter(hasGlobalStackLabels),
    subscriptions: (subscriptions.response.body.subscriptions ?? []).filter(hasGlobalStackLabels),
    snapshots: (snapshots.response.body.snapshots ?? []).filter(hasGlobalStackLabels),
    schemas: (schemas.response.body.schemas ?? []).filter(resource => resource.name.split('/').at(-1).startsWith('gst-capture-schema-')),
  };
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

async function deletePubSubResources(projectId, resources) {
  const pubsub = new PubSubApi(new GoogleRestClient());
  const deleted = {
    subscriptions: [],
    snapshots: [],
    topics: [],
    schemas: [],
  };
  for (const subscription of resources.subscriptions) {
    const subscriptionName = resourceNameTail(subscription.name);
    const result = await pubsub.deleteSubscription({ projectId, subscriptionName });
    if (![200, 204, 404].includes(result.response.status)) {
      throw new Error(`Failed to delete Pub/Sub subscription ${subscription.name}: ${result.response.status}`);
    }
    deleted.subscriptions.push(subscription.name);
  }
  for (const snapshot of resources.snapshots) {
    const snapshotName = resourceNameTail(snapshot.name);
    const result = await pubsub.deleteSnapshot({ projectId, snapshotName });
    if (![200, 204, 404].includes(result.response.status)) {
      throw new Error(`Failed to delete Pub/Sub snapshot ${snapshot.name}: ${result.response.status}`);
    }
    deleted.snapshots.push(snapshot.name);
  }
  for (const topic of resources.topics) {
    const topicName = resourceNameTail(topic.name);
    const result = await pubsub.deleteTopic({ projectId, topicName });
    if (![200, 204, 404].includes(result.response.status)) {
      throw new Error(`Failed to delete Pub/Sub topic ${topic.name}: ${result.response.status}`);
    }
    deleted.topics.push(topic.name);
  }
  for (const schema of resources.schemas) {
    const schemaId = resourceNameTail(schema.name);
    const result = await pubsub.deleteSchema({ projectId, schemaId });
    if (![200, 204, 404].includes(result.response.status)) {
      throw new Error(`Failed to delete Pub/Sub schema ${schema.name}: ${result.response.status}`);
    }
    deleted.schemas.push(schema.name);
  }
  return deleted;
}

const args = parseArgs(process.argv.slice(2));
const context = await createRunContext({
  service: 'cleanup',
  projectId: args.projectId,
});
const [buckets, pubsub] = await Promise.all([
  listBuckets(context.project_id),
  listPubSubResources(context.project_id),
]);
const report = {
  project_id: context.project_id,
  apply: args.apply,
  labels,
  buckets: buckets.map(bucket => ({
    name: bucket.name,
    url: bucket.storage_url ?? `gs://${bucket.name}`,
    location: bucket.location ?? null,
  })),
  pubsub: {
    topics: pubsub.topics.map(resource => resource.name),
    subscriptions: pubsub.subscriptions.map(resource => resource.name),
    snapshots: pubsub.snapshots.map(resource => resource.name),
    schemas: pubsub.schemas.map(resource => resource.name),
  },
  deleted: [],
};

if (args.apply) {
  for (const bucket of report.buckets) {
    await deleteBucket(bucket.name);
    report.deleted.push(bucket.url);
  }
  report.deleted_pubsub = await deletePubSubResources(context.project_id, pubsub);
}

console.log(JSON.stringify(report, null, 2));

function hasGlobalStackLabels(resource) {
  return resource.labels?.purpose === labels.purpose && resource.labels?.owner === labels.owner;
}

function resourceNameTail(name) {
  return name.split('/').at(-1);
}
