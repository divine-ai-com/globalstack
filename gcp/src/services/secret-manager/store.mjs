export class SecretManagerStore {
  constructor() {
    this.secrets = new Map();
  }

  createSecret({ projectId, secretId, labels = {}, replication = { automatic: {} } }) {
    const name = secretName(projectId, secretId);
    if (this.secrets.has(name)) return null;
    const now = new Date().toISOString();
    const secret = {
      name,
      replication,
      labels,
      createTime: now,
      versions: [],
    };
    this.secrets.set(name, secret);
    return publicSecret(secret);
  }

  getSecret({ projectId, secretId }) {
    const secret = this.secrets.get(secretName(projectId, secretId));
    return secret ? publicSecret(secret) : null;
  }

  listSecrets(projectId) {
    const prefix = `projects/${projectId}/secrets/`;
    return [...this.secrets.values()]
      .filter(secret => secret.name.startsWith(prefix))
      .map(publicSecret);
  }

  deleteSecret({ projectId, secretId }) {
    return this.secrets.delete(secretName(projectId, secretId));
  }

  addVersion({ projectId, secretId, data }) {
    const secret = this.secrets.get(secretName(projectId, secretId));
    if (!secret) return null;
    const versionNumber = secret.versions.length + 1;
    const version = {
      name: `${secret.name}/versions/${versionNumber}`,
      state: 'ENABLED',
      createTime: new Date().toISOString(),
      data,
    };
    secret.versions.push(version);
    return publicVersion(version);
  }

  accessVersion({ projectId, secretId, versionId }) {
    const version = this.resolveVersion({ projectId, secretId, versionId });
    if (!version || version.state !== 'ENABLED') return null;
    return {
      name: version.name,
      payload: {
        data: version.data,
      },
    };
  }

  getVersion({ projectId, secretId, versionId }) {
    const version = this.resolveVersion({ projectId, secretId, versionId });
    return version ? publicVersion(version) : null;
  }

  enableVersion({ projectId, secretId, versionId }) {
    const version = this.resolveVersion({ projectId, secretId, versionId });
    if (!version) return null;
    if (version.state !== 'DESTROYED') {
      version.state = 'ENABLED';
    }
    return publicVersion(version);
  }

  disableVersion({ projectId, secretId, versionId }) {
    const version = this.resolveVersion({ projectId, secretId, versionId });
    if (!version) return null;
    if (version.state !== 'DESTROYED') {
      version.state = 'DISABLED';
    }
    return publicVersion(version);
  }

  destroyVersion({ projectId, secretId, versionId }) {
    const version = this.resolveVersion({ projectId, secretId, versionId });
    if (!version) return null;
    version.state = 'DESTROYED';
    version.destroyTime = new Date().toISOString();
    version.data = '';
    return publicVersion(version);
  }

  resolveVersion({ projectId, secretId, versionId }) {
    const secret = this.secrets.get(secretName(projectId, secretId));
    if (!secret) return null;
    if (versionId === 'latest') {
      return [...secret.versions].reverse().find(version => version.state === 'ENABLED') ?? null;
    }
    return secret.versions.find(version => version.name.endsWith(`/versions/${versionId}`)) ?? null;
  }
}

export function secretName(projectId, secretId) {
  return `projects/${projectId}/secrets/${secretId}`;
}

function publicSecret(secret) {
  return {
    name: secret.name,
    replication: secret.replication,
    labels: secret.labels,
    createTime: secret.createTime,
  };
}

function publicVersion(version) {
  const result = {
    name: version.name,
    state: version.state,
    createTime: version.createTime,
  };
  if (version.destroyTime) result.destroyTime = version.destroyTime;
  return result;
}
