param accountName string
param workerIdentityName string
param publisherPrincipalId string
param roleAssignmentNames array
param location string
param runId string
var containerNames = ['landing', 'clean-projection', 'quarantine', 'event-deadletters']

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: accountName
  location: location
  tags: { project: 'globalstack-production-scenarios', run: runId }
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    isVersioningEnabled: true
    deleteRetentionPolicy: { enabled: true, days: 7 }
    containerDeleteRetentionPolicy: { enabled: true, days: 7 }
  }
}

resource containers 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = [for containerName in containerNames: {
  parent: blobService
  name: containerName
  properties: { publicAccess: 'None' }
}]

resource workerIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: workerIdentityName
}

resource uploadGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[0]
  scope: storage
  properties: {
    principalId: publisherPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    description: 'globalstack-production-scenarios:${runId}'
  }
}

resource workerGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: roleAssignmentNames[1]
  scope: storage
  properties: {
    principalId: workerIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    description: 'globalstack-production-scenarios:${runId}'
  }
}

output accountId string = storage.id
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output deployedContainerNames array = containerNames
output uploadRoleId string = uploadGrant.id
output workerRoleId string = workerGrant.id
