import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';
import { createArmServer } from '../../packages/azure-control-plane/src/server.mjs';
import { azurePlatforms } from '../../packages/platform-registry/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const outRoot = join(root, 'dist', 'e2e', 'azure-dns-zones-parity');
const skipPlatforms = process.argv.includes('--skip-platforms');
const subscriptionId = process.env.GLOBALSTACK_AZURE_SUBSCRIPTION_ID ?? '00000000-0000-0000-0000-000000000000';
const token = process.env.GLOBALSTACK_AZURE_ACCESS_TOKEN ?? 'globalstack-local-token';
const authHeader = `Bearer ${token}`;

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
    });
    const timeoutMs = options.timeoutMs ?? 900000;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ code: 124 });
    }, timeoutMs);
    child.on('error', error => {
      clearTimeout(timeout);
      resolve({ code: 127, error: error.message });
    });
    child.on('close', code => {
      clearTimeout(timeout);
      resolve({ code: code ?? 1 });
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function withArmServer(fn) {
  const server = createArmServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    return await fn(port);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function httpJson(port, method, path, body, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      ...(options.auth === false ? {} : { authorization: authHeader }),
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body: parsed,
  };
}

function errorCode(result) {
  return result.body?.error?.code ?? result.body?.code ?? result.body?.Code ?? null;
}

function providerPath(resourceGroup, providerNamespace, typePath, apiVersion) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}?api-version=${apiVersion}`;
}

function providerPathWithoutApiVersion(resourceGroup, providerNamespace, typePath) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/${providerNamespace}/${typePath}`;
}

function resourceGroupPath(resourceGroup, apiVersion = '2021-04-01') {
  return `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}?api-version=${apiVersion}`;
}

function publicDnsZonePath(resourceGroup, zoneName, apiVersion = '2018-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `dnsZones/${zoneName}`, apiVersion);
}

function publicRecordPath(resourceGroup, zoneName, recordType, recordName, apiVersion = '2018-05-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `dnsZones/${zoneName}/${recordType}/${recordName}`, apiVersion);
}

function privateDnsZonePath(resourceGroup, zoneName, apiVersion = '2020-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${zoneName}`, apiVersion);
}

function privateRecordPath(resourceGroup, zoneName, recordType, recordName, apiVersion = '2020-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${zoneName}/${recordType}/${recordName}`, apiVersion);
}

function virtualNetworkPath(resourceGroup, vnetName, apiVersion = '2023-09-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `virtualNetworks/${vnetName}`, apiVersion);
}

