import { writeGoogleError, unsupportedApiError } from '../errors/google-error.mjs';

export function createRouter({ services = [] } = {}) {
  const routeHandlers = [];
  for (const service of services) {
    for (const route of service.routes?.() ?? []) {
      routeHandlers.push({
        service: service.name,
        ...route,
      });
    }
  }

  return async function route(request, response) {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    for (const routeHandler of routeHandlers) {
      if (routeHandler.method !== request.method) continue;
      const match = routeHandler.match(url);
      if (!match) continue;
      await routeHandler.handle({ request, response, url, match });
      return;
    }
    writeGoogleError(response, unsupportedApiError(request.method, url.pathname));
  };
}
