import assert from 'node:assert/strict';

// Only operator-selected settings are translated. An ARM URL cannot select an
// arbitrary host service or bypass the deployed Container App's ingress policy.
export function resolveNativeContainerAppEndpoints({ resource, store, settings, names = [] }) {
  assert.ok(Array.isArray(names) && names.length <= 16 && new Set(names).size === names.length);
  const subscription = id => /^\/subscriptions\/([^/]+)\//i.exec(id ?? '')?.[1]?.toLowerCase();
  const workloadSubscription = subscription(resource.id);
  assert.ok(workloadSubscription);
  return names.map(name => {
    assert.match(name, /^[A-Z][A-Z0-9_]{0,127}$/);
    assert.ok(!name.startsWith('AZUREWEBJOBSSTORAGE'), 'Host storage transport has its own resolver');
    const url = new URL(settings[name]);
    assert.ok(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
      && url.pathname === '/' && (!url.port || url.port === '443'), 'A credential-free HTTPS service origin is required');
    assert.match(url.hostname, /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/);
    const matches = [...store.resources.values()].filter(item => item.type?.toLowerCase() === 'microsoft.app/containerapps'
      && subscription(item.id) === workloadSubscription
      && item.properties?.configuration?.ingress?.fqdn?.toLowerCase() === url.hostname);
    assert.equal(matches.length, 1, 'The endpoint must identify one deployed Container App in the workload subscription');
    return { setting: name, hostname: url.hostname, resourceId: matches[0].id };
  });
}
