param serviceName string
param location string
param runId string
param runnerIp string
resource service 'Microsoft.Search/searchServices@2025-05-01' = {
  name: serviceName
  location: location
  tags: {
    project: 'globalstack-production-scenarios'
    run: runId
  }
  sku: { name: 'basic' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'Default'
    publicNetworkAccess: 'enabled'
    disableLocalAuth: false
    networkRuleSet: { ipRules: [{ value: runnerIp }] }
  }
}
