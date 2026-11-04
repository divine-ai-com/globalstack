targetScope = 'resourceGroup'

param location string = 'eastus'
param storageAccountName string
param serviceBusNamespaceName string
param eventGridTopicName string
param appConfigurationStoreName string

var blobContainerName = 'artifacts'
var queueName = 'jobs'
var serviceBusTopicName = 'events'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {}
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: blobContainerName
  properties: {
    publicAccess: 'None'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {}
}

resource storageQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-05-01' = {
  parent: queueService
  name: queueName
  properties: {}
}

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: serviceBusNamespaceName
  location: location
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {}
}

resource serviceBusTopic 'Microsoft.ServiceBus/namespaces/topics@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: serviceBusTopicName
  properties: {}
}

resource eventGridTopic 'Microsoft.EventGrid/topics@2022-06-15' = {
  name: eventGridTopicName
  location: location
  properties: {
    inputSchema: 'EventGridSchema'
  }
}

resource appConfigurationStore 'Microsoft.AppConfiguration/configurationStores@2023-03-01' = {
  name: appConfigurationStoreName
  location: location
  sku: {
    name: 'free'
  }
  properties: {
    disableLocalAuth: false
    publicNetworkAccess: 'Enabled'
  }
}

output storageAccountName string = storageAccount.name
output blobContainerName string = blobContainer.name
output queueName string = storageQueue.name
output serviceBusTopicName string = serviceBusTopic.name
output eventGridTopicName string = eventGridTopic.name
output appConfigurationStoreName string = appConfigurationStore.name
