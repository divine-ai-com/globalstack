import { readRequestJson, readRequestText, writeEmpty, writeJson } from '../../http/body.mjs';
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
      match: matchBucketStorageLayoutPath,
      handle: async ({ response, match }) => {
        const layout = store.getBucketStorageLayout(match.bucketName);
        if (!layout) {
          writeStorageError(response, 404, 'notFound', missingBucketMessage());
          return;
        }
        writeJson(response, 200, layout);
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
        const upload = await readObjectUpload(request, url);
        const objectName = upload.objectName;
        const object = await store.insertObject({
          bucketName: match.bucketName,
          objectName,
          content: upload.content,
          contentType: upload.contentType,
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

async function readObjectUpload(request, url) {
  const contentType = request.headers['content-type'] ?? 'application/octet-stream';
  if (contentType.startsWith('multipart/')) {
    const text = await readRequestText(request);
    return parseMultipartUpload({
      text,
      contentType,
      fallbackObjectName: url.searchParams.get('name'),
    });
  }
  if (contentType.includes('application/json')) {
    const body = await readRequestJson(request);
    return {
      objectName: url.searchParams.get('name') ?? body.name,
      content: body,
      contentType,
    };
  }
  return {
    objectName: url.searchParams.get('name'),
    content: await readRequestText(request),
    contentType,
  };
}

function parseMultipartUpload({ text, contentType, fallbackObjectName }) {
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|'([^']+)'|([^;]+))/i);
  if (!boundaryMatch) {
    return {
      objectName: fallbackObjectName,
      content: text,
      contentType,
    };
  }
  const boundary = boundaryMatch[1] ?? boundaryMatch[2] ?? boundaryMatch[3];
  const parts = text
    .split(`--${boundary}`)
    .map(cleanMultipartSegment)
    .filter(part => part && part !== '--')
    .map(parseMultipartPart);
  const metadataPart = parts.find(part => part.contentType.includes('application/json'));
  const contentPart = parts.find(part => part !== metadataPart) ?? metadataPart;
  const metadata = metadataPart ? JSON.parse(metadataPart.body) : {};
  return {
    objectName: fallbackObjectName ?? metadata.name,
    content: contentPart?.body ?? '',
    contentType: metadata.contentType ?? contentPart?.contentType ?? 'application/octet-stream',
  };
}

function cleanMultipartSegment(segment) {
  if (!segment) return '';
  if (segment.startsWith('--')) return '--';
  return segment
    .replace(/^\r?\n/, '')
    .replace(/\r?\n$/, '');
}

function parseMultipartPart(part) {
  const separator = part.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const [rawHeaders, ...bodyParts] = part.split(separator);
  const headers = {};
  for (const line of rawHeaders.split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index < 0) continue;
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return {
    headers,
    contentType: headers['content-type'] ?? 'application/octet-stream',
    body: bodyParts.join(separator),
  };
}

function matchBucketPath(url) {
  const match = url.pathname.match(/^\/storage\/v1\/b\/([^/]+)$/);
  return match ? { bucketName: decodeURIComponent(match[1]) } : null;
}

function matchBucketStorageLayoutPath(url) {
  const match = url.pathname.match(/^\/storage\/v1\/b\/([^/]+)\/storageLayout$/);
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
