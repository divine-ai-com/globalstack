function fqdnKey(fqdn) {
  return String(fqdn ?? '').replace(/\.$/, '').toLowerCase();
}

export class ServiceDiscoveryRegistry {
  constructor() {
    this.records = new Map();
    this.apps = new Map();
  }

  registerPrivateDnsRecord({ fqdn, type = 'A', values = [], ttl = 300 }) {
    this.records.set(fqdnKey(fqdn), {
      fqdn: fqdnKey(fqdn),
      type,
      values,
      ttl,
    });
  }

  resolvePrivateDns(fqdn) {
    const record = this.records.get(fqdnKey(fqdn));
    if (!record) {
      return { status: 'NXDOMAIN', fqdn: fqdnKey(fqdn), values: [] };
    }
    return { status: 'NOERROR', ...record };
  }

  registerContainerApp({ appName, environmentName, fqdn, targetPort, external = false }) {
    this.apps.set(fqdnKey(fqdn), {
      appName,
      environmentName,
      fqdn: fqdnKey(fqdn),
      targetPort,
      external,
    });
  }

  resolveContainerApp(fqdn) {
    const app = this.apps.get(fqdnKey(fqdn));
    if (!app) {
      return { status: 404, code: 'ServiceNotFound', fqdn: fqdnKey(fqdn) };
    }
    return { status: 200, body: app };
  }

  unregisterContainerApp(fqdn) {
    this.apps.delete(fqdnKey(fqdn));
  }
}

export function createServiceDiscoveryRegistry() {
  return new ServiceDiscoveryRegistry();
}
