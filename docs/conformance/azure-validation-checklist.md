# Azure Validation Checklist

This generated checklist tracks real Azure conformance work. An item is checked only when a fixture exists and ephemeral resource-group cleanup was verified.

## Operating Rules

- [x] Azure CLI installed and authenticated.
- [x] Real Azure execution remains gated by `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1`.
- [x] Runner supports single capability, resource type, and variance-case targeting.
- [x] Runner verifies ephemeral resource-group deletion after each Azure case.
- [ ] Captured Azure responses are normalized into local emulator expectations for every checked case.

## Progress

- Candidate calls: 336
- Candidate create/update calls: 84
- Real Azure fixtures with verified cleanup: 448

## Tier 1

### blob-storage / Microsoft.Storage/storageAccounts / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 202; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### blob-storage / Microsoft.Storage/storageAccounts / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### blob-storage / Microsoft.Storage/storageAccounts / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### blob-storage / Microsoft.Storage/storageAccounts / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### blob-storage / Microsoft.Storage/storageAccounts/blobServices/containers / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### blob-storage / Microsoft.Storage/storageAccounts/blobServices/containers / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### blob-storage / Microsoft.Storage/storageAccounts/blobServices/containers / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### blob-storage / Microsoft.Storage/storageAccounts/blobServices/containers / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### azure-functions / Microsoft.Web/sites / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### azure-functions / Microsoft.Web/sites / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### azure-functions / Microsoft.Web/sites / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### azure-functions / Microsoft.Web/sites / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### azure-functions / Microsoft.Web/serverfarms / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 401; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### azure-functions / Microsoft.Web/serverfarms / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### azure-functions / Microsoft.Web/serverfarms / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### azure-functions / Microsoft.Web/serverfarms / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### api-management / Microsoft.ApiManagement/service / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### api-management / Microsoft.ApiManagement/service / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### api-management / Microsoft.ApiManagement/service / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### api-management / Microsoft.ApiManagement/service / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### api-management / Microsoft.ApiManagement/service/apis / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### api-management / Microsoft.ApiManagement/service/apis / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### api-management / Microsoft.ApiManagement/service/apis / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### api-management / Microsoft.ApiManagement/service/apis / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### identity-rbac / Microsoft.ManagedIdentity/userAssignedIdentities / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### identity-rbac / Microsoft.ManagedIdentity/userAssignedIdentities / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### identity-rbac / Microsoft.ManagedIdentity/userAssignedIdentities / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### identity-rbac / Microsoft.ManagedIdentity/userAssignedIdentities / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### identity-rbac / Microsoft.Authorization/roleAssignments / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### identity-rbac / Microsoft.Authorization/roleAssignments / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### identity-rbac / Microsoft.Authorization/roleAssignments / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### identity-rbac / Microsoft.Authorization/roleAssignments / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### identity-rbac / Microsoft.Authorization/roleDefinitions / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### identity-rbac / Microsoft.Authorization/roleDefinitions / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### identity-rbac / Microsoft.Authorization/roleDefinitions / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### identity-rbac / Microsoft.Authorization/roleDefinitions / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 200; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults/secrets / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults/secrets / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults/secrets / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### key-vault-secrets / Microsoft.KeyVault/vaults/secrets / Delete

- [x] `not-found`: captured HTTP 405; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 200; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults/keys / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults/keys / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults/keys / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### key-vault-keys / Microsoft.KeyVault/vaults/keys / Delete

- [x] `not-found`: captured HTTP 405; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers/databases / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers/databases / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers/databases / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### postgresql-flexible-server / Microsoft.DBforPostgreSQL/flexibleServers/databases / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases / Get

- [ ] `not-found`: pending

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases / ListByResourceGroup

- [ ] `empty-list`: pending

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases / Delete

- [ ] `not-found`: pending

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers / Get

- [ ] `not-found`: pending

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers / ListByResourceGroup

- [ ] `empty-list`: pending

### cosmos-nosql-table / Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers / Delete

- [ ] `not-found`: pending

### cosmos-nosql-table / Microsoft.Storage/storageAccounts/tableServices/tables / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### cosmos-nosql-table / Microsoft.Storage/storageAccounts/tableServices/tables / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### cosmos-nosql-table / Microsoft.Storage/storageAccounts/tableServices/tables / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### cosmos-nosql-table / Microsoft.Storage/storageAccounts/tableServices/tables / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified
- [x] `invalid-sku`: captured HTTP 404; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics/subscriptions / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending
- [ ] `invalid-sku`: pending

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics/subscriptions / Get

