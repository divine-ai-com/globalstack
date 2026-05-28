import { readRequestJson, writeJson } from '../../http/body.mjs';

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
  ];
}
