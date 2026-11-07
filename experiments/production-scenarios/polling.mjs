export function validationPollPath(raw, subscription) {
  if (!raw) return null;
  const url = new URL(raw, 'https://management.azure.com');
  const prefix = `/subscriptions/${subscription}/`.toLowerCase();
  const scoped = url.pathname.toLowerCase().slice(prefix.length);
  const knownOperation = /^operationresults\/[^/]+$/.test(scoped)
    || (/^providers\/microsoft\.resources\//.test(scoped) && /\/(operationresults|operationstatuses|operations)\/[^/]+$/.test(scoped));
  if (url.origin !== 'https://management.azure.com' || url.username || url.password
    || !url.pathname.toLowerCase().startsWith(prefix) || !knownOperation) {
    throw new Error('Validation poll URL is outside the authorized subscription operation scope');
  }
  return url.pathname + url.search;
}
