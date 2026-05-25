function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeZoneName(zoneName) {
  return String(zoneName ?? '').trim().replace(/\.$/, '').toLowerCase();
}

function normalizeRecordName(recordName) {
  const normalized = String(recordName ?? '').trim().replace(/\.$/, '').toLowerCase();
  return normalized === '' ? '@' : normalized;
}

function normalizeFqdn(fqdn) {
  return String(fqdn ?? '').trim().replace(/\.$/, '').toLowerCase();
}

function normalizeVnetId(vnetId) {
  return String(vnetId ?? '').trim().toLowerCase();
}

function recordFqdn(zoneName, recordName) {
  const normalizedZoneName = normalizeZoneName(zoneName);
  const normalizedRecordName = normalizeRecordName(recordName);
  if (!normalizedZoneName) return '';
  if (normalizedRecordName === '@') return normalizedZoneName;
  return `${normalizedRecordName}.${normalizedZoneName}`;
}

function recordKey({ privateZone, zoneName, recordType, recordName }) {
  return [
    privateZone ? 'private' : 'public',
    normalizeZoneName(zoneName),
    String(recordType ?? '').toUpperCase(),
    normalizeRecordName(recordName),
  ].join(':');
}

function zoneKey({ privateZone, zoneName }) {
  return `${privateZone ? 'private' : 'public'}:${normalizeZoneName(zoneName)}`;
}

function parseRecordValues(recordType, properties = {}) {
  switch (String(recordType ?? '').toUpperCase()) {
    case 'A':
      return (properties.ARecords ?? properties.aRecords ?? [])
        .map(record => record?.ipv4Address)
        .filter(Boolean);
    case 'AAAA':
      return (properties.AAAARecords ?? properties.aaaaRecords ?? [])
        .map(record => record?.ipv6Address)
        .filter(Boolean);
    case 'CAA':
      return (properties.CAARecords ?? properties.caaRecords ?? [])
        .filter(Boolean)
        .map(record => deepClone(record));
    case 'CNAME':
      return properties.CNAMERecord?.cname
        ? [properties.CNAMERecord.cname]
        : properties.cnameRecord?.cname
          ? [properties.cnameRecord.cname]
          : [];
    case 'MX':
      return (properties.MXRecords ?? properties.mxRecords ?? [])
        .filter(Boolean)
        .map(record => deepClone(record));
    case 'NS':
      return (properties.NSRecords ?? properties.nsRecords ?? [])
        .map(record => record?.nsdname)
        .filter(Boolean);
    case 'PTR':
      return (properties.PTRRecords ?? properties.ptrRecords ?? [])
        .map(record => record?.ptrdname)
        .filter(Boolean);
    case 'SOA':
      return properties.SOARecord || properties.soaRecord
        ? [deepClone(properties.SOARecord ?? properties.soaRecord)]
        : [];
    case 'SRV':
      return (properties.SRVRecords ?? properties.srvRecords ?? [])
        .filter(Boolean)
        .map(record => deepClone(record));
    case 'TXT':
      return (properties.TXTRecords ?? properties.txtRecords ?? [])
        .flatMap(record => Array.isArray(record?.value) ? record.value : [])
        .filter(Boolean);
    default:
      return [];
  }
}

export class DnsRegistry {
  constructor() {
    this.zones = new Map();
    this.records = new Map();
    this.privateZoneLinks = new Map();
  }

  registerZone({ zoneName, privateZone = false }) {
    const key = zoneKey({ zoneName, privateZone });
    this.zones.set(key, {
      zoneName: normalizeZoneName(zoneName),
      privateZone,
    });
  }

  unregisterZone({ zoneName, privateZone = false }) {
    const key = zoneKey({ zoneName, privateZone });
    const normalizedZoneName = normalizeZoneName(zoneName);
    this.zones.delete(key);
    for (const [recordId, record] of this.records.entries()) {
      if (record.zoneName === normalizedZoneName && record.privateZone === privateZone) {
        this.records.delete(recordId);
      }
    }
    if (privateZone) {
      this.privateZoneLinks.delete(normalizedZoneName);
    }
  }

