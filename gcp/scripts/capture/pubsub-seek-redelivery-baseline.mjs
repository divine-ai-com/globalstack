import { CleanupStack } from '../../src/conformance/cleanup-stack.mjs';
import { CaptureWriter } from '../../src/conformance/capture-writer.mjs';
import { createResourceName, createRunContext } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { decodePubSubMessageData, PubSubApi } from '../../src/services/pubsub/google-api.mjs';

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
    service: 'pubsub-seek',
    projectId: args.projectId,
    location: args.location,
  });
  const topicName = createResourceName({
    prefix: 'gst-capture-seek-topic',
    runId: context.run_id,
    maxLength: 255,
  });
  const subscriptionName = createResourceName({
    prefix: 'gst-capture-seek-sub',
    runId: context.run_id,
    maxLength: 255,
  });
  const snapshotName = createResourceName({
    prefix: 'gst-capture-seek-snap',
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
    snapshot_name: snapshotName,
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
    await recordExpected(pubsub.createTopic({
      projectId: context.project_id,
      topicName,
      labels: context.labels,
    }), writer, 'create-topic', 200);

    cleanup.push(`delete topic ${topicName}`, async () => {
      await deleteTopicIfPresent(pubsub, {
        projectId: context.project_id,
        topicName,
      });
    });

    await recordExpected(pubsub.createSubscription({
      projectId: context.project_id,
      subscriptionName,
      topicName,
      labels: context.labels,
      body: {
        ackDeadlineSeconds: 20,
        retainAckedMessages: true,
      },
    }), writer, 'create-subscription', 200);

    cleanup.push(`delete subscription ${subscriptionName}`, async () => {
      await deleteSubscriptionIfPresent(pubsub, {
        projectId: context.project_id,
        subscriptionName,
      });
    });

    await recordExpected(pubsub.publish({
      projectId: context.project_id,
      topicName,
      messages: [{
        data: {
          run_id: context.run_id,
          route: 'seek-redelivery',
        },
        attributes: {
          run_id: context.run_id,
        },
      }],
    }), writer, 'publish-message', 200);

    const firstPull = await pollForMessage(pubsub, {
      projectId: context.project_id,
      subscriptionName,
    });
    writer.record('pull-before-snapshot', firstPull, { expected_status: 200 });
    requireStatus(firstPull, [200]);
    const firstMessage = firstPull.response.body.receivedMessages[0];
    assertMessage(firstMessage, context.run_id);

    await recordExpected(pubsub.createSnapshot({
      projectId: context.project_id,
      snapshotName,
      subscriptionName,
      labels: context.labels,
    }), writer, 'create-snapshot-before-ack', 200);

    cleanup.push(`delete snapshot ${snapshotName}`, async () => {
      await deleteSnapshotIfPresent(pubsub, {
        projectId: context.project_id,
        snapshotName,
      });
    });

    await recordExpected(pubsub.acknowledge({
      projectId: context.project_id,
      subscriptionName,
      ackIds: [firstMessage.ackId],
    }), writer, 'acknowledge-original-delivery', 200);

    await recordExpected(pubsub.seekToSnapshot({
      projectId: context.project_id,
      subscriptionName,
      snapshotName,
    }), writer, 'seek-to-snapshot', 200);

    const redeliveryPull = await pollForMessage(pubsub, {
      projectId: context.project_id,
      subscriptionName,
    });
    writer.record('pull-after-seek-redelivery', redeliveryPull, {
      expected_status: 200,
      expected_redelivery: true,
    });
    requireStatus(redeliveryPull, [200]);
    const redeliveredMessage = redeliveryPull.response.body.receivedMessages[0];
    assertMessage(redeliveredMessage, context.run_id);

    await recordExpected(pubsub.acknowledge({
      projectId: context.project_id,
      subscriptionName,
      ackIds: [redeliveredMessage.ackId],
    }), writer, 'acknowledge-redelivery', 200);
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
    const verifySnapshotDeleted = await pubsub.getSnapshot({
      projectId: context.project_id,
      snapshotName,
    }).catch(errorExchange);
    writer.record('get-snapshot-after-cleanup', verifySnapshotDeleted, {
      expected_status: 404,
    });
    if (verifySnapshotDeleted.response.status !== 404) {
      status = 'failed';
      process.exitCode = 1;
    }
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
        scenario: 'seek-redelivery',
        resources: {
          topic_name: topicName,
          subscription_name: subscriptionName,
          snapshot_name: snapshotName,
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

async function pollForMessage(pubsub, { projectId, subscriptionName, attempts = 10 }) {
  let latest = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await pubsub.pull({
      projectId,
      subscriptionName,
      maxMessages: 1,
    });
    requireStatus(latest, [200]);
    if (latest.response.body?.receivedMessages?.length) return latest;
    await delay(1000);
  }
  return latest;
}

function assertMessage(receivedMessage, runId) {
  if (!receivedMessage) {
    throw new Error('Expected Pub/Sub message delivery');
  }
  const decoded = decodePubSubMessageData(receivedMessage.message);
  if (decoded.run_id !== runId || decoded.route !== 'seek-redelivery') {
    throw new Error(`Unexpected Pub/Sub message body: ${JSON.stringify(decoded)}`);
  }
  if (receivedMessage.message.attributes?.run_id !== runId) {
    throw new Error('Pub/Sub message attributes did not preserve run_id');
  }
}

function requireStatus(exchange, statuses) {
  if (!statuses.includes(exchange.response.status)) {
    throw new Error(`${exchange.request.method} ${exchange.request.url} returned ${exchange.response.status}; expected ${statuses.join(', ')}`);
  }
}

async function deleteSnapshotIfPresent(pubsub, { projectId, snapshotName }) {
  const get = await pubsub.getSnapshot({ projectId, snapshotName });
  if (get.response.status === 404) return;
  requireStatus(get, [200]);
  const deleted = await pubsub.deleteSnapshot({ projectId, snapshotName });
  requireStatus(deleted, [200, 204]);
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

await main();
