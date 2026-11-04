const defaultLoggingRoot = 'https://logging.googleapis.com/v2';

export class LoggingApi {
  constructor(client, { loggingRoot = defaultLoggingRoot } = {}) {
    this.client = client;
    this.loggingRoot = loggingRoot.replace(/\/+$/g, '');
  }

  async writeEntries({ entries, resource, labels }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.loggingRoot}/entries:write`),
      body: {
        entries,
        resource,
        labels,
      },
    });
  }

  async listEntries({ resourceNames, filter }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.loggingRoot}/entries:list`),
      body: {
        resourceNames,
        filter,
      },
    });
  }

  async createMetric({ projectId, metric }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.loggingRoot}/projects/${projectId}/metrics`),
      body: metric,
    });
  }

  async getMetric({ projectId, metricId }) {
    return this.client.requestJson({
      url: new URL(`${this.loggingRoot}/projects/${projectId}/metrics/${metricId}`),
    });
  }

  async listMetrics(projectId) {
    return this.client.requestJson({
      url: new URL(`${this.loggingRoot}/projects/${projectId}/metrics`),
    });
  }

  async deleteMetric({ projectId, metricId }) {
    return this.client.requestJson({
      method: 'DELETE',
      url: new URL(`${this.loggingRoot}/projects/${projectId}/metrics/${metricId}`),
    });
  }
}
