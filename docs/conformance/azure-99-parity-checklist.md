# Azure 99% Parity Checklist

This checklist is the service-by-service work queue for making GlobalStack Azure behave like real Azure for IaC deployments and integration tests.

A service is not 99%-ready until every dimension below is complete from live Azure, official emulator, or explicitly scoped local conformance evidence. Partial evidence is useful, but it is not a parity claim.

Generated: 2026-05-20T14:41:47.746Z

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
| blob-storage | 1 | in-progress | 0 | 10 | 0 | 8 | 16 | 232 |
| azure-functions | 1 | in-progress | 0 | 9 | 1 | 8 | 15 | 418 |
| api-management | 1 | in-progress | 0 | 9 | 1 | 8 | 26 | 511 |
| identity-rbac | 1 | in-progress | 0 | 8 | 2 | 12 | 39 | 15 |
| key-vault-secrets | 1 | in-progress | 0 | 9 | 1 | 8 | 15 | 96 |
| key-vault-keys | 1 | in-progress | 0 | 9 | 1 | 8 | 14 | 105 |
| postgresql-flexible-server | 1 | in-progress | 0 | 8 | 2 | 8 | 29 | 89 |
| cosmos-nosql-table | 1 | in-progress | 0 | 8 | 2 | 16 | 41 | 366 |
| service-bus-topics | 1 | in-progress | 0 | 9 | 1 | 12 | 33 | 116 |
| event-grid | 1 | in-progress | 0 | 9 | 1 | 8 | 14 | 35 |
| container-registry | 1 | in-progress | 0 | 9 | 1 | 4 | 7 | 118 |
| aks-metadata | 1 | in-progress | 0 | 8 | 2 | 4 | 7 | 453 |
| monitor-logs | 1 | in-progress | 0 | 8 | 2 | 8 | 15 | 1013 |
| monitor-metrics-alerts | 1 | in-progress | 0 | 8 | 2 | 8 | 14 | 12 |
| virtual-network | 1 | in-progress | 0 | 8 | 2 | 12 | 41 | 110 |
| mysql-flexible-server | 2 | in-progress | 0 | 8 | 2 | 8 | 16 | 67 |
| queue-storage | 2 | in-progress | 0 | 10 | 0 | 8 | 14 | 22 |
| redis-cache | 2 | in-progress | 0 | 8 | 2 | 8 | 16 | 73 |
| logic-workflows | 2 | in-progress | 0 | 8 | 2 | 8 | 14 | 425 |
| dns-zones | 2 | in-progress | 0 | 8 | 2 | 84 | 168 | 136 |
| load-balancing | 2 | in-progress | 0 | 8 | 2 | 8 | 14 | 67 |
| front-door-cdn | 2 | in-progress | 0 | 8 | 2 | 12 | 21 | 133 |
| waf-policy | 2 | in-progress | 0 | 8 | 2 | 8 | 14 | 9 |
| activity-log-audit | 2 | in-progress | 0 | 8 | 2 | 8 | 14 | 15 |
| azure-files | 2 | in-progress | 0 | 8 | 2 | 8 | 17 | 70 |
| event-hubs-streams | 2 | in-progress | 0 | 8 | 2 | 8 | 29 | 93 |
| synapse-warehouse | 2 | in-progress | 0 | 8 | 2 | 8 | 14 | 244 |
| app-configuration-parameters | 2 | in-progress | 0 | 8 | 2 | 8 | 18 | 57 |
| database-migration-service | 2 | in-progress | 0 | 8 | 2 | 8 | 14 | 34 |
| service-discovery | 2 | in-progress | 0 | 8 | 2 | 12 | 37 | 131 |

## blob-storage

