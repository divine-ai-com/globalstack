// These cases change configuration, never the emulator's implementation or expected payload.
export const flowStudyCases = [
  ['vault-enrichment', 'wrong-config-reference', 'reference'],
  ['vault-enrichment', 'missing-config-reference', 'reference'],
  ['vault-enrichment', 'wrong-destination', 'routing'],
  ['vault-enrichment', 'wrong-course', 'payload'],
  ['vault-enrichment', 'duplicate-delivery', 'multiplicity'],
  ['vault-enrichment', 'extra-destination', 'multiplicity'],
  ['event-routing', 'deleted-subscription', 'routing'],
  ['event-routing', 'wrong-destination', 'routing'],
  ['event-routing', 'wrong-course', 'payload'],
  ['event-routing', 'duplicate-delivery', 'multiplicity'],
  ['event-routing', 'extra-destination', 'multiplicity'],
  ['event-routing', 'wrong-version-type', 'schema'],
].map(([scenario, mutation, faultClass]) => ({ id: `${scenario}/${mutation}`, scenario, mutation, faultClass }));
