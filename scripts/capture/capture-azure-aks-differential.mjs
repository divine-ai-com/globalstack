import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { workspaceRoot } from '../../packages/workspace-utils/src/index.mjs';

const root = workspaceRoot(import.meta.url);
const fixtureRoot = join(root, 'fixtures', 'azure-captures');
const reportRoot = join(root, 'dist', 'captures', 'azure-aks-differential');
const enabled = process.env.GLOBALSTACK_REAL_AZURE_CONFORMANCE === '1';
const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID ?? process.env.ARM_SUBSCRIPTION_ID ?? '';
const tenantId = process.env.AZURE_TENANT_ID ?? process.env.ARM_TENANT_ID ?? '';
const location = process.env.GLOBALSTACK_AZURE_CAPTURE_LOCATION ?? 'eastus';
const includeProvisioning = process.argv.includes('--include-provisioning');
const runAll = process.argv.includes('--all');
const caseFilter = process.argv
  .find(arg => arg.startsWith('--case='))
  ?.slice('--case='.length);
const captureSalt = process.env.GLOBALSTACK_AZURE_CAPTURE_SALT
  ?? Date.now().toString(36).slice(-8).toLowerCase();
const requestTimeoutMs = Number(process.env.GLOBALSTACK_AZURE_REQUEST_TIMEOUT_MS ?? 300000);

function run(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => resolve({ code: 127, stdout, stderr: String(error?.message ?? error) }));
    child.on('close', code => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function sanitize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
      const lower = key.toLowerCase();
      if (lower.includes('token') || lower.includes('secret') || lower.includes('password') || lower.includes('key')) {
        return [key, '<redacted>'];
      }
      return [key, sanitize(nested)];
    }));
  }
  if (typeof value === 'string') {
    let sanitized = value;
    if (subscriptionId) sanitized = sanitized.replaceAll(subscriptionId, '<subscription-id>');
    if (tenantId) sanitized = sanitized.replaceAll(tenantId, '<tenant-id>');
    return sanitized.replace(/\/subscriptions\/[^/]+/gi, '/subscriptions/<subscription-id>');
  }
  return value;
}

function sanitizeHeaders(headers) {
  const sanitized = {};
  for (const [key, value] of headers.entries()) {
    const lower = key.toLowerCase();
    if (lower.includes('authorization') || lower.includes('token') || lower.includes('key')) continue;
    if (['content-type', 'location', 'azure-asyncoperation', 'retry-after', 'x-ms-request-id', 'x-ms-correlation-request-id', 'x-ms-routing-request-id'].includes(lower)) {
      sanitized[key] = sanitize(value);
    }
  }
  return sanitized;
}

async function azureToken() {
  const result = await run('az', [
    'account',
    'get-access-token',
    '--resource',
    'https://management.azure.com/',
    '--output',
    'json',
  ]);
  if (result.code !== 0) {
    throw new Error(`az account get-access-token failed: ${result.stderr || result.stdout}`);
  }
  const parsed = JSON.parse(result.stdout);
  if (!parsed.accessToken) throw new Error('az account get-access-token did not return accessToken.');
  return parsed.accessToken;
}

