import { readRequestJson, writeJson } from '../../http/body.mjs';
import { googleError, writeGoogleError } from '../../errors/google-error.mjs';

export function createKmsRoutes({ store }) {
  return [
    {
      method: 'POST',
      match: url => {
        const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings$/);
        return match ? { projectId: decodeURIComponent(match[1]), location: decodeURIComponent(match[2]) } : null;
      },
      handle: async ({ response, url, match }) => {
        const keyRingId = url.searchParams.get('keyRingId');
        if (!keyRingId) {
          writeKmsError(response, 400, 'INVALID_ARGUMENT', 'Missing required keyRingId query parameter.');
          return;
        }
        const keyRing = store.createKeyRing({ ...match, keyRingId });
        if (!keyRing) {
          writeKmsError(response, 409, 'ALREADY_EXISTS', `Key ring ${keyRingId} already exists.`);
          return;
        }
        writeJson(response, 200, keyRing);
      },
    },
    {
      method: 'GET',
      match: matchKeyRingPath,
      handle: async ({ response, match }) => {
        const keyRing = store.getKeyRing(match);
        if (!keyRing) {
          writeKmsError(response, 404, 'NOT_FOUND', `Key ring ${match.keyRingId} was not found.`);
          return;
        }
        writeJson(response, 200, keyRing);
      },
    },
    {
      method: 'POST',
      match: url => {
        const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys$/);
        return match ? {
          projectId: decodeURIComponent(match[1]),
          location: decodeURIComponent(match[2]),
          keyRingId: decodeURIComponent(match[3]),
        } : null;
      },
      handle: async ({ request, response, url, match }) => {
        const cryptoKeyId = url.searchParams.get('cryptoKeyId');
        if (!cryptoKeyId) {
          writeKmsError(response, 400, 'INVALID_ARGUMENT', 'Missing required cryptoKeyId query parameter.');
          return;
        }
        const body = await readRequestJson(request);
        const result = store.createCryptoKey({
          ...match,
          cryptoKeyId,
          purpose: body.purpose,
          labels: body.labels,
        });
        if (result.missingKeyRing) {
          writeKmsError(response, 404, 'NOT_FOUND', `Key ring ${match.keyRingId} was not found.`);
          return;
        }
        if (result.duplicate) {
          writeKmsError(response, 409, 'ALREADY_EXISTS', `Crypto key ${cryptoKeyId} already exists.`);
          return;
        }
        writeJson(response, 200, result.cryptoKey);
      },
    },
    {
      method: 'GET',
      match: matchCryptoKeyPath,
      handle: async ({ response, match }) => {
        const cryptoKey = store.getCryptoKey(match);
        if (!cryptoKey) {
          writeKmsError(response, 404, 'NOT_FOUND', `Crypto key ${match.cryptoKeyId} was not found.`);
          return;
        }
        writeJson(response, 200, cryptoKey);
      },
    },
    {
      method: 'POST',
      match: matchEncryptPath,
      handle: async ({ request, response, match }) => {
        const body = await readRequestJson(request);
        const encrypted = store.encrypt({ ...match, ...body });
        if (!encrypted) {
          writeKmsError(response, 404, 'NOT_FOUND', `Crypto key ${match.cryptoKeyId} was not found.`);
          return;
        }
        writeJson(response, 200, encrypted);
      },
    },
    {
      method: 'POST',
      match: matchDecryptPath,
      handle: async ({ request, response, match }) => {
        const body = await readRequestJson(request);
        try {
          const decrypted = store.decrypt({ ...match, ...body });
          if (!decrypted) {
            writeKmsError(response, 404, 'NOT_FOUND', `Crypto key ${match.cryptoKeyId} was not found.`);
            return;
          }
          writeJson(response, 200, decrypted);
        } catch {
          writeKmsError(response, 400, 'INVALID_ARGUMENT', 'Decryption failed.');
        }
      },
    },
    {
      method: 'GET',
      match: matchCryptoKeyVersionsPath,
      handle: async ({ response, match }) => {
        const cryptoKeyVersions = store.listCryptoKeyVersions(match);
        if (!cryptoKeyVersions) {
          writeKmsError(response, 404, 'NOT_FOUND', `Crypto key ${match.cryptoKeyId} was not found.`);
          return;
        }
        writeJson(response, 200, { cryptoKeyVersions });
      },
    },
    {
      method: 'POST',
      match: matchDestroyCryptoKeyVersionPath,
      handle: async ({ response, match }) => {
        const cryptoKeyVersion = store.destroyCryptoKeyVersion(match);
        if (!cryptoKeyVersion) {
          writeKmsError(response, 404, 'NOT_FOUND', `Crypto key version ${match.versionId} was not found.`);
          return;
        }
        writeJson(response, 200, cryptoKeyVersion);
      },
    },
  ];
}

function matchKeyRingPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    keyRingId: decodeURIComponent(match[3]),
  } : null;
}

function matchCryptoKeyPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+)$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    keyRingId: decodeURIComponent(match[3]),
    cryptoKeyId: decodeURIComponent(match[4]),
  } : null;
}

function matchCryptoKeyVersionsPath(url) {
  const match = normalizePath(url.pathname).match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+)\/cryptoKeyVersions$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    keyRingId: decodeURIComponent(match[3]),
    cryptoKeyId: decodeURIComponent(match[4]),
  } : null;
}

function matchDestroyCryptoKeyVersionPath(url) {
  const match = normalizePath(url.pathname).match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+)\/cryptoKeyVersions\/([^/]+):destroy$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    keyRingId: decodeURIComponent(match[3]),
    cryptoKeyId: decodeURIComponent(match[4]),
    versionId: decodeURIComponent(match[5]),
  } : null;
}

function matchEncryptPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+):encrypt$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    keyRingId: decodeURIComponent(match[3]),
    cryptoKeyId: decodeURIComponent(match[4]),
  } : null;
}

function matchDecryptPath(url) {
  const match = url.pathname.match(/^\/v1\/projects\/([^/]+)\/locations\/([^/]+)\/keyRings\/([^/]+)\/cryptoKeys\/([^/]+):decrypt$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    location: decodeURIComponent(match[2]),
    keyRingId: decodeURIComponent(match[3]),
    cryptoKeyId: decodeURIComponent(match[4]),
  } : null;
}

function writeKmsError(response, status, reason, message) {
  writeGoogleError(response, googleError(status, reason, message));
}

function normalizePath(pathname) {
  return pathname.replace(/^\/v1\/v1\//, '/v1/');
}
