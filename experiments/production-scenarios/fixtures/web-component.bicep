targetScope = 'subscription'
param groupName string
param serviceName string
param location string
param runId string
resource group 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: groupName
  location: location
  tags: {
    project: 'globalstack-production-scenarios'
    run: runId
  }
}
module hosting './web-plans.bicep' = {
  name: 'web-component'
  scope: group
  params: {
    serviceName: serviceName
    location: location
  }
}
