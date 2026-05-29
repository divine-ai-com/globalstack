import { createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { CloudTasksApi } from '../../src/services/cloud-tasks/google-api.mjs';
import { LoggingApi } from '../../src/services/logging/google-api.mjs';
import { PubSubApi } from '../../src/services/pubsub/google-api.mjs';
import { SecretManagerApi } from '../../src/services/secret-manager/google-api.mjs';
import { StorageApi } from '../../src/services/storage/google-api.mjs';

const labels = {
  purpose: 'globalstack-conformance',
  owner: 'globalstack',
};

function parseArgs(argv) {
  const args = {
    projectId: undefined,
    location: 'us-central1',
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
    if (arg.startsWith('--location=')) {
      args.location = arg.slice('--location='.length);
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

async function listSecrets(projectId) {
  const secrets = new SecretManagerApi(new GoogleRestClient());
  const result = await secrets.listSecrets(projectId);
  if (result.response.status === 403 || result.response.status === 404) return [];
  if (!result.response.ok) {
    throw new Error(`Failed to list Secret Manager secrets: ${result.response.status} ${JSON.stringify(result.response.body)}`);
  }
  return (result.response.body.secrets ?? []).filter(hasGlobalStackLabels);
}

async function listCloudTasksQueues({ projectId, location }) {
  const tasks = new CloudTasksApi(new GoogleRestClient());
  const result = await tasks.listQueues({ projectId, location });
  if (result.response.status === 403 || result.response.status === 404) return [];
  if (!result.response.ok) {
    throw new Error(`Failed to list Cloud Tasks queues: ${result.response.status} ${JSON.stringify(result.response.body)}`);
  }
  return (result.response.body.queues ?? []).filter(queue => queue.name.split('/').at(-1).startsWith('gst-'));
}

async function listLoggingMetrics(projectId) {
  const logging = new LoggingApi(new GoogleRestClient());
  const result = await logging.listMetrics(projectId);
  if (result.response.status === 403 || result.response.status === 404) return [];
  if (!result.response.ok) {
    throw new Error(`Failed to list Cloud Logging metrics: ${result.response.status} ${JSON.stringify(result.response.body)}`);
  }
  return (result.response.body.metrics ?? []).filter(metric => metric.name?.startsWith('gst_'));
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

async function deleteSecretResources(projectId, secrets) {
  const api = new SecretManagerApi(new GoogleRestClient());
  const deleted = [];
  for (const secret of secrets) {
    const secretId = resourceNameTail(secret.name);
    const result = await api.deleteSecret({ projectId, secretId });
    if (![200, 204, 404].includes(result.response.status)) {
      throw new Error(`Failed to delete secret ${secret.name}: ${result.response.status}`);
    }
    deleted.push(secret.name);
  }
  return deleted;
}

async function deleteCloudTasksQueues({ projectId, location, queues }) {
  const api = new CloudTasksApi(new GoogleRestClient());
  const deleted = [];
  for (const queue of queues) {
    const queueId = resourceNameTail(queue.name);
    const result = await api.deleteQueue({ projectId, location, queueId });
    if (![200, 204, 404].includes(result.response.status)) {
      throw new Error(`Failed to delete Cloud Tasks queue ${queue.name}: ${result.response.status}`);
    }
    deleted.push(queue.name);
  }
  return deleted;
}

async function deleteLoggingMetrics(projectId, metrics) {
  const api = new LoggingApi(new GoogleRestClient());
  const deleted = [];
  for (const metric of metrics) {
    const metricId = resourceNameTail(metric.name);
    const result = await api.deleteMetric({ projectId, metricId });
    if (![200, 204, 404].includes(result.response.status)) {
      throw new Error(`Failed to delete Logging metric ${metric.name}: ${result.response.status}`);
    }
    deleted.push(metric.name);
  }
  return deleted;
}

const args = parseArgs(process.argv.slice(2));
const context = await createRunContext({
  service: 'cleanup',
  projectId: args.projectId,
});
const [buckets, pubsub, secrets, cloudTasksQueues, loggingMetrics] = await Promise.all([
  listBuckets(context.project_id),
  listPubSubResources(context.project_id),
  listSecrets(context.project_id),
  listCloudTasksQueues({ projectId: context.project_id, location: args.location }),
  listLoggingMetrics(context.project_id),
]);
const report = {
  project_id: context.project_id,
  location: args.location,
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
  secret_manager: secrets.map(resource => resource.name),
  cloud_tasks: cloudTasksQueues.map(resource => resource.name),
  logging_metrics: loggingMetrics.map(resource => resource.name),
  deleted: [],
};

if (args.apply) {
  for (const bucket of report.buckets) {
    await deleteBucket(bucket.name);
    report.deleted.push(bucket.url);
  }
  report.deleted_pubsub = await deletePubSubResources(context.project_id, pubsub);
  report.deleted_secret_manager = await deleteSecretResources(context.project_id, secrets);
  report.deleted_cloud_tasks = await deleteCloudTasksQueues({
    projectId: context.project_id,
    location: args.location,
    queues: cloudTasksQueues,
  });
  report.deleted_logging_metrics = await deleteLoggingMetrics(context.project_id, loggingMetrics);
}

console.log(JSON.stringify(report, null, 2));

function hasGlobalStackLabels(resource) {
  return resource.labels?.purpose === labels.purpose && resource.labels?.owner === labels.owner;
}

function resourceNameTail(name) {
  return name.split('/').at(-1);
}