- Tier: 1
- AWS analogue: S3
- Azure equivalent: Azure Blob Storage / Storage Account
- Current status: in-progress
- Resource types: Microsoft.Storage/storageAccounts, Microsoft.Storage/storageAccounts/blobServices/containers

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>232 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1, unsupported-api-version=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=7, arm-surface=2, provider-validation=3, subscription-or-provider-readiness=1, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:storage-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files<br>e2e:storage-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:storage-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
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
| Identity/RBAC behavior | partial | e2e:azure-functions-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:azure-functions-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:azure-functions-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | partial | e2e:azure-functions-parity is wired into npm run smoke<br>local HTTP-trigger routing, function-key rejection, and post-delete route rejection | Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.<br>Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out. |
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
| Parameter variance captures | partial | 26 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-protocols-shape=1, invalid-tags-shape=2, missing-api-version=2, missing-path=1, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1, missing-location=1, missing-publisher-email=1, missing-publisher-name=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=18, arm-surface=2, provider-routing-or-parent-validation=4, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:api-management-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:api-management-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:api-management-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | partial | e2e:api-management-parity is wired into npm run smoke<br>local gateway host/path/subscription-key rejection and route smoke | Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.<br>Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out. |
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
| Parameter variance captures | partial | 39 live ARM captures<br>variance cases: empty-body=3, empty-principal-id=1, empty-role-definition-id=1, invalid-location=3, invalid-tags-shape=3, missing-api-version=3, missing-principal-id=1, missing-role-definition-id=1, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=6, empty-list=3, empty-assignable-scopes=1, empty-permissions=1, missing-assignable-scopes=1, missing-permissions=1, missing-location=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=27, arm-surface=3, provider-accepted=6, provider-validation=2, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:identity-rbac-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack<br>local token facade, OpenID discovery, Managed Identity, role assignment, and role definition rejection paths are covered by the identity/RBAC parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:identity-rbac-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:identity-rbac-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
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
| Parameter variance captures | partial | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, unsupported-api-version=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-routing-or-parent-validation=6, arm-surface=2, provider-validation=3, subscription-or-provider-readiness=1, provider-accepted=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>local Key Vault secret set/get/version-list/delete and malformed secret rejection smoke | Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.<br>Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out. |
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
| Identity/RBAC behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | partial | e2e:key-vault-parity is wired into npm run smoke<br>local Key Vault key create/get/list/encrypt/decrypt/delete and key_ops rejection smoke | Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.<br>Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out. |
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
| Parameter variance captures | partial | 29 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=2, invalid-tags-shape=2, missing-api-version=2, missing-charset=1, missing-collation=1, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-version=1, missing-admin-login=1, missing-admin-password=1, missing-location=1, weak-admin-password=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=20, provider-routing-or-parent-validation=5, arm-surface=2, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:postgresql-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:postgresql-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:postgresql-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 9 registry operations declared<br>backing engines: local-postgres | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## cosmos-nosql-table

- Tier: 1
- AWS analogue: DynamoDB
- Azure equivalent: Cosmos DB for NoSQL / Table Storage
- Current status: in-progress
- Resource types: Microsoft.DocumentDB/databaseAccounts, Microsoft.DocumentDB/databaseAccounts/sqlDatabases, Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers, Microsoft.Storage/storageAccounts/tableServices/tables

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 16 candidate catalog calls<br>366 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 41 live ARM captures<br>variance cases: empty-body=4, invalid-location=4, invalid-partition-key-kind=1, invalid-tags-shape=4, invalid-throughput=2, mismatched-resource-id=2, missing-api-version=4, missing-partition-key-paths=1, null-properties=4, unsupported-api-version=4, valid-minimal=4, missing-location=1, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=34, arm-surface=4, provider-accepted=2, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:cosmos-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files<br>e2e:cosmos-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:cosmos-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | Official/local backing option declared: cosmos-db-emulator, azurite<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 16 registry operations declared<br>backing engines: cosmos-db-emulator, azurite | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## service-bus-topics

