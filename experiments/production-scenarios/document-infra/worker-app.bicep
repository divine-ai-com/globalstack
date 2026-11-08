param serviceName string
param location string
param runId string
param imageReference string
param applicationSettings array = []

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' existing = { name: '${serviceName}-worker' }
resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' existing = { name: '${serviceName}host' }
resource plan 'Microsoft.Web/serverfarms@2024-11-01' existing = { name: '${serviceName}-worker' }
resource app 'Microsoft.Web/sites@2024-11-01' = {
  name: '${serviceName}-worker'
  location: location
  tags: { project: 'globalstack-production-scenarios', run: runId }
  kind: 'functionapp,linux,container'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${identity.id}': {} }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${imageReference}'
      acrUseManagedIdentityCreds: true
      acrUserManagedIdentityID: identity.properties.clientId
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      minimumElasticInstanceCount: 1
      functionAppScaleLimit: 1
      appSettings: concat([
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'AZURE_CLIENT_ID', value: identity.properties.clientId }
        { name: 'AzureWebJobsStorage__accountName', value: storage.name }
        { name: 'AzureWebJobsStorage__credential', value: 'managedidentity' }
        { name: 'AzureWebJobsStorage__clientId', value: identity.properties.clientId }
        { name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE', value: 'false' }
      ], applicationSettings)
    }
  }
}
output hostname string = app.properties.defaultHostName
