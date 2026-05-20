# Azure Live API Call Catalog

This catalog filters candidate Azure management-plane API calls for the Tier 1 and Tier 2 AWS-equivalent GlobalStack capabilities.

No call in this file is considered Azure-correct until the exact request shape, status code, error body, defaults, and async behavior are captured from real Azure or an official emulator-backed conformance test.

## Summary

- Capabilities: 30
- Tier 1 capabilities: 15
- Tier 2 capabilities: 15
- Candidate calls: 336
- Create/update calls with parameter variance cases: 84

## Validation Policy

No call is considered Azure-correct until executed against real Azure or matched to an official emulator with conformance tests.

Parameter variance testing starts with `valid-minimal`, `missing-api-version`, `invalid-location`, `empty-body`, and SKU variance where a SKU is present. Provider-specific cases should be added from real Azure captures as each service is validated.

## 99% Parity Work Queue

Use `azure-99-parity-checklist.md` as the service-by-service work queue for real Azure emulation depth. It tracks every Tier 1 and Tier 2 capability against live API surface inventory, parameter variance captures, state transitions, error-shape fidelity, identity/RBAC, retry/eventual consistency, IaC-provider behavior, data-plane behavior, repeat captures, and service-specific facade or official emulator integration.

Generate it with:

```bash
npm run conformance:parity
```

Generate the prioritized execution roadmap with:

```bash
npm run conformance:roadmap
```

Refresh live Azure provider-operation inventory intentionally with:

```bash
npm run providers:surface
```

Provider-operation metadata is inventory input only. It does not prove status codes, defaulting, async behavior, data-plane semantics, or RBAC behavior.

## Tier 1 Calls

