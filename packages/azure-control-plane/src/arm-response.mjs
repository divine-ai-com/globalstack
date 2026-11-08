// Keep write-only credentials available to local backends without returning
// them in ARM resource bodies or inventory collections.
export function armResponseReplacer(_key, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.id !== 'string' || !value.id.startsWith('/subscriptions/')
    || String(value.type).toLowerCase() !== 'microsoft.dbforpostgresql/flexibleservers'
    || !value.properties || typeof value.properties !== 'object' || Array.isArray(value.properties)
    || !Object.hasOwn(value.properties, 'administratorLoginPassword')) return value;
  const { administratorLoginPassword: _credential, ...properties } = value.properties;
  return { ...value, properties };
}