  registerRecord({ zoneName, privateZone = false, recordType, recordName, properties = {} }) {
    const normalizedZoneName = normalizeZoneName(zoneName);
    const normalizedRecordType = String(recordType ?? '').toUpperCase();
    const normalizedRecordName = normalizeRecordName(recordName);
    const fqdn = recordFqdn(normalizedZoneName, normalizedRecordName);
    this.records.set(recordKey({
      privateZone,
      zoneName: normalizedZoneName,
      recordType: normalizedRecordType,
      recordName: normalizedRecordName,
    }), {
      zoneName: normalizedZoneName,
      privateZone,
      recordType: normalizedRecordType,
      recordName: normalizedRecordName,
      fqdn,
      ttl: properties.TTL ?? properties.ttl ?? 0,
      values: parseRecordValues(normalizedRecordType, properties),
    });
  }

  unregisterRecord({ zoneName, privateZone = false, recordType, recordName }) {
    this.records.delete(recordKey({ zoneName, privateZone, recordType, recordName }));
  }

  registerVirtualNetworkLink({ zoneName, linkName, vnetId, registrationEnabled = false }) {
    const normalizedZoneName = normalizeZoneName(zoneName);
    const links = this.privateZoneLinks.get(normalizedZoneName) ?? new Map();
    links.set(String(linkName ?? '').trim().toLowerCase(), {
      zoneName: normalizedZoneName,
      linkName: String(linkName ?? '').trim().toLowerCase(),
      vnetId: normalizeVnetId(vnetId),
      registrationEnabled: Boolean(registrationEnabled),
    });
    this.privateZoneLinks.set(normalizedZoneName, links);
  }

  unregisterVirtualNetworkLink({ zoneName, linkName }) {
    const normalizedZoneName = normalizeZoneName(zoneName);
    const links = this.privateZoneLinks.get(normalizedZoneName);
    if (!links) return;
    links.delete(String(linkName ?? '').trim().toLowerCase());
    if (!links.size) {
      this.privateZoneLinks.delete(normalizedZoneName);
    }
  }

  listVirtualNetworkLinks(zoneName) {
    return [...(this.privateZoneLinks.get(normalizeZoneName(zoneName))?.values() ?? [])].map(deepClone);
  }

  resolvePublicDns(fqdn, recordType = 'A') {
    const normalizedFqdn = normalizeFqdn(fqdn);
    const record = [...this.records.values()].find(item =>
      !item.privateZone
      && item.recordType === String(recordType ?? '').toUpperCase()
      && item.fqdn === normalizedFqdn,
    );
    if (!record || !record.values.length) {
      return { status: 'NXDOMAIN', fqdn: normalizedFqdn, values: [] };
    }
    return {
      status: 'NOERROR',
      fqdn: record.fqdn,
      ttl: record.ttl,
      values: deepClone(record.values),
      recordType: record.recordType,
      visibility: 'public',
    };
  }

  resolvePrivateDns({ fqdn, vnetId = null, recordType = 'A' }) {
    const normalizedFqdn = normalizeFqdn(fqdn);
    const normalizedVnetId = normalizeVnetId(vnetId);
    const matches = [...this.records.values()].filter(record =>
      record.privateZone
      && record.recordType === String(recordType ?? '').toUpperCase()
      && record.fqdn === normalizedFqdn,
    );
    if (!matches.length) {
      return { status: 'NXDOMAIN', fqdn: normalizedFqdn, values: [], reason: 'RECORD_NOT_FOUND' };
    }
    const record = matches[0];
    const links = this.privateZoneLinks.get(record.zoneName);
    if (!links || !links.size) {
      return { status: 'NXDOMAIN', fqdn: normalizedFqdn, values: [], reason: 'ZONE_NOT_LINKED' };
    }
    if (!normalizedVnetId) {
      return { status: 'NXDOMAIN', fqdn: normalizedFqdn, values: [], reason: 'VNET_ID_REQUIRED' };
    }
    const linked = [...links.values()].some(link => link.vnetId === normalizedVnetId);
    if (!linked) {
      return { status: 'NXDOMAIN', fqdn: normalizedFqdn, values: [], reason: 'VNET_NOT_LINKED' };
    }
    return {
      status: 'NOERROR',
      fqdn: record.fqdn,
      ttl: record.ttl,
      values: deepClone(record.values),
      recordType: record.recordType,
      visibility: 'private',
      zoneName: record.zoneName,
      vnetId: normalizedVnetId,
    };
  }
}

export function createDnsRegistry() {
  return new DnsRegistry();
}