function vnetLinkPath(resourceGroup, zoneName, linkName, apiVersion = '2020-06-01') {
  return providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${zoneName}/virtualNetworkLinks/${linkName}`, apiVersion);
}

function zoneBody(overrides = {}) {
  return {
    location: 'global',
    tags: { workload: 'ai-mlops-dns' },
    properties: {
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function vnetBody() {
  return {
    location: 'eastus',
    properties: {
      addressSpace: {
        addressPrefixes: ['10.73.0.0/16'],
      },
      subnets: [
        {
          name: 'default',
          properties: { addressPrefix: '10.73.1.0/24' },
        },
      ],
    },
  };
}

function recordBody(recordType, overrides = {}) {
  const base = {
    A: { TTL: 60, ARecords: [{ ipv4Address: '10.10.1.10' }] },
    AAAA: { TTL: 60, AAAARecords: [{ ipv6Address: '2001:db8::10' }] },
    CAA: { TTL: 60, CAARecords: [{ flags: 0, tag: 'issue', value: 'example.com' }] },
    CNAME: { TTL: 60, CNAMERecord: { cname: 'target.example.test.' } },
    MX: { TTL: 60, MXRecords: [{ preference: 10, exchange: 'mail.example.test.' }] },
    NS: { TTL: 60, NSRecords: [{ nsdname: 'ns1.example.test.' }] },
    PTR: { TTL: 60, PTRRecords: [{ ptrdname: 'host.example.test.' }] },
    SOA: {
      TTL: 3600,
      SOARecord: {
        host: 'ns1.example.test.',
        email: 'azuredns-hostmaster.microsoft.com',
        serialNumber: 1,
        refreshTime: 3600,
        retryTime: 300,
        expireTime: 2419200,
        minimumTTL: 300,
      },
    },
    SRV: { TTL: 60, SRVRecords: [{ priority: 1, weight: 5, port: 443, target: 'service.example.test.' }] },
    TXT: { TTL: 60, TXTRecords: [{ value: ['globalstack=parity'] }] },
  };
  return {
    properties: {
      ...(base[recordType] ?? {}),
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function vnetLinkBody({ vnetId, overrides = {} }) {
  return {
    location: 'global',
    tags: { workload: 'private-name-resolution' },
    properties: {
      registrationEnabled: false,
      virtualNetwork: {
        id: vnetId,
      },
      ...(overrides.properties ?? {}),
    },
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'properties')),
  };
}

function deploymentBody({ publicZoneName, privateZoneName, publicRecordName, privateRecordName, linkName, vnetName, resourceGroup }) {
  const vnetId = `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Network/virtualNetworks/${vnetName}`;
  return {
    properties: {
      mode: 'Incremental',
      template: {
        $schema: 'https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#',
        contentVersion: '1.0.0.0',
        resources: [
          {
            type: 'Microsoft.Network/dnsZones',
            apiVersion: '2018-05-01',
            name: publicZoneName,
            location: 'global',
            properties: {},
          },
          {
            type: 'Microsoft.Network/dnsZones/A',
            apiVersion: '2018-05-01',
            name: `${publicZoneName}/${publicRecordName}`,
            properties: recordBody('A').properties,
          },
          {
            type: 'Microsoft.Network/virtualNetworks',
            apiVersion: '2023-09-01',
            name: vnetName,
            location: 'eastus',
            properties: vnetBody().properties,
          },
          {
            type: 'Microsoft.Network/privateDnsZones',
            apiVersion: '2020-06-01',
            name: privateZoneName,
            location: 'global',
            properties: {},
          },
          {
            type: 'Microsoft.Network/privateDnsZones/A',
            apiVersion: '2020-06-01',
            name: `${privateZoneName}/${privateRecordName}`,
            properties: recordBody('A').properties,
          },
          {
            type: 'Microsoft.Network/privateDnsZones/virtualNetworkLinks',
            apiVersion: '2020-06-01',
            name: `${privateZoneName}/${linkName}`,
            location: 'global',
            properties: vnetLinkBody({ vnetId }).properties,
          },
        ],
        outputs: {
          publicZoneName: { type: 'string', value: publicZoneName },
          privateZoneName: { type: 'string', value: privateZoneName },
        },
      },
    },
  };
}

async function runControlPlaneMatrix() {
  const cases = [];
  const suffix = Date.now().toString(36).slice(-8).toLowerCase();
  const resourceGroup = `rg-gs-dns-parity-${suffix}`;
  const missingResourceGroup = `rg-gs-dns-missing-${suffix}`;
  const publicZoneName = `${suffix}.example.test`;
  const privateZoneName = `${suffix}.internal.test`;
  const missingPublicZoneName = `missing-${suffix}.example.test`;
  const missingPrivateZoneName = `missing-${suffix}.internal.test`;
  const vnetName = `vnet-dns-${suffix}`.slice(0, 40);
  const linkName = `link-${suffix}`.slice(0, 40);
  const publicRecords = [
    ['A', 'www'],
    ['AAAA', 'ipv6'],
    ['CAA', 'caa'],
    ['CNAME', 'alias'],
    ['MX', '@'],
    ['NS', 'delegated'],
    ['PTR', 'ptr'],
    ['SOA', '@'],
    ['SRV', `_robot._tcp`],
    ['TXT', 'txt'],
  ];
  const privateRecords = [
    ['A', 'api'],
    ['AAAA', 'ipv6'],
    ['CNAME', 'alias'],
    ['MX', '@'],
    ['PTR', 'ptr'],
    ['SOA', '@'],
    ['SRV', `_robot._tcp`],
    ['TXT', 'txt'],
  ];
  let vnetId = null;

  async function record(name, fn) {
    const startedAt = Date.now();
    try {
      const detail = await fn();
      cases.push({
        name,
        ok: true,
        durationMs: Date.now() - startedAt,
        ...detail,
      });
      console.log(`PASS ${name}`);
    } catch (error) {
      cases.push({
        name,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: error?.stack ?? String(error),
      });
      console.error(`FAIL ${name}`);
      console.error(error);
    }
  }

  await withArmServer(async (armPort) => {
    await record('unauthenticated ARM request is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { auth: false });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('malformed bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Token bad' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('wrong bearer token is rejected', async () => {
      const result = await httpJson(armPort, 'GET', resourceGroupPath(resourceGroup), undefined, { headers: { authorization: 'Bearer wrong-token' } });
      assert.equal(result.status, 401);
      assert.equal(errorCode(result), 'InvalidAuthenticationToken');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('subscription mismatch is rejected', async () => {
      const path = `/subscriptions/99999999-9999-9999-9999-999999999999/resourceGroups/${resourceGroup}?api-version=2021-04-01`;
      const result = await httpJson(armPort, 'GET', path);
      assert.equal(result.status, 403);
      assert.equal(errorCode(result), 'AuthorizationFailed');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('missing api-version is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', providerPathWithoutApiVersion(resourceGroup, 'Microsoft.Network', `dnsZones/${publicZoneName}`), zoneBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'MissingApiVersionParameter');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns zone create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', publicDnsZonePath(missingResourceGroup, publicZoneName), zoneBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone create requires an existing resource group', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(missingResourceGroup, privateZoneName), zoneBody());
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceGroupNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns record create with missing zone reports parent not found', async () => {
      await httpJson(armPort, 'PUT', resourceGroupPath(resourceGroup), { location: 'eastus' });
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, missingPublicZoneName, 'A', 'www'), recordBody('A'));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns vnet link create with missing zone reports parent not found', async () => {
      const result = await httpJson(armPort, 'PUT', vnetLinkPath(resourceGroup, missingPrivateZoneName, linkName), vnetLinkBody({ vnetId: 'local' }));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns zone collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'dnsZones', '2018-05-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('private dns zone collection list is empty before create', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', 'privateDnsZones', '2020-06-01'));
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.value, []);
      return { status: result.status, count: result.body.value.length };
    });

    await record('public dns zone delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', publicDnsZonePath(resourceGroup, missingPublicZoneName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('private dns zone delete missing returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', privateDnsZonePath(resourceGroup, missingPrivateZoneName));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('public dns zone empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicDnsZonePath(resourceGroup, publicZoneName), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'LocationRequired');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns zone invalid location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicDnsZonePath(resourceGroup, publicZoneName), zoneBody({ location: 'globalstack-invalid-location' }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns zone non-global location is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicDnsZonePath(resourceGroup, publicZoneName), zoneBody({ location: 'eastus' }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidResourceLocation');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns zone invalid name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicDnsZonePath(resourceGroup, 'invalidzone'), zoneBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidDomainName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone invalid name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(resourceGroup, 'invalidzone'), zoneBody());
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidDomainName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns record empty body with missing zone reports parent not found', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'A', 'www'), {});
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ParentResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns zone create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', publicDnsZonePath(resourceGroup, publicZoneName), zoneBody());
      assert.equal(result.status, 201);
      assert.equal(result.body.name, publicZoneName);
      assert.ok(Array.isArray(result.body.properties.nameServers));
      return { status: result.status, nameServers: result.body.properties.nameServers.length };
    });

    await record('private dns zone create is accepted asynchronously', async () => {
      const result = await httpJson(armPort, 'PUT', privateDnsZonePath(resourceGroup, privateZoneName), zoneBody());
      assert.equal(result.status, 202);
      assert.ok(result.headers['azure-asyncoperation']);
      return { status: result.status, asyncOperation: result.headers['azure-asyncoperation'] };
    });

    await record('private dns zone operation status succeeds', async () => {
      const result = await httpJson(armPort, 'GET', `/subscriptions/${subscriptionId}/providers/Microsoft.Resources/operationStatuses/dns-zone-ready?api-version=2022-09-01`);
      assert.equal(result.status, 200);
      assert.equal(result.body.status, 'Succeeded');
      return { status: result.status, provisioningState: result.body.status };
    });

    await record('public dns zone get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', publicDnsZonePath(resourceGroup, publicZoneName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, publicZoneName);
      return { status: result.status };
    });

    await record('private dns zone get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', privateDnsZonePath(resourceGroup, privateZoneName));
      assert.equal(result.status, 200);
      assert.equal(result.body.name, privateZoneName);
      return { status: result.status, provisioningState: result.body.properties.provisioningState };
    });

    await record('public dns record empty body is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'A', 'emptybody'), {});
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'BadRequest');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns record missing ttl is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'A', 'missingttl'), { properties: { ARecords: [{ ipv4Address: '10.10.1.11' }] } });
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidTtl');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns record invalid ttl is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'A', 'badttl'), recordBody('A', { properties: { TTL: -1 } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidTtl');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns A record invalid IPv4 is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'A', 'badip'), recordBody('A', { properties: { ARecords: [{ ipv4Address: '999.1.1.1' }] } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidARecord');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns AAAA record invalid IPv6 is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'AAAA', 'badipv6'), recordBody('AAAA', { properties: { AAAARecords: [{ ipv6Address: 'not-ipv6' }] } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidAaaaRecord');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns CNAME record missing cname is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'CNAME', 'badcname'), recordBody('CNAME', { properties: { CNAMERecord: {} } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidCnameRecord');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns TXT record empty value is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'TXT', 'badtxt'), recordBody('TXT', { properties: { TXTRecords: [{ value: [] }] } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidTxtRecord');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns MX record missing exchange is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'MX', 'badmx'), recordBody('MX', { properties: { MXRecords: [{ preference: 10 }] } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidMxRecord');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns record invalid relative name is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'A', 'bad%20name'), recordBody('A'));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRecordSetName');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns unsupported record type route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Network', `dnsZones/${publicZoneName}/DS/key1`, '2018-05-01'), { properties: { TTL: 60 } });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    for (const [recordType, recordName] of publicRecords) {
      await record(`public dns ${recordType} record create succeeds`, async () => {
        const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, recordType, recordName), recordBody(recordType));
        assert.equal(result.status, 201);
        assert.ok(result.body.id.endsWith(`/dnsZones/${publicZoneName}/${recordType}/${recordName}`));
        assert.equal(result.body.type, `Microsoft.Network/dnsZones/${recordType}`);
        assert.ok(result.body.properties.fqdn.endsWith('.'));
        return { status: result.status, fqdn: result.body.properties.fqdn };
      });
    }

    for (const [recordType, recordName] of privateRecords) {
      await record(`private dns ${recordType} record create succeeds`, async () => {
        const result = await httpJson(armPort, 'PUT', privateRecordPath(resourceGroup, privateZoneName, recordType, recordName), recordBody(recordType));
        assert.equal(result.status, 201);
        assert.ok(result.body.id.endsWith(`/privateDnsZones/${privateZoneName}/${recordType}/${recordName}`));
        assert.equal(result.body.type, `Microsoft.Network/privateDnsZones/${recordType}`);
        assert.ok(result.body.properties.fqdn.endsWith('.'));
        return { status: result.status, fqdn: result.body.properties.fqdn };
      });
    }

    await record('public dns A record get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', publicRecordPath(resourceGroup, publicZoneName, 'A', 'www'));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.ARecords[0].ipv4Address, '10.10.1.10');
      return { status: result.status };
    });

    await record('public dns A record update preserves metadata', async () => {
      const result = await httpJson(armPort, 'PUT', publicRecordPath(resourceGroup, publicZoneName, 'A', 'www'), recordBody('A', { properties: { ARecords: [{ ipv4Address: '10.10.1.12' }] } }));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.ARecords[0].ipv4Address, '10.10.1.12');
      return { status: result.status };
    });

    await record('public dns A record list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', `dnsZones/${publicZoneName}/A`, '2018-05-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.id.endsWith(`/dnsZones/${publicZoneName}/A/www`)));
      return { status: result.status, count: result.body.value.length };
    });

    await record('private dns A record list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${privateZoneName}/A`, '2020-06-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.id.endsWith(`/privateDnsZones/${privateZoneName}/A/api`)));
      return { status: result.status, count: result.body.value.length };
    });

    await record('virtual network create succeeds for private dns link', async () => {
      const result = await httpJson(armPort, 'PUT', virtualNetworkPath(resourceGroup, vnetName), vnetBody());
      assert.equal(result.status, 201);
      vnetId = result.body.id;
      return { status: result.status, id: vnetId };
    });

    await record('private dns vnet link missing virtual network id is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', vnetLinkPath(resourceGroup, privateZoneName, linkName), vnetLinkBody({ vnetId: '', overrides: { properties: { virtualNetwork: {} } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'VirtualNetworkLinkReferenceMissing');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns vnet link invalid registration flag is rejected', async () => {
      const result = await httpJson(armPort, 'PUT', vnetLinkPath(resourceGroup, privateZoneName, linkName), vnetLinkBody({ vnetId, overrides: { properties: { registrationEnabled: 'false' } } }));
      assert.equal(result.status, 400);
      assert.equal(errorCode(result), 'InvalidRequestFormat');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns vnet link create succeeds', async () => {
      const result = await httpJson(armPort, 'PUT', vnetLinkPath(resourceGroup, privateZoneName, linkName), vnetLinkBody({ vnetId }));
      assert.equal(result.status, 201);
      assert.equal(result.body.name, `${privateZoneName}/${linkName}`);
      assert.equal(result.body.properties.virtualNetwork.id, vnetId);
      return { status: result.status };
    });

    await record('private dns vnet link get succeeds', async () => {
      const result = await httpJson(armPort, 'GET', vnetLinkPath(resourceGroup, privateZoneName, linkName));
      assert.equal(result.status, 200);
      assert.equal(result.body.properties.registrationEnabled, false);
      return { status: result.status };
    });

    await record('private dns vnet link list includes created resource', async () => {
      const result = await httpJson(armPort, 'GET', providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${privateZoneName}/virtualNetworkLinks`, '2020-06-01'));
      assert.equal(result.status, 200);
      assert.ok(result.body.value.some(item => item.name === `${privateZoneName}/${linkName}`));
      return { status: result.status, count: result.body.value.length };
    });

    await record('private dns unsupported resolver policy route fails closed', async () => {
      const result = await httpJson(armPort, 'PUT', providerPath(resourceGroup, 'Microsoft.Network', `privateDnsZones/${privateZoneName}/resolverPolicies/policy1`, '2020-06-01'), { properties: {} });
      assert.equal(result.status, 501);
      assert.equal(errorCode(result), 'GlobalStackResourceTypeNotEmulated');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('ARM template deployment can create dns resources', async () => {
      const deploymentName = `dns-deploy-${suffix}`;
      const deploymentPublicZone = `deploy-${suffix}.example.test`;
      const deploymentPrivateZone = `deploy-${suffix}.internal.test`;
      const deploymentPublicRecord = 'www';
      const deploymentPrivateRecord = 'api';
      const deploymentLinkName = `deploy-link-${suffix}`.slice(0, 40);
      const deploymentVnet = `deploy-vnet-${suffix}`.slice(0, 40);
      const result = await httpJson(
        armPort,
        'PUT',
        `/subscriptions/${subscriptionId}/resourceGroups/${resourceGroup}/providers/Microsoft.Resources/deployments/${deploymentName}?api-version=2022-09-01`,
        deploymentBody({
          publicZoneName: deploymentPublicZone,
          privateZoneName: deploymentPrivateZone,
          publicRecordName: deploymentPublicRecord,
          privateRecordName: deploymentPrivateRecord,
          linkName: deploymentLinkName,
          vnetName: deploymentVnet,
          resourceGroup,
        }),
      );
      assert.equal(result.status, 201);
      assert.equal(result.body.properties.provisioningState, 'Succeeded');
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/dnsZones/${deploymentPublicZone}/A/${deploymentPublicRecord}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/privateDnsZones/${deploymentPrivateZone}/A/${deploymentPrivateRecord}`)));
      assert.ok(result.body.properties.globalstackDeploymentSteps.some(step => step.id.includes(`/privateDnsZones/${deploymentPrivateZone}/virtualNetworkLinks/${deploymentLinkName}`)));
      return { status: result.status, stepCount: result.body.properties.globalstackDeploymentSteps.length };
    });

    await record('public dns A record delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', publicRecordPath(resourceGroup, publicZoneName, 'A', 'www'));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('public dns A record get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', publicRecordPath(resourceGroup, publicZoneName, 'A', 'www'));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns A record delete after delete returns no content', async () => {
      const result = await httpJson(armPort, 'DELETE', publicRecordPath(resourceGroup, publicZoneName, 'A', 'www'));
      assert.equal(result.status, 204);
      return { status: result.status };
    });

    await record('private dns vnet link delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', vnetLinkPath(resourceGroup, privateZoneName, linkName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('private dns vnet link get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', vnetLinkPath(resourceGroup, privateZoneName, linkName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('public dns zone delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', publicDnsZonePath(resourceGroup, publicZoneName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('private dns zone delete succeeds', async () => {
      const result = await httpJson(armPort, 'DELETE', privateDnsZonePath(resourceGroup, privateZoneName));
      assert.equal(result.status, 200);
      return { status: result.status };
    });

    await record('public dns zone get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', publicDnsZonePath(resourceGroup, publicZoneName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });

    await record('private dns zone get after delete is not found', async () => {
      const result = await httpJson(armPort, 'GET', privateDnsZonePath(resourceGroup, privateZoneName));
      assert.equal(result.status, 404);
      assert.equal(errorCode(result), 'ResourceNotFound');
      return { status: result.status, errorCode: errorCode(result) };
    });
  });

  const failed = cases.filter(item => !item.ok);
  return {
    ok: failed.length === 0,
    total: cases.length,
    failedCount: failed.length,
    resourceGroup,
    publicZoneName,
    privateZoneName,
    vnetName,
    linkName,
    cases,
  };
}

async function runPlatformMatrix() {
  if (skipPlatforms) {
    return {
      ok: true,
      skipped: true,
      reason: '--skip-platforms was provided',
      expectedPlatforms: azurePlatforms.length,
      results: [],
    };
  }

  const env = {
    ...process.env,
    GLOBALSTACK_AUTH_TOKEN: process.env.GLOBALSTACK_AUTH_TOKEN ?? 'globalstack-dns-zones-parity-local-token',
    PROVIDER: 'GlobalStack',
    CLOUD_PROVIDER: 'GlobalStack',
  };
  const result = await run('npm', ['run', 'smoke:platform-runners'], { env, timeoutMs: 1800000 });
  const resultsPath = join(root, 'dist', 'platform-lifecycle-smoke-results.json');
  const summary = await readJson(resultsPath).catch(() => ({ generatedAt: null, results: [] }));
  const failed = (summary.results ?? []).filter(item => !item.ok);
  return {
    ok: result.code === 0 && failed.length === 0 && (summary.results ?? []).length === azurePlatforms.length,
    skipped: false,
    exitCode: result.code,
    expectedPlatforms: azurePlatforms.length,
    passedCount: (summary.results ?? []).length - failed.length,
    failedCount: failed.length,
    resultsPath,
    results: summary.results ?? [],
  };
}

function markdown(report) {
  const lines = [
    '# Azure DNS Zones Parity E2E Report',
    '',
    `Status: ${report.ok ? 'pass' : 'fail'}`,
    `Generated: ${report.generatedAt}`,
    '',
    '## Control Plane',
    '',
    `- Passed: ${report.controlPlane.total - report.controlPlane.failedCount}/${report.controlPlane.total}`,
    `- Public zone under test: ${report.controlPlane.publicZoneName}`,
    `- Private zone under test: ${report.controlPlane.privateZoneName}`,
    `- Private DNS VNet link under test: ${report.controlPlane.linkName}`,
    '',
    '| Case | Status | HTTP | Error Code |',
    '|---|---|---:|---|',
  ];

  for (const item of report.controlPlane.cases) {
    lines.push(`| ${item.name} | ${item.ok ? 'pass' : 'fail'} | ${item.status ?? ''} | ${item.errorCode ?? item.error ?? ''} |`);
  }

  lines.push('');
  lines.push('## Platform Matrix');
  lines.push('');
  if (report.platformMatrix.skipped) {
    lines.push(`- Skipped: ${report.platformMatrix.reason}`);
  } else {
    lines.push(`- Passed: ${report.platformMatrix.passedCount}/${report.platformMatrix.expectedPlatforms}`);
    lines.push('');
    lines.push('| Platform | Status | Final Stage | Provisioning State |');
    lines.push('|---|---|---|---|');
    for (const item of report.platformMatrix.results) {
      lines.push(`| ${item.platformId} | ${item.ok ? 'pass' : 'fail'} | ${item.finalStage ?? ''} | ${item.provisioningState ?? ''} |`);
    }
  }
  lines.push('');
  lines.push('## Claim Boundary');
  lines.push('');
  lines.push('This run proves local GlobalStack handling for the listed Azure DNS and Private DNS ARM lifecycle, record-set parameter rejection, private DNS virtual network link metadata, unsupported DNS child routes failing closed, ARM-template deployment path, and all-platform runner deployment paths. It does not mark Azure DNS as 99%-complete or cloudValidated for authoritative DNS serving, recursive resolution, delegation propagation, DNSSEC, traffic routing, health checks, resolver policies, throttling, RBAC, or exact Azure DNS data-plane behavior.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

await mkdir(outRoot, { recursive: true });

const controlPlane = await runControlPlaneMatrix();
const platformMatrix = await runPlatformMatrix();
const report = {
  generatedAt: new Date().toISOString(),
  ok: controlPlane.ok && platformMatrix.ok,
  scope: 'Azure DNS zones, public and private record sets, private DNS virtual network links, parameter rejection, unsupported route fail-closed checks, ARM-template deployment, and all-platform GlobalStack lifecycle smoke.',
  claimBoundary: 'Local parity evidence for the enumerated cases only; not a full Azure DNS cloudValidated claim.',
  controlPlane,
  platformMatrix,
};

await writeFile(join(outRoot, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outRoot, 'report.md'), markdown(report));

console.log(`Azure DNS Zones parity E2E ${report.ok ? 'passed' : 'failed'}; report: ${join(outRoot, 'report.md')}`);
if (!report.ok) process.exit(1);
