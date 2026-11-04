const sensitiveName = /authorization|cookie|secret|password|token|connection.?string|account.?key|access.?key|shared.?key|subscription.?id|tenant.?id|client.?id|principal.?id|object.?id/i;

export function sanitizeText(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer <redacted>')
    .replace(/(\/subscriptions\/)[^/\s?"']+/gi, '$1<subscription-id>')
    .replace(/(\/tenants\/)[^/\s?"']+/gi, '$1<tenant-id>')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1<redacted>@')
    .replace(/([?&](?:sig|signature|token|access_token|client_secret|key|code)=)[^&#\s"']*/gi, '$1<redacted>')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>');
}

export function sanitizeCapture(value) {
  if (typeof value === 'string') return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeCapture);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
      key,
      sensitiveName.test(key) || key.toLowerCase().includes('key') ? '<redacted>' : sanitizeCapture(nested),
    ]));
  }
  return value;
}
