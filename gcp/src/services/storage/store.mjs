import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const defaultDataRoot = process.env.GLOBALSTACK_GCP_STORAGE_DIR ?? '/tmp/globalstack-gcp/storage';

export class StorageStore {
  constructor({ root = defaultDataRoot, clock = () => new Date() } = {}) {
    this.root = root;
    this.clock = clock;
    this.buckets = new Map();
  }

  async createBucket({ projectId, name, location, labels = {}, versioning = {}, iamConfiguration = {} }) {
    if (this.buckets.has(name)) {
      return null;
    }
    const now = this.clock().toISOString();
    const bucket = {
      kind: 'storage#bucket',
      id: name,
      name,
      projectNumber: projectId,
      metageneration: '1',
      location,
      storageClass: 'STANDARD',
      timeCreated: now,
      updated: now,
      versioning: {
        enabled: Boolean(versioning.enabled),
      },
      labels: { ...labels },
      iamConfiguration: {
        bucketPolicyOnly: {
          enabled: false,
        },
        uniformBucketLevelAccess: {
          enabled: Boolean(iamConfiguration.uniformBucketLevelAccess?.enabled),
        },
        publicAccessPrevention: 'inherited',
      },
      locationType: location?.includes('-') ? 'region' : 'multi-region',
      rpo: 'DEFAULT',
      objects: new Map(),
    };
    this.buckets.set(name, bucket);
    await mkdir(this.#bucketPath(name), { recursive: true });
    return cloneBucket(bucket);
  }

  getBucket(name) {
    const bucket = this.buckets.get(name);
    return bucket ? cloneBucket(bucket) : null;
  }

  listBuckets(projectId) {
    return [...this.buckets.values()]
      .filter(bucket => bucket.projectNumber === projectId)
      .map(bucket => cloneBucket(bucket));
  }

  async patchBucket({ name, labels }) {
    const bucket = this.buckets.get(name);
    if (!bucket) return null;
    bucket.labels = { ...labels };
    bucket.metageneration = String(Number(bucket.metageneration) + 1);
    bucket.updated = this.clock().toISOString();
    return cloneBucket(bucket);
  }

  async deleteBucket(name) {
    const bucket = this.buckets.get(name);
    if (!bucket) return { found: false, deleted: false, notEmpty: false };
    if (bucket.objects.size > 0) {
      return { found: true, deleted: false, notEmpty: true };
    }
    this.buckets.delete(name);
    await rm(this.#bucketPath(name), { recursive: true, force: true });
    return { found: true, deleted: true, notEmpty: false };
  }

  async insertObject({ bucketName, objectName, content, contentType }) {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) return null;
    const now = this.clock().toISOString();
    const generation = String(Date.now() * 1000);
    const text = typeof content === 'string' ? content : JSON.stringify(content);
    const object = {
      kind: 'storage#object',
      id: `${bucketName}/${objectName}/${generation}`,
      name: objectName,
      bucket: bucketName,
      generation,
      metageneration: '1',
      contentType,
      storageClass: 'STANDARD',
      size: String(Buffer.byteLength(text)),
      timeCreated: now,
      updated: now,
      timeStorageClassUpdated: now,
      timeFinalized: now,
    };
    bucket.objects.set(objectName, object);
    bucket.updated = now;
    await mkdir(this.#objectDirectory(bucketName, objectName), { recursive: true });
    await writeFile(this.#objectContentPath(bucketName, objectName), text);
    await writeFile(this.#objectMetadataPath(bucketName, objectName), `${JSON.stringify(object, null, 2)}\n`);
    return cloneObject(object);
  }

  getObject({ bucketName, objectName }) {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) return { bucketFound: false, object: null };
    const object = bucket.objects.get(objectName);
    return {
      bucketFound: true,
      object: object ? cloneObject(object) : null,
    };
  }

  listObjects(bucketName) {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) return null;
    return [...bucket.objects.values()].map(object => cloneObject(object));
  }

  async deleteObject({ bucketName, objectName }) {
    const bucket = this.buckets.get(bucketName);
    if (!bucket) return { bucketFound: false, deleted: false };
    const existed = bucket.objects.delete(objectName);
    if (existed) {
      bucket.updated = this.clock().toISOString();
      await rm(this.#objectBasePath(bucketName, objectName), { recursive: true, force: true });
    }
    return { bucketFound: true, deleted: existed };
  }

  async getObjectContent({ bucketName, objectName }) {
    return readFile(this.#objectContentPath(bucketName, objectName), 'utf8');
  }

  #bucketPath(bucketName) {
    return join(this.root, 'buckets', encodePathSegment(bucketName));
  }

  #objectBasePath(bucketName, objectName) {
    return join(this.#bucketPath(bucketName), 'objects', encodePathSegment(objectName));
  }

  #objectDirectory(bucketName, objectName) {
    return this.#objectBasePath(bucketName, objectName);
  }

  #objectContentPath(bucketName, objectName) {
    return join(this.#objectBasePath(bucketName, objectName), 'content');
  }

  #objectMetadataPath(bucketName, objectName) {
    return join(this.#objectBasePath(bucketName, objectName), 'metadata.json');
  }
}

function cloneBucket(bucket) {
  const { objects, ...metadata } = bucket;
  return structuredClone(metadata);
}

function cloneObject(object) {
  return structuredClone(object);
}

function encodePathSegment(value) {
  return Buffer.from(value).toString('base64url');
}
