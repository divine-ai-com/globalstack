# Azure 99% Parity Checklist

This checklist is the service-by-service work queue for making GlobalStack Azure behave like real Azure for IaC deployments and integration tests.

A service is not 99%-ready until every dimension below is complete from live Azure, official emulator, or explicitly scoped local conformance evidence. Partial evidence is useful, but it is not a parity claim.

Generated: 2026-05-19T12:38:40.351Z

## Dimensions

- `liveApiSurfaceInventory`: Complete live Azure API surface inventory. Done when: Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability.
- `parameterVarianceCaptures`: Parameter variance captures. Done when: Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints.
- `stateTransitionCaptures`: State transition captures. Done when: Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized.
- `errorShapeFidelity`: Error-shape fidelity. Done when: Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior.
- `identityRbacBehavior`: Identity/RBAC behavior. Done when: Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable.
- `retryEventualConsistency`: Retry/eventual consistency behavior. Done when: Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope.
- `iacProviderBehavior`: IaC-provider behavior. Done when: Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack.
- `dataPlaneBehavior`: Data-plane behavior. Done when: Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics.
- `ambiguousRepeatCaptures`: Repeat captures for ambiguous behavior. Done when: Timing-sensitive or inconsistent captures have repeat evidence before normalization.
- `serviceSpecificFacade`: Service-specific local facade/emulator integration. Done when: The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests.

## Service Summary

| Service | Tier | Current Status | Complete | Partial | Not Started | Candidate Calls | Live Captures | Provider Ops |
|---|---:|---|---:|---:|---:|---:|---:|---:|
| blob-storage | 1 | in-progress | 0 | 8 | 2 | 8 | 15 | 233 |
| azure-functions | 1 | in-progress | 0 | 5 | 5 | 8 | 15 | 418 |
| api-management | 1 | in-progress | 0 | 5 | 5 | 8 | 14 | 511 |
| identity-rbac | 1 | in-progress | 0 | 6 | 4 | 12 | 21 | 15 |
| key-vault-secrets | 1 | in-progress | 0 | 5 | 5 | 8 | 14 | 96 |
| key-vault-keys | 1 | in-progress | 0 | 5 | 5 | 8 | 14 | 105 |
| postgresql-flexible-server | 1 | in-progress | 0 | 5 | 5 | 8 | 16 | 89 |
| cosmos-nosql-table | 1 | in-progress | 0 | 6 | 4 | 8 | 14 | 296 |
| service-bus-topics | 1 | in-progress | 0 | 5 | 5 | 12 | 16 | 110 |
| event-grid | 1 | in-progress | 0 | 5 | 5 | 8 | 14 | 35 |
| container-registry | 1 | in-progress | 0 | 5 | 5 | 4 | 7 | 118 |
| aks-metadata | 1 | in-progress | 0 | 5 | 5 | 4 | 7 | 453 |
| monitor-logs | 1 | in-progress | 0 | 5 | 5 | 8 | 15 | 1010 |
| monitor-metrics-alerts | 1 | in-progress | 0 | 5 | 5 | 8 | 14 | 12 |
| virtual-network | 1 | in-progress | 0 | 5 | 5 | 12 | 21 | 110 |
| mysql-flexible-server | 2 | in-progress | 0 | 5 | 5 | 8 | 16 | 67 |
| queue-storage | 2 | in-progress | 0 | 8 | 2 | 8 | 14 | 22 |
| redis-cache | 2 | in-progress | 0 | 5 | 5 | 8 | 16 | 73 |
| logic-workflows | 2 | in-progress | 0 | 5 | 5 | 8 | 14 | 425 |
| dns-zones | 2 | in-progress | 0 | 5 | 5 | 84 | 14 | 81 |
| load-balancing | 2 | in-progress | 0 | 5 | 5 | 8 | 14 | 67 |
| front-door-cdn | 2 | in-progress | 0 | 5 | 5 | 12 | 21 | 133 |
| waf-policy | 2 | in-progress | 0 | 5 | 5 | 8 | 14 | 9 |
| activity-log-audit | 2 | in-progress | 0 | 5 | 5 | 8 | 14 | 15 |
| azure-files | 2 | in-progress | 0 | 6 | 4 | 8 | 14 | 70 |
| event-hubs-streams | 2 | in-progress | 0 | 5 | 5 | 8 | 16 | 93 |
| synapse-warehouse | 2 | in-progress | 0 | 5 | 5 | 8 | 14 | 244 |
| app-configuration-parameters | 2 | in-progress | 0 | 5 | 5 | 8 | 15 | 57 |
| database-migration-service | 2 | in-progress | 0 | 5 | 5 | 8 | 14 | 34 |
| service-discovery | 2 | in-progress | 0 | 5 | 5 | 12 | 21 | 131 |

