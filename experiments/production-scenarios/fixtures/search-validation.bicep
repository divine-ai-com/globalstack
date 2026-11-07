targetScope = 'subscription'
param groupName string
param serviceName string
param location string
resource group 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: groupName
  location: location
}
module search './search-service.bicep' = {
  name: 'search-foundation'
  scope: group
  params: {
    serviceName: serviceName
    location: location
  }
}
