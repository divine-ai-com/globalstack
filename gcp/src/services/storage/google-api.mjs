const defaultStorageRoot = 'https://storage.googleapis.com/storage/v1';
const defaultUploadRoot = 'https://storage.googleapis.com/upload/storage/v1';

export class StorageApi {
  constructor(client, { storageRoot = defaultStorageRoot, uploadRoot = defaultUploadRoot } = {}) {
    this.client = client;
    this.storageRoot = storageRoot;
    this.uploadRoot = uploadRoot;
  }

  async createBucket({ projectId, bucketName, location, labels }) {
    const url = new URL(`${this.storageRoot}/b`);
    url.searchParams.set('project', projectId);
    return this.client.requestJson({
      method: 'POST',
      url,
      body: {
        name: bucketName,
        location,
        labels,
        versioning: {
          enabled: true,
        },
        iamConfiguration: {
          uniformBucketLevelAccess: {
            enabled: true,
          },
        },
      },
    });
  }

  async getBucket(bucketName) {
    return this.client.requestJson({
      url: new URL(`${this.storageRoot}/b/${encodeURIComponent(bucketName)}`),
    });
  }

  async listBuckets(projectId) {
    const url = new URL(`${this.storageRoot}/b`);
    url.searchParams.set('project', projectId);
    url.searchParams.set('projection', 'full');
    return this.client.requestJson({ url });
  }

  async patchBucketLabels({ bucketName, labels }) {
    return this.client.requestJson({
      method: 'PATCH',
      url: new URL(`${this.storageRoot}/b/${encodeURIComponent(bucketName)}`),
      body: { labels },
    });
  }

  async insertObject({ bucketName, objectName, content, contentType = 'application/json' }) {
    const url = new URL(`${this.uploadRoot}/b/${encodeURIComponent(bucketName)}/o`);
    url.searchParams.set('uploadType', 'media');
    url.searchParams.set('name', objectName);
    return this.client.requestJson({
      method: 'POST',
      url,
      body: content,
      headers: {
        'content-type': contentType,
      },
    });
  }

  async getObject({ bucketName, objectName }) {
    return this.client.requestJson({
      url: new URL(`${this.storageRoot}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`),
    });
  }

  async listObjects(bucketName) {
    return this.client.requestJson({
      url: new URL(`${this.storageRoot}/b/${encodeURIComponent(bucketName)}/o`),
    });
  }

  async deleteObject({ bucketName, objectName, generation }) {
    const url = new URL(`${this.storageRoot}/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(objectName)}`);
    if (generation) url.searchParams.set('generation', generation);
    return this.client.requestJson({
      method: 'DELETE',
      url,
      allowEmpty: true,
    });
  }

  async deleteBucket(bucketName) {
    return this.client.requestJson({
      method: 'DELETE',
      url: new URL(`${this.storageRoot}/b/${encodeURIComponent(bucketName)}`),
      allowEmpty: true,
    });
  }
}
