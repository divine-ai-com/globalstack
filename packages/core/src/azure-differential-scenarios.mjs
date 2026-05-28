export const aksDifferentialApiVersion = '2024-02-01';

function baseAksBody({ name, location, kubernetesVersion, vmSize }) {
  return {
    location,
    identity: { type: 'SystemAssigned' },
    properties: {
      dnsPrefix: name,
      kubernetesVersion,
      servicePrincipalProfile: { clientId: 'msi' },
      agentPoolProfiles: [
        {
          name: 'systempool',
          count: 1,
          vmSize,
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

function aksBody(context, patch = {}) {
  return mergeBody(baseAksBody(context), patch);
}

export const azureDifferentialScenarios = {
  'aks-metadata': {
    id: 'aks-metadata',
    capabilityId: 'aks-metadata',
    resourceType: 'Microsoft.ContainerService/managedClusters',
    operation: 'CreateOrUpdate',
    apiVersion: aksDifferentialApiVersion,
    defaultLocation: 'eastus',
    defaultKubernetesVersion: '1.29.2',
    defaultVmSize: 'Standard_DS2_v2',
    resourceName({ caseId, salt }) {
      return `aksdiff${caseId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20)}${salt.slice(-4)}`.slice(0, 40);
    },
    cases: [
      {
        id: 'invalid-network-plugin',
        description: 'AKS accepts unsupported networkProfile.networkPlugin values into async provisioning before the operation fails.',
        expectedLocalCase: 'cluster invalid network plugin is accepted into async failure',
        provisioning: true,
        expected: { status: 201, errorCode: null },
        body: context => aksBody(context, {
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
        expected: { status: 400, errorCode: 'NetworkPolicyNotSupported' },
        body: context => aksBody(context, {
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
        expected: { status: 400, errorCode: 'InvalidParameter' },
        body: context => aksBody(context, {
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
        expected: { status: 400, errorCode: 'InvalidParameter' },
        body: context => aksBody(context, {
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
        expected: { status: 400, errorCode: 'InvalidParameter' },
        body: context => aksBody(context, {
          properties: {
            agentPoolProfiles: [
              {
                name: 'systempool',
                count: 1,
                vmSize: context.vmSize,
                mode: 'System',
                osType: 'Linux',
                type: 'VirtualMachineScaleSets',
                orchestratorVersion: context.aboveKubernetesVersion,
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
        expected: { status: [200, 201, 202], errorCode: null },
        body: context => aksBody(context, {
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
    ],
  },
};

export function getAzureDifferentialScenario(id) {
  const scenario = azureDifferentialScenarios[id];
  if (!scenario) {
    throw new Error(`Unknown Azure differential scenario '${id}'.`);
  }
  return scenario;
}

export function selectDifferentialCases(scenario, { caseId = null, includeAll = false, includeProvisioning = false } = {}) {
  let selected = scenario.cases;
  if (caseId) selected = selected.filter(item => item.id === caseId);
  if (!includeAll && !caseId) selected = selected.filter(item => item.provisioning === false);
  if (selected.length === 0) {
    throw new Error(`No differential cases selected for '${scenario.id}'.`);
  }
  if (selected.some(item => item.provisioning) && !includeProvisioning) {
    throw new Error('Provisioning cases require --include-provisioning.');
  }
  return selected;
}
