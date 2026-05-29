const defaultDatastoreRoot = 'https://datastore.googleapis.com/v1';

export class DatastoreApi {
  constructor(client, { datastoreRoot = defaultDatastoreRoot } = {}) {
    this.client = client;
    this.datastoreRoot = datastoreRoot.replace(/\/+$/g, '');
  }

  async upsertEntity({ projectId, kind, name, properties }) {
    return this.commit({
      projectId,
      mutations: [{
        upsert: {
          key: entityKey({ projectId, kind, name }),
          properties: encodeProperties(properties),
        },
      }],
    });
  }

  async deleteEntity({ projectId, kind, name }) {
    return this.commit({
      projectId,
      mutations: [{
        delete: entityKey({ projectId, kind, name }),
      }],
    });
  }

  async commit({ projectId, mutations }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.datastoreRoot}/projects/${projectId}:commit`),
      body: {
        mode: 'NON_TRANSACTIONAL',
        mutations,
      },
    });
  }

  async lookup({ projectId, keys }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.datastoreRoot}/projects/${projectId}:lookup`),
      body: { keys },
    });
  }

  async lookupEntity({ projectId, kind, name }) {
    return this.lookup({
      projectId,
      keys: [entityKey({ projectId, kind, name })],
    });
  }

  async runQuery({ projectId, kind }) {
    return this.client.requestJson({
      method: 'POST',
      url: new URL(`${this.datastoreRoot}/projects/${projectId}:runQuery`),
      body: {
        query: {
          kind: [{ name: kind }],
        },
      },
    });
  }
}

export function entityKey({ projectId, kind, name }) {
  return {
    partitionId: { projectId },
    path: [{ kind, name }],
  };
}

export function encodeProperties(properties) {
  return Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, encodeValue(value)]));
}

export function decodeProperties(properties) {
  return Object.fromEntries(Object.entries(properties ?? {}).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { entityValue: { properties: encodeProperties(value) } };
  throw new Error(`Unsupported Datastore value type: ${typeof value}`);
}

function decodeValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('entityValue' in value) return decodeProperties(value.entityValue.properties);
  throw new Error(`Unsupported Datastore encoded value: ${JSON.stringify(value)}`);
}