- Tier: 1
- AWS analogue: SNS
- Azure equivalent: Service Bus topics / Event Grid topics
- Current status: in-progress
- Resource types: Microsoft.ServiceBus/namespaces, Microsoft.ServiceBus/namespaces/topics, Microsoft.ServiceBus/namespaces/topics/subscriptions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 12 candidate catalog calls<br>116 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 33 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-max-delivery-count=1, invalid-tags-shape=3, missing-api-version=3, null-properties=3, unsupported-api-version=3, valid-minimal=3, invalid-default-message-ttl=1, invalid-max-size=1, invalid-sku=2, not-found=4, empty-list=2, missing-location=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=23, arm-surface=3, provider-routing-or-parent-validation=5, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:service-bus-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:service-bus-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:service-bus-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | partial | e2e:service-bus-parity is wired into npm run smoke<br>official Service Bus emulator queue/topic send, receive, complete, and missing-entity rejection smoke | Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.<br>Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out. |
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
| Identity/RBAC behavior | partial | e2e:event-grid-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:event-grid-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:event-grid-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | partial | e2e:event-grid-parity is wired into npm run smoke<br>Event Grid topic publish URL, key auth, malformed publish rejection, and local event capture | Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.<br>Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out. |
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
| Identity/RBAC behavior | partial | e2e:container-registry-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:container-registry-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:container-registry-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | partial | e2e:container-registry-parity is wired into npm run smoke<br>local ACR/Docker Registry bearer challenge, token, catalog, tag, manifest, and post-delete rejection smoke | Expand from local data-plane smoke to live Azure-captured success, rejection, auth, retry, and side-effect matrices.<br>Keep unmodeled data-plane routes fail-closed until captured or explicitly scoped out. |
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
| Identity/RBAC behavior | partial | e2e:aks-metadata-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:aks-metadata-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:aks-metadata-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
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
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>1013 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=8, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:monitor-logs-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:monitor-logs-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:monitor-logs-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
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
| Identity/RBAC behavior | partial | e2e:monitor-metrics-alerts-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:monitor-metrics-alerts-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:monitor-metrics-alerts-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
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
| Parameter variance captures | partial | 41 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-tags-shape=3, missing-api-version=3, missing-location=3, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=6, empty-list=3, missing-group-ids=1, missing-private-link-connections=1, missing-private-link-service-id=1, missing-subnet-id=1, invalid-address-prefix=1, invalid-subnet-prefix=1, missing-address-space=1, missing-subnet-prefix=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=30, arm-surface=3, provider-accepted=5, provider-routing-or-parent-validation=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:virtual-network-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:virtual-network-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:virtual-network-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
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
| Identity/RBAC behavior | partial | e2e:mysql-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:mysql-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:mysql-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 9 registry operations declared<br>backing engines: local-mysql | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

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
| Identity/RBAC behavior | partial | e2e:storage-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files<br>e2e:storage-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:storage-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
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
| Identity/RBAC behavior | partial | e2e:redis-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:redis-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:redis-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 7 registry operations declared<br>backing engines: local-redis | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

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
| Identity/RBAC behavior | partial | e2e:logic-workflows-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:logic-workflows-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:logic-workflows-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 6 registry operations declared<br>backing engines: globalstack-workflow-runner, functions-core-tools | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## dns-zones

