targetScope = 'resourceGroup'

param location string
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

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource documentsContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: documentsContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource jobsQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: jobsQueueName
  properties: {}
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource filesShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-01-01' = {
  parent: fileService
  name: filesShareName
  properties: {
    shareQuota: 32
  }
}

resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource ledgerTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2023-01-01' = {
  parent: tableService
  name: ledgerTableName
  properties: {}
}

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2021-11-01' = {
  name: serviceBusNamespaceName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {}
}

resource serviceBusTopic 'Microsoft.ServiceBus/namespaces/topics@2021-11-01' = {
  parent: serviceBusNamespace
  name: serviceBusTopicName
  properties: {
    maxSizeInMegabytes: 1024
  }
}

resource eventGridTopic 'Microsoft.EventGrid/topics@2022-06-15' = {
  name: eventGridTopicName
  location: location
  properties: {
    inputSchema: 'EventGridSchema'
  }
}

resource eventHubsNamespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: eventHubsNamespaceName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  properties: {}
}

resource eventHub 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = {
  parent: eventHubsNamespace
  name: eventHubName
  properties: {
    partitionCount: 2
    messageRetentionInDays: 1
  }
}

resource appConfigStore 'Microsoft.AppConfiguration/configurationStores@2023-03-01' = {
  name: appConfigStoreName
  location: location
  sku: {
    name: 'free'
  }
  properties: {
    disableLocalAuth: false
  }
}

output KnowledgeStorageAccountName string = storageAccount.name
output KnowledgeDocumentsContainerName string = documentsContainer.name
output KnowledgeJobsQueueName string = jobsQueue.name
output KnowledgeFilesShareName string = filesShare.name
output KnowledgeLedgerTableName string = ledgerTable.name
output KnowledgeEventsTopicName string = serviceBusTopic.name
output KnowledgeStreamHubName string = eventHub.name
output KnowledgeConfigStoreName string = appConfigStore.name
