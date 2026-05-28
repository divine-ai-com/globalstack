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
  const capture = await readLatestCapture(capture => !capture.context.scenario);
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

test('Pub/Sub official emulator replays captured advanced ordering, retry, and snapshot semantics', async () => {
  const capture = await readLatestCapture(capture => capture.context.scenario === 'advanced');
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
    const snapshotName = resources.snapshot_name;
    const orderingKey = resources.ordering_key;

    const createTopic = await pubsub.createTopic({ projectId, topicName, labels });
    assert.equal(createTopic.response.status, expectedStatus.get('create-topic'));

    const createSubscription = await pubsub.createSubscription({
      projectId,
      subscriptionName,
      topicName,
      labels,
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
    assert.equal(createSubscription.response.status, expectedStatus.get('create-advanced-subscription'));

    const getSubscription = await pubsub.getSubscription({ projectId, subscriptionName });
    assert.equal(getSubscription.response.status, expectedStatus.get('get-advanced-subscription'));
    assert.equal(getSubscription.response.body.enableMessageOrdering, true);
    assert.equal(getSubscription.response.body.retainAckedMessages, true);
    assert.equal(getSubscription.response.body.retryPolicy?.minimumBackoff, '10s');
    assert.equal(getSubscription.response.body.retryPolicy?.maximumBackoff, '60s');

    const publish = await pubsub.publish({
      projectId,
      topicName,
      messages: [1, 2].map(sequence => ({
        orderingKey,
        data: {
          run_id: capture.context.run_id,
          sequence,
          source: 'pubsub advanced capture',
        },
        attributes: {
          run_id: capture.context.run_id,
          sequence: String(sequence),
        },
      })),
    });
    assert.equal(publish.response.status, expectedStatus.get('publish-ordered-messages'));
    assert.equal(publish.response.body.messageIds.length, 2);

    const pull = await pubsub.pull({ projectId, subscriptionName, maxMessages: 2 });
    assert.equal(pull.response.status, expectedStatus.get('pull-ordered-messages'));
    const receivedMessages = pull.response.body.receivedMessages;
    assert.equal(receivedMessages.length, 2);
    for (const [index, received] of receivedMessages.entries()) {
      const expectedSequence = index + 1;
      assert.equal(received.message.orderingKey, orderingKey);
      assert.equal(decodePubSubMessageData(received.message).sequence, expectedSequence);
      assert.equal(received.message.attributes.sequence, String(expectedSequence));
    }

    const acknowledge = await pubsub.acknowledge({
      projectId,
      subscriptionName,
      ackIds: receivedMessages.map(message => message.ackId),
    });
    assert.equal(acknowledge.response.status, expectedStatus.get('acknowledge-ordered-messages'));

    const createSnapshot = await pubsub.createSnapshot({
      projectId,
      snapshotName,
      subscriptionName,
      labels,
    });
    assert.equal(createSnapshot.response.status, expectedStatus.get('create-snapshot'));

    const getSnapshot = await pubsub.getSnapshot({ projectId, snapshotName });
    assert.equal(getSnapshot.response.status, expectedStatus.get('get-snapshot'));

    const seek = await pubsub.seekToSnapshot({ projectId, subscriptionName, snapshotName });
    assert.equal(seek.response.status, expectedStatus.get('seek-subscription-to-snapshot'));

    const deleteSnapshot = await pubsub.deleteSnapshot({ projectId, snapshotName });
    assert.ok([200, 204].includes(deleteSnapshot.response.status));
    const deleteSubscription = await pubsub.deleteSubscription({ projectId, subscriptionName });
    assert.ok([200, 204].includes(deleteSubscription.response.status));
    const deleteTopic = await pubsub.deleteTopic({ projectId, topicName });
    assert.ok([200, 204].includes(deleteTopic.response.status));

    const getSnapshotAfterCleanup = await pubsub.getSnapshot({ projectId, snapshotName });
    assert.equal(getSnapshotAfterCleanup.response.status, expectedStatus.get('get-snapshot-after-cleanup'));
    const getSubscriptionAfterCleanup = await pubsub.getSubscription({ projectId, subscriptionName });
    assert.equal(getSubscriptionAfterCleanup.response.status, expectedStatus.get('get-subscription-after-cleanup'));
    const getTopicAfterCleanup = await pubsub.getTopic({ projectId, topicName });
    assert.equal(getTopicAfterCleanup.response.status, expectedStatus.get('get-topic-after-cleanup'));
  } finally {
    await emulator.stop();
  }
});

test('Pub/Sub official emulator replays captured error status and envelope semantics', async () => {
  const capture = await readLatestCapture(capture => capture.context.scenario === 'errors');
  const expected = new Map(capture.events.map(event => [event.name, event.exchange?.response]));
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
    const missingTopicName = resources.missing_topic_name;
    const missingSubscriptionName = resources.missing_subscription_name;
    const missingSnapshotName = resources.missing_snapshot_name;

    assertErrorLike(await pubsub.getTopic({ projectId, topicName: missingTopicName }), expected.get('get-missing-topic'));
    assertErrorLike(await pubsub.createSubscription({
      projectId,
      subscriptionName: missingSubscriptionName,
      topicName: missingTopicName,
      labels,
    }), expected.get('create-subscription-missing-topic'));
    assertErrorLike(await pubsub.publish({
      projectId,
      topicName: missingTopicName,
      messages: [{
        data: {
          run_id: capture.context.run_id,
          case: 'missing-topic',
        },
      }],
    }), expected.get('publish-missing-topic'));
    assertErrorLike(await pubsub.pull({
      projectId,
      subscriptionName: missingSubscriptionName,
    }), expected.get('pull-missing-subscription'));

    const createTopic = await pubsub.createTopic({ projectId, topicName, labels });
    assert.equal(createTopic.response.status, expected.get('create-topic-for-error-cases').status);
    const createSubscription = await pubsub.createSubscription({
      projectId,
      subscriptionName,
      topicName,
      labels,
    });
    assert.equal(createSubscription.response.status, expected.get('create-subscription-for-error-cases').status);

    assertErrorLike(await pubsub.createSubscription({
      projectId,
      subscriptionName,
      topicName,
      labels,
    }), expected.get('create-duplicate-subscription'));
    assertErrorLike(await pubsub.createSnapshot({
      projectId,
      snapshotName: missingSnapshotName,
      subscriptionName: missingSubscriptionName,
      labels,
    }), expected.get('create-snapshot-missing-subscription'));
    assertErrorLike(await pubsub.seekToSnapshot({
      projectId,
      subscriptionName,
      snapshotName: missingSnapshotName,
    }), expected.get('seek-missing-snapshot'));
    assertErrorLike(await pubsub.deleteSnapshot({
      projectId,
      snapshotName: missingSnapshotName,
    }), expected.get('delete-missing-snapshot'));

    const deleteSubscription = await pubsub.deleteSubscription({ projectId, subscriptionName });
    assert.ok([200, 204].includes(deleteSubscription.response.status));
    const deleteTopic = await pubsub.deleteTopic({ projectId, topicName });
    assert.ok([200, 204].includes(deleteTopic.response.status));

    assertErrorLike(await pubsub.getSubscription({ projectId, subscriptionName }), expected.get('get-subscription-after-cleanup'));
    assertErrorLike(await pubsub.getTopic({ projectId, topicName }), expected.get('get-topic-after-cleanup'));
  } finally {
    await emulator.stop();
  }
});

async function readLatestCapture(predicate) {
  const directories = await readdir(capturesRoot, { withFileTypes: true });
  const captures = await Promise.all(directories
    .filter(directory => directory.isDirectory())
    .map(directory => directory.name)
    .sort()
    .map(async directory => {
      const capturePath = join(capturesRoot, directory, 'capture.json');
      return JSON.parse(await readFile(capturePath, 'utf8'));
    }));
  const matchingCaptures = captures.filter(predicate);
  assert.ok(matchingCaptures.length > 0, 'No matching Pub/Sub capture fixtures found');
  return matchingCaptures[matchingCaptures.length - 1];
}

function assertErrorLike(actualExchange, expectedResponse) {
  assert.equal(actualExchange.response.status, expectedResponse.status);
  if (expectedResponse.body?.error?.status) {
    assert.equal(actualExchange.response.body?.error?.status, expectedResponse.body.error.status);
  }
  if (expectedResponse.body?.error?.code) {
    assert.equal(actualExchange.response.body?.error?.code, expectedResponse.body.error.code);
  }
}
