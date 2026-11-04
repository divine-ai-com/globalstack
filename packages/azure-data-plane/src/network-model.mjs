function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeId(value) {
  return String(value ?? '').trim().toLowerCase();
}

function ipToInt(ipAddress) {
  return String(ipAddress)
    .split('.')
    .map(Number)
    .reduce((accumulator, octet) => ((accumulator << 8) >>> 0) + octet, 0) >>> 0;
}

function intToIp(value) {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

function parsePrimaryPrefix(prefixes = []) {
  return prefixes.find(prefix => typeof prefix === 'string' && prefix.includes('/')) ?? null;
}

function prefixRange(prefix) {
  if (!prefix) return null;
  const [ipAddress, maskText] = String(prefix).split('/');
  const maskLength = Number(maskText);
  if (!Number.isInteger(maskLength) || maskLength < 0 || maskLength > 32) return null;
  const base = ipToInt(ipAddress);
  const mask = maskLength === 0 ? 0 : (0xffffffff << (32 - maskLength)) >>> 0;
  const network = base & mask;
  const broadcast = network | (~mask >>> 0);
  return { network, broadcast };
}

function subnetCandidatePrefix(subnet = {}) {
  return parsePrimaryPrefix([
    subnet.addressPrefix,
    ...(Array.isArray(subnet.addressPrefixes) ? subnet.addressPrefixes : []),
  ].filter(Boolean));
}

function allocatePrivateIp(prefix, usedIps) {
  const range = prefixRange(prefix);
  if (!range) return null;
  const start = range.network + 4;
  const end = range.broadcast - 1;
  for (let candidate = start; candidate <= end; candidate += 1) {
    const ipAddress = intToIp(candidate >>> 0);
    if (!usedIps.has(ipAddress)) return ipAddress;
  }
  return null;
}

function privateEndpointConnections(properties = {}) {
  return deepClone(properties.privateLinkServiceConnections ?? []);
}

export class NetworkModel {
  constructor() {
    this.virtualNetworks = new Map();
    this.subnets = new Map();
    this.privateEndpoints = new Map();
  }

  registerVirtualNetwork(resource) {
    const id = normalizeId(resource?.id);
    if (!id) return;
    const properties = resource?.properties ?? {};
    const vnet = {
      id,
      name: resource?.name ?? '',
      location: resource?.location ?? 'global',
      addressPrefixes: deepClone(properties.addressSpace?.addressPrefixes ?? []),
      subnets: [],
    };
    this.virtualNetworks.set(id, vnet);
    for (const subnet of properties.subnets ?? []) {
      const subnetName = String(subnet?.name ?? '').trim();
      if (!subnetName) continue;
      this.registerSubnet({
        id: `${resource.id}/subnets/${subnetName}`,
        name: subnetName,
        location: resource?.location ?? 'global',
        properties: subnet.properties ?? {},
      });
    }
  }

  unregisterVirtualNetwork(resource) {
    const id = normalizeId(resource?.id ?? resource);
    if (!id) return;
    this.virtualNetworks.delete(id);
    for (const [subnetId, subnet] of this.subnets.entries()) {
      if (subnet.vnetId === id) {
        this.subnets.delete(subnetId);
      }
    }
  }

  registerSubnet(resource) {
    const id = normalizeId(resource?.id);
    if (!id) return;
    const parentId = id.split('/subnets/')[0];
    const properties = resource?.properties ?? {};
    const subnet = {
      id,
      name: resource?.name ?? id.split('/').at(-1) ?? '',
      vnetId: parentId,
      location: resource?.location ?? 'global',
      addressPrefix: subnetCandidatePrefix(properties),
      properties: deepClone(properties),
    };
    this.subnets.set(id, subnet);
    const vnet = this.virtualNetworks.get(parentId);
    if (vnet) {
      vnet.subnets = [...new Set([...vnet.subnets.filter(item => item !== id), id])];
    }
  }

  unregisterSubnet(resource) {
    const id = normalizeId(resource?.id ?? resource);
    if (!id) return;
    const subnet = this.subnets.get(id);
    if (subnet) {
      const vnet = this.virtualNetworks.get(subnet.vnetId);
      if (vnet) {
        vnet.subnets = vnet.subnets.filter(item => item !== id);
      }
    }
    this.subnets.delete(id);
  }

  registerPrivateEndpoint(resource) {
    const id = normalizeId(resource?.id);
    if (!id) return null;
    const subnetId = normalizeId(resource?.properties?.subnet?.id);
    const subnet = this.subnets.get(subnetId);
    const usedIps = new Set(
      [...this.privateEndpoints.values()]
        .filter(endpoint => endpoint.subnetId === subnetId)
        .map(endpoint => endpoint.ipAddress)
        .filter(Boolean),
    );
    const requestedIp = resource?.properties?.customNetworkInterfaceName ? null : null;
    const ipAddress = requestedIp ?? allocatePrivateIp(subnet?.addressPrefix, usedIps);
    const endpoint = {
      id,
      name: resource?.name ?? '',
      subnetId,
      location: resource?.location ?? 'global',
      ipAddress,
      privateLinkServiceConnections: privateEndpointConnections(resource?.properties ?? {}),
    };
    this.privateEndpoints.set(id, endpoint);
    return deepClone(endpoint);
  }

  unregisterPrivateEndpoint(resource) {
    const id = normalizeId(resource?.id ?? resource);
    if (!id) return;
    this.privateEndpoints.delete(id);
  }

  getPrivateEndpoint(resource) {
    const id = normalizeId(resource?.id ?? resource);
    if (!id) return null;
    const endpoint = this.privateEndpoints.get(id)
      ?? [...this.privateEndpoints.values()].find(item => item.name.toLowerCase() === id);
    return endpoint ? deepClone(endpoint) : null;
  }
}

export function createNetworkModel() {
  return new NetworkModel();
}
