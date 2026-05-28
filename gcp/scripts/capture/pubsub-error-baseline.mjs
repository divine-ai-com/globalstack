import { CleanupStack } from '../../src/conformance/cleanup-stack.mjs';
import { CaptureWriter } from '../../src/conformance/capture-writer.mjs';
import { createResourceName, createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { PubSubApi } from '../../src/services/pubsub/google-api.mjs';

function parseArgs(argv) {
  const args = {
    apply: false,
    projectId: undefined,
    location: undefined,
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = await createRunContext({
    service: 'pubsub-errors',
    projectId: args.projectId,
    location: args.location,
  });
  const topicName = createResourceName({
    prefix: 'gst-capture-error-topic',
    runId: context.run_id,
    maxLength: 255,
  });
  const subscriptionName = createResourceName({
    prefix: 'gst-capture-error-sub',
    runId: context.run_id,
    maxLength: 255,
  });
  const missingTopicName = createResourceName({
    prefix: 'gst-capture-missing-topic',
    runId: context.run_id,
    maxLength: 255,
  });
  const missingSubscriptionName = createResourceName({
    prefix: 'gst-capture-missing-sub',
    runId: context.run_id,
    maxLength: 255,
  });
  const missingSnapshotName = createResourceName({
    prefix: 'gst-capture-missing-snap',
    runId: context.run_id,
    maxLength: 255,
  });
  const writer = new CaptureWriter({
    service: 'pubsub',
    runId: context.run_id,
  });

  const plan = {
    apply: args.apply,
    project_id: context.project_id,
    location: context.location,
    topic_name: topicName,
    subscription_name: subscriptionName,
    missing_topic_name: missingTopicName,
    missing_subscription_name: missingSubscriptionName,
    missing_snapshot_name: missingSnapshotName,
    labels: context.labels,
  };

  if (!args.apply) {
    console.log(JSON.stringify({ status: 'dry-run', plan }, null, 2));
    return;
  }

  const cleanup = new CleanupStack();
  const pubsub = new PubSubApi(new GoogleRestClient());
  let status = 'passed';
  let cleanupResults = [];
  let capturePath = null;

  try {
    await recordExpected(pubsub.getTopic({
      projectId: context.project_id,
      topicName: missingTopicName,
    }), writer, 'get-missing-topic', 404);

    await recordExpected(pubsub.createSubscription({
      projectId: context.project_id,
      subscriptionName: missingSubscriptionName,
      topicName: missingTopicName,
      labels: context.labels,
    }), writer, 'create-subscription-missing-topic', 404);

    await recordExpected(pubsub.publish({
      projectId: context.project_id,
      topicName: missingTopicName,
      messages: [{
        data: {
          run_id: context.run_id,
          case: 'missing-topic',
        },
      }],
    }), writer, 'publish-missing-topic', 404);

    await recordExpected(pubsub.pull({
      projectId: context.project_id,
      subscriptionName: missingSubscriptionName,
    }), writer, 'pull-missing-subscription', 404);

    const createTopic = await recordExpected(pubsub.createTopic({
      projectId: context.project_id,
      topicName,
      labels: context.labels,
    }), writer, 'create-topic-for-error-cases', 200);

    cleanup.push(`delete topic ${topicName}`, async () => {
      await deleteTopicIfPresent(pubsub, {
        projectId: context.project_id,
        topicName,
      });
    });

    const createSubscription = await recordExpected(pubsub.createSubscription({
      projectId: context.project_id,
      subscriptionName,
      topicName,
      labels: context.labels,
    }), writer, 'create-subscription-for-error-cases', 200);

    cleanup.push(`delete subscription ${subscriptionName}`, async () => {
      await deleteSubscriptionIfPresent(pubsub, {
        projectId: context.project_id,
        subscriptionName,
      });
    });

    if (!createTopic.response.ok || !createSubscription.response.ok) {
      throw new Error('Unable to create control resources for Pub/Sub error-shape capture');
    }

    await recordExpected(pubsub.createSubscription({
      projectId: context.project_id,
      subscriptionName,
      topicName,
      labels: context.labels,
    }), writer, 'create-duplicate-subscription', 409);

    await recordExpected(pubsub.createSnapshot({
      projectId: context.project_id,
      snapshotName: missingSnapshotName,
      subscriptionName: missingSubscriptionName,
      labels: context.labels,
    }), writer, 'create-snapshot-missing-subscription', 404);

    await recordExpected(pubsub.seekToSnapshot({
      projectId: context.project_id,
      subscriptionName,
      snapshotName: missingSnapshotName,
    }), writer, 'seek-missing-snapshot', 404);

    await recordExpected(pubsub.deleteSnapshot({
      projectId: context.project_id,
      snapshotName: missingSnapshotName,
    }), writer, 'delete-missing-snapshot', 404);
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
    const verifySubscriptionDeleted = await pubsub.getSubscription({
      projectId: context.project_id,
      subscriptionName,
    }).catch(errorExchange);
    writer.record('get-subscription-after-cleanup', verifySubscriptionDeleted, {
      expected_status: 404,
    });
    if (verifySubscriptionDeleted.response.status !== 404) {
      status = 'failed';
      process.exitCode = 1;
    }
    const verifyTopicDeleted = await pubsub.getTopic({
      projectId: context.project_id,
      topicName,
    }).catch(errorExchange);
    writer.record('get-topic-after-cleanup', verifyTopicDeleted, {
      expected_status: 404,
    });
    if (verifyTopicDeleted.response.status !== 404) {
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
        scenario: 'errors',
        resources: {
          topic_name: topicName,
          subscription_name: subscriptionName,
          missing_topic_name: missingTopicName,
          missing_subscription_name: missingSubscriptionName,
          missing_snapshot_name: missingSnapshotName,
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

async function recordExpected(exchangePromise, writer, name, expectedStatus) {
  const exchange = await exchangePromise;
  writer.record(name, exchange, { expected_status: expectedStatus });
  requireStatus(exchange, [expectedStatus]);
  return exchange;
}

function requireStatus(exchange, statuses) {
  if (!statuses.includes(exchange.response.status)) {
    throw new Error(`${exchange.request.method} ${exchange.request.url} returned ${exchange.response.status}; expected ${statuses.join(', ')}`);
  }
}

async function deleteSubscriptionIfPresent(pubsub, { projectId, subscriptionName }) {
  const get = await pubsub.getSubscription({ projectId, subscriptionName });
  if (get.response.status === 404) return;
  requireStatus(get, [200]);
  const deleted = await pubsub.deleteSubscription({ projectId, subscriptionName });
  requireStatus(deleted, [200, 204]);
}

async function deleteTopicIfPresent(pubsub, { projectId, topicName }) {
  const get = await pubsub.getTopic({ projectId, topicName });
  if (get.response.status === 404) return;
  requireStatus(get, [200]);
  const deleted = await pubsub.deleteTopic({ projectId, topicName });
  requireStatus(deleted, [200, 204]);
}

function errorExchange(error) {
  return {
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
  };
}

await main();
