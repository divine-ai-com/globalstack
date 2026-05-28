import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { GoogleRestClient } from '../../src/google/rest-client.mjs';
import { decodePubSubMessageData, PubSubApi } from '../../src/services/pubsub/google-api.mjs';
import { startPubSubEmulator } from '../../src/services/pubsub/emulator-engine.mjs';

const capturesRoot = fileURLToPath(new URL('../../fixtures/captures/pubsub/', import.meta.url));

test('Pub/Sub official emulator replays captured topic/subscription/message lifecycle semantics', async () => {
  const capture = await readLatestCapture();
  const expectedStatus = new Map(capture.events.map(event => [event.name, event.exchange?.response.status]));
  const emulator = await startPubSubEmulator();
  const pubsub = new PubSubApi(new GoogleRestClient({
    tokenProvider: async () => 'local-test-token',
  }), {
    pubsubRoot: `http://${emulator.endpoint}/v1`,
  });

  try {
    const { project_id: projectId, labels, resources } = capture.context;
    const topicName = resources.topic_name;
    const subscriptionName = resources.subscription_name;

    const missingTopic = await pubsub.getTopic({ projectId, topicName });
    assert.equal(missingTopic.response.status, expectedStatus.get('get-missing-topic-before-create'));

    const createTopic = await pubsub.createTopic({ projectId, topicName, labels });
    assert.equal(createTopic.response.status, expectedStatus.get('create-topic'));
    assert.match(createTopic.response.body.name, new RegExp(`/topics/${topicName}$`));

    const createSubscription = await pubsub.createSubscription({
      projectId,
      subscriptionName,
      topicName,
      labels,
    });
    assert.equal(createSubscription.response.status, expectedStatus.get('create-subscription'));
    assert.match(createSubscription.response.body.name, new RegExp(`/subscriptions/${subscriptionName}$`));

    const getTopic = await pubsub.getTopic({ projectId, topicName });
    assert.equal(getTopic.response.status, expectedStatus.get('get-topic-after-create'));

    const listTopics = await pubsub.listTopics(projectId);
    assert.equal(listTopics.response.status, expectedStatus.get('list-topics-after-create'));
    assert.ok(listTopics.response.body.topics.some(topic => topic.name.endsWith(`/topics/${topicName}`)));

    const getSubscription = await pubsub.getSubscription({ projectId, subscriptionName });
    assert.equal(getSubscription.response.status, expectedStatus.get('get-subscription-after-create'));

    const listSubscriptions = await pubsub.listSubscriptions(projectId);
    assert.equal(listSubscriptions.response.status, expectedStatus.get('list-subscriptions-after-create'));
    assert.ok(listSubscriptions.response.body.subscriptions.some(subscription => subscription.name.endsWith(`/subscriptions/${subscriptionName}`)));

    const duplicateTopic = await pubsub.createTopic({ projectId, topicName, labels });
    assert.equal(duplicateTopic.response.status, expectedStatus.get('create-duplicate-topic-error'));

    const publish = await pubsub.publish({
      projectId,
      topicName,
      messages: [
        {
          data: {
            run_id: capture.context.run_id,
            purpose: 'globalstack gcp pubsub capture',
          },
          attributes: {
            run_id: capture.context.run_id,
          },
        },
      ],
    });
    assert.equal(publish.response.status, expectedStatus.get('publish-message'));
    assert.ok(publish.response.body.messageIds.length > 0);

    const pull = await pubsub.pull({ projectId, subscriptionName, maxMessages: 1 });
    assert.equal(pull.response.status, expectedStatus.get('pull-message'));
    const received = pull.response.body.receivedMessages[0];
    assert.equal(decodePubSubMessageData(received.message).run_id, capture.context.run_id);

    const acknowledge = await pubsub.acknowledge({
      projectId,
      subscriptionName,
      ackIds: [received.ackId],
    });
    assert.equal(acknowledge.response.status, expectedStatus.get('acknowledge-message'));

    const deleteSubscription = await pubsub.deleteSubscription({ projectId, subscriptionName });
    assert.ok([200, 204].includes(deleteSubscription.response.status));
    const deleteTopic = await pubsub.deleteTopic({ projectId, topicName });
    assert.ok([200, 204].includes(deleteTopic.response.status));

    const getSubscriptionAfterCleanup = await pubsub.getSubscription({ projectId, subscriptionName });
    assert.equal(getSubscriptionAfterCleanup.response.status, expectedStatus.get('get-subscription-after-cleanup'));
    const getTopicAfterCleanup = await pubsub.getTopic({ projectId, topicName });
    assert.equal(getTopicAfterCleanup.response.status, expectedStatus.get('get-topic-after-cleanup'));
  } finally {
    await emulator.stop();
  }
});

async function readLatestCapture() {
  const directories = await readdir(capturesRoot, { withFileTypes: true });
  const captureDirs = directories
    .filter(directory => directory.isDirectory())
    .map(directory => directory.name)
    .sort();
  assert.ok(captureDirs.length > 0, 'No Pub/Sub capture fixtures found');
  const capturePath = join(capturesRoot, captureDirs[captureDirs.length - 1], 'capture.json');
  return JSON.parse(await readFile(capturePath, 'utf8'));
}
