param serviceName string
param location string
param runId string
param publisherPrincipalId string
param roleAssignmentNames array
var tags = { project: 'globalstack-production-scenarios', run: runId }
resource scannerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${serviceName}-scanner'
  location: location
  tags: tags
}
resource workerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${serviceName}-worker'
  location: location
  tags: tags
}
resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${serviceName}images'
  location: location
  tags: tags
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}
resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${serviceName}-scanner'
  location: location
  tags: tags
  properties: {
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    zoneRedundant: false
  }
}
resource pullGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[0]
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '7f951dda-4ed3-4680-a7ca-43fe172d538d')
    principalId: scannerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}
resource pushGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[1]
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '8311e382-0749-4cb8-b61a-304f252e45ec')
    principalId: publisherPrincipalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}
output registryHost string = registry.properties.loginServer
output environmentId string = environment.id
output workerClientId string = workerIdentity.properties.clientId
output workerPrincipalId string = workerIdentity.properties.principalId
