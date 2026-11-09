param serviceName string
param location string
param runId string
param tenantId string
param administratorObjectId string
param administratorName string

var tags = { project: 'globalstack-production-scenarios', run: runId }

resource worker 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${serviceName}-worker'
  location: location
  tags: tags
}

resource ingress 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${serviceName}-ingress'
  location: location
  tags: tags
}

resource server 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${serviceName}-db'
  location: location
  tags: tags
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: '16'
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    authConfig: {
      activeDirectoryAuth: 'Enabled'
      passwordAuth: 'Disabled'
      tenantId: tenantId
    }
    network: { publicNetworkAccess: 'Enabled' }
  }
}

resource administrator 'Microsoft.DBforPostgreSQL/flexibleServers/administrators@2024-08-01' = {
  parent: server
  name: administratorObjectId
  properties: {
    principalName: administratorName
    principalType: 'ServicePrincipal'
    tenantId: tenantId
  }
}

resource database 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: server
  name: 'documents'
  properties: { charset: 'UTF8', collation: 'en_US.utf8' }
}

output databaseHost string = '${server.name}.postgres.database.azure.com'
output databaseName string = database.name
output serverId string = server.id
output workerPrincipalId string = worker.properties.principalId
output ingressPrincipalId string = ingress.properties.principalId
