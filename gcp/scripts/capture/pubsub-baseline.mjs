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
    service: 'pubsub',
    projectId: args.projectId,
    location: args.location,
  });
  const topicName = createResourceName({
    prefix: 'gst-capture-topic',
    runId: context.run_id,
    maxLength: 255,
  });
  const subscriptionName = createResourceName({
    prefix: 'gst-capture-sub',
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
    const getMissingTopic = await pubsub.getTopic({
      projectId: context.project_id,
      topicName,
    });
    writer.record('get-missing-topic-before-create', getMissingTopic, {
      expected_status: 404,
    });
    requireStatus(getMissingTopic, [404]);

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
    });
    writer.record('create-subscription', createSubscription, { expected_status: 200 });
    requireStatus(createSubscription, [200]);

    cleanup.push(`delete subscription ${subscriptionName}`, async () => {
      await deleteSubscriptionIfPresent(pubsub, {
        projectId: context.project_id,
        subscriptionName,
      });
    });

    writer.record('get-topic-after-create', await pubsub.getTopic({
      projectId: context.project_id,
      topicName,
    }), {
      expected_status: 200,
    });
    writer.record('list-topics-after-create', await pubsub.listTopics(context.project_id), {
      expected_status: 200,
      expected_topic_name: topicName,
    });
    writer.record('get-subscription-after-create', await pubsub.getSubscription({
      projectId: context.project_id,
      subscriptionName,
    }), {
      expected_status: 200,
    });
    writer.record('list-subscriptions-after-create', await pubsub.listSubscriptions(context.project_id), {
      expected_status: 200,
      expected_subscription_name: subscriptionName,
    });

    const duplicateTopic = await pubsub.createTopic({
      projectId: context.project_id,
      topicName,
      labels: context.labels,
    });
    writer.record('create-duplicate-topic-error', duplicateTopic, {
      expected_status: 409,
    });
    requireStatus(duplicateTopic, [409]);

    const publish = await pubsub.publish({
      projectId: context.project_id,
      topicName,
      messages: [
        {
          data: {
            run_id: context.run_id,
            purpose: 'globalstack gcp pubsub capture',
          },
          attributes: {
            run_id: context.run_id,
          },
        },
      ],
    });
    writer.record('publish-message', publish, { expected_status: 200 });
    requireStatus(publish, [200]);

    const pull = await pollForMessage(pubsub, {
      projectId: context.project_id,
      subscriptionName,
    });
    writer.record('pull-message', pull, { expected_status: 200 });
    requireStatus(pull, [200]);
    const received = pull.response.body?.receivedMessages?.[0];
    const body = decodePubSubMessageData(received.message);
    if (body.run_id !== context.run_id) {
      throw new Error(`Pulled run_id ${body.run_id}; expected ${context.run_id}`);
    }

    const acknowledge = await pubsub.acknowledge({
      projectId: context.project_id,
      subscriptionName,
      ackIds: [received.ackId],
    });
    writer.record('acknowledge-message', acknowledge, { expected_status: 200 });
    requireStatus(acknowledge, [200]);
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
        resources: {
          topic_name: topicName,
          subscription_name: subscriptionName,
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
