targetScope = 'subscription'

param deploymentSuffix string
param location string
param resourceGroupName string
param storageAccountName string
param documentsContainerName string
param jobsQueueName string
param filesShareName string
param ledgerTableName string
param serviceBusNamespaceName string
param serviceBusTopicName string
param eventGridTopicName string
param eventHubsNamespaceName string
param eventHubName string
param appConfigStoreName string

resource resourceGroup 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: resourceGroupName
  location: location
}

module workload './workload.bicep' = {
  name: 'workload-${deploymentSuffix}'
  scope: resourceGroup
  params: {
    location: location
    storageAccountName: storageAccountName
    documentsContainerName: documentsContainerName
    jobsQueueName: jobsQueueName
    filesShareName: filesShareName
    ledgerTableName: ledgerTableName
    serviceBusNamespaceName: serviceBusNamespaceName
    serviceBusTopicName: serviceBusTopicName
    eventGridTopicName: eventGridTopicName
    eventHubsNamespaceName: eventHubsNamespaceName
    eventHubName: eventHubName
    appConfigStoreName: appConfigStoreName
  }
}

output KnowledgeStorageAccountName string = workload.outputs.KnowledgeStorageAccountName
output KnowledgeDocumentsContainerName string = workload.outputs.KnowledgeDocumentsContainerName
output KnowledgeJobsQueueName string = workload.outputs.KnowledgeJobsQueueName
output KnowledgeFilesShareName string = workload.outputs.KnowledgeFilesShareName
output KnowledgeLedgerTableName string = workload.outputs.KnowledgeLedgerTableName
output KnowledgeEventsTopicName string = workload.outputs.KnowledgeEventsTopicName
output KnowledgeStreamHubName string = workload.outputs.KnowledgeStreamHubName
output KnowledgeConfigStoreName string = workload.outputs.KnowledgeConfigStoreName
