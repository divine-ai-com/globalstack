param accountName string
param topicName string
param roleName string
param runId string
param location string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: accountName
}
resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource arrivals 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: 'event-arrivals'
  properties: {}
}
resource topic 'Microsoft.EventGrid/systemTopics@2025-02-15' = {
  name: topicName
  location: location
  identity: { type: 'SystemAssigned' }
  tags: { project: 'globalstack-storage-component', run: runId }
  properties: {
    source: storage.id
    topicType: 'Microsoft.Storage.StorageAccounts'
  }
}
resource sender 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: arrivals
  name: roleName
  properties: {
    principalId: topic.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'c6a89b2d-59bc-44d0-9896-0f6e12d7b80a')
  }
}
resource subscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2025-02-15' = {
  parent: topic
  name: 'blob-arrivals'
  properties: {
    eventDeliverySchema: 'EventGridSchema'
    deliveryWithResourceIdentity: {
      identity: { type: 'SystemAssigned' }
      destination: {
        endpointType: 'StorageQueue'
        properties: {
          resourceId: storage.id
          queueName: arrivals.name
          queueMessageTimeToLiveInSeconds: 300
        }
      }
    }
    filter: {
      includedEventTypes: ['Microsoft.Storage.BlobCreated']
      subjectBeginsWith: '/blobServices/default/containers/event-landing/blobs/'
      isSubjectCaseSensitive: true
    }
    retryPolicy: { maxDeliveryAttempts: 3, eventTimeToLiveInMinutes: 5 }
  }
  dependsOn: [sender]
}

output systemTopicId string = topic.id
output eventSubscriptionId string = subscription.id
output senderRoleId string = sender.id
