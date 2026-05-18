targetScope = 'subscription'

param location string = 'eastus'
param resourceGroupName string = 'rg-gs-bicep-sample'
param storageAccountName string = 'gsbicepsample001'
param serviceBusNamespaceName string = 'gs-sb-bicep-sample'
param eventGridTopicName string = 'gs-eg-bicep-sample'
param appConfigurationStoreName string = 'gscfgbicepsample001'

resource rg 'Microsoft.Resources/resourceGroups@2022-09-01' = {
  name: resourceGroupName
  location: location
  tags: {
    purpose: 'globalstack-bicep-runner-smoke'
  }
}

module workload './workload.bicep' = {
  name: 'globalstack-bicep-workload'
  scope: rg
  params: {
    location: location
    storageAccountName: storageAccountName
    serviceBusNamespaceName: serviceBusNamespaceName
    eventGridTopicName: eventGridTopicName
    appConfigurationStoreName: appConfigurationStoreName
  }
}

output resourceGroupName string = resourceGroupName
output storageAccountName string = workload.outputs.storageAccountName
output blobContainerName string = workload.outputs.blobContainerName
output queueName string = workload.outputs.queueName
output serviceBusTopicName string = workload.outputs.serviceBusTopicName
output eventGridTopicName string = workload.outputs.eventGridTopicName
output appConfigurationStoreName string = workload.outputs.appConfigurationStoreName
