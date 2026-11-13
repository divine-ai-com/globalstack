param serviceName string
param location string
param runId string
param publisherPrincipalId string
param roleAssignmentNames array

var tags = { project: 'globalstack-production-scenarios', run: runId }
var storageRoles = [
  'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  '974c5e8b-45b9-4653-ba55-5f855dd0fb88'
  '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
  '17d1049b-9a84-46fb-8f53-869881c3d3ab'
]
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${serviceName}-worker'
  location: location
  tags: tags
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: '${serviceName}host'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${serviceName}images'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}
resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: '${serviceName}-worker'
  location: location
  tags: tags
  kind: 'elastic'
  sku: { name: 'EP1', tier: 'ElasticPremium', capacity: 1 }
  properties: { reserved: true, maximumElasticWorkerCount: 1 }
}
resource storageGrants 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (role, i) in storageRoles: {
  name: roleAssignmentNames[i]
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', role)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}]
resource pullGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[4]
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}
resource pushGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[5]
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
    principalId: publisherPrincipalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}
output registryHost string = registry.properties.loginServer
output workerClientId string = identity.properties.clientId