## blob-storage

- Tier: 1
- AWS analogue: S3
- Azure equivalent: Azure Blob Storage / Storage Account
- Current status: in-progress
- Resource types: Microsoft.Storage/storageAccounts, Microsoft.Storage/storageAccounts/blobServices/containers

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>233 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=7, arm-surface=2, provider-validation=3, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | partial | 32 Blob/Queue data-plane expectations | Expand Blob/Queue captures and local normalization beyond Wave 1. |
| Repeat captures for ambiguous behavior | partial | queue-peek-after-delete is explicitly marked needs-repeat-capture | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 12 registry operations declared<br>backing engines: azurite | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## azure-functions

- Tier: 1
- AWS analogue: Lambda
- Azure equivalent: Azure Functions / Function Apps
- Current status: in-progress
- Resource types: Microsoft.Web/sites, Microsoft.Web/serverfarms

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>418 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=1, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=7, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started | official emulator path declared: functions-core-tools, azurite | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 12 registry operations declared<br>backing engines: functions-core-tools, azurite | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## api-management

- Tier: 1
- AWS analogue: API Gateway
- Azure equivalent: Azure API Management
- Current status: in-progress
- Resource types: Microsoft.ApiManagement/service, Microsoft.ApiManagement/service/apis

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>511 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=7, arm-surface=2, provider-validation=3, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 11 registry operations declared<br>backing engines: globalstack-http-router | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## identity-rbac

- Tier: 1
- AWS analogue: IAM/STS
- Azure equivalent: Microsoft Entra ID, Azure RBAC, Managed Identity
- Current status: in-progress
- Resource types: Microsoft.ManagedIdentity/userAssignedIdentities, Microsoft.Authorization/roleAssignments, Microsoft.Authorization/roleDefinitions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 12 candidate catalog calls<br>15 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 21 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, missing-api-version=3, valid-minimal=3, not-found=6, empty-list=3 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=10, arm-surface=3, provider-accepted=7, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | identity-rbac capability exists in Tier 1 registry | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 14 registry operations declared<br>backing engines: globalstack-local-token-service | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## key-vault-secrets

- Tier: 1
- AWS analogue: Secrets Manager
- Azure equivalent: Key Vault secrets
- Current status: in-progress
- Resource types: Microsoft.KeyVault/vaults, Microsoft.KeyVault/vaults/secrets

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>96 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=6, arm-surface=2, provider-validation=3, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 6 registry operations declared<br>backing engines: globalstack-secret-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## key-vault-keys

- Tier: 1
- AWS analogue: KMS
- Azure equivalent: Key Vault keys / Managed HSM
- Current status: in-progress
- Resource types: Microsoft.KeyVault/vaults, Microsoft.KeyVault/vaults/keys

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>105 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=6, arm-surface=2, provider-validation=3, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 6 registry operations declared<br>backing engines: node-crypto | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## postgresql-flexible-server

- Tier: 1
- AWS analogue: RDS PostgreSQL
- Azure equivalent: Azure Database for PostgreSQL Flexible Server
- Current status: in-progress
- Resource types: Microsoft.DBforPostgreSQL/flexibleServers, Microsoft.DBforPostgreSQL/flexibleServers/databases

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>89 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=8, arm-surface=2, provider-validation=4, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 9 registry operations declared<br>backing engines: local-postgres | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## cosmos-nosql-table