- Tier: 2
- AWS analogue: Route 53
- Azure equivalent: Azure DNS / Private DNS Zones
- Current status: in-progress
- Resource types: Microsoft.Network/dnsZones, Microsoft.Network/dnsZones/A, Microsoft.Network/dnsZones/AAAA, Microsoft.Network/dnsZones/CAA, Microsoft.Network/dnsZones/CNAME, Microsoft.Network/dnsZones/MX, Microsoft.Network/dnsZones/NS, Microsoft.Network/dnsZones/PTR, Microsoft.Network/dnsZones/SOA, Microsoft.Network/dnsZones/SRV, Microsoft.Network/dnsZones/TXT, Microsoft.Network/privateDnsZones, Microsoft.Network/privateDnsZones/A, Microsoft.Network/privateDnsZones/AAAA, Microsoft.Network/privateDnsZones/CNAME, Microsoft.Network/privateDnsZones/MX, Microsoft.Network/privateDnsZones/PTR, Microsoft.Network/privateDnsZones/SOA, Microsoft.Network/privateDnsZones/SRV, Microsoft.Network/privateDnsZones/TXT, Microsoft.Network/privateDnsZones/virtualNetworkLinks

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 84 candidate catalog calls<br>136 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 168 live ARM captures<br>variance cases: empty-body=21, invalid-a-record=2, invalid-location=21, invalid-tags-shape=19, missing-api-version=21, null-properties=19, unsupported-api-version=19, valid-minimal=21, invalid-aaaa-record=2, invalid-caa-record=1, missing-cname=2, invalid-mx-record=2, invalid-ns-record=1, invalid-ptr-record=2, invalid-soa-record=2, invalid-srv-record=2, invalid-txt-record=2, not-found=4, empty-list=2, invalid-registration-enabled-type=1, missing-location=1, missing-virtual-network-id=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=137, arm-surface=21, provider-validation=4, provider-accepted=4, provider-routing-or-parent-validation=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:dns-zones-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:dns-zones-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:dns-zones-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
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
| Identity/RBAC behavior | partial | e2e:load-balancing-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:load-balancing-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:load-balancing-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
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
| Identity/RBAC behavior | partial | e2e:front-door-cdn-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:front-door-cdn-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:front-door-cdn-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 14 registry operations declared<br>backing engines: globalstack-edge-router | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

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
| Identity/RBAC behavior | partial | e2e:waf-policy-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:waf-policy-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:waf-policy-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 10 registry operations declared<br>backing engines: globalstack-waf-metadata | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

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
| Identity/RBAC behavior | partial | e2e:activity-log-audit-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:activity-log-audit-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:activity-log-audit-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 9 registry operations declared<br>backing engines: globalstack-audit-log | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## azure-files

- Tier: 2
- AWS analogue: EFS
- Azure equivalent: Azure Files / Azure NetApp Files
- Current status: in-progress
- Resource types: Microsoft.Storage/storageAccounts/fileServices/shares, Microsoft.NetApp/netAppAccounts/capacityPools/volumes

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>70 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 17 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-enabled-protocols=1, invalid-share-quota=1, unsupported-api-version=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=4, arm-surface=2, provider-routing-or-parent-validation=10, provider-accepted=1 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:azure-files-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | 2 storage lifecycle capture files<br>e2e:azure-files-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:azure-files-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 9 registry operations declared<br>backing engines: local-file-share | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## event-hubs-streams

- Tier: 2
- AWS analogue: Kinesis Data Streams
- Azure equivalent: Azure Event Hubs
- Current status: in-progress
- Resource types: Microsoft.EventHub/namespaces, Microsoft.EventHub/namespaces/eventhubs

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>93 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 29 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-message-retention-type=1, invalid-message-retention=1, invalid-partition-count-type=1, invalid-partition-count=1, invalid-sku=2, invalid-tags-shape=2, missing-api-version=2, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-capacity-type=1, invalid-capacity=1, missing-location=1 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=20, provider-routing-or-parent-validation=5, arm-surface=2, provider-accepted=2 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:event-hubs-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:event-hubs-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:event-hubs-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | Official/local backing option declared: event-hubs-emulator<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 11 registry operations declared<br>backing engines: event-hubs-emulator | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

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
| Identity/RBAC behavior | partial | e2e:synapse-warehouse-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:synapse-warehouse-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:synapse-warehouse-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 10 registry operations declared<br>backing engines: local-analytics-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## app-configuration-parameters

