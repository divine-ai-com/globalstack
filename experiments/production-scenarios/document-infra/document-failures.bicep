param namespaceName string
param location string
param runId string
param workerIdentityName string
param roleAssignmentNames array

resource worker 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = {
  name: workerIdentityName
}
resource namespace 'Microsoft.ServiceBus/namespaces@2024-01-01' = {
  name: namespaceName
  location: location
  tags: { project: 'globalstack-production-scenarios', run: runId }
  sku: { name: 'Standard', tier: 'Standard' }
  properties: { disableLocalAuth: true, publicNetworkAccess: 'Enabled' }
}
resource queue 'Microsoft.ServiceBus/namespaces/queues@2024-01-01' = {
  parent: namespace
  name: 'document-failures'
  properties: {
    maxDeliveryCount: 3
    lockDuration: 'PT1M'
    defaultMessageTimeToLive: 'P7D'
    deadLetteringOnMessageExpiration: true
  }
}
var roleIds = [
  '69a216fc-b8fb-44d8-bc22-1f3c2cd27a39' // Azure Service Bus Data Sender
  '4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0' // Azure Service Bus Data Receiver
]
resource grants 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (roleId, i) in roleIds: {
  name: roleAssignmentNames[i]
  scope: queue
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleId)
    principalId: worker.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'globalstack-production-scenarios:${runId}'
  }
}]

output namespaceHost string = '${namespace.name}.servicebus.windows.net'
output queueName string = queue.name
output namespaceId string = namespace.id
output queueId string = queue.id
