import { isDeepStrictEqual } from 'node:util';

export function deploymentBody(template, context, revision) {
  return { location: context.location, properties: { mode: 'Incremental', template, parameters: Object.fromEntries(Object.entries({ groupName: context.group, location: context.location, runId: context.runId, expires: context.expires, revision }).map(([key, value]) => [key, { value }])) } };
}

export function additionalPolicy(context, template) {
  const subscription = `/subscriptions/${context.subscription}`.toLowerCase();
  const deployment = `${subscription}/providers/microsoft.resources/deployments/${context.group}`;
  const allowedBodies = template ? ['one', 'two'].map(revision => deploymentBody(template, context, revision)) : [];
  return (method, url, body) => {
    if (url.origin !== 'https://management.azure.com' || url.username || url.password) return false;
    const path = url.pathname.toLowerCase();
    if (method === 'GET' && path === `${subscription}/resourcegroups/${context.group}/resources`) return true;
    if (method === 'GET' && [subscription, `${subscription}/providers`, `${subscription}/providers/microsoft.resources`].includes(path)) return true;
    if (!template || path !== deployment) return false;
    if (['GET', 'DELETE'].includes(method)) return true;
    // The frozen template and all resolved parameters must match an approved body.
    return method === 'PUT' && allowedBodies.some(expected => isDeepStrictEqual(body, expected));
  };
}
