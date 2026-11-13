param serviceName string
param location string
param runId string

var tags = {
  project: 'globalstack-production-scenarios'
  run: runId
}

resource identities 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = [for name in ['ingress', 'worker', 'scanner']: {
  name: '${serviceName}-${name}'
  location: location
  tags: tags
}]

// Subnet allocation is a deployment prerequisite, not evidence of isolation.
// Effective access is tested after endpoints, applications and policies exist.
resource network 'Microsoft.Network/virtualNetworks@2024-05-01' = {
  name: '${serviceName}-network'
  location: location
  tags: tags
  properties: {
    addressSpace: { addressPrefixes: ['10.72.0.0/16'] }
    subnets: [
      {
        name: 'ingress-integration'
        properties: {
          addressPrefix: '10.72.0.0/26'
          delegations: [{ name: 'app-service', properties: { serviceName: 'Microsoft.Web/serverFarms' } }]
        }
      }
      {
        name: 'worker-integration'
        properties: {
          addressPrefix: '10.72.0.64/26'
          delegations: [{ name: 'functions', properties: { serviceName: 'Microsoft.Web/serverFarms' } }]
        }
      }
      {
        name: 'scanner-environment'
        properties: {
          addressPrefix: '10.72.1.0/27'
          delegations: [{ name: 'container-apps', properties: { serviceName: 'Microsoft.App/environments' } }]
        }
      }
      {
        name: 'database'
        properties: {
          addressPrefix: '10.72.2.0/27'
          delegations: [{ name: 'postgres', properties: { serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers' } }]
        }
      }
      {
        name: 'private-endpoints'
        properties: {
          addressPrefix: '10.72.3.0/26'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

output networkId string = network.id
output workloadIdentities array = [for (name, i) in ['ingress', 'worker', 'scanner']: {
  name: name
  resourceId: identities[i].id
  clientId: identities[i].properties.clientId
  principalId: identities[i].properties.principalId
}]