| Capability | AWS Analogue | Resource Type | Operation | Method | API Version | Variance Cases |
|---|---|---|---|---|---|---|
| blob-storage | S3 | Microsoft.Storage/storageAccounts | CreateOrUpdate | PUT | 2023-01-01 | 9 |
| blob-storage | S3 | Microsoft.Storage/storageAccounts | Get | GET | 2023-01-01 | 0 |
| blob-storage | S3 | Microsoft.Storage/storageAccounts | ListByResourceGroup | GET | 2023-01-01 | 0 |
| blob-storage | S3 | Microsoft.Storage/storageAccounts | Delete | DELETE | 2023-01-01 | 0 |
| blob-storage | S3 | Microsoft.Storage/storageAccounts/blobServices/containers | CreateOrUpdate | PUT | 2023-01-01 | 7 |
| blob-storage | S3 | Microsoft.Storage/storageAccounts/blobServices/containers | Get | GET | 2023-01-01 | 0 |
| blob-storage | S3 | Microsoft.Storage/storageAccounts/blobServices/containers | ListByResourceGroup | GET | 2023-01-01 | 0 |
| blob-storage | S3 | Microsoft.Storage/storageAccounts/blobServices/containers | Delete | DELETE | 2023-01-01 | 0 |
| azure-functions | Lambda | Microsoft.Web/sites | CreateOrUpdate | PUT | 2023-12-01 | 8 |
| azure-functions | Lambda | Microsoft.Web/sites | Get | GET | 2023-12-01 | 0 |
| azure-functions | Lambda | Microsoft.Web/sites | ListByResourceGroup | GET | 2023-12-01 | 0 |
| azure-functions | Lambda | Microsoft.Web/sites | Delete | DELETE | 2023-12-01 | 0 |
| azure-functions | Lambda | Microsoft.Web/serverfarms | CreateOrUpdate | PUT | 2023-12-01 | 9 |
| azure-functions | Lambda | Microsoft.Web/serverfarms | Get | GET | 2023-12-01 | 0 |
| azure-functions | Lambda | Microsoft.Web/serverfarms | ListByResourceGroup | GET | 2023-12-01 | 0 |
| azure-functions | Lambda | Microsoft.Web/serverfarms | Delete | DELETE | 2023-12-01 | 0 |
| api-management | API Gateway | Microsoft.ApiManagement/service | CreateOrUpdate | PUT | 2023-05-01-preview | 12 |
| api-management | API Gateway | Microsoft.ApiManagement/service | Get | GET | 2023-05-01-preview | 0 |
| api-management | API Gateway | Microsoft.ApiManagement/service | ListByResourceGroup | GET | 2023-05-01-preview | 0 |
| api-management | API Gateway | Microsoft.ApiManagement/service | Delete | DELETE | 2023-05-01-preview | 0 |
| api-management | API Gateway | Microsoft.ApiManagement/service/apis | CreateOrUpdate | PUT | 2023-05-01-preview | 10 |
| api-management | API Gateway | Microsoft.ApiManagement/service/apis | Get | GET | 2023-05-01-preview | 0 |
| api-management | API Gateway | Microsoft.ApiManagement/service/apis | ListByResourceGroup | GET | 2023-05-01-preview | 0 |
| api-management | API Gateway | Microsoft.ApiManagement/service/apis | Delete | DELETE | 2023-05-01-preview | 0 |
| identity-rbac | IAM/STS | Microsoft.ManagedIdentity/userAssignedIdentities | CreateOrUpdate | PUT | 2023-01-31 | 8 |
| identity-rbac | IAM/STS | Microsoft.ManagedIdentity/userAssignedIdentities | Get | GET | 2023-01-31 | 0 |
| identity-rbac | IAM/STS | Microsoft.ManagedIdentity/userAssignedIdentities | ListByResourceGroup | GET | 2023-01-31 | 0 |
| identity-rbac | IAM/STS | Microsoft.ManagedIdentity/userAssignedIdentities | Delete | DELETE | 2023-01-31 | 0 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleAssignments | CreateOrUpdate | PUT | 2022-04-01 | 11 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleAssignments | Get | GET | 2022-04-01 | 0 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleAssignments | ListByResourceGroup | GET | 2022-04-01 | 0 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleAssignments | Delete | DELETE | 2022-04-01 | 0 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleDefinitions | CreateOrUpdate | PUT | 2022-04-01 | 11 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleDefinitions | Get | GET | 2022-04-01 | 0 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleDefinitions | ListByResourceGroup | GET | 2022-04-01 | 0 |
| identity-rbac | IAM/STS | Microsoft.Authorization/roleDefinitions | Delete | DELETE | 2022-04-01 | 0 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults | CreateOrUpdate | PUT | 2023-07-01 | 8 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults | Get | GET | 2023-07-01 | 0 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults | ListByResourceGroup | GET | 2023-07-01 | 0 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults | Delete | DELETE | 2023-07-01 | 0 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults/secrets | CreateOrUpdate | PUT | 2023-07-01 | 8 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults/secrets | Get | GET | 2023-07-01 | 0 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults/secrets | ListByResourceGroup | GET | 2023-07-01 | 0 |
| key-vault-secrets | Secrets Manager | Microsoft.KeyVault/vaults/secrets | Delete | DELETE | 2023-07-01 | 0 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults | CreateOrUpdate | PUT | 2023-07-01 | 8 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults | Get | GET | 2023-07-01 | 0 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults | ListByResourceGroup | GET | 2023-07-01 | 0 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults | Delete | DELETE | 2023-07-01 | 0 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults/keys | CreateOrUpdate | PUT | 2023-07-01 | 8 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults/keys | Get | GET | 2023-07-01 | 0 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults/keys | ListByResourceGroup | GET | 2023-07-01 | 0 |
| key-vault-keys | KMS | Microsoft.KeyVault/vaults/keys | Delete | DELETE | 2023-07-01 | 0 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers | CreateOrUpdate | PUT | 2023-06-01-preview | 14 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers | Get | GET | 2023-06-01-preview | 0 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers | ListByResourceGroup | GET | 2023-06-01-preview | 0 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers | Delete | DELETE | 2023-06-01-preview | 0 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers/databases | CreateOrUpdate | PUT | 2023-06-01-preview | 10 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers/databases | Get | GET | 2023-06-01-preview | 0 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers/databases | ListByResourceGroup | GET | 2023-06-01-preview | 0 |
| postgresql-flexible-server | RDS PostgreSQL | Microsoft.DBforPostgreSQL/flexibleServers/databases | Delete | DELETE | 2023-06-01-preview | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts | CreateOrUpdate | PUT | 2024-05-15 | 8 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts | Get | GET | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts | ListByResourceGroup | GET | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts | Delete | DELETE | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases | CreateOrUpdate | PUT | 2024-05-15 | 9 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases | Get | GET | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases | ListByResourceGroup | GET | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases | Delete | DELETE | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers | CreateOrUpdate | PUT | 2024-05-15 | 11 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers | Get | GET | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers | ListByResourceGroup | GET | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers | Delete | DELETE | 2024-05-15 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.Storage/storageAccounts/tableServices/tables | CreateOrUpdate | PUT | 2023-01-01 | 7 |
| cosmos-nosql-table | DynamoDB | Microsoft.Storage/storageAccounts/tableServices/tables | Get | GET | 2023-01-01 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.Storage/storageAccounts/tableServices/tables | ListByResourceGroup | GET | 2023-01-01 | 0 |
| cosmos-nosql-table | DynamoDB | Microsoft.Storage/storageAccounts/tableServices/tables | Delete | DELETE | 2023-01-01 | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces | CreateOrUpdate | PUT | 2021-11-01 | 9 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces | Get | GET | 2021-11-01 | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces | ListByResourceGroup | GET | 2021-11-01 | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces | Delete | DELETE | 2021-11-01 | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics | CreateOrUpdate | PUT | 2021-11-01 | 9 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics | Get | GET | 2021-11-01 | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics | ListByResourceGroup | GET | 2021-11-01 | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics | Delete | DELETE | 2021-11-01 | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics/subscriptions | CreateOrUpdate | PUT | provider-default-required | 8 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics/subscriptions | Get | GET | provider-default-required | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics/subscriptions | ListByResourceGroup | GET | provider-default-required | 0 |
| service-bus-topics | SNS | Microsoft.ServiceBus/namespaces/topics/subscriptions | Delete | DELETE | provider-default-required | 0 |
| event-grid | EventBridge | Microsoft.EventGrid/topics | CreateOrUpdate | PUT | 2022-06-15 | 8 |
| event-grid | EventBridge | Microsoft.EventGrid/topics | Get | GET | 2022-06-15 | 0 |
| event-grid | EventBridge | Microsoft.EventGrid/topics | ListByResourceGroup | GET | 2022-06-15 | 0 |
| event-grid | EventBridge | Microsoft.EventGrid/topics | Delete | DELETE | 2022-06-15 | 0 |
| event-grid | EventBridge | Microsoft.EventGrid/eventSubscriptions | CreateOrUpdate | PUT | 2022-06-15 | 8 |
| event-grid | EventBridge | Microsoft.EventGrid/eventSubscriptions | Get | GET | 2022-06-15 | 0 |
| event-grid | EventBridge | Microsoft.EventGrid/eventSubscriptions | ListByResourceGroup | GET | 2022-06-15 | 0 |
| event-grid | EventBridge | Microsoft.EventGrid/eventSubscriptions | Delete | DELETE | 2022-06-15 | 0 |
| container-registry | ECR | Microsoft.ContainerRegistry/registries | CreateOrUpdate | PUT | 2023-07-01 | 8 |
| container-registry | ECR | Microsoft.ContainerRegistry/registries | Get | GET | 2023-07-01 | 0 |
| container-registry | ECR | Microsoft.ContainerRegistry/registries | ListByResourceGroup | GET | 2023-07-01 | 0 |
| container-registry | ECR | Microsoft.ContainerRegistry/registries | Delete | DELETE | 2023-07-01 | 0 |
| aks-metadata | EKS | Microsoft.ContainerService/managedClusters | CreateOrUpdate | PUT | 2024-02-01 | 8 |
| aks-metadata | EKS | Microsoft.ContainerService/managedClusters | Get | GET | 2024-02-01 | 0 |
| aks-metadata | EKS | Microsoft.ContainerService/managedClusters | ListByResourceGroup | GET | 2024-02-01 | 0 |
| aks-metadata | EKS | Microsoft.ContainerService/managedClusters | Delete | DELETE | 2024-02-01 | 0 |
| monitor-logs | CloudWatch Logs | Microsoft.OperationalInsights/workspaces | CreateOrUpdate | PUT | 2022-10-01 | 9 |
| monitor-logs | CloudWatch Logs | Microsoft.OperationalInsights/workspaces | Get | GET | 2022-10-01 | 0 |
| monitor-logs | CloudWatch Logs | Microsoft.OperationalInsights/workspaces | ListByResourceGroup | GET | 2022-10-01 | 0 |
| monitor-logs | CloudWatch Logs | Microsoft.OperationalInsights/workspaces | Delete | DELETE | 2022-10-01 | 0 |
| monitor-logs | CloudWatch Logs | Microsoft.Insights/diagnosticSettings | CreateOrUpdate | PUT | 2021-05-01-preview | 8 |
| monitor-logs | CloudWatch Logs | Microsoft.Insights/diagnosticSettings | Get | GET | 2021-05-01-preview | 0 |
| monitor-logs | CloudWatch Logs | Microsoft.Insights/diagnosticSettings | ListByResourceGroup | GET | 2021-05-01-preview | 0 |
| monitor-logs | CloudWatch Logs | Microsoft.Insights/diagnosticSettings | Delete | DELETE | 2021-05-01-preview | 0 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/metricAlerts | CreateOrUpdate | PUT | 2018-03-01 | 8 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/metricAlerts | Get | GET | 2018-03-01 | 0 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/metricAlerts | ListByResourceGroup | GET | 2018-03-01 | 0 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/metricAlerts | Delete | DELETE | 2018-03-01 | 0 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/actionGroups | CreateOrUpdate | PUT | 2023-01-01 | 8 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/actionGroups | Get | GET | 2023-01-01 | 0 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/actionGroups | ListByResourceGroup | GET | 2023-01-01 | 0 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Microsoft.Insights/actionGroups | Delete | DELETE | 2023-01-01 | 0 |
| virtual-network | VPC | Microsoft.Network/virtualNetworks | CreateOrUpdate | PUT | 2023-09-01 | 12 |
| virtual-network | VPC | Microsoft.Network/virtualNetworks | Get | GET | 2023-09-01 | 0 |
| virtual-network | VPC | Microsoft.Network/virtualNetworks | ListByResourceGroup | GET | 2023-09-01 | 0 |
| virtual-network | VPC | Microsoft.Network/virtualNetworks | Delete | DELETE | 2023-09-01 | 0 |
| virtual-network | VPC | Microsoft.Network/privateEndpoints | CreateOrUpdate | PUT | 2023-09-01 | 12 |
| virtual-network | VPC | Microsoft.Network/privateEndpoints | Get | GET | 2023-09-01 | 0 |
| virtual-network | VPC | Microsoft.Network/privateEndpoints | ListByResourceGroup | GET | 2023-09-01 | 0 |
| virtual-network | VPC | Microsoft.Network/privateEndpoints | Delete | DELETE | 2023-09-01 | 0 |
| virtual-network | VPC | Microsoft.Network/privateDnsZones | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| virtual-network | VPC | Microsoft.Network/privateDnsZones | Get | GET | 2020-06-01 | 0 |
| virtual-network | VPC | Microsoft.Network/privateDnsZones | ListByResourceGroup | GET | 2020-06-01 | 0 |
| virtual-network | VPC | Microsoft.Network/privateDnsZones | Delete | DELETE | 2020-06-01 | 0 |

