# GlobalStack Azure Hybrid Coverage

This coverage file is generated from the GlobalStack Tier 1 and Tier 2 capability registry.
It intentionally separates local implementation, official emulator backing, contract tests, and real Azure validation.

## Claim Policy

No service is considered fully supported unless implemented, contractTested, cloudValidated, and knownGaps is empty.

Unknown Azure resource types and incomplete ARM requests must fail closed rather than returning fabricated success.

## Official Emulator Options

| Emulator | Covers | Image / Runtime | Notes |
|---|---|---|---|
| Azurite | blob-storage, queue-storage, table-storage | mcr.microsoft.com/azure-storage/azurite | Official Microsoft storage emulator for Blob, Queue, and Table data planes. |
| Azure Cosmos DB Emulator | cosmos-nosql | mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator:vnext-preview | Official local Cosmos DB development emulator. Use for data-plane app tests, not production parity claims. |
| Azure Service Bus Emulator | service-bus-queues, service-bus-topics | mcr.microsoft.com/azure-messaging/servicebus-emulator:latest | Official container emulator. Requires a SQL Server sidecar and static config for entities. |
| Azure Event Hubs Emulator | event-hubs | mcr.microsoft.com/azure-messaging/eventhubs-emulator:latest | Official container emulator. Use for streaming/Kafka/AMQP scenarios, not Event Grid parity. |
| Azure Functions Core Tools | azure-functions-runtime | local tool | Official local Functions runtime. GlobalStack models Function App resources and wires local settings. |
| Azure App Configuration Emulator | app-configuration | mcr.microsoft.com/azure-app-configuration/app-configuration-emulator:1.0.2 | Official local emulator for key/value and feature configuration workflows. |
| Azure SignalR Local Emulator | signalr-serverless | local tool | Official dotnet tool for serverless SignalR scenarios only. |
| Local PostgreSQL | postgresql-data-plane | postgres:16-alpine | Not an Azure emulator. Used behind an Azure Database for PostgreSQL control-plane facade. |
| Local MySQL | mysql-data-plane | mysql:8 | Not an Azure emulator. Used behind an Azure Database for MySQL control-plane facade. |
| Local Redis | redis-data-plane | redis:7-alpine | Not an Azure emulator. Used behind an Azure Cache for Redis control-plane facade. |
| Local File Share | azure-files-data-plane | local tool | Not an Azure emulator. Used for Azure Files metadata and POSIX-like local file persistence only. |
| Local Analytics Store | synapse-redshift-analogue-data-plane | local tool | Not an Azure emulator. Used for lightweight warehouse metadata and future DuckDB/PostgreSQL-backed query smoke tests. |
| Local OCI Registry | container-registry-data-plane | registry:2 | Not an Azure emulator. Used behind an Azure Container Registry metadata facade. |

## Tier 1 Capabilities

| Capability | AWS Analogue | Azure Equivalent | Implementation Kind | Cloud Validated | Known Gaps |
|---|---|---|---|---|---|
| blob-storage | S3 | Azure Blob Storage / Storage Account | official-emulator-backed-local | no | 3 |
| azure-functions | Lambda | Azure Functions / Function Apps | official-emulator-backed-local | no | 3 |
| api-management | API Gateway | Azure API Management | metadata-only-control-plane | no | 2 |
| identity-rbac | IAM/STS | Microsoft Entra ID, Azure RBAC, Managed Identity | metadata-only-control-plane | no | 2 |
| key-vault-secrets | Secrets Manager | Key Vault secrets | metadata-only-control-plane | no | 2 |
| key-vault-keys | KMS | Key Vault keys / Managed HSM | metadata-only-control-plane | no | 1 |
| postgresql-flexible-server | RDS PostgreSQL | Azure Database for PostgreSQL Flexible Server | metadata-only-control-plane | no | 2 |
| cosmos-nosql-table | DynamoDB | Cosmos DB for NoSQL / Table Storage | official-emulator-backed-local | no | 2 |
| service-bus-topics | SNS | Service Bus topics / Event Grid topics | official-emulator-backed-local | no | 2 |
| event-grid | EventBridge | Event Grid | metadata-only-control-plane | no | 2 |
| container-registry | ECR | Azure Container Registry | metadata-only-control-plane | no | 1 |
| aks-metadata | EKS | Azure Kubernetes Service | facade-plus-local-runtime | no | 2 |
| monitor-logs | CloudWatch Logs | Log Analytics / Application Insights / Azure Monitor Logs | metadata-only-control-plane | no | 1 |
| monitor-metrics-alerts | CloudWatch Metrics/Alarms | Azure Monitor metrics and alerts | metadata-only-control-plane | no | 1 |
| virtual-network | VPC | Virtual Network / Private Endpoint / Private DNS | metadata-only-control-plane | no | 2 |

## Tier 2 Capabilities

| Capability | AWS Analogue | Azure Equivalent | Implementation Kind | Cloud Validated | Known Gaps |
|---|---|---|---|---|---|
| mysql-flexible-server | RDS MySQL | Azure Database for MySQL Flexible Server | metadata-only-control-plane | no | 2 |
| queue-storage | SQS | Azure Queue Storage / Service Bus queues | official-emulator-backed-local | no | 2 |
| redis-cache | ElastiCache Redis | Azure Cache for Redis | metadata-only-control-plane | no | 2 |
| logic-workflows | Step Functions | Azure Logic Apps / Durable Functions | metadata-only-control-plane | no | 2 |
| dns-zones | Route 53 | Azure DNS / Private DNS Zones | metadata-only-control-plane | no | 2 |
| load-balancing | ALB/NLB | Azure Application Gateway / Load Balancer | metadata-only-control-plane | no | 3 |
| front-door-cdn | CloudFront | Azure Front Door / Azure CDN | metadata-only-control-plane | no | 2 |
| waf-policy | WAF | Azure Web Application Firewall policy | metadata-only-control-plane | no | 2 |
| activity-log-audit | CloudTrail | Azure Activity Log / Diagnostic Settings | metadata-only-control-plane | no | 2 |
| azure-files | EFS | Azure Files / Azure NetApp Files | metadata-only-control-plane | no | 2 |
| event-hubs-streams | Kinesis Data Streams | Azure Event Hubs | official-emulator-backed-local | no | 2 |
| synapse-warehouse | Redshift | Azure Synapse Analytics dedicated SQL pool | metadata-only-control-plane | no | 2 |
| app-configuration-parameters | SSM Parameter Store | Azure App Configuration / Key Vault configuration values | official-emulator-backed-local | no | 2 |
| database-migration-service | DMS | Azure Database Migration Service | metadata-only-control-plane | no | 2 |
| service-discovery | Service Discovery / Cloud Map | Azure Private DNS / Container Apps service discovery | metadata-only-control-plane | no | 2 |

## Real Azure Capture Rule

Any unclear validation, default, error, async, auth, or side-effect behavior must be captured from a disposable real Azure resource before it can be marked `cloudValidated`.
