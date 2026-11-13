param accountName string
param workerName string
param topicName string
param deadLetterRoleName string
param location string
param runId string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = { name: accountName }
resource worker 'Microsoft.Web/sites@2024-11-01' existing = { name: workerName }

resource topic 'Microsoft.EventGrid/systemTopics@2025-02-15' = {
  name: topicName
  location: location
  identity: { type: 'SystemAssigned' }
  tags: { project: 'globalstack-production-scenarios', run: runId }
  properties: {
    source: storage.id
    topicType: 'Microsoft.Storage.StorageAccounts'
  }
}

resource deadLetterGrant 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: deadLetterRoleName
  scope: storage
  properties: {
    principalId: topic.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    description: 'globalstack-production-scenarios:${runId}'
  }
}

resource subscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2025-02-15' = {
  parent: topic
  name: 'document-revisions'
  properties: {
    eventDeliverySchema: 'EventGridSchema'
    destination: {
      endpointType: 'AzureFunction'
      properties: { resourceId: '${worker.id}/functions/documentUploaded' }
    }
    filter: {
      includedEventTypes: ['Microsoft.Storage.BlobCreated', 'Microsoft.Storage.BlobDeleted']
      subjectBeginsWith: '/blobServices/default/containers/landing/blobs/'
      isSubjectCaseSensitive: true
    }
    retryPolicy: { maxDeliveryAttempts: 3, eventTimeToLiveInMinutes: 30 }
    deadLetterWithResourceIdentity: {
      identity: { type: 'SystemAssigned' }
      deadLetterDestination: {
        endpointType: 'StorageBlob'
        properties: { resourceId: storage.id, blobContainerName: 'event-deadletters' }
      }
    }
  }
  dependsOn: [deadLetterGrant]
}

output systemTopicId string = topic.id
output eventSubscriptionId string = subscription.id
output deadLetterRoleId string = deadLetterGrant.id
