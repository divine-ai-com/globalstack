export function validationPollPath(raw, subscription) {
  if (!raw) return null;
  const url = new URL(raw, 'https://management.azure.com');
  if (url.origin !== 'https://management.azure.com' || url.username || url.password
    || !url.pathname.toLowerCase().startsWith(`/subscriptions/${subscription}/`.toLowerCase())
    || !/\/providers\/microsoft\.resources\//i.test(url.pathname)
    || !/\/(operationresults|operationstatuses|operations)\//i.test(url.pathname)) {
    throw new Error('Validation poll URL is outside the authorized subscription operation scope');
  }
  return url.pathname + url.search;
}
