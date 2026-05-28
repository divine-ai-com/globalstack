const defaultTasksRoot = 'https://cloudtasks.googleapis.com/v2';

export class CloudTasksApi {
  constructor(client, { tasksRoot = defaultTasksRoot } = {}) {
    this.client = client;
    this.tasksRoot = tasksRoot.replace(/\/+$/g, '');
  }

  async createQueue({ projectId, location, queueId, rateLimits, retryConfig }) {
    const url = new URL(`${this.tasksRoot}/projects/${projectId}/locations/${location}/queues`);
    url.searchParams.set('queueId', queueId);
    return this.client.requestJson({
      method: 'POST',
      url,
      body: {
        rateLimits,
        retryConfig,
      },
    });
  }

  async getQueue({ projectId, location, queueId }) {
    return this.client.requestJson({
      url: new URL(`${this.tasksRoot}/projects/${projectId}/locations/${location}/queues/${queueId}`),
    });
  }

  async createHttpTask({ projectId, location, queueId, taskId, url, body, headers = {}, httpMethod = 'POST' }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.tasksRoot}/projects/${projectId}/locations/${location}/queues/${queueId}/tasks`),
      body: {
        task: {
          name: `projects/${projectId}/locations/${location}/queues/${queueId}/tasks/${taskId}`,
          httpRequest: {
            url,
            httpMethod,
            headers,
            body: Buffer.from(body).toString('base64'),
          },
        },
      },
    });
  }

  async getTask({ projectId, location, queueId, taskId }) {
    return this.client.requestJson({
      url: new URL(`${this.tasksRoot}/projects/${projectId}/locations/${location}/queues/${queueId}/tasks/${taskId}`),
    });
  }

  async runTask({ projectId, location, queueId, taskId }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.tasksRoot}/projects/${projectId}/locations/${location}/queues/${queueId}/tasks/${taskId}:run`),
      body: {},
    });
  }
}
