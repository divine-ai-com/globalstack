const defaultFirestoreRoot = 'https://firestore.googleapis.com/v1';

export class FirestoreApi {
  constructor(client, { firestoreRoot = defaultFirestoreRoot } = {}) {
    this.client = client;
    this.firestoreRoot = firestoreRoot.replace(/\/+$/g, '');
  }

  async createOrReplaceDocument({ projectId, collectionId, documentId, fields }) {
    return this.client.requestJson({
      method: 'PATCH',
      url: new URL(`${this.documentsRoot(projectId)}/${collectionId}/${documentId}`),
      body: {
        fields: encodeFields(fields),
      },
    });
  }

  async getDocument({ projectId, collectionId, documentId }) {
    return this.client.requestJson({
      url: new URL(`${this.documentsRoot(projectId)}/${collectionId}/${documentId}`),
    });
  }

  async listDocuments({ projectId, collectionId }) {
    return this.client.requestJson({
      url: new URL(`${this.documentsRoot(projectId)}/${collectionId}`),
    });
  }

  async deleteDocument({ projectId, collectionId, documentId }) {
    return this.client.requestJson({
      method: 'DELETE',
      url: new URL(`${this.documentsRoot(projectId)}/${collectionId}/${documentId}`),
      allowEmpty: true,
    });
  }

  documentsRoot(projectId) {
    return `${this.firestoreRoot}/projects/${projectId}/databases/(default)/documents`;
  }
}

export function encodeFields(fields) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]));
}

export function decodeFields(fields) {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, decodeValue(value)]));
}

function encodeValue(value) {
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

function decodeValue(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields);
  throw new Error(`Unsupported Firestore encoded value: ${JSON.stringify(value)}`);
}