- Tier: 1
- AWS analogue: DynamoDB
- Azure equivalent: Cosmos DB for NoSQL / Table Storage
- Current status: in-progress
- Resource types: Microsoft.DocumentDB/databaseAccounts, Microsoft.Storage/storageAccounts/tableServices/tables

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>296 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=3, arm-surface=2, provider-accepted=2, provider-routing-or-parent-validation=4, capture-infrastructure-gap=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started | official emulator path declared: cosmos-db-emulator, azurite | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 4 registry operations declared<br>backing engines: cosmos-db-emulator, azurite | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## service-bus-topics

- Tier: 1
- AWS analogue: SNS
- Azure equivalent: Service Bus topics / Event Grid topics
- Current status: in-progress
- Resource types: Microsoft.ServiceBus/namespaces, Microsoft.ServiceBus/namespaces/topics, Microsoft.ServiceBus/namespaces/topics/subscriptions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 12 candidate catalog calls<br>110 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=8, arm-surface=2, provider-validation=3, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started | official emulator path declared: service-bus-emulator, globalstack-event-router | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 13 registry operations declared<br>backing engines: service-bus-emulator, globalstack-event-router | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## event-grid

- Tier: 1
- AWS analogue: EventBridge
- Azure equivalent: Event Grid
- Current status: in-progress
- Resource types: Microsoft.EventGrid/topics, Microsoft.EventGrid/eventSubscriptions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>35 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=5, arm-surface=2, provider-accepted=5, provider-routing-or-parent-validation=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 8 registry operations declared<br>backing engines: globalstack-event-router | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## container-registry

- Tier: 1
- AWS analogue: ECR
- Azure equivalent: Azure Container Registry
- Current status: in-progress
- Resource types: Microsoft.ContainerRegistry/registries

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 4 candidate catalog calls<br>118 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 7 live ARM captures<br>variance cases: empty-body=1, invalid-location=1, missing-api-version=1, valid-minimal=1, not-found=2, empty-list=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=3, arm-surface=1, provider-accepted=2, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 6 registry operations declared<br>backing engines: local-oci-registry | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## aks-metadata

- Tier: 1
- AWS analogue: EKS
- Azure equivalent: Azure Kubernetes Service
- Current status: in-progress
- Resource types: Microsoft.ContainerService/managedClusters

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 4 candidate catalog calls<br>453 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 7 live ARM captures<br>variance cases: empty-body=1, invalid-location=1, missing-api-version=1, valid-minimal=1, not-found=2, empty-list=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=3, arm-surface=1, provider-accepted=2, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 6 registry operations declared<br>backing engines: kind-or-k3d-future | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## monitor-logs

- Tier: 1
- AWS analogue: CloudWatch Logs
- Azure equivalent: Log Analytics / Azure Monitor Logs
- Current status: in-progress
- Resource types: Microsoft.OperationalInsights/workspaces, Microsoft.Insights/diagnosticSettings

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>1010 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=8, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 6 registry operations declared<br>backing engines: globalstack-log-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## monitor-metrics-alerts

- Tier: 1
- AWS analogue: CloudWatch Metrics/Alarms
- Azure equivalent: Azure Monitor metrics and alerts
- Current status: in-progress
- Resource types: Microsoft.Insights/metricAlerts, Microsoft.Insights/actionGroups

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>12 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=6, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 9 registry operations declared<br>backing engines: globalstack-metric-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## virtual-network

- Tier: 1
- AWS analogue: VPC
- Azure equivalent: Virtual Network / Private Endpoint / Private DNS
- Current status: in-progress
- Resource types: Microsoft.Network/virtualNetworks, Microsoft.Network/privateEndpoints, Microsoft.Network/privateDnsZones

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 12 candidate catalog calls<br>110 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 21 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, missing-api-version=3, valid-minimal=3, not-found=6, empty-list=3 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=8, arm-surface=3, provider-accepted=6, provider-routing-or-parent-validation=3, capture-infrastructure-gap=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 17 registry operations declared<br>backing engines: globalstack-network-model | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## mysql-flexible-server

- Tier: 2
- AWS analogue: RDS MySQL
- Azure equivalent: Azure Database for MySQL Flexible Server
- Current status: in-progress
- Resource types: Microsoft.DBforMySQL/flexibleServers, Microsoft.DBforMySQL/flexibleServers/databases

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>67 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=8, arm-surface=2, provider-validation=4, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: local-mysql | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## queue-storage

