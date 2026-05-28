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
}
