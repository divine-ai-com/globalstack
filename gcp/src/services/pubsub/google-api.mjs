const defaultPubSubRoot = 'https://pubsub.googleapis.com/v1';

export class PubSubApi {
  constructor(client, { pubsubRoot = defaultPubSubRoot } = {}) {
    this.client = client;
    this.pubsubRoot = pubsubRoot.replace(/\/+$/g, '');
  }

  async createTopic({ projectId, topicName, labels }) {
    return this.client.requestJson({
      method: 'PUT',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/topics/${topicName}`),
      body: {
        labels,
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

  async createSubscription({ projectId, subscriptionName, topicName, labels }) {
    return this.client.requestJson({
      method: 'PUT',
      url: new URL(`${this.pubsubRoot}/projects/${projectId}/subscriptions/${subscriptionName}`),
      body: {
        topic: `projects/${projectId}/topics/${topicName}`,
        labels,
        ackDeadlineSeconds: 20,
        messageRetentionDuration: '604800s',
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
}

export function decodePubSubMessageData(message) {
  return JSON.parse(Buffer.from(message.data, 'base64').toString('utf8'));
}
