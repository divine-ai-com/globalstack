const defaultSecretManagerRoot = 'https://secretmanager.googleapis.com/v1';

export class SecretManagerApi {
  constructor(client, { secretManagerRoot = defaultSecretManagerRoot } = {}) {
    this.client = client;
    this.secretManagerRoot = secretManagerRoot.replace(/\/+$/g, '');
  }

  async createSecret({ projectId, secretId, labels }) {
    const url = new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets`);
    url.searchParams.set('secretId', secretId);
    return this.client.requestJson({
      method: 'POST',
      url,
      body: {
        replication: {
          automatic: {},
        },
        labels,
      },
    });
  }

  async getSecret({ projectId, secretId }) {
    return this.client.requestJson({
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}`),
    });
  }

  async listSecrets(projectId) {
    return this.client.requestJson({
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets`),
    });
  }

  async deleteSecret({ projectId, secretId }) {
    return this.client.requestJson({
      method: 'DELETE',
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}`),
      allowEmpty: true,
    });
  }

  async addVersion({ projectId, secretId, data }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}:addVersion`),
      body: {
        payload: {
          data: Buffer.from(data).toString('base64'),
        },
      },
    });
  }

  async accessVersion({ projectId, secretId, versionId = 'latest' }) {
    return this.client.requestJson({
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}/versions/${versionId}:access`),
    });
  }

  async getVersion({ projectId, secretId, versionId }) {
    return this.client.requestJson({
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}/versions/${versionId}`),
    });
  }

  async enableVersion({ projectId, secretId, versionId }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}/versions/${versionId}:enable`),
      body: {},
    });
  }

  async disableVersion({ projectId, secretId, versionId }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}/versions/${versionId}:disable`),
      body: {},
    });
  }

  async destroyVersion({ projectId, secretId, versionId }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.secretManagerRoot}/projects/${projectId}/secrets/${secretId}/versions/${versionId}:destroy`),
      body: {},
    });
  }
}

export function decodeSecretPayload(accessResponse) {
  return Buffer.from(accessResponse.payload.data, 'base64').toString('utf8');
}
