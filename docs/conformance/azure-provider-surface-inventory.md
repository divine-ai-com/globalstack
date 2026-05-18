# Azure Provider Surface Inventory

This file is generated from Azure ARM provider operation metadata. It is a live surface inventory input, not proof that GlobalStack emulates the behavior.

Generated: 2026-05-16T13:35:07.590Z
Provider namespaces queried: 25
Capabilities: 30

| Capability | Tier | Provider Resource Types | Matched Provider Operations | Read | Write | Delete | Action | Other |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| blob-storage | 1 | Microsoft.Storage/storageAccounts<br>Microsoft.Storage/storageAccounts/blobServices/containers | 233 | 72 | 50 | 29 | 82 | 0 |
| azure-functions | 1 | Microsoft.Web/sites<br>Microsoft.Web/serverfarms | 418 | 194 | 63 | 58 | 103 | 0 |
| api-management | 1 | Microsoft.ApiManagement/service<br>Microsoft.ApiManagement/service/apis | 511 | 178 | 139 | 133 | 61 | 0 |
| identity-rbac | 1 | Microsoft.ManagedIdentity/userAssignedIdentities<br>Microsoft.Authorization/roleAssignments<br>Microsoft.Authorization/roleDefinitions | 15 | 4 | 4 | 4 | 3 | 0 |
| key-vault-secrets | 1 | Microsoft.KeyVault/vaults<br>Microsoft.KeyVault/vaults/secrets | 96 | 20 | 13 | 12 | 51 | 0 |
| key-vault-keys | 1 | Microsoft.KeyVault/vaults<br>Microsoft.KeyVault/vaults/keys | 105 | 22 | 13 | 12 | 58 | 0 |
| postgresql-flexible-server | 1 | Microsoft.DBforPostgreSQL/flexibleServers<br>Microsoft.DBforPostgreSQL/flexibleServers/databases | 89 | 36 | 15 | 10 | 28 | 0 |
| cosmos-nosql-table | 1 | Microsoft.DocumentDB/databaseAccounts<br>Microsoft.Storage/storageAccounts/tableServices/tables | 296 | 145 | 54 | 33 | 64 | 0 |
| service-bus-topics | 1 | Microsoft.ServiceBus/namespaces<br>Microsoft.ServiceBus/namespaces/topics | 110 | 35 | 24 | 22 | 29 | 0 |
| event-grid | 1 | Microsoft.EventGrid/topics<br>Microsoft.EventGrid/eventSubscriptions | 35 | 13 | 8 | 6 | 8 | 0 |
| container-registry | 1 | Microsoft.ContainerRegistry/registries | 118 | 47 | 30 | 22 | 19 | 0 |
| aks-metadata | 1 | Microsoft.ContainerService/managedClusters | 453 | 230 | 102 | 93 | 28 | 0 |
| monitor-logs | 1 | Microsoft.OperationalInsights/workspaces<br>Microsoft.Insights/diagnosticSettings | 1010 | 952 | 22 | 19 | 17 | 0 |
| monitor-metrics-alerts | 1 | Microsoft.Insights/metricAlerts<br>Microsoft.Insights/actionGroups | 12 | 5 | 3 | 3 | 1 | 0 |
| virtual-network | 1 | Microsoft.Network/virtualNetworks<br>Microsoft.Network/privateEndpoints<br>Microsoft.Network/privateDnsZones | 110 | 40 | 23 | 20 | 27 | 0 |
| mysql-flexible-server | 2 | Microsoft.DBforMySQL/flexibleServers<br>Microsoft.DBforMySQL/flexibleServers/databases | 67 | 25 | 15 | 9 | 18 | 0 |
| queue-storage | 2 | Microsoft.Storage/storageAccounts/queueServices/queues<br>Microsoft.ServiceBus/namespaces/queues | 22 | 5 | 5 | 5 | 7 | 0 |
| redis-cache | 2 | Microsoft.Cache/redis<br>Microsoft.Cache/redisEnterprise | 73 | 22 | 14 | 13 | 24 | 0 |
| logic-workflows | 2 | Microsoft.Logic/workflows<br>Microsoft.Web/sites | 425 | 190 | 59 | 56 | 120 | 0 |
| dns-zones | 2 | Microsoft.Network/dnsZones<br>Microsoft.Network/privateDnsZones | 81 | 32 | 26 | 22 | 1 | 0 |
| load-balancing | 2 | Microsoft.Network/applicationGateways<br>Microsoft.Network/loadBalancers | 67 | 21 | 7 | 6 | 33 | 0 |
| front-door-cdn | 2 | Microsoft.Cdn/profiles<br>Microsoft.Cdn/profiles/afdEndpoints<br>Microsoft.Cdn/profiles/endpoints | 133 | 37 | 27 | 24 | 45 | 0 |
| waf-policy | 2 | Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies<br>Microsoft.Cdn/profiles/securityPolicies | 9 | 2 | 2 | 2 | 3 | 0 |
| activity-log-audit | 2 | Microsoft.Insights/diagnosticSettings<br>Microsoft.EventGrid/systemTopics | 15 | 6 | 4 | 3 | 2 | 0 |
| azure-files | 2 | Microsoft.Storage/storageAccounts/fileServices/shares<br>Microsoft.NetApp/netAppAccounts/capacityPools/volumes | 70 | 17 | 8 | 7 | 38 | 0 |
| event-hubs-streams | 2 | Microsoft.EventHub/namespaces<br>Microsoft.EventHub/namespaces/eventhubs | 93 | 30 | 20 | 18 | 25 | 0 |
| synapse-warehouse | 2 | Microsoft.Synapse/workspaces<br>Microsoft.Synapse/workspaces/sqlPools | 244 | 122 | 58 | 26 | 38 | 0 |
| app-configuration-parameters | 2 | Microsoft.AppConfiguration/configurationStores<br>Microsoft.KeyVault/vaults/secrets | 57 | 16 | 13 | 11 | 17 | 0 |
| database-migration-service | 2 | Microsoft.DataMigration/services<br>Microsoft.DataMigration/services/projects | 34 | 7 | 7 | 7 | 13 | 0 |
| service-discovery | 2 | Microsoft.Network/privateDnsZones<br>Microsoft.App/managedEnvironments<br>Microsoft.App/containerApps | 131 | 47 | 30 | 31 | 23 | 0 |

## Policy

- A capability is not considered API-complete until its provider-operation inventory has been reconciled with ARM REST specs, SDK/IaC provider behavior, and real Azure captures.
- Provider operation metadata does not include every data-plane operation and does not prove status codes, error shapes, defaults, async behavior, RBAC behavior, or eventual consistency.
- Unknown or unreconciled operations must fail closed locally.