- Tier: 2
- AWS analogue: SSM Parameter Store
- Azure equivalent: Azure App Configuration / Key Vault configuration values
- Current status: in-progress
- Resource types: Microsoft.AppConfiguration/configurationStores, Microsoft.KeyVault/vaults/secrets

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 8 candidate catalog calls<br>57 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 18 live ARM captures<br>variance cases: empty-body=2, invalid-disable-local-auth-type=1, invalid-location=2, invalid-public-network-access=1, invalid-sku=1, missing-api-version=2, unsupported-api-version=1, valid-minimal=2, not-found=4, empty-list=2 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: provider-validation=6, arm-surface=2, subscription-or-provider-readiness=1, provider-accepted=3, provider-routing-or-parent-validation=6 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:app-configuration-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:app-configuration-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:app-configuration-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | Official/local backing option declared: app-configuration-emulator, globalstack-secret-store<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 7 registry operations declared<br>backing engines: app-configuration-emulator, globalstack-secret-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

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
| Identity/RBAC behavior | partial | e2e:database-migration-service-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:database-migration-service-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:database-migration-service-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 10 registry operations declared<br>backing engines: globalstack-migration-plan-store | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## service-discovery

- Tier: 2
- AWS analogue: Service Discovery / Cloud Map
- Azure equivalent: Azure Private DNS / Container Apps service discovery
- Current status: in-progress
- Resource types: Microsoft.Network/privateDnsZones, Microsoft.App/managedEnvironments, Microsoft.App/containerApps

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | partial | 12 candidate catalog calls<br>131 provider operations matched | Reconcile provider operations with ARM REST specs and SDK/IaC provider call traces.<br>Add data-plane surface inventory where the service has data-plane APIs. |
| Parameter variance captures | partial | 37 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-scale=1, invalid-tags-shape=3, missing-api-version=3, missing-containers=1, missing-location=3, missing-managed-environment-id=1, missing-managed-environment-reference=1, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=6, empty-list=3 | Expand service-specific positive and negative parameter matrix beyond the current generic variance cases. |
| State transition captures | partial | create captured<br>get captured<br>list captured<br>delete captured | Capture update, async provisioning, failed provisioning, parent readiness, delete polling, and post-delete behavior for this specific service. |
| Error-shape fidelity | partial | validation depths: capture-infrastructure-gap=26, arm-surface=3, provider-accepted=5, provider-routing-or-parent-validation=3 | Promote captured status/error/body/header assertions into local replay tests for every service-specific case. |
| Identity/RBAC behavior | partial | e2e:service-discovery-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack | Capture real Azure allow/deny matrices for ARM actions, role assignments, deny assignments, and inherited scopes.<br>Implement service-specific data-plane RBAC denials and propagation timing where applicable.<br>Keep exact Entra ID, Microsoft Graph, conditional access, token claim signing, and managed identity endpoint semantics out of parity claims until captured. |
| Retry/eventual consistency behavior | partial | e2e:service-discovery-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted | Capture poll intervals, retry timing, throttling, eventual read/list windows, and repeated delete consistency from real Azure for this service.<br>Promote timing-sensitive behavior only after repeat captures prove it is stable enough to emulate. |
| IaC-provider behavior | partial | e2e:service-discovery-parity is wired into npm run smoke<br>8 platform lifecycle runners: Terraform HCL, OpenTofu HCL, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, ARM JSON | Extend beyond create/destroy lifecycle smoke to provider refresh, diff/preview, update, import, and drift checks where relevant.<br>Capture provider-specific Azure errors, retry behavior, and non-happy-path IaC operations before claiming full provider parity. |
| Data-plane behavior | not-started |  | No durable local data-plane evidence is recorded yet.<br>Inventory and capture service-specific data-plane APIs, or explicitly mark no data-plane scope for this capability. |
| Repeat captures for ambiguous behavior | not-started |  | Repeat timing-sensitive captures and record stabilization rules before normalization. |
| Service-specific local facade/emulator integration | partial | 15 registry operations declared<br>backing engines: globalstack-service-registry, globalstack-dns-registry | Implement strict service-specific handlers and replay tests for all captured operations; unknown surfaces must fail closed. |

## Operating Rule

GlobalStack must deploy resources locally only for modeled surfaces. A modeled surface should match real Azure for captured parameters and states. Unknown surfaces, unmodeled data-plane calls, and unreconciled Azure behavior must fail closed rather than return fabricated success.

