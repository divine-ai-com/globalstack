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
    try {
      for (const routeHandler of routeHandlers) {
        if (routeHandler.method !== request.method) continue;
        const match = routeHandler.match(url);
        if (!match) continue;
        await routeHandler.handle({ request, response, url, match });
        return;
      }
    } catch (error) {
      writeGoogleError(response, {
        status: 500,
        body: {
          error: {
            code: 500,
            message: error.message,
            status: 'INTERNAL',
          },
        },
      });
      return;
    }
    writeGoogleError(response, unsupportedApiError(request.method, url.pathname));
  };
}
