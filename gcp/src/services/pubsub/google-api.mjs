const defaultPubSubRoot = 'https://pubsub.googleapis.com/v1';

export class PubSubApi {
  constructor(client, { pubsubRoot = defaultPubSubRoot } = {}) {
    this.client = client;
    this.pubsubRoot = pubsubRoot.replace(/\/+$/g, '');
  }

  async createTopic({ projectId, topicName, labels, body = {} }) {
    return this.client.requestJson({
      method: 'PUT',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/topics/${topicName}`),
      body: {
        labels,
        ...body,
      },
    });
  }

  async getTopic({ projectId, topicName }) {
    return this.client.requestJson({
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/topics/${topicName}`),
    });
  }

  async listTopics(projectId) {
    return this.client.requestJson({
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/topics`),
    });
  }

  async deleteTopic({ projectId, topicName }) {
    return this.client.requestJson({
      method: 'DELETE',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/topics/${topicName}`),
      allowEmpty: true,
    });
  }

  async createSubscription({ projectId, subscriptionName, topicName, labels, body = {} }) {
    return this.client.requestJson({
      method: 'PUT',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}`),
      body: {
        topic: `projects/${projectId}/topics/${topicName}`,
        labels,
        ackDeadlineSeconds: 20,
        messageRetentionDuration: '604800s',
        ...body,
      },
    });
  }

  async getSubscription({ projectId, subscriptionName }) {
    return this.client.requestJson({
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}`),
    });
  }

  async listSubscriptions(projectId) {
    return this.client.requestJson({
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions`),
    });
  }

  async deleteSubscription({ projectId, subscriptionName }) {
    return this.client.requestJson({
      method: 'DELETE',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}`),
      allowEmpty: true,
    });
  }

  async publish({ projectId, topicName, messages }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/topics/${topicName}:publish`),
      body: {
        messages: messages.map(message => ({
          data: Buffer.from(JSON.stringify(message.data)).toString('base64'),
          attributes: message.attributes ?? {},
          orderingKey: message.orderingKey,
        })),
      },
    });
  }

  async pull({ projectId, subscriptionName, maxMessages = 1 }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}:pull`),
      body: {
        maxMessages,
      },
    });
  }

  async acknowledge({ projectId, subscriptionName, ackIds }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}:acknowledge`),
      body: {
        ackIds,
      },
      allowEmpty: true,
    });
  }

  async modifyAckDeadline({ projectId, subscriptionName, ackIds, ackDeadlineSeconds }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}:modifyAckDeadline`),
      body: {
        ackIds,
        ackDeadlineSeconds,
      },
      allowEmpty: true,
    });
  }

  async createSnapshot({ projectId, snapshotName, subscriptionName, labels }) {
    return this.client.requestJson({
      method: 'PUT',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/snapshots/${snapshotName}`),
      body: {
        subscription: `projects/${projectId}/subscriptions/${subscriptionName}`,
        labels,
      },
    });
  }

  async getSnapshot({ projectId, snapshotName }) {
    return this.client.requestJson({
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/snapshots/${snapshotName}`),
    });
  }

  async listSnapshots(projectId) {
    return this.client.requestJson({
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/snapshots`),
    });
  }

  async deleteSnapshot({ projectId, snapshotName }) {
    return this.client.requestJson({
      method: 'DELETE',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/snapshots/${snapshotName}`),
      allowEmpty: true,
    });
  }

  async seekToSnapshot({ projectId, subscriptionName, snapshotName }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}:seek`),
      body: {
        snapshot: `projects/${projectId}/snapshots/${snapshotName}`,
      },
    });
  }
}

export function decodePubSubMessageData(message) {
  return JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
}