async function azureRequest(token, method, path, body = undefined) {
  const response = await fetch(`https://management.azure.com${path}`, {
    method,
    signal: AbortSignal.timeout(requestTimeoutMs),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // keep text
  }
  return {
    status: response.status,
    headers: sanitizeHeaders(response.headers),
    body: parsed,
  };
}

function resourceGroupName() {
  return `rg-gs-aks-diff-${captureSalt}`.toLowerCase().slice(0, 64);
}

function clusterName(caseId) {
  return `aksdiff${caseId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)}${captureSalt.slice(-4)}`.slice(0, 40);
}

function managedClusterPath(rgName, name) {
  return `/subscriptions/${subscriptionId}/resourceGroups/${rgName}/providers/Microsoft.ContainerService/managedClusters/${name}?api-version=2024-02-01`;
}

function baseAksBody(name) {
  return {
    location,
    identity: { type: 'SystemAssigned' },
    properties: {
      dnsPrefix: name,
      kubernetesVersion: process.env.GLOBALSTACK_AKS_CAPTURE_VERSION ?? '1.29.2',
      agentPoolProfiles: [
        {
          name: 'systempool',
          count: 1,
          vmSize: process.env.GLOBALSTACK_AKS_CAPTURE_VM_SIZE ?? 'Standard_DS2_v2',
          mode: 'System',
          osType: 'Linux',
          type: 'VirtualMachineScaleSets',
        },
      ],
    },
  };
}

function mergeBody(base, patch) {
  return {
    ...base,
    ...patch,
    properties: {
      ...(base.properties ?? {}),
      ...(patch.properties ?? {}),
      networkProfile: patch.properties?.networkProfile
        ? { ...(base.properties?.networkProfile ?? {}), ...patch.properties.networkProfile }
        : base.properties?.networkProfile,
      apiServerAccessProfile: patch.properties?.apiServerAccessProfile
        ? { ...(base.properties?.apiServerAccessProfile ?? {}), ...patch.properties.apiServerAccessProfile }
        : base.properties?.apiServerAccessProfile,
      agentPoolProfiles: patch.properties?.agentPoolProfiles ?? base.properties?.agentPoolProfiles,
    },
  };
}

const cases = [
  {
    id: 'invalid-network-plugin',
    description: 'AKS rejects unsupported networkProfile.networkPlugin values.',
    expectedLocalCase: 'cluster invalid network plugin is rejected',
    provisioning: false,
    body: name => mergeBody(baseAksBody(name), {
      properties: {
        networkProfile: {
          networkPlugin: 'invalid-plugin',
        },
      },
    }),
  },
  {
    id: 'invalid-network-policy',
    description: 'AKS rejects unsupported networkProfile.networkPolicy values.',
    expectedLocalCase: 'cluster invalid network policy is rejected',
    provisioning: false,
    body: name => mergeBody(baseAksBody(name), {
      properties: {
        networkProfile: {
          networkPolicy: 'invalid-policy',
        },
      },
    }),
  },
  {
    id: 'dns-service-ip-outside-service-cidr',
    description: 'AKS rejects dnsServiceIP values outside serviceCidr.',
    expectedLocalCase: 'cluster dnsServiceIP outside serviceCidr is rejected',
    provisioning: false,
    body: name => mergeBody(baseAksBody(name), {
      properties: {
        networkProfile: {
          serviceCidr: '10.42.0.0/16',
          dnsServiceIP: '10.43.0.10',
        },
      },
    }),
  },
  {
    id: 'private-dns-none-public-fqdn-disabled',
    description: 'AKS rejects privateDNSZone None when public FQDN is disabled.',
    expectedLocalCase: 'private cluster dns zone None with disabled public FQDN is rejected',
    provisioning: false,
    body: name => mergeBody(baseAksBody(name), {
      properties: {
        apiServerAccessProfile: {
          enablePrivateCluster: true,
          privateDNSZone: 'None',
          enablePrivateClusterPublicFQDN: false,
        },
      },
    }),
  },
  {
    id: 'agent-pool-orchestrator-above-control-plane',
    description: 'AKS rejects an agent-pool orchestratorVersion above the control-plane version.',
    expectedLocalCase: 'cluster agent pool orchestratorVersion above control plane is rejected',
    provisioning: false,
    body: name => mergeBody(baseAksBody(name), {
      properties: {
        agentPoolProfiles: [
          {
            name: 'systempool',
            count: 1,
            vmSize: process.env.GLOBALSTACK_AKS_CAPTURE_VM_SIZE ?? 'Standard_DS2_v2',
            mode: 'System',
            osType: 'Linux',
            type: 'VirtualMachineScaleSets',
            orchestratorVersion: '1.30.0',
          },
        ],
      },
    }),
  },
  {
    id: 'valid-private-public-fqdn-enabled',
    description: 'AKS creates a private cluster with public FQDN enabled and reports public/private FQDN fields.',
    expectedLocalCase: 'private cluster public FQDN can be re-enabled and routes public host',
    provisioning: true,
    body: name => mergeBody(baseAksBody(name), {
      properties: {
        apiServerAccessProfile: {
          enablePrivateCluster: true,
          privateDNSZone: 'System',
          enablePrivateClusterPublicFQDN: true,
        },
        networkProfile: {
          networkPlugin: 'azure',
          serviceCidr: '10.42.0.0/16',
          dnsServiceIP: '10.42.0.10',
          loadBalancerSku: 'standard',
        },
      },
    }),
  },
];

function selectedCases() {
  let selected = cases;
  if (caseFilter) selected = selected.filter(item => item.id === caseFilter);
  if (!runAll && !caseFilter) selected = selected.filter(item => item.provisioning === false);
  if (selected.some(item => item.provisioning) && !includeProvisioning) {
    throw new Error('Provisioning cases require --include-provisioning.');
  }
  return selected;
}

async function writeFixture(result) {
  await mkdir(fixtureRoot, { recursive: true });
  const fixtureId = `aks-metadata.differential.${result.case.id}`;
  const fixture = {
    id: fixtureId,
    capturedAt: new Date().toISOString(),
    target: 'azure',
    subscriptionId: '<subscription-id>',
    capabilityId: 'aks-metadata',
    resourceType: 'Microsoft.ContainerService/managedClusters',
    operation: 'CreateOrUpdate',
    varianceId: result.case.id,
    request: {
      method: 'PUT',
      path: sanitize(result.path),
      body: sanitize(result.body),
    },
    response: {
      status: result.response.status,
      headers: result.response.headers,
      body: sanitize(result.response.body),
    },
    cleanup: result.cleanup,
    globalstack: {
      normalizedIntoLocalConformance: false,
      expectedLocalCase: result.case.expectedLocalCase,
      validationDepth: result.case.provisioning ? 'real-azure-differential-provisioning' : 'provider-validation',
      cloudValidated: false,
      captureMode: result.case.provisioning ? 'opt-in-provisioning' : 'validation-only',
      caveat: 'Review this fixture against the local AKS parity case before marking cloudValidated.',
    },
  };
  await writeFile(join(fixtureRoot, `${fixtureId}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  return fixtureId;
}

async function main() {
  const selected = selectedCases();
  if (selected.length === 0) {
    throw new Error('No AKS differential cases selected.');
  }
  if (!enabled) {
    console.error('Real Azure AKS differential capture is disabled. Set GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 to execute Azure calls.');
    console.error(`Selected cases: ${selected.map(item => item.id).join(', ')}`);
    process.exit(3);
  }
  if (!subscriptionId) throw new Error('Set AZURE_SUBSCRIPTION_ID or ARM_SUBSCRIPTION_ID before running AKS differential capture.');

  const token = await azureToken();
  const rgName = resourceGroupName();
  const rgPath = `/subscriptions/${subscriptionId}/resourceGroups/${rgName}?api-version=2021-04-01`;
  const results = [];
  let cleanup = {
    resourceGroupName: rgName,
    attempted: false,
    status: null,
    verificationStatus: null,
    verifiedDeleted: false,
  };

  try {
    const rgCreate = await azureRequest(token, 'PUT', rgPath, {
      location,
      tags: {
        purpose: 'globalstack-aks-differential',
        ttl: 'ephemeral',
      },
    });
    if (rgCreate.status < 200 || rgCreate.status >= 300) {
      throw new Error(`Resource group create failed: HTTP ${rgCreate.status} ${JSON.stringify(rgCreate.body)}`);
    }

    for (const captureCase of selected) {
      const name = clusterName(captureCase.id);
      const path = managedClusterPath(rgName, name);
      const body = captureCase.body(name);
      const response = await azureRequest(token, 'PUT', path, body);
      results.push({
        case: captureCase,
        path,
        body,
        response,
      });
      console.log(`Captured ${captureCase.id}: HTTP ${response.status}`);
    }
  } finally {
    const deleteResponse = await azureRequest(token, 'DELETE', rgPath, null).catch(error => ({
      status: 0,
      body: { error: String(error?.message ?? error) },
      headers: {},
    }));
    cleanup = {
      ...cleanup,
      attempted: true,
      status: deleteResponse.status,
      verificationStatus: null,
      verifiedDeleted: false,
    };
    for (let attempt = 0; attempt < Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_ATTEMPTS ?? 60); attempt += 1) {
      const verify = await azureRequest(token, 'GET', rgPath, null);
      cleanup.verificationStatus = verify.status;
      if (verify.status === 404) {
        cleanup.verifiedDeleted = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, Number(process.env.GLOBALSTACK_AZURE_CLEANUP_VERIFY_DELAY_MS ?? 5000)));
    }
  }

  const written = [];
  for (const result of results) {
    written.push(await writeFixture({
      ...result,
      cleanup: {
        resourceGroupName: cleanup.resourceGroupName,
        deleteStatus: cleanup.status,
        verificationStatus: cleanup.verificationStatus,
        verifiedDeleted: cleanup.verifiedDeleted,
      },
    }));
  }

  await mkdir(reportRoot, { recursive: true });
  await writeFile(join(reportRoot, 'results.json'), `${JSON.stringify({
    ok: cleanup.verifiedDeleted && results.length === selected.length,
    capturedAt: new Date().toISOString(),
    selectedCases: selected.map(item => item.id),
    fixtureIds: written,
    cleanup,
    results: results.map(item => ({
      id: item.case.id,
      status: item.response.status,
      expectedLocalCase: item.case.expectedLocalCase,
      provisioning: item.case.provisioning,
    })),
  }, null, 2)}\n`);

  console.log(`Wrote ${written.length} AKS differential fixture(s). Cleanup verified: ${cleanup.verifiedDeleted ? 'yes' : 'no'}`);
  if (!cleanup.verifiedDeleted) process.exit(1);
}

await main();
