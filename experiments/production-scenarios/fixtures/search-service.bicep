param serviceName string
param location string
resource service 'Microsoft.Search/searchServices@2025-05-01' = {
  name: serviceName
  location: location
  sku: { name: 'basic' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'Default'
    publicNetworkAccess: 'disabled'
    disableLocalAuth: true
  }
}
