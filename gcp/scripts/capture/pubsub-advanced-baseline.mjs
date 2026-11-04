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
    service: 'pubsub-advanced',
    projectId: args.projectId,
    location: args.location,
  });
  const topicName = createResourceName({
    prefix: 'gst-capture-adv-topic',
    runId: context.run_id,
    maxLength: 255,
  });
  const subscriptionName = createResourceName({
    prefix: 'gst-capture-adv-sub',
    runId: context.run_id,
    maxLength: 255,
  });
  const snapshotName = createResourceName({
    prefix: 'gst-capture-adv-snap',
    runId: context.run_id,
    maxLength: 255,
  });
  const orderingKey = `ordering-${context.run_id}`;
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
    ordering_key: orderingKey,
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
    const createTopic = await pubsub.createTopic({
      projectId: context.project_id,
      topicName,
      labels: context.labels,
    });
    writer.record('create-topic', createTopic, { expected_status: 200 });
    requireStatus(createTopic, [200]);

    cleanup.push(`delete topic ${topicName}`, async () => {
      await deleteTopicIfPresent(pubsub, {
        projectId: context.project_id,
        topicName,
      });
    });

    const createSubscription = await pubsub.createSubscription({
      projectId: context.project_id,
      subscriptionName,
      topicName,
      labels: context.labels,
      body: {
        ackDeadlineSeconds: 30,
        retainAckedMessages: true,
        enableMessageOrdering: true,
        retryPolicy: {
          minimumBackoff: '10s',
          maximumBackoff: '60s',
        },
      },
    });
    writer.record('create-advanced-subscription', createSubscription, {
      expected_status: 200,
      expected_enable_message_ordering: true,
      expected_retain_acked_messages: true,
      expected_retry_policy: {
        minimumBackoff: '10s',
        maximumBackoff: '60s',
      },
    });
    requireStatus(createSubscription, [200]);

    cleanup.push(`delete subscription ${subscriptionName}`, async () => {
      await deleteSubscriptionIfPresent(pubsub, {
        projectId: context.project_id,
        subscriptionName,
      });
    });

    const getSubscription = await pubsub.getSubscription({
      projectId: context.project_id,
      subscriptionName,
    });
    writer.record('get-advanced-subscription', getSubscription, { expected_status: 200 });
    requireStatus(getSubscription, [200]);
    assertSubscriptionPolicy(getSubscription.response.body);

    const publish = await pubsub.publish({
      projectId: context.project_id,
      topicName,
      messages: [1, 2].map(sequence => ({
        orderingKey,
        data: {
          run_id: context.run_id,
          sequence,
          source: 'pubsub advanced capture',
        },
        attributes: {
          run_id: context.run_id,
          sequence: String(sequence),
        },
      })),
    });
    writer.record('publish-ordered-messages', publish, {
      expected_status: 200,
      expected_message_count: 2,
    });
    requireStatus(publish, [200]);

    const pull = await pollForMessages(pubsub, {
      projectId: context.project_id,
      subscriptionName,
      maxMessages: 2,
      expectedMessages: 2,
    });
    writer.record('pull-ordered-messages', pull, {
      expected_status: 200,
      expected_message_count: 2,
      expected_ordering_key: orderingKey,
    });
    requireStatus(pull, [200]);
    const receivedMessages = pull.response.body?.receivedMessages ?? [];
    assertOrderedMessages(receivedMessages, { runId: context.run_id, orderingKey });

    const acknowledge = await pubsub.acknowledge({
      projectId: context.project_id,
      subscriptionName,
      ackIds: receivedMessages.map(message => message.ackId),
    });
    writer.record('acknowledge-ordered-messages', acknowledge, { expected_status: 200 });
    requireStatus(acknowledge, [200]);

    const createSnapshot = await pubsub.createSnapshot({
      projectId: context.project_id,
      snapshotName,
      subscriptionName,
      labels: context.labels,
    });
    writer.record('create-snapshot', createSnapshot, { expected_status: 200 });
    requireStatus(createSnapshot, [200]);

    cleanup.push(`delete snapshot ${snapshotName}`, async () => {
      await deleteSnapshotIfPresent(pubsub, {
        projectId: context.project_id,
        snapshotName,
      });
    });

    const getSnapshot = await pubsub.getSnapshot({
      projectId: context.project_id,
      snapshotName,
    });
    writer.record('get-snapshot', getSnapshot, { expected_status: 200 });
    requireStatus(getSnapshot, [200]);

    const seek = await pubsub.seekToSnapshot({
      projectId: context.project_id,
      subscriptionName,
      snapshotName,
    });
    writer.record('seek-subscription-to-snapshot', seek, { expected_status: 200 });
    requireStatus(seek, [200]);
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
        scenario: 'advanced',
        resources: {
          topic_name: topicName,
          subscription_name: subscriptionName,
          snapshot_name: snapshotName,
          ordering_key: orderingKey,
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

async function pollForMessages(pubsub, { projectId, subscriptionName, maxMessages, expectedMessages, attempts = 10 }) {
  let latest = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latest = await pubsub.pull({
      projectId,
      subscriptionName,
      maxMessages,
    });
    requireStatus(latest, [200]);
    if ((latest.response.body?.receivedMessages ?? []).length >= expectedMessages) return latest;
    await delay(1000);
  }
  return latest;
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

function assertSubscriptionPolicy(subscription) {
  if (subscription.enableMessageOrdering !== true) {
    throw new Error('Advanced subscription did not preserve enableMessageOrdering');
  }
  if (subscription.retainAckedMessages !== true) {
    throw new Error('Advanced subscription did not preserve retainAckedMessages');
  }
  if (subscription.retryPolicy?.minimumBackoff !== '10s' || subscription.retryPolicy?.maximumBackoff !== '60s') {
    throw new Error('Advanced subscription did not preserve retry policy');
  }
}

function assertOrderedMessages(receivedMessages, { runId, orderingKey }) {
  if (receivedMessages.length < 2) {
    throw new Error(`Expected 2 ordered messages; received ${receivedMessages.length}`);
  }
  const decoded = receivedMessages.map(received => ({
    data: decodePubSubMessageData(received.message),
    orderingKey: received.message.orderingKey,
    attributes: received.message.attributes ?? {},
  }));
  for (const [index, message] of decoded.entries()) {
    const expectedSequence = index + 1;
    if (message.data.run_id !== runId || message.data.sequence !== expectedSequence) {
      throw new Error(`Ordered message ${index} did not preserve payload sequence ${expectedSequence}`);
    }
    if (message.orderingKey !== orderingKey) {
      throw new Error(`Ordered message ${index} did not preserve ordering key`);
    }
    if (message.attributes.run_id !== runId || message.attributes.sequence !== String(expectedSequence)) {
      throw new Error(`Ordered message ${index} did not preserve attributes`);
    }
  }
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
