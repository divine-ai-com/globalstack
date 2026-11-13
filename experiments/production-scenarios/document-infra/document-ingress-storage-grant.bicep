param accountName string
param ingressIdentityName string
param roleAssignmentName string
param runId string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = { name: accountName }
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource landing 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' existing = {
  parent: blobService
  name: 'landing'
}
resource ingress 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: ingressIdentityName }

resource grant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentName
  scope: landing
  properties: {
    principalId: ingress.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    description: 'globalstack-production-scenarios:${runId}'
  }
}

output landingRoleId string = grant.id
