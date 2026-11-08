param serviceName string
param location string
param runId string
param publisherPrincipalId string
param workerIdentityName string
param ingressIdentityName string
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
resource search 'Microsoft.Search/searchServices@2025-05-01' = {
  name: '${serviceName}-search'
  location: location
  tags: tags
  sku: { name: 'basic' }
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

output searchEndpoint string = 'https://${search.name}.search.windows.net'
output searchServiceId string = search.id