- [ ] `not-found`: pending

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics/subscriptions / ListByResourceGroup

- [ ] `empty-list`: pending

### service-bus-topics / Microsoft.ServiceBus/namespaces/topics/subscriptions / Delete

- [ ] `not-found`: pending

### event-grid / Microsoft.EventGrid/topics / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### event-grid / Microsoft.EventGrid/topics / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### event-grid / Microsoft.EventGrid/topics / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### event-grid / Microsoft.EventGrid/topics / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### event-grid / Microsoft.EventGrid/eventSubscriptions / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### event-grid / Microsoft.EventGrid/eventSubscriptions / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### event-grid / Microsoft.EventGrid/eventSubscriptions / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### event-grid / Microsoft.EventGrid/eventSubscriptions / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### container-registry / Microsoft.ContainerRegistry/registries / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### container-registry / Microsoft.ContainerRegistry/registries / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### container-registry / Microsoft.ContainerRegistry/registries / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### container-registry / Microsoft.ContainerRegistry/registries / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### aks-metadata / Microsoft.ContainerService/managedClusters / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### aks-metadata / Microsoft.ContainerService/managedClusters / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### aks-metadata / Microsoft.ContainerService/managedClusters / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### aks-metadata / Microsoft.ContainerService/managedClusters / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### monitor-logs / Microsoft.OperationalInsights/workspaces / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 201; cleanup verified

### monitor-logs / Microsoft.OperationalInsights/workspaces / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### monitor-logs / Microsoft.OperationalInsights/workspaces / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### monitor-logs / Microsoft.OperationalInsights/workspaces / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### monitor-logs / Microsoft.Insights/diagnosticSettings / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### monitor-logs / Microsoft.Insights/diagnosticSettings / Get

- [x] `not-found`: captured HTTP 400; cleanup verified

### monitor-logs / Microsoft.Insights/diagnosticSettings / ListByResourceGroup

- [x] `empty-list`: captured HTTP 400; cleanup verified

### monitor-logs / Microsoft.Insights/diagnosticSettings / Delete

- [x] `not-found`: captured HTTP 400; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/metricAlerts / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/metricAlerts / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/metricAlerts / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/metricAlerts / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/actionGroups / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/actionGroups / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/actionGroups / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### monitor-metrics-alerts / Microsoft.Insights/actionGroups / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### virtual-network / Microsoft.Network/virtualNetworks / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### virtual-network / Microsoft.Network/virtualNetworks / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### virtual-network / Microsoft.Network/virtualNetworks / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### virtual-network / Microsoft.Network/virtualNetworks / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### virtual-network / Microsoft.Network/privateEndpoints / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### virtual-network / Microsoft.Network/privateEndpoints / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### virtual-network / Microsoft.Network/privateEndpoints / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### virtual-network / Microsoft.Network/privateEndpoints / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### virtual-network / Microsoft.Network/privateDnsZones / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 202; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### virtual-network / Microsoft.Network/privateDnsZones / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### virtual-network / Microsoft.Network/privateDnsZones / ListByResourceGroup

- [x] `empty-list`: captured HTTP 400; cleanup verified

### virtual-network / Microsoft.Network/privateDnsZones / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

## Tier 2

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers/databases / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified
- [x] `invalid-sku`: captured HTTP 404; cleanup verified

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers/databases / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers/databases / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### mysql-flexible-server / Microsoft.DBforMySQL/flexibleServers/databases / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.Storage/storageAccounts/queueServices/queues / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.Storage/storageAccounts/queueServices/queues / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.Storage/storageAccounts/queueServices/queues / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.Storage/storageAccounts/queueServices/queues / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.ServiceBus/namespaces/queues / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.ServiceBus/namespaces/queues / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.ServiceBus/namespaces/queues / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### queue-storage / Microsoft.ServiceBus/namespaces/queues / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### redis-cache / Microsoft.Cache/redis / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### redis-cache / Microsoft.Cache/redis / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### redis-cache / Microsoft.Cache/redis / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### redis-cache / Microsoft.Cache/redis / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### redis-cache / Microsoft.Cache/redisEnterprise / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### redis-cache / Microsoft.Cache/redisEnterprise / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### redis-cache / Microsoft.Cache/redisEnterprise / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### redis-cache / Microsoft.Cache/redisEnterprise / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### logic-workflows / Microsoft.Logic/workflows / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### logic-workflows / Microsoft.Logic/workflows / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### logic-workflows / Microsoft.Logic/workflows / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### logic-workflows / Microsoft.Logic/workflows / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### logic-workflows / Microsoft.Web/sites / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### logic-workflows / Microsoft.Web/sites / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### logic-workflows / Microsoft.Web/sites / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### logic-workflows / Microsoft.Web/sites / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### dns-zones / Microsoft.Network/dnsZones / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### dns-zones / Microsoft.Network/dnsZones / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### dns-zones / Microsoft.Network/dnsZones / ListByResourceGroup