- Tier: 2
- AWS analogue: SQS
- Azure equivalent: Azure Queue Storage / Service Bus queues
- Current status: in-progress
- Resource types: Microsoft.Storage/storageAccounts/queueServices/queues, Microsoft.ServiceBus/namespaces/queues

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>22 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=12, arm-surface=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | partial | 32 Blob/Queue data-plane expectations | Expand Blob/Queue captures and local normalization beyond Wave 1. |
| Repeat captures for ambiguous behavior | partial | queue-peek-after-delete is explicitly marked needs-repeat-capture | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 7 registry operations declared<br>backing engines: azurite, service-bus-emulator | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## redis-cache

- Tier: 2
- AWS analogue: ElastiCache Redis
- Azure equivalent: Azure Cache for Redis
- Current status: in-progress
- Resource types: Microsoft.Cache/redis, Microsoft.Cache/redisEnterprise

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>73 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=6, arm-surface=2, provider-accepted=3, provider-routing-or-parent-validation=2, subscription-or-provider-readiness=2, capture-infrastructure-gap=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 4 registry operations declared<br>backing engines: local-redis | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## logic-workflows

- Tier: 2
- AWS analogue: Step Functions
- Azure equivalent: Azure Logic Apps / Durable Functions
- Current status: in-progress
- Resource types: Microsoft.Logic/workflows, Microsoft.Web/sites

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>425 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=6, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: globalstack-workflow-runner, functions-core-tools | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## dns-zones

- Tier: 2
- AWS analogue: Route 53
- Azure equivalent: Azure DNS / Private DNS Zones
- Current status: in-progress
- Resource types: Microsoft.Network/dnsZones, Microsoft.Network/dnsZones/A, Microsoft.Network/dnsZones/AAAA, Microsoft.Network/dnsZones/CAA, Microsoft.Network/dnsZones/CNAME, Microsoft.Network/dnsZones/MX, Microsoft.Network/dnsZones/NS, Microsoft.Network/dnsZones/PTR, Microsoft.Network/dnsZones/SOA, Microsoft.Network/dnsZones/SRV, Microsoft.Network/dnsZones/TXT, Microsoft.Network/privateDnsZones, Microsoft.Network/privateDnsZones/A, Microsoft.Network/privateDnsZones/AAAA, Microsoft.Network/privateDnsZones/CNAME, Microsoft.Network/privateDnsZones/MX, Microsoft.Network/privateDnsZones/PTR, Microsoft.Network/privateDnsZones/SOA, Microsoft.Network/privateDnsZones/SRV, Microsoft.Network/privateDnsZones/TXT, Microsoft.Network/privateDnsZones/virtualNetworkLinks

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 84 candidate catalog calls<br>81 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=4, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=2, capture-infrastructure-gap=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 17 registry operations declared<br>backing engines: globalstack-dns-registry | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## load-balancing

- Tier: 2
- AWS analogue: ALB/NLB
- Azure equivalent: Azure Application Gateway / Load Balancer
- Current status: in-progress
- Resource types: Microsoft.Network/applicationGateways, Microsoft.Network/loadBalancers

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>67 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=5, arm-surface=2, provider-accepted=5, provider-routing-or-parent-validation=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 10 registry operations declared<br>backing engines: globalstack-http-router | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## front-door-cdn

- Tier: 2
- AWS analogue: CloudFront
- Azure equivalent: Azure Front Door / Azure CDN
- Current status: in-progress
- Resource types: Microsoft.Cdn/profiles, Microsoft.Cdn/profiles/afdEndpoints, Microsoft.Cdn/profiles/endpoints

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 12 candidate catalog calls<br>133 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 21 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, missing-api-version=3, valid-minimal=3, not-found=6, empty-list=3 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=7, arm-surface=3, provider-routing-or-parent-validation=7, provider-accepted=4 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: globalstack-edge-router | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## waf-policy

- Tier: 2
- AWS analogue: WAF
- Azure equivalent: Azure Web Application Firewall policy
- Current status: in-progress
- Resource types: Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies, Microsoft.Cdn/profiles/securityPolicies

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>9 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=7, arm-surface=2, provider-validation=3, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: globalstack-waf-metadata | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## activity-log-audit