## Tier 2 Calls

| Capability | AWS Analogue | Resource Type | Operation | Method | API Version | Variance Cases |
|---|---|---|---|---|---|---|
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers | CreateOrUpdate | PUT | 2023-12-30 | 9 |
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers | Get | GET | 2023-12-30 | 0 |
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers | ListByResourceGroup | GET | 2023-12-30 | 0 |
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers | Delete | DELETE | 2023-12-30 | 0 |
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers/databases | CreateOrUpdate | PUT | 2023-12-30 | 7 |
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers/databases | Get | GET | 2023-12-30 | 0 |
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers/databases | ListByResourceGroup | GET | 2023-12-30 | 0 |
| mysql-flexible-server | RDS MySQL | Microsoft.DBforMySQL/flexibleServers/databases | Delete | DELETE | 2023-12-30 | 0 |
| queue-storage | SQS | Microsoft.Storage/storageAccounts/queueServices/queues | CreateOrUpdate | PUT | 2023-01-01 | 7 |
| queue-storage | SQS | Microsoft.Storage/storageAccounts/queueServices/queues | Get | GET | 2023-01-01 | 0 |
| queue-storage | SQS | Microsoft.Storage/storageAccounts/queueServices/queues | ListByResourceGroup | GET | 2023-01-01 | 0 |
| queue-storage | SQS | Microsoft.Storage/storageAccounts/queueServices/queues | Delete | DELETE | 2023-01-01 | 0 |
| queue-storage | SQS | Microsoft.ServiceBus/namespaces/queues | CreateOrUpdate | PUT | 2021-11-01 | 7 |
| queue-storage | SQS | Microsoft.ServiceBus/namespaces/queues | Get | GET | 2021-11-01 | 0 |
| queue-storage | SQS | Microsoft.ServiceBus/namespaces/queues | ListByResourceGroup | GET | 2021-11-01 | 0 |
| queue-storage | SQS | Microsoft.ServiceBus/namespaces/queues | Delete | DELETE | 2021-11-01 | 0 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redis | CreateOrUpdate | PUT | 2023-08-01 | 9 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redis | Get | GET | 2023-08-01 | 0 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redis | ListByResourceGroup | GET | 2023-08-01 | 0 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redis | Delete | DELETE | 2023-08-01 | 0 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redisEnterprise | CreateOrUpdate | PUT | 2023-08-01 | 9 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redisEnterprise | Get | GET | 2023-08-01 | 0 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redisEnterprise | ListByResourceGroup | GET | 2023-08-01 | 0 |
| redis-cache | ElastiCache Redis | Microsoft.Cache/redisEnterprise | Delete | DELETE | 2023-08-01 | 0 |
| logic-workflows | Step Functions | Microsoft.Logic/workflows | CreateOrUpdate | PUT | 2019-05-01 | 8 |
| logic-workflows | Step Functions | Microsoft.Logic/workflows | Get | GET | 2019-05-01 | 0 |
| logic-workflows | Step Functions | Microsoft.Logic/workflows | ListByResourceGroup | GET | 2019-05-01 | 0 |
| logic-workflows | Step Functions | Microsoft.Logic/workflows | Delete | DELETE | 2019-05-01 | 0 |
| logic-workflows | Step Functions | Microsoft.Web/sites | CreateOrUpdate | PUT | 2023-12-01 | 8 |
| logic-workflows | Step Functions | Microsoft.Web/sites | Get | GET | 2023-12-01 | 0 |
| logic-workflows | Step Functions | Microsoft.Web/sites | ListByResourceGroup | GET | 2023-12-01 | 0 |
| logic-workflows | Step Functions | Microsoft.Web/sites | Delete | DELETE | 2023-12-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/A | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/A | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/A | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/A | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/AAAA | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/AAAA | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/AAAA | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/AAAA | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CAA | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CAA | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CAA | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CAA | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CNAME | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CNAME | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CNAME | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/CNAME | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/MX | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/MX | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/MX | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/MX | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/NS | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/NS | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/NS | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/NS | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/PTR | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/PTR | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/PTR | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/PTR | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SOA | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SOA | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SOA | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SOA | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SRV | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SRV | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SRV | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/SRV | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/TXT | CreateOrUpdate | PUT | 2018-05-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/TXT | Get | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/TXT | ListByResourceGroup | GET | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/dnsZones/TXT | Delete | DELETE | 2018-05-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/A | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/A | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/A | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/A | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/AAAA | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/AAAA | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/AAAA | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/AAAA | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/CNAME | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/CNAME | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/CNAME | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/CNAME | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/MX | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/MX | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/MX | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/MX | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/PTR | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/PTR | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/PTR | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/PTR | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SOA | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SOA | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SOA | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SOA | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SRV | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SRV | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SRV | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/SRV | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/TXT | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/TXT | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/TXT | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/TXT | Delete | DELETE | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/virtualNetworkLinks | CreateOrUpdate | PUT | 2020-06-01 | 10 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/virtualNetworkLinks | Get | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/virtualNetworkLinks | ListByResourceGroup | GET | 2020-06-01 | 0 |
| dns-zones | Route 53 | Microsoft.Network/privateDnsZones/virtualNetworkLinks | Delete | DELETE | 2020-06-01 | 0 |
| load-balancing | ALB/NLB | Microsoft.Network/applicationGateways | CreateOrUpdate | PUT | 2023-09-01 | 9 |
| load-balancing | ALB/NLB | Microsoft.Network/applicationGateways | Get | GET | 2023-09-01 | 0 |
| load-balancing | ALB/NLB | Microsoft.Network/applicationGateways | ListByResourceGroup | GET | 2023-09-01 | 0 |
| load-balancing | ALB/NLB | Microsoft.Network/applicationGateways | Delete | DELETE | 2023-09-01 | 0 |
| load-balancing | ALB/NLB | Microsoft.Network/loadBalancers | CreateOrUpdate | PUT | 2023-09-01 | 9 |
| load-balancing | ALB/NLB | Microsoft.Network/loadBalancers | Get | GET | 2023-09-01 | 0 |
| load-balancing | ALB/NLB | Microsoft.Network/loadBalancers | ListByResourceGroup | GET | 2023-09-01 | 0 |
| load-balancing | ALB/NLB | Microsoft.Network/loadBalancers | Delete | DELETE | 2023-09-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles | CreateOrUpdate | PUT | 2024-02-01 | 9 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles | Get | GET | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles | ListByResourceGroup | GET | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles | Delete | DELETE | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/afdEndpoints | CreateOrUpdate | PUT | 2024-02-01 | 8 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/afdEndpoints | Get | GET | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/afdEndpoints | ListByResourceGroup | GET | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/afdEndpoints | Delete | DELETE | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/endpoints | CreateOrUpdate | PUT | 2024-02-01 | 8 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/endpoints | Get | GET | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/endpoints | ListByResourceGroup | GET | 2024-02-01 | 0 |
| front-door-cdn | CloudFront | Microsoft.Cdn/profiles/endpoints | Delete | DELETE | 2024-02-01 | 0 |
| waf-policy | WAF | Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies | CreateOrUpdate | PUT | 2023-09-01 | 8 |
| waf-policy | WAF | Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies | Get | GET | 2023-09-01 | 0 |
| waf-policy | WAF | Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies | ListByResourceGroup | GET | 2023-09-01 | 0 |
| waf-policy | WAF | Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies | Delete | DELETE | 2023-09-01 | 0 |
| waf-policy | WAF | Microsoft.Cdn/profiles/securityPolicies | CreateOrUpdate | PUT | 2024-02-01 | 7 |
| waf-policy | WAF | Microsoft.Cdn/profiles/securityPolicies | Get | GET | 2024-02-01 | 0 |
| waf-policy | WAF | Microsoft.Cdn/profiles/securityPolicies | ListByResourceGroup | GET | 2024-02-01 | 0 |
| waf-policy | WAF | Microsoft.Cdn/profiles/securityPolicies | Delete | DELETE | 2024-02-01 | 0 |
| activity-log-audit | CloudTrail | Microsoft.Insights/diagnosticSettings | CreateOrUpdate | PUT | 2021-05-01-preview | 8 |
| activity-log-audit | CloudTrail | Microsoft.Insights/diagnosticSettings | Get | GET | 2021-05-01-preview | 0 |
| activity-log-audit | CloudTrail | Microsoft.Insights/diagnosticSettings | ListByResourceGroup | GET | 2021-05-01-preview | 0 |
| activity-log-audit | CloudTrail | Microsoft.Insights/diagnosticSettings | Delete | DELETE | 2021-05-01-preview | 0 |
| activity-log-audit | CloudTrail | Microsoft.EventGrid/systemTopics | CreateOrUpdate | PUT | 2022-06-15 | 8 |
| activity-log-audit | CloudTrail | Microsoft.EventGrid/systemTopics | Get | GET | 2022-06-15 | 0 |
| activity-log-audit | CloudTrail | Microsoft.EventGrid/systemTopics | ListByResourceGroup | GET | 2022-06-15 | 0 |
| activity-log-audit | CloudTrail | Microsoft.EventGrid/systemTopics | Delete | DELETE | 2022-06-15 | 0 |
| azure-files | EFS | Microsoft.Storage/storageAccounts/fileServices/shares | CreateOrUpdate | PUT | 2023-01-01 | 9 |
| azure-files | EFS | Microsoft.Storage/storageAccounts/fileServices/shares | Get | GET | 2023-01-01 | 0 |
| azure-files | EFS | Microsoft.Storage/storageAccounts/fileServices/shares | ListByResourceGroup | GET | 2023-01-01 | 0 |
| azure-files | EFS | Microsoft.Storage/storageAccounts/fileServices/shares | Delete | DELETE | 2023-01-01 | 0 |
| azure-files | EFS | Microsoft.NetApp/netAppAccounts/capacityPools/volumes | CreateOrUpdate | PUT | 2023-11-01 | 8 |
| azure-files | EFS | Microsoft.NetApp/netAppAccounts/capacityPools/volumes | Get | GET | 2023-11-01 | 0 |
| azure-files | EFS | Microsoft.NetApp/netAppAccounts/capacityPools/volumes | ListByResourceGroup | GET | 2023-11-01 | 0 |
| azure-files | EFS | Microsoft.NetApp/netAppAccounts/capacityPools/volumes | Delete | DELETE | 2023-11-01 | 0 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces | CreateOrUpdate | PUT | 2024-01-01 | 12 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces | Get | GET | 2024-01-01 | 0 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces | ListByResourceGroup | GET | 2024-01-01 | 0 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces | Delete | DELETE | 2024-01-01 | 0 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces/eventhubs | CreateOrUpdate | PUT | 2024-01-01 | 12 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces/eventhubs | Get | GET | 2024-01-01 | 0 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces/eventhubs | ListByResourceGroup | GET | 2024-01-01 | 0 |
| event-hubs-streams | Kinesis Data Streams | Microsoft.EventHub/namespaces/eventhubs | Delete | DELETE | 2024-01-01 | 0 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces | CreateOrUpdate | PUT | 2021-06-01 | 8 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces | Get | GET | 2021-06-01 | 0 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces | ListByResourceGroup | GET | 2021-06-01 | 0 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces | Delete | DELETE | 2021-06-01 | 0 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces/sqlPools | CreateOrUpdate | PUT | 2021-06-01 | 8 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces/sqlPools | Get | GET | 2021-06-01 | 0 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces/sqlPools | ListByResourceGroup | GET | 2021-06-01 | 0 |
| synapse-warehouse | Redshift | Microsoft.Synapse/workspaces/sqlPools | Delete | DELETE | 2021-06-01 | 0 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.AppConfiguration/configurationStores | CreateOrUpdate | PUT | 2023-03-01 | 11 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.AppConfiguration/configurationStores | Get | GET | 2023-03-01 | 0 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.AppConfiguration/configurationStores | ListByResourceGroup | GET | 2023-03-01 | 0 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.AppConfiguration/configurationStores | Delete | DELETE | 2023-03-01 | 0 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.KeyVault/vaults/secrets | CreateOrUpdate | PUT | 2023-07-01 | 8 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.KeyVault/vaults/secrets | Get | GET | 2023-07-01 | 0 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.KeyVault/vaults/secrets | ListByResourceGroup | GET | 2023-07-01 | 0 |
| app-configuration-parameters | SSM Parameter Store | Microsoft.KeyVault/vaults/secrets | Delete | DELETE | 2023-07-01 | 0 |
| database-migration-service | DMS | Microsoft.DataMigration/services | CreateOrUpdate | PUT | 2022-03-30-preview | 8 |
| database-migration-service | DMS | Microsoft.DataMigration/services | Get | GET | 2022-03-30-preview | 0 |
| database-migration-service | DMS | Microsoft.DataMigration/services | ListByResourceGroup | GET | 2022-03-30-preview | 0 |
| database-migration-service | DMS | Microsoft.DataMigration/services | Delete | DELETE | 2022-03-30-preview | 0 |
| database-migration-service | DMS | Microsoft.DataMigration/services/projects | CreateOrUpdate | PUT | 2022-03-30-preview | 8 |
| database-migration-service | DMS | Microsoft.DataMigration/services/projects | Get | GET | 2022-03-30-preview | 0 |
| database-migration-service | DMS | Microsoft.DataMigration/services/projects | ListByResourceGroup | GET | 2022-03-30-preview | 0 |
| database-migration-service | DMS | Microsoft.DataMigration/services/projects | Delete | DELETE | 2022-03-30-preview | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.Network/privateDnsZones | CreateOrUpdate | PUT | 2020-06-01 | 8 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.Network/privateDnsZones | Get | GET | 2020-06-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.Network/privateDnsZones | ListByResourceGroup | GET | 2020-06-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.Network/privateDnsZones | Delete | DELETE | 2020-06-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/managedEnvironments | CreateOrUpdate | PUT | 2023-05-01 | 8 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/managedEnvironments | Get | GET | 2023-05-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/managedEnvironments | ListByResourceGroup | GET | 2023-05-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/managedEnvironments | Delete | DELETE | 2023-05-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/containerApps | CreateOrUpdate | PUT | 2023-05-01 | 12 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/containerApps | Get | GET | 2023-05-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/containerApps | ListByResourceGroup | GET | 2023-05-01 | 0 |
| service-discovery | Service Discovery / Cloud Map | Microsoft.App/containerApps | Delete | DELETE | 2023-05-01 | 0 |

