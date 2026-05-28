import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRunId } from '../../src/conformance/run-context.mjs';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { decodePubSubMessageData, PubSubApi } from '../../src/services/pubsub/google-api.mjs';
import { startPubSubEmulator } from '../../src/services/pubsub/emulator-engine.mjs';

test('Pub/Sub official emulator exposes dead-letter policy config but not bounded redrive fidelity', {
  timeout: 20000,
}, async () => {
  const runId = createRunId('pubsub-dlq-gap');
  const projectId = 'globalstack-local';
  const topicName = `gst-${runId}`.slice(0, 255).replace(/-+$/g, '');
  const deadLetterTopicName = `gst-dlq-${runId}`.slice(0, 255).replace(/-+$/g, '');
  const subscriptionName = `gst-sub-${runId}`.slice(0, 255).replace(/-+$/g, '');
  const deadLetterSubscriptionName = `gst-dlq-sub-${runId}`.slice(0, 255).replace(/-+$/g, '');
  const emulator = await startPubSubEmulator();
  const pubsub = new PubSubApi(new GoogleRestClient({
    tokenProvider: async () => 'local-test-token',
    timeoutMs: 5000,
  }), {
    pubsubRoot: `http://${emulator.endpoint}/v1`,
  });

  try {
    assert.equal((await pubsub.createTopic({ projectId, topicName, labels: labels(runId) })).response.status, 200);
    assert.equal((await pubsub.createTopic({ projectId, topicName: deadLetterTopicName, labels: labels(runId) })).response.status, 200);
    const createSubscription = await pubsub.createSubscription({
      projectId,
      subscriptionName,
      topicName,
      labels: labels(runId),
      body: {
        ackDeadlineSeconds: 10,
        deadLetterPolicy: {
          deadLetterTopic: `projects/${projectId}/topics/${deadLetterTopicName}`,
          maxDeliveryAttempts: 5,
        },
      },
    });
    assert.equal(createSubscription.response.status, 200);
    assert.equal(
      createSubscription.response.body.deadLetterPolicy.deadLetterTopic,
      `projects/${projectId}/topics/${deadLetterTopicName}`
    );
    assert.equal(createSubscription.response.body.deadLetterPolicy.maxDeliveryAttempts, 5);
    assert.equal((await pubsub.createSubscription({
      projectId,
      subscriptionName: deadLetterSubscriptionName,
      topicName: deadLetterTopicName,
      labels: labels(runId),
    })).response.status, 200);

    assert.equal((await pubsub.publish({
      projectId,
      topicName,
      messages: [{
        data: {
          run_id: runId,
          route: 'dead-letter',
        },
        attributes: {
          run_id: runId,
        },
      }],
    })).response.status, 200);

    const firstDelivery = await pollForMessage(pubsub, {
      projectId,
      subscriptionName,
      attempts: 4,
    });
    assert.equal(decodePubSubMessageData(firstDelivery.message).run_id, runId);
    const nack = await pubsub.modifyAckDeadline({
      projectId,
      subscriptionName,
      ackIds: [firstDelivery.ackId],
      ackDeadlineSeconds: 0,
    });
    assert.equal(nack.response.status, 200);

    const deadLetterDelivery = await pollForMessage(pubsub, {
      projectId,
      subscriptionName: deadLetterSubscriptionName,
      attempts: 4,
      allowEmpty: true,
    });
    assert.equal(deadLetterDelivery, null);
  } finally {
    await pubsub.deleteSubscription({ projectId, subscriptionName }).catch(() => {});
    await pubsub.deleteSubscription({ projectId, subscriptionName: deadLetterSubscriptionName }).catch(() => {});
    await pubsub.deleteTopic({ projectId, topicName }).catch(() => {});
    await pubsub.deleteTopic({ projectId, topicName: deadLetterTopicName }).catch(() => {});
    await emulator.stop();
  }
});

async function pollForMessage(pubsub, { projectId, subscriptionName, attempts = 10, allowEmpty = false }) {
  let latest = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      latest = await pubsub.pull({ projectId, subscriptionName, maxMessages: 1 });
    } catch (error) {
      if (allowEmpty && error.name === 'TimeoutError') return null;
      throw error;
    }
    assert.equal(latest.response.status, 200);
    const message = latest.response.body.receivedMessages?.[0];
    if (message) return message;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (allowEmpty) return null;
  throw new Error(`No Pub/Sub message received from ${subscriptionName}; latest=${JSON.stringify(latest?.response.body)}`);
}

function labels(runId) {
  return {
    purpose: 'globalstack-conformance',
    owner: 'globalstack',
    run_id: runId,
  };
}