- [x] `empty-list`: captured HTTP 400; cleanup verified

### dns-zones / Microsoft.Network/dnsZones / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### dns-zones / Microsoft.Network/dnsZones/A / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/A / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/A / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/A / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/AAAA / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/AAAA / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/AAAA / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/AAAA / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/CAA / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/CAA / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/CAA / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/CAA / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/CNAME / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/CNAME / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/CNAME / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/CNAME / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/MX / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/MX / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/MX / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/MX / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/NS / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/NS / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/NS / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/NS / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/PTR / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/PTR / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/PTR / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/PTR / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/SOA / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/SOA / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/SOA / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/SOA / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/SRV / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/SRV / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/SRV / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/SRV / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/TXT / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/dnsZones/TXT / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/dnsZones/TXT / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/dnsZones/TXT / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 202; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### dns-zones / Microsoft.Network/privateDnsZones / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### dns-zones / Microsoft.Network/privateDnsZones / ListByResourceGroup

- [x] `empty-list`: captured HTTP 400; cleanup verified

### dns-zones / Microsoft.Network/privateDnsZones / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### dns-zones / Microsoft.Network/privateDnsZones/A / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/A / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/A / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/A / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/AAAA / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/AAAA / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/AAAA / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/AAAA / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/CNAME / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/CNAME / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/CNAME / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/CNAME / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/MX / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/MX / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/MX / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/MX / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/PTR / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/PTR / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/PTR / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/PTR / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SOA / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SOA / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SOA / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SOA / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SRV / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SRV / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SRV / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/SRV / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/TXT / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/TXT / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/TXT / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/TXT / Delete

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/virtualNetworkLinks / CreateOrUpdate

- [ ] `valid-minimal`: pending
- [ ] `missing-api-version`: pending
- [ ] `invalid-location`: pending
- [ ] `empty-body`: pending

### dns-zones / Microsoft.Network/privateDnsZones/virtualNetworkLinks / Get

- [ ] `not-found`: pending

### dns-zones / Microsoft.Network/privateDnsZones/virtualNetworkLinks / ListByResourceGroup

- [ ] `empty-list`: pending

### dns-zones / Microsoft.Network/privateDnsZones/virtualNetworkLinks / Delete

- [ ] `not-found`: pending

### load-balancing / Microsoft.Network/applicationGateways / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [ ] `invalid-sku`: pending

### load-balancing / Microsoft.Network/applicationGateways / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### load-balancing / Microsoft.Network/applicationGateways / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### load-balancing / Microsoft.Network/applicationGateways / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### load-balancing / Microsoft.Network/loadBalancers / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [ ] `invalid-sku`: pending

### load-balancing / Microsoft.Network/loadBalancers / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### load-balancing / Microsoft.Network/loadBalancers / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### load-balancing / Microsoft.Network/loadBalancers / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/afdEndpoints / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/afdEndpoints / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/afdEndpoints / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/afdEndpoints / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/endpoints / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/endpoints / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/endpoints / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### front-door-cdn / Microsoft.Cdn/profiles/endpoints / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### waf-policy / Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### waf-policy / Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### waf-policy / Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### waf-policy / Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### waf-policy / Microsoft.Cdn/profiles/securityPolicies / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### waf-policy / Microsoft.Cdn/profiles/securityPolicies / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### waf-policy / Microsoft.Cdn/profiles/securityPolicies / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### waf-policy / Microsoft.Cdn/profiles/securityPolicies / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### activity-log-audit / Microsoft.Insights/diagnosticSettings / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### activity-log-audit / Microsoft.Insights/diagnosticSettings / Get

- [x] `not-found`: captured HTTP 400; cleanup verified

### activity-log-audit / Microsoft.Insights/diagnosticSettings / ListByResourceGroup

