import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';

async function readBodyText(req) {
  let text = '';
  for await (const chunk of req) text += chunk;
  return text;
}

function sendJson(res, status, body, headers = {}) {
  const payload = body === undefined ? '' : JSON.stringify(body, null, 2);
  res.writeHead(status, {
    ...(payload ? { 'content-type': 'application/json' } : {}),
    'content-length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

function sendError(res, status, code, message, headers = {}) {
  sendJson(res, status, {
    errors: [
      {
        code,
        message,
      },
    ],
  }, headers);
}

function registryFromHost(host) {
  const hostname = String(host ?? '').split(':')[0];
  if (!hostname.endsWith('.azurecr.io')) return null;
  return hostname.split('.')[0] ?? null;
}

function bearerChallenge(loginServer) {
  return `Bearer realm="https://${loginServer}/oauth2/token",service="${loginServer}"`;
}

function requireAuth(req, loginServer) {
  const auth = String(req.headers.authorization ?? '');
  if (!auth.match(/^Bearer\s+.+/i) && !auth.match(/^Basic\s+.+/i)) {
    return {
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Authentication is required to access this registry.',
      headers: { 'www-authenticate': bearerChallenge(loginServer) },
    };
  }
  return null;
}

function digestFor(text) {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __invalidJson: true };
  }
}

function isValidManifest(body) {
  return Boolean(
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && !body.__invalidJson
    && (Number.isInteger(body.schemaVersion) || typeof body.mediaType === 'string'),
  );
}

function tokenResponse(registryName, scope) {
  return {
    access_token: `globalstack-acr-token-${registryName}`,
    refresh_token: `globalstack-acr-refresh-${registryName}`,
    expires_in: 3600,
    issued_at: new Date().toISOString(),
    scope: scope ?? null,
  };
}

export class ContainerRegistryRouter {
  constructor() {
    this.registries = new Map();
  }

  registerRegistry({ registryName, loginServer }) {
    const name = String(registryName);
    this.registries.set(name.toLowerCase(), {
      registryName: name,
      loginServer: loginServer ?? `${name}.azurecr.io`,
      repositories: new Map(),
    });
  }

  unregisterRegistry(registryName) {
    this.registries.delete(String(registryName).toLowerCase());
  }

  putImage({ registryName, repository, tag, digest, manifest = {} }) {
    const registry = this.registries.get(String(registryName).toLowerCase());
    if (!registry) throw new Error(`Container Registry ${registryName} is not registered in the local router.`);
    const repoKey = String(repository).toLowerCase();
    const existing = registry.repositories.get(repoKey) ?? {
      name: repository,
      manifests: new Map(),
      tags: new Map(),
    };
    const manifestText = JSON.stringify(manifest);
    const computedDigest = digest ?? digestFor(manifestText);
    existing.manifests.set(computedDigest, {
      digest: computedDigest,
      manifest,
      pushedAt: new Date().toISOString(),
    });
    if (tag) existing.tags.set(String(tag), computedDigest);
    registry.repositories.set(repoKey, existing);
    return existing.manifests.get(computedDigest);
  }

  registryForRequest(req, url) {
    const hostRegistry = registryFromHost(req.headers.host);
    if (hostRegistry) return this.registries.get(hostRegistry.toLowerCase()) ?? null;
    const inspectionMatch = url.pathname.match(/^\/_globalstack\/acr\/registries\/([^/]+)/);
    if (inspectionMatch) return this.registries.get(decodeURIComponent(inspectionMatch[1]).toLowerCase()) ?? null;
    return null;
  }

  handler() {
    return async (req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const method = req.method.toUpperCase();

      if (method === 'GET' && url.pathname.startsWith('/_globalstack/acr/registries/')) {
        const [, , , , registryName, collection] = url.pathname.split('/');
        const registry = this.registries.get(decodeURIComponent(registryName ?? '').toLowerCase());
        if (!registry) return sendError(res, 404, 'RegistryNotFound', `The registry '${registryName}' was not found.`);
        if (collection !== 'repositories') return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Container Registry inspection route handles ${url.pathname}.`);
        return sendJson(res, 200, {
          value: [...registry.repositories.values()].map(repo => ({
            name: repo.name,
            tags: [...repo.tags.keys()],
            digests: [...repo.manifests.keys()],
          })),
        });
      }

      const registryName = registryFromHost(req.headers.host);
      if (!registryName) return sendError(res, 404, 'RegistryNotFound', 'The Container Registry host was not found.');
      const registry = this.registries.get(registryName.toLowerCase());
      if (!registry) return sendError(res, 404, 'RegistryNotFound', `The registry '${registryName}' was not found.`);

      if (url.pathname === '/oauth2/token') {
        if (!['GET', 'POST'].includes(method)) return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'ACR token endpoint supports GET and POST.');
        return sendJson(res, 200, tokenResponse(registry.registryName, url.searchParams.get('scope')));
      }

      const authError = requireAuth(req, registry.loginServer);
      if (authError) return sendError(res, authError.status, authError.code, authError.message, authError.headers);

      if (url.pathname === '/v2/' || url.pathname === '/v2') {
        if (method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Docker Registry /v2/ supports GET in this local surface.');
        return sendJson(res, 200, {}, { 'docker-distribution-api-version': 'registry/2.0' });
      }

      if (url.pathname === '/acr/v1/_catalog') {
        if (method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'ACR catalog supports GET.');
        return sendJson(res, 200, {
          repositories: [...registry.repositories.values()].map(repo => repo.name).sort(),
        });
      }

      const acrTagsMatch = url.pathname.match(/^\/acr\/v1\/(.+)\/_tags$/);
      if (acrTagsMatch) {
        if (method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'ACR tag listing supports GET.');
        const repository = decodeURIComponent(acrTagsMatch[1]);
        const repo = registry.repositories.get(repository.toLowerCase());
        if (!repo) return sendError(res, 404, 'RepositoryNotFound', `The repository '${repository}' was not found.`);
        return sendJson(res, 200, {
          name: repo.name,
          tags: [...repo.tags.keys()].map(tag => ({ name: tag })),
        });
      }

      const dockerSegments = url.pathname.split('/').filter(Boolean).map(segment => decodeURIComponent(segment));
      if (dockerSegments[0] !== 'v2') {
        return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Container Registry data-plane route handles ${url.pathname}.`);
      }
      const manifestMarker = dockerSegments.indexOf('manifests');
      const tagsMarker = dockerSegments.indexOf('tags');
      if (manifestMarker > 1) {
        const repository = dockerSegments.slice(1, manifestMarker).join('/');
        const reference = dockerSegments[manifestMarker + 1];
        if (!repository || !reference) return sendError(res, 404, 'ManifestNotFound', 'The manifest route is incomplete.');
        const repoKey = repository.toLowerCase();

        if (method === 'PUT') {
          const text = await readBodyText(req);
          const body = parseJson(text);
          if (!isValidManifest(body)) {
            return sendError(res, 400, 'MANIFEST_INVALID', 'The manifest body must be valid JSON with schemaVersion or mediaType.');
          }
          const manifest = this.putImage({
            registryName: registry.registryName,
            repository,
            tag: reference.startsWith('sha256:') ? null : reference,
            digest: reference.startsWith('sha256:') ? reference : null,
            manifest: body,
          });
          return sendJson(res, 201, undefined, {
            location: `/v2/${repository}/manifests/${manifest.digest}`,
            'docker-content-digest': manifest.digest,
          });
        }

        const repo = registry.repositories.get(repoKey);
        if (!repo) return sendError(res, 404, 'RepositoryNotFound', `The repository '${repository}' was not found.`);
        const digest = reference.startsWith('sha256:') ? reference : repo.tags.get(reference);
        const manifest = digest ? repo.manifests.get(digest) : null;
        if (!manifest) return sendError(res, 404, 'ManifestNotFound', `The manifest '${reference}' was not found.`);

        if (method === 'GET' || method === 'HEAD') {
          if (method === 'HEAD') {
            res.writeHead(200, {
              'docker-content-digest': manifest.digest,
              'content-length': '0',
            });
            return res.end();
          }
          return sendJson(res, 200, manifest.manifest, { 'docker-content-digest': manifest.digest });
        }
        if (method === 'DELETE') {
          repo.manifests.delete(manifest.digest);
          for (const [tag, tagDigest] of repo.tags.entries()) {
            if (tagDigest === manifest.digest) repo.tags.delete(tag);
          }
          if (repo.manifests.size === 0 && repo.tags.size === 0) registry.repositories.delete(repoKey);
          return sendJson(res, 202);
        }
        return sendError(res, 405, 'METHOD_NOT_ALLOWED', `Manifest route does not support ${method}.`);
      }

      if (tagsMarker > 1 && dockerSegments[tagsMarker + 1] === 'list') {
        if (method !== 'GET') return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Docker tags list supports GET.');
        const repository = dockerSegments.slice(1, tagsMarker).join('/');
        const repo = registry.repositories.get(repository.toLowerCase());
        if (!repo) return sendError(res, 404, 'RepositoryNotFound', `The repository '${repository}' was not found.`);
        return sendJson(res, 200, {
          name: repo.name,
          tags: [...repo.tags.keys()].sort(),
        });
      }

      return sendError(res, 404, 'GlobalStackRouteNotImplemented', `No Container Registry data-plane route handles ${url.pathname}.`);
    };
  }
}

export function createContainerRegistryRouter() {
  return new ContainerRegistryRouter();
}

export function createContainerRegistryRouterServer(router = createContainerRegistryRouter()) {
  return createServer(router.handler());
}
