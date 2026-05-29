import { readRequestJson, writeJson } from '../../http/body.mjs';
import { googleError, writeGoogleError } from '../../errors/google-error.mjs';

export function createLoggingRoutes({ store }) {
  return [
    {
      method: 'POST',
      match: url => url.pathname === '/v2/entries:write' ? {} : null,
      handle: async ({ request, response }) => {
        const body = await readRequestJson(request);
        store.writeEntries({
          entries: body.entries ?? [],
          resource: body.resource,
          labels: body.labels,
        });
        writeJson(response, 200, {});
      },
    },
    {
      method: 'POST',
      match: url => url.pathname === '/v2/entries:list' ? {} : null,
      handle: async ({ request, response }) => {
        const body = await readRequestJson(request);
        const entries = store.listEntries({
          resourceNames: body.resourceNames ?? [],
          filter: body.filter,
        });
        writeJson(response, 200, { entries });
      },
    },
    {
      method: 'POST',
      match: url => {
        const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/metrics$/);
        return match ? { projectId: decodeURIComponent(match[1]) } : null;
      },
      handle: async ({ request, response, match }) => {
        const body = await readRequestJson(request);
        const metric = store.createMetric({ projectId: match.projectId, metric: body });
        if (!metric) {
          writeLoggingError(response, 409, 'ALREADY_EXISTS', `Log metric ${body.name} already exists.`);
          return;
        }
        writeJson(response, 200, metric);
      },
    },
    {
      method: 'GET',
      match: url => {
        const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/metrics$/);
        return match ? { projectId: decodeURIComponent(match[1]) } : null;
      },
      handle: async ({ response, match }) => {
        writeJson(response, 200, {
          metrics: store.listMetrics(match.projectId),
        });
      },
    },
    {
      method: 'GET',
      match: matchMetricPath,
      handle: async ({ response, match }) => {
        const metric = store.getMetric(match);
        if (!metric) {
          writeLoggingError(response, 404, 'NOT_FOUND', `Log metric ${match.metricId} was not found.`);
          return;
        }
        writeJson(response, 200, metric);
      },
    },
    {
      method: 'DELETE',
      match: matchMetricPath,
      handle: async ({ response, match }) => {
        if (!store.deleteMetric(match)) {
          writeLoggingError(response, 404, 'NOT_FOUND', `Log metric ${match.metricId} was not found.`);
          return;
        }
        writeJson(response, 200, {});
      },
    },
  ];
}

function matchMetricPath(url) {
  const match = url.pathname.match(/^\/v2\/projects\/([^/]+)\/metrics\/([^/]+)$/);
  return match ? {
    projectId: decodeURIComponent(match[1]),
    metricId: decodeURIComponent(match[2]),
  } : null;
}

function writeLoggingError(response, status, reason, message) {
  writeGoogleError(response, googleError(status, reason, message));
}
