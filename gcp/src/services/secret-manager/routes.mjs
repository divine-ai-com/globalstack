import { readRequestJson, writeEmpty, writeJson } from '../../http/body.mjs';
import { googleError, writeGoogleError } from '../../errors/google-error.mjs';

export function createSecretManagerRoutes({ store }) {
  return [
    {
      method: 'POST',
      match: url => {
        const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/secrets$/);
        return match ? { projectId: decodeURIComponent(match[1]) } : null;
      },
      handle: async ({ request, response, url, match }) => {
        const secretId = url.searchParams.get('secretId');
        if (!secretId) {
          writeSecretError(response, 400, 'INVALID_ARGUMENT', 'Missing required secretId query parameter.');
          return;
        }
        const body = await readRequestJson(request);
        const secret = store.createSecret({
          projectId: match.projectId,
          secretId,
          labels: body.labels,
          replication: body.replication,
        });
        if (!secret) {
          writeSecretError(response, 409, 'ALREADY_EXISTS', `Secret ${secretId} already exists.`);
          return;
        }
        writeJson(response, 200, secret);
      },
    },
    {
      method: 'GET',
      match: url => {
        const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/secrets$/);
        return match ? { projectId: decodeURIComponent(match[1]) } : null;
      },
      handle: async ({ response, match }) => {
        writeJson(response, 200, {
          secrets: store.listSecrets(match.projectId),
        });
      },
    },
    {
      method: 'GET',
      match: matchSecretPath,
      handle: async ({ response, match }) => {
        const secret = store.getSecret(match);
        if (!secret) {
          writeSecretError(response, 404, 'NOT_FOUND', `Secret ${match.secretId} was not found.`);
          return;
        }
        writeJson(response, 200, secret);
      },
    },
    {
      method: 'DELETE',
      match: matchSecretPath,
      handle: async ({ response, match }) => {
        if (!store.deleteSecret(match)) {
          writeSecretError(response, 404, 'NOT_FOUND', `Secret ${match.secretId} was not found.`);
          return;
        }
        writeEmpty(response, 200);
      },
    },
    {
      method: 'POST',
      match: matchAddVersionPath,
      handle: async ({ request, response, match }) => {
        const body = await readRequestJson(request);
        const data = body.payload?.data;
        if (typeof data !== 'string') {
          writeSecretError(response, 400, 'INVALID_ARGUMENT', 'Secret version payload.data must be a base64 string.');
          return;
        }
        const version = store.addVersion({ ...match, data });
        if (!version) {
          writeSecretError(response, 404, 'NOT_FOUND', `Secret ${match.secretId} was not found.`);
          return;
        }
        writeJson(response, 200, version);
      },
    },
    {
      method: 'GET',
      match: matchAccessVersionPath,
      handle: async ({ response, match }) => {
        const access = store.accessVersion(match);
        if (!access) {
          writeSecretError(response, 404, 'NOT_FOUND', `Secret version ${match.versionId} was not found or is not enabled.`);
          return;
        }
        writeJson(response, 200, access);
      },
    },
    {
      method: 'POST',
      match: matchDestroyVersionPath,
      handle: async ({ response, match }) => {
        const version = store.destroyVersion(match);
        if (!version) {
          writeSecretError(response, 404, 'NOT_FOUND', `Secret version ${match.versionId} was not found.`);
          return;
        }
        writeJson(response, 200, version);
      },
    },
  ];
}

function matchSecretPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/secrets\/([^/]+)$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    secretId: decodeURIComponent(match[2]),
  } : null;
}

function matchAddVersionPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/secrets\/([^/]+):addVersion$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    secretId: decodeURIComponent(match[2]),
  } : null;
}

function matchAccessVersionPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+):access$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    secretId: decodeURIComponent(match[2]),
    versionId: decodeURIComponent(match[3]),
  } : null;
}

function matchDestroyVersionPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/secrets\/([^/]+)\/versions\/([^/]+):destroy$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    secretId: decodeURIComponent(match[2]),
    versionId: decodeURIComponent(match[3]),
  } : null;
}

function writeSecretError(response, status, reason, message) {
  writeGoogleError(response, googleError(status, reason, message));
}
