import { sanitize } from '../paired-lifecycle/transport.mjs';

// Event Grid encodes its queue payload. Redact identifiers inside that JSON as
// well as the surrounding HTTP exchange before a recording can be published.
export function redactQueueEvents(value, replacements) {
  if (typeof value === 'string') return value.replace(/<MessageText>([A-Za-z0-9+/=]+)<\/MessageText>/g, (match, encoded) => {
    try {
      const event = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      if (!event?.eventType && !(Array.isArray(event) && event.every(item => item?.eventType))) return match;
      return `<MessageText>${Buffer.from(JSON.stringify(sanitize(event, replacements))).toString('base64')}</MessageText>`;
    } catch { return match; }
  });
  if (Array.isArray(value)) return value.map(item => redactQueueEvents(item, replacements));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactQueueEvents(child, replacements)]));
  return value;
}
