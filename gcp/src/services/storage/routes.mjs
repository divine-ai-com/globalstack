import { readRequestJson, writeEmpty, writeJson } from '../../http/body.mjs';
import {
  bucketNotEmptyMessage,
  duplicateBucketMessage,
  missingBucketMessage,
  missingObjectMessage,
  writeStorageError,
} from './errors.mjs';

export function createStorageRoutes({ store }) {
  return [
    {
      method: 'POST',
      match: url => url.pathname === '/storage/v1/b' ? {} : null,
      handle: async ({ request, response, url }) => {
        const projectId = url.searchParams.get('project');
        const body = await readRequestJson(request);
        const bucket = await store.createBucket({
          projectId,
          name: body.name,
          location: body.location,
          labels: body.labels,
          versioning: body.versioning,
          iamConfiguration: body.iamConfiguration,
        });
        if (!bucket) {
          writeStorageError(response, 409, 'conflict', duplicateBucketMessage());
          return;
        }
        writeJson(response, 200, bucket);
      },
    },
    {
      method: 'GET',
      match: url => url.pathname === '/storage/v1/b' ? {} : null,
      handle: async ({ response, url }) => {
        const projectId = url.searchParams.get('project');
        const items = store.listBuckets(projectId);
        writeJson(response, 200, {
          kind: 'storage#buckets',
          items,
        });
      },
    },
    {
      method: 'GET',
      match: matchBucketPath,
      handle: async ({ response, match }) => {
        const bucket = store.getBucket(match.bucketName);
        if (!bucket) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        writeJson(response, 200, bucket);
      },
    },
    {
      method: 'PATCH',
      match: matchBucketPath,
      handle: async ({ request, response, match }) => {
        const body = await readRequestJson(request);
        const bucket = await store.patchBucket({
          name: match.bucketName,
          labels: body.labels ?? {},
        });
        if (!bucket) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        writeJson(response, 200, bucket);
      },
    },
    {
      method: 'DELETE',
      match: matchBucketPath,
      handle: async ({ response, match }) => {
        const result = await store.deleteBucket(match.bucketName);
        if (!result.found) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        if (result.notEmpty) {
          writeStorageError(response, 409, 'conflict', bucketNotEmptyMessage());
          return;
        }
        writeEmpty(response, 204);
      },
    },
    {
      method: 'POST',
      match: matchObjectUploadPath,
      handle: async ({ request, response, url, match }) => {
        const objectName = url.searchParams.get('name');
        const body = await readRequestJson(request);
        const object = await store.insertObject({
          bucketName: match.bucketName,
          objectName,
          content: body,
          contentType: request.headers['content-type'] ?? 'application/octet-stream',
        });
        if (!object) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        writeJson(response, 200, object);
      },
    },
    {
      method: 'GET',
      match: matchObjectCollectionPath,
      handle: async ({ response, match }) => {
        const objects = store.listObjects(match.bucketName);
        if (!objects) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        writeJson(response, 200, {
          kind: 'storage#objects',
          items: objects,
        });
      },
    },
    {
      method: 'GET',
      match: matchObjectPath,
      handle: async ({ response, match }) => {
        const result = store.getObject(match);
        if (!result.bucketFound) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        if (!result.object) {
          writeStorageError(response, 404, 'notFound', missingObjectMessage());
          return;
        }
        writeJson(response, 200, result.object);
      },
    },
    {
      method: 'DELETE',
      match: matchObjectPath,
      handle: async ({ response, match }) => {
        const result = await store.deleteObject(match);
        if (!result.bucketFound) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        if (!result.deleted) {
          writeStorageError(response, 404, 'notFound', missingObjectMessage());
          return;
        }
        writeEmpty(response, 204);
      },
    },
  ];
}

function matchBucketPath(url) {
  const match = url.pathname.match(/^\/storage\/v1\/b\/([^/]+)$/);
  return match ? { bucketName: decodeURIComponent(match[1]) } : null;
}

function matchObjectCollectionPath(url) {
  const match = url.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/o$/);
  return match ? { bucketName: decodeURIComponent(match[1]) } : null;
}

function matchObjectPath(url) {
  const match = url.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/o\/(.+)$/);
  return match ? {
    bucketName: decodeURIComponent(match[1]),
    objectName: decodeURIComponent(match[2]),
  } : null;
}

function matchObjectUploadPath(url) {
  const match = url.pathname.match(/^\/upload\/storage\/v1\/b\/([^/]+)\/o$/);
  return match ? { bucketName: decodeURIComponent(match[1]) } : null;
}