- [x] `empty-list`: captured HTTP 400; cleanup verified

### activity-log-audit / Microsoft.Insights/diagnosticSettings / Delete

- [x] `not-found`: captured HTTP 400; cleanup verified

### activity-log-audit / Microsoft.EventGrid/systemTopics / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### activity-log-audit / Microsoft.EventGrid/systemTopics / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### activity-log-audit / Microsoft.EventGrid/systemTopics / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### activity-log-audit / Microsoft.EventGrid/systemTopics / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### azure-files / Microsoft.Storage/storageAccounts/fileServices/shares / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### azure-files / Microsoft.Storage/storageAccounts/fileServices/shares / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### azure-files / Microsoft.Storage/storageAccounts/fileServices/shares / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### azure-files / Microsoft.Storage/storageAccounts/fileServices/shares / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### azure-files / Microsoft.NetApp/netAppAccounts/capacityPools/volumes / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### azure-files / Microsoft.NetApp/netAppAccounts/capacityPools/volumes / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### azure-files / Microsoft.NetApp/netAppAccounts/capacityPools/volumes / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### azure-files / Microsoft.NetApp/netAppAccounts/capacityPools/volumes / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces/eventhubs / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified
- [x] `invalid-sku`: captured HTTP 404; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces/eventhubs / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces/eventhubs / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### event-hubs-streams / Microsoft.EventHub/namespaces/eventhubs / Delete

- [x] `not-found`: captured HTTP 404; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces/sqlPools / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces/sqlPools / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces/sqlPools / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### synapse-warehouse / Microsoft.Synapse/workspaces/sqlPools / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### app-configuration-parameters / Microsoft.AppConfiguration/configurationStores / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified
- [x] `invalid-sku`: captured HTTP 400; cleanup verified

### app-configuration-parameters / Microsoft.AppConfiguration/configurationStores / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### app-configuration-parameters / Microsoft.AppConfiguration/configurationStores / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### app-configuration-parameters / Microsoft.AppConfiguration/configurationStores / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### app-configuration-parameters / Microsoft.KeyVault/vaults/secrets / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 404; cleanup verified
- [x] `empty-body`: captured HTTP 404; cleanup verified

### app-configuration-parameters / Microsoft.KeyVault/vaults/secrets / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### app-configuration-parameters / Microsoft.KeyVault/vaults/secrets / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### app-configuration-parameters / Microsoft.KeyVault/vaults/secrets / Delete

- [x] `not-found`: captured HTTP 405; cleanup verified

### database-migration-service / Microsoft.DataMigration/services / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### database-migration-service / Microsoft.DataMigration/services / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### database-migration-service / Microsoft.DataMigration/services / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### database-migration-service / Microsoft.DataMigration/services / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### database-migration-service / Microsoft.DataMigration/services/projects / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 404; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### database-migration-service / Microsoft.DataMigration/services/projects / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### database-migration-service / Microsoft.DataMigration/services/projects / ListByResourceGroup

- [x] `empty-list`: captured HTTP 404; cleanup verified

### database-migration-service / Microsoft.DataMigration/services/projects / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### service-discovery / Microsoft.Network/privateDnsZones / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 202; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### service-discovery / Microsoft.Network/privateDnsZones / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### service-discovery / Microsoft.Network/privateDnsZones / ListByResourceGroup

- [x] `empty-list`: captured HTTP 400; cleanup verified

### service-discovery / Microsoft.Network/privateDnsZones / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### service-discovery / Microsoft.App/managedEnvironments / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 201; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### service-discovery / Microsoft.App/managedEnvironments / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### service-discovery / Microsoft.App/managedEnvironments / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### service-discovery / Microsoft.App/managedEnvironments / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

### service-discovery / Microsoft.App/containerApps / CreateOrUpdate

- [x] `valid-minimal`: captured HTTP 400; cleanup verified
- [x] `missing-api-version`: captured HTTP 400; cleanup verified
- [x] `invalid-location`: captured HTTP 400; cleanup verified
- [x] `empty-body`: captured HTTP 400; cleanup verified

### service-discovery / Microsoft.App/containerApps / Get

- [x] `not-found`: captured HTTP 404; cleanup verified

### service-discovery / Microsoft.App/containerApps / ListByResourceGroup

- [x] `empty-list`: captured HTTP 200; cleanup verified

### service-discovery / Microsoft.App/containerApps / Delete

- [x] `not-found`: captured HTTP 204; cleanup verified

