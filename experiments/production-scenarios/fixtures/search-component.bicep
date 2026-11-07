targetScope = 'subscription'
param groupName string
param serviceName string
param location string
param runId string
param runnerIp string
resource group 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: groupName
  location: location
  tags: {
    project: 'globalstack-production-scenarios'
    run: runId
  }
}
module search './search-component-service.bicep' = {
  name: 'search-component'
  scope: group
  params: {
    serviceName: serviceName
    location: location
    runId: runId
    runnerIp: runnerIp
  }
}
