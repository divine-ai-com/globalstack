param accountName string
param workerName string
param topicName string
param runId string

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = { name: accountName }
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' existing = {
  parent: storage
  name: 'default'
}
resource markerContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'event-diagnostics'
  properties: {
    publicAccess: 'None'
    metadata: { run: runId, project: 'globalstack-production-scenarios' }
  }
}
resource topic 'Microsoft.EventGrid/systemTopics@2025-02-15' existing = { name: topicName }
resource worker 'Microsoft.Web/sites@2024-11-01' existing = { name: workerName }

resource diagnosticSubscription 'Microsoft.EventGrid/systemTopics/eventSubscriptions@2025-02-15' = {
  parent: topic
  name: 'document-diagnostic'
  properties: {
    eventDeliverySchema: 'EventGridSchema'
    destination: {
      endpointType: 'AzureFunction'
      properties: { resourceId: '${worker.id}/functions/documentEventDiagnostic' }
    }
    filter: {
      includedEventTypes: ['Microsoft.Storage.BlobCreated']
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
  dependsOn: [markerContainer]
}

output diagnosticContainerId string = markerContainer.id
output diagnosticEventSubscriptionId string = diagnosticSubscription.id