- Tier: 2
- AWS analogue: CloudTrail
- Azure equivalent: Azure Activity Log / Diagnostic Settings
- Current status: in-progress
- Resource types: Microsoft.Insights/diagnosticSettings, Microsoft.EventGrid/systemTopics

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>15 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=9, arm-surface=2, provider-accepted=2, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: globalstack-audit-log | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## azure-files

- Tier: 2
- AWS analogue: EFS
- Azure equivalent: Azure Files / Azure NetApp Files
- Current status: in-progress
- Resource types: Microsoft.Storage/storageAccounts/fileServices/shares, Microsoft.NetApp/netAppAccounts/capacityPools/volumes

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>70 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=2, arm-surface=2, provider-routing-or-parent-validation=9, provider-accepted=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 4 registry operations declared<br>backing engines: local-file-share | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## event-hubs-streams

- Tier: 2
- AWS analogue: Kinesis Data Streams
- Azure equivalent: Azure Event Hubs
- Current status: in-progress
- Resource types: Microsoft.EventHub/namespaces, Microsoft.EventHub/namespaces/eventhubs

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>93 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=8, arm-surface=2, provider-validation=3, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started | official emulator path declared: event-hubs-emulator | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 4 registry operations declared<br>backing engines: event-hubs-emulator | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## synapse-warehouse

- Tier: 2
- AWS analogue: Redshift
- Azure equivalent: Azure Synapse Analytics dedicated SQL pool
- Current status: in-progress
- Resource types: Microsoft.Synapse/workspaces, Microsoft.Synapse/workspaces/sqlPools

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>244 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=5, arm-surface=2, provider-routing-or-parent-validation=4, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: local-analytics-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## app-configuration-parameters

- Tier: 2
- AWS analogue: SSM Parameter Store
- Azure equivalent: Azure App Configuration / Key Vault configuration values
- Current status: in-progress
- Resource types: Microsoft.AppConfiguration/configurationStores, Microsoft.KeyVault/vaults/secrets

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>57 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=1, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=4, arm-surface=2, provider-accepted=3, provider-routing-or-parent-validation=6 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started | official emulator path declared: app-configuration-emulator, globalstack-secret-store | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: app-configuration-emulator, globalstack-secret-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## database-migration-service

- Tier: 2
- AWS analogue: DMS
- Azure equivalent: Azure Database Migration Service
- Current status: in-progress
- Resource types: Microsoft.DataMigration/services, Microsoft.DataMigration/services/projects

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>34 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 14 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=5, arm-surface=2, provider-routing-or-parent-validation=4, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: globalstack-migration-plan-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## service-discovery

- Tier: 2
- AWS analogue: Service Discovery / Cloud Map
- Azure equivalent: Azure Private DNS / Container Apps service discovery
- Current status: in-progress
- Resource types: Microsoft.Network/privateDnsZones, Microsoft.App/managedEnvironments, Microsoft.App/containerApps

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 12 candidate catalog calls<br>131 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 21 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, missing-api-version=3, valid-minimal=3, not-found=6, empty-list=3 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=7, arm-surface=3, provider-accepted=7, provider-routing-or-parent-validation=3, capture-infrastructure-gap=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | not-started |  | Capture allow/deny matrices for ARM and data-plane auth; implement local RBAC decisions with Azure-shaped denials. |
| Retry/eventual consistency behavior | not-started |  | Capture poll/retry timing, transitional states, eventual list/read behavior, and delete consistency for this service. |
| IaC-provider behavior | not-started |  | Run Terraform/OpenTofu/Pulumi/Bicep/ARM/Ansible create-refresh-update-destroy/import where relevant against the local endpoint. |
| Data-plane behavior | not-started |  | Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 3 registry operations declared<br>backing engines: globalstack-service-registry, globalstack-dns-registry | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## Operating Rule

GlobalStack must deploy resources locally only for modeled surfaces. A modeled surface should match real Azure for captured parameters and states. Unknown surfaces, unmodeled data-plane calls, and unreconciled Azure behavior must fail closed rather than return fabricated success.

