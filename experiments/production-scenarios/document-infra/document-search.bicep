param serviceName string
param location string
param runId string
param publisherPrincipalId string
param workerIdentityName string
param ingressIdentityName string
param storageAccountName string
param roleAssignmentNames array

var tags = { project: 'globalstack-production-scenarios', run: runId }
var roleIds = [
  '7ca78c08-252a-4471-8644-bb5ff32d4ba0' // Search Service Contributor
  '8ebe5a00-799e-43f5-93ac-243d3dce84a7' // Search Index Data Contributor
  '1407120a-92aa-4202-b7e9-c0e197c71c8f' // Search Index Data Reader
]

resource worker 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: workerIdentityName
}
resource ingress 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: ingressIdentityName
}
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource projection 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' existing = {
  parent: blobService
  name: 'clean-projection'
}
resource search 'Microsoft.Search/searchServices@2025-05-01' = {
  name: '${serviceName}-search'
  location: location
  tags: tags
  sku: { name: 'basic' }
  identity: { type: 'SystemAssigned' }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'Default'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    semanticSearch: 'disabled'
  }
}
resource grants 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (roleId, i) in roleIds: {
  name: roleAssignmentNames[i]
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
    principalId: i == 0 ? publisherPrincipalId : i == 1 ? worker.properties.principalId : ingress.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}]
resource projectionReadGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[3]
  scope: projection
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
    principalId: search.identity.principalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}
resource pilotQueryGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[4]
  scope: search
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '1407120a-92aa-4202-b7e9-c0e197c71c8f')
    principalId: publisherPrincipalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}

output searchEndpoint string = 'https://${search.name}.search.windows.net'
output searchServiceId string = search.id
output projectionReadRoleId string = projectionReadGrant.id
