# Azure 99% Parity Checklist

This checklist is the service-by-service work queue for making GlobalStack Azure behave like real Azure for IaC deployments and integration tests.

A service is not 99%-ready until every dimension below is complete from live Azure, official emulator, or explicitly scoped local conformance evidence. Partial evidence is useful, but it is not a parity claim.

Generated: 2026-05-28T19:33:56.464Z

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
| blob-storage | 1 | 99-ready | 10 | 0 | 0 | 8 | 16 | 232 |
| azure-functions | 1 | 99-ready | 10 | 0 | 0 | 8 | 15 | 418 |
| api-management | 1 | 99-ready | 10 | 0 | 0 | 8 | 28 | 511 |
| identity-rbac | 1 | 99-ready | 10 | 0 | 0 | 12 | 39 | 15 |
| key-vault-secrets | 1 | 99-ready | 10 | 0 | 0 | 8 | 20 | 96 |
| key-vault-keys | 1 | 99-ready | 10 | 0 | 0 | 8 | 19 | 105 |
| postgresql-flexible-server | 1 | 99-ready | 10 | 0 | 0 | 8 | 31 | 89 |
| cosmos-nosql-table | 1 | 99-ready | 10 | 0 | 0 | 16 | 41 | 366 |
| service-bus-topics | 1 | 99-ready | 10 | 0 | 0 | 12 | 33 | 116 |
| event-grid | 1 | 99-ready | 10 | 0 | 0 | 8 | 20 | 35 |
| container-registry | 1 | 99-ready | 10 | 0 | 0 | 4 | 12 | 118 |
| aks-metadata | 1 | 99-ready | 10 | 0 | 0 | 4 | 13 | 453 |
| monitor-logs | 1 | 99-ready | 10 | 0 | 0 | 8 | 15 | 1013 |
| monitor-metrics-alerts | 1 | 99-ready | 10 | 0 | 0 | 8 | 31 | 12 |
| virtual-network | 1 | 99-ready | 10 | 0 | 0 | 12 | 41 | 110 |
| mysql-flexible-server | 2 | 99-ready | 10 | 0 | 0 | 8 | 17 | 67 |
| queue-storage | 2 | 99-ready | 10 | 0 | 0 | 8 | 16 | 22 |
| redis-cache | 2 | 99-ready | 10 | 0 | 0 | 8 | 17 | 73 |
| logic-workflows | 2 | 99-ready | 10 | 0 | 0 | 8 | 20 | 425 |
| dns-zones | 2 | 99-ready | 10 | 0 | 0 | 84 | 168 | 136 |
| load-balancing | 2 | 99-ready | 10 | 0 | 0 | 8 | 34 | 67 |
| front-door-cdn | 2 | 99-ready | 10 | 0 | 0 | 12 | 41 | 133 |
| waf-policy | 2 | 99-ready | 10 | 0 | 0 | 8 | 31 | 9 |
| activity-log-audit | 2 | 99-ready | 10 | 0 | 0 | 8 | 23 | 15 |
| azure-files | 2 | 99-ready | 10 | 0 | 0 | 8 | 17 | 70 |
| event-hubs-streams | 2 | 99-ready | 10 | 0 | 0 | 8 | 31 | 93 |
| synapse-warehouse | 2 | 99-ready | 10 | 0 | 0 | 8 | 23 | 244 |
| app-configuration-parameters | 2 | 99-ready | 10 | 0 | 0 | 8 | 18 | 57 |
| database-migration-service | 2 | 99-ready | 10 | 0 | 0 | 8 | 23 | 34 |
| service-discovery | 2 | 99-ready | 10 | 0 | 0 | 12 | 37 | 131 |

## blob-storage

- Tier: 1
- AWS analogue: S3
- Azure equivalent: Azure Blob Storage / Storage Account
- Current status: 99-ready
- Resource types: Microsoft.Storage/storageAccounts, Microsoft.Storage/storageAccounts/blobServices/containers

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>232 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1, unsupported-api-version=1<br>service-specific negative variance ids: invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-routing-or-parent-validation=7, arm-surface=2, provider-validation=3, subscription-or-provider-readiness=1, provider-accepted=3<br>e2e:storage-parity asserts 26 status checks, 13 error-code checks, 3 header checks |  |
| Identity/RBAC behavior | complete | e2e:storage-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack<br>official-emulator Blob data-plane create/get/delete/auth plus GlobalStack normalization coverage includes explicit data-plane authorization rejection coverage |  |
| Retry/eventual consistency behavior | complete | 2 storage lifecycle capture files<br>e2e:storage-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:storage-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | 32 Blob/Queue data-plane expectations<br>e2e:storage-parity is wired into npm run smoke<br>official-emulator Blob data-plane create/get/delete/auth plus GlobalStack normalization coverage<br>18 official-emulator data-plane hardening checks<br>6 normalization checks<br>no service-specific repeat caveat is currently recorded for this storage surface<br>parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete | no blob-specific repeat gap remains in the storage normalizer caveat set |  |
| Service-specific local facade/emulator integration | complete | 12 registry operations declared<br>backing engines: azurite<br>dedicated parity pack passed against the local facade/runtime path |  |

## azure-functions

- Tier: 1
- AWS analogue: Lambda
- Azure equivalent: Azure Functions / Function Apps
- Current status: 99-ready
- Resource types: Microsoft.Web/sites, Microsoft.Web/serverfarms, Microsoft.Web/sites/functions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>418 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=1, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2<br>service-specific negative variance ids: invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=7, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=2<br>e2e:azure-functions-parity asserts 128 status checks, 38 error-code checks, 4 header checks |  |
| Identity/RBAC behavior | complete | e2e:azure-functions-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:azure-functions-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:azure-functions-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | e2e:azure-functions-parity is wired into npm run smoke<br>local HTTP-trigger routing, function-key rejection, and post-delete route rejection<br>parity result sections: controlAndDataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 48 registry operations declared<br>backing engines: functions-core-tools, azurite<br>dedicated parity pack passed against the local facade/runtime path |  |

## api-management

- Tier: 1
- AWS analogue: API Gateway
- Azure equivalent: Azure API Management
- Current status: 99-ready
- Resource types: Microsoft.ApiManagement/service, Microsoft.ApiManagement/service/apis

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>511 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 28 live ARM captures<br>variance cases: empty-body=2, invalid-api-identifier=1, invalid-location=2, invalid-protocols-shape=1, invalid-tags-shape=2, missing-api-version=2, missing-path=1, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-service-name=1, invalid-sku=1, missing-location=1, missing-publisher-email=1, missing-publisher-name=1<br>service-specific negative variance ids: invalid-api-identifier, invalid-protocols-shape, missing-path, invalid-service-name, invalid-sku, missing-publisher-email, missing-publisher-name |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=20, arm-surface=2, provider-routing-or-parent-validation=4, provider-accepted=2<br>e2e:api-management-parity asserts 50 status checks, 27 error-code checks, 3 header checks |  |
| Identity/RBAC behavior | complete | e2e:api-management-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:api-management-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:api-management-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | e2e:api-management-parity is wired into npm run smoke<br>local gateway host/path/subscription-key rejection and route smoke<br>parity result sections: controlAndGatewayPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 11 registry operations declared<br>backing engines: globalstack-http-router<br>dedicated parity pack passed against the local facade/runtime path |  |

## identity-rbac

- Tier: 1
- AWS analogue: IAM/STS
- Azure equivalent: Microsoft Entra ID, Azure RBAC, Managed Identity
- Current status: 99-ready
- Resource types: Microsoft.ManagedIdentity/userAssignedIdentities, Microsoft.Authorization/roleAssignments, Microsoft.Authorization/roleDefinitions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 12 candidate catalog calls<br>15 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 39 live ARM captures<br>variance cases: empty-body=3, empty-principal-id=1, empty-role-definition-id=1, invalid-location=3, invalid-tags-shape=3, missing-api-version=3, missing-principal-id=1, missing-role-definition-id=1, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=6, empty-list=3, empty-assignable-scopes=1, empty-permissions=1, missing-assignable-scopes=1, missing-permissions=1, missing-location=1<br>service-specific negative variance ids: empty-principal-id, empty-role-definition-id, missing-principal-id, missing-role-definition-id, empty-assignable-scopes, empty-permissions, missing-assignable-scopes, missing-permissions |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=27, arm-surface=3, provider-accepted=6, provider-validation=2, provider-routing-or-parent-validation=1<br>e2e:identity-rbac-parity asserts 52 status checks, 33 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:identity-rbac-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack<br>local token facade, OpenID discovery, Managed Identity, role assignment, and role definition rejection paths are covered by the identity/RBAC parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:identity-rbac-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>identity token issuance remains stable across repeated requests while post-delete identity reads remain not found<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:identity-rbac-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlAndTokenPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 14 registry operations declared<br>backing engines: globalstack-local-token-service<br>dedicated parity pack passed against the local facade/runtime path |  |

## key-vault-secrets

- Tier: 1
- AWS analogue: Secrets Manager
- Azure equivalent: Key Vault secrets
- Current status: 99-ready
- Resource types: Microsoft.KeyVault/vaults, Microsoft.KeyVault/vaults/secrets

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>96 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 20 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-secret-name=1, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1, invalid-tags-shape=1, missing-location=1, null-properties=1, unsupported-api-version=1<br>service-specific negative variance ids: invalid-secret-name, invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-routing-or-parent-validation=5, provider-validation=9, arm-surface=2, subscription-or-provider-readiness=1, provider-accepted=3<br>e2e:key-vault-parity asserts 100 status checks, 51 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>local Key Vault secret set/get/version-list/delete and malformed secret rejection smoke<br>parity result sections: controlAndDataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 6 registry operations declared<br>backing engines: globalstack-secret-store<br>dedicated parity pack passed against the local facade/runtime path |  |

## key-vault-keys

- Tier: 1
- AWS analogue: KMS
- Azure equivalent: Key Vault keys / Managed HSM
- Current status: 99-ready
- Resource types: Microsoft.KeyVault/vaults, Microsoft.KeyVault/vaults/keys

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>105 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 19 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1, invalid-tags-shape=1, missing-location=1, null-properties=1, unsupported-api-version=1<br>service-specific negative variance ids: invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-routing-or-parent-validation=5, arm-surface=2, provider-validation=8, subscription-or-provider-readiness=1, provider-accepted=3<br>e2e:key-vault-parity asserts 100 status checks, 51 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | e2e:key-vault-parity is wired into npm run smoke<br>local Key Vault key create/get/list/encrypt/decrypt/sign/verify/wrapKey/unwrapKey/delete and key_ops rejection smoke<br>parity result sections: controlAndDataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 6 registry operations declared<br>backing engines: node-crypto<br>dedicated parity pack passed against the local facade/runtime path |  |

## postgresql-flexible-server

- Tier: 1
- AWS analogue: RDS PostgreSQL
- Azure equivalent: Azure Database for PostgreSQL Flexible Server
- Current status: 99-ready
- Resource types: Microsoft.DBforPostgreSQL/flexibleServers, Microsoft.DBforPostgreSQL/flexibleServers/databases

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>89 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 31 live ARM captures<br>variance cases: empty-body=2, invalid-database-name=1, invalid-location=2, invalid-sku=2, invalid-tags-shape=2, missing-api-version=2, missing-charset=1, missing-collation=1, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-server-name=1, invalid-version=1, missing-admin-login=1, missing-admin-password=1, missing-location=1, weak-admin-password=1<br>service-specific negative variance ids: invalid-database-name, invalid-sku, missing-charset, missing-collation, invalid-server-name, invalid-version, missing-admin-login, missing-admin-password, weak-admin-password |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=11, provider-validation=9, provider-routing-or-parent-validation=5, arm-surface=2, subscription-or-provider-readiness=1, provider-accepted=3<br>e2e:postgresql-parity asserts 38 status checks, 23 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:postgresql-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:postgresql-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:postgresql-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 9 registry operations declared<br>backing engines: local-postgres<br>dedicated parity pack passed against the local facade/runtime path |  |

## cosmos-nosql-table

- Tier: 1
- AWS analogue: DynamoDB
- Azure equivalent: Cosmos DB for NoSQL / Table Storage
- Current status: 99-ready
- Resource types: Microsoft.DocumentDB/databaseAccounts, Microsoft.DocumentDB/databaseAccounts/sqlDatabases, Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers, Microsoft.Storage/storageAccounts/tableServices/tables

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 16 candidate catalog calls<br>366 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 41 live ARM captures<br>variance cases: empty-body=4, invalid-location=4, invalid-partition-key-kind=1, invalid-tags-shape=4, invalid-throughput=2, mismatched-resource-id=2, missing-api-version=4, missing-partition-key-paths=1, null-properties=4, unsupported-api-version=4, valid-minimal=4, missing-location=1, not-found=4, empty-list=2<br>service-specific negative variance ids: invalid-partition-key-kind, invalid-throughput, mismatched-resource-id, missing-partition-key-paths |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=34, arm-surface=4, provider-accepted=2, provider-routing-or-parent-validation=1<br>e2e:cosmos-parity asserts 78 status checks, 45 error-code checks, 1 header checks |  |
| Identity/RBAC behavior | complete | e2e:cosmos-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | 2 storage lifecycle capture files<br>e2e:cosmos-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:cosmos-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 16 registry operations declared<br>backing engines: cosmos-db-emulator, azurite<br>dedicated parity pack passed against the local facade/runtime path |  |

## service-bus-topics

- Tier: 1
- AWS analogue: SNS
- Azure equivalent: Service Bus topics / Event Grid topics
- Current status: 99-ready
- Resource types: Microsoft.ServiceBus/namespaces, Microsoft.ServiceBus/namespaces/topics, Microsoft.ServiceBus/namespaces/topics/subscriptions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 12 candidate catalog calls<br>116 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 33 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-max-delivery-count=1, invalid-tags-shape=3, missing-api-version=3, null-properties=3, unsupported-api-version=3, valid-minimal=3, invalid-default-message-ttl=1, invalid-max-size=1, invalid-sku=2, not-found=4, empty-list=2, missing-location=1<br>service-specific negative variance ids: invalid-max-delivery-count, invalid-default-message-ttl, invalid-max-size, invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=23, arm-surface=3, provider-routing-or-parent-validation=5, provider-accepted=2<br>e2e:service-bus-parity asserts 50 status checks, 25 error-code checks, 3 header checks |  |
| Identity/RBAC behavior | complete | e2e:service-bus-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:service-bus-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:service-bus-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | e2e:service-bus-parity is wired into npm run smoke<br>official Service Bus emulator queue/topic send, receive, complete, and missing-entity rejection smoke<br>parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 13 registry operations declared<br>backing engines: service-bus-emulator, globalstack-event-router<br>dedicated parity pack passed against the local facade/runtime path |  |

## event-grid

- Tier: 1
- AWS analogue: EventBridge
- Azure equivalent: Event Grid
- Current status: 99-ready
- Resource types: Microsoft.EventGrid/topics, Microsoft.EventGrid/eventSubscriptions

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>35 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 20 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-input-schema=1, invalid-tags-shape=1, missing-location=1, null-properties=1<br>service-specific negative variance ids: invalid-input-schema |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=8, arm-surface=2, subscription-or-provider-readiness=2, provider-accepted=6, provider-routing-or-parent-validation=2<br>e2e:event-grid-parity asserts 46 status checks, 29 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:event-grid-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:event-grid-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:event-grid-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | e2e:event-grid-parity is wired into npm run smoke<br>Event Grid topic publish URL, key auth, malformed publish rejection, and local event capture<br>parity result sections: controlAndDataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 8 registry operations declared<br>backing engines: globalstack-event-router<br>dedicated parity pack passed against the local facade/runtime path |  |

## container-registry

- Tier: 1
- AWS analogue: ECR
- Azure equivalent: Azure Container Registry
- Current status: 99-ready
- Resource types: Microsoft.ContainerRegistry/registries

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 4 candidate catalog calls<br>118 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 12 live ARM captures<br>variance cases: empty-body=1, invalid-location=1, invalid-registry-name=1, invalid-tags-shape=1, missing-api-version=1, missing-location=1, null-properties=1, unsupported-api-version=1, valid-minimal=1, not-found=2, empty-list=1<br>service-specific negative variance ids: invalid-registry-name |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=7, arm-surface=1, subscription-or-provider-readiness=1, provider-accepted=2, provider-routing-or-parent-validation=1<br>e2e:container-registry-parity asserts 43 status checks, 22 error-code checks, 1 header checks |  |
| Identity/RBAC behavior | complete | e2e:container-registry-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:container-registry-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:container-registry-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | e2e:container-registry-parity is wired into npm run smoke<br>local ACR/Docker Registry bearer challenge, token, catalog, tag, manifest, and post-delete rejection smoke<br>parity result sections: controlAndDataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 6 registry operations declared<br>backing engines: local-oci-registry<br>dedicated parity pack passed against the local facade/runtime path |  |

## aks-metadata

- Tier: 1
- AWS analogue: EKS
- Azure equivalent: Azure Kubernetes Service
- Current status: 99-ready
- Resource types: Microsoft.ContainerService/managedClusters, Microsoft.ContainerService/managedClusters/agentPools

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 4 candidate catalog calls<br>453 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 13 live ARM captures<br>variance cases: invalid-network-policy=1, empty-body=1, invalid-cluster-name=1, invalid-location=1, invalid-tags-shape=1, missing-api-version=1, missing-location=1, null-properties=1, unsupported-api-version=1, valid-minimal=1, not-found=2, empty-list=1<br>service-specific negative variance ids: invalid-network-policy, invalid-cluster-name |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=8, arm-surface=1, subscription-or-provider-readiness=1, provider-accepted=2, provider-routing-or-parent-validation=1<br>e2e:aks-metadata-parity asserts 161 status checks, 41 error-code checks, 4 header checks |  |
| Identity/RBAC behavior | complete | e2e:aks-metadata-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:aks-metadata-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:aks-metadata-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 36 registry operations declared<br>backing engines: globalstack-aks-runtime, rancher-k3s-cluster<br>dedicated parity pack passed against the local facade/runtime path |  |

## monitor-logs

- Tier: 1
- AWS analogue: CloudWatch Logs
- Azure equivalent: Log Analytics / Application Insights / Azure Monitor Logs
- Current status: 99-ready
- Resource types: Microsoft.OperationalInsights/workspaces, Microsoft.Insights/components, Microsoft.Insights/diagnosticSettings

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>1013 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 15 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-sku=1<br>service-specific negative variance ids: invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=8, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=1<br>e2e:monitor-logs-parity asserts 40 status checks, 13 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:monitor-logs-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:monitor-logs-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:monitor-logs-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 14 registry operations declared<br>backing engines: globalstack-log-store<br>dedicated parity pack passed against the local facade/runtime path |  |

## monitor-metrics-alerts

- Tier: 1
- AWS analogue: CloudWatch Metrics/Alarms
- Azure equivalent: Azure Monitor metrics and alerts
- Current status: 99-ready
- Resource types: Microsoft.Insights/metricAlerts, Microsoft.Insights/actionGroups, Microsoft.Insights/activityLogAlerts

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>12 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 31 live ARM captures<br>variance cases: empty-body=3, invalid-group-short-name=1, invalid-location=3, invalid-tags-shape=3, missing-api-version=3, missing-location=3, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=4, empty-list=2<br>service-specific negative variance ids: invalid-group-short-name |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=20, arm-surface=3, subscription-or-provider-readiness=2, provider-accepted=4, provider-routing-or-parent-validation=2<br>e2e:monitor-metrics-alerts-parity asserts 53 status checks, 22 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:monitor-metrics-alerts-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:monitor-metrics-alerts-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:monitor-metrics-alerts-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 15 registry operations declared<br>backing engines: globalstack-metric-store<br>dedicated parity pack passed against the local facade/runtime path |  |

## virtual-network

- Tier: 1
- AWS analogue: VPC
- Azure equivalent: Virtual Network / Private Endpoint / Private DNS
- Current status: 99-ready
- Resource types: Microsoft.Network/virtualNetworks, Microsoft.Network/virtualNetworks/virtualNetworkPeerings, Microsoft.Network/privateEndpoints, Microsoft.Network/privateEndpoints/privateDnsZoneGroups, Microsoft.Network/privateDnsZones

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 12 candidate catalog calls<br>110 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 41 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-tags-shape=3, missing-api-version=3, missing-location=3, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=6, empty-list=3, missing-group-ids=1, missing-private-link-connections=1, missing-private-link-service-id=1, missing-subnet-id=1, invalid-address-prefix=1, invalid-subnet-prefix=1, missing-address-space=1, missing-subnet-prefix=1<br>service-specific negative variance ids: missing-group-ids, missing-private-link-connections, missing-private-link-service-id, missing-subnet-id, invalid-address-prefix, invalid-subnet-prefix, missing-address-space, missing-subnet-prefix |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=30, arm-surface=3, provider-accepted=5, provider-routing-or-parent-validation=3<br>e2e:virtual-network-parity asserts 74 status checks, 29 error-code checks, 2 header checks |  |
| Identity/RBAC behavior | complete | e2e:virtual-network-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:virtual-network-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:virtual-network-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 25 registry operations declared<br>backing engines: globalstack-network-model<br>dedicated parity pack passed against the local facade/runtime path |  |

## mysql-flexible-server

- Tier: 2
- AWS analogue: RDS MySQL
- Azure equivalent: Azure Database for MySQL Flexible Server
- Current status: 99-ready
- Resource types: Microsoft.DBforMySQL/flexibleServers, Microsoft.DBforMySQL/flexibleServers/databases

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>67 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 17 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-sku=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-server-name=1<br>service-specific negative variance ids: invalid-sku, invalid-server-name |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-routing-or-parent-validation=8, arm-surface=2, provider-validation=5, provider-accepted=2<br>e2e:mysql-parity asserts 28 status checks, 13 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:mysql-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:mysql-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:mysql-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 9 registry operations declared<br>backing engines: local-mysql<br>dedicated parity pack passed against the local facade/runtime path |  |

## queue-storage

- Tier: 2
- AWS analogue: SQS
- Azure equivalent: Azure Queue Storage / Service Bus queues
- Current status: 99-ready
- Resource types: Microsoft.Storage/storageAccounts/queueServices/queues, Microsoft.ServiceBus/namespaces/queues

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>22 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 16 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-max-delivery-count=1, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, unsupported-api-version=1<br>service-specific negative variance ids: invalid-max-delivery-count |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-routing-or-parent-validation=10, provider-validation=3, arm-surface=2, subscription-or-provider-readiness=1<br>e2e:storage-parity asserts 26 status checks, 13 error-code checks, 3 header checks |  |
| Identity/RBAC behavior | complete | e2e:storage-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack<br>official-emulator Queue data-plane create/peek/delete/auth plus GlobalStack normalization coverage includes explicit data-plane authorization rejection coverage |  |
| Retry/eventual consistency behavior | complete | 2 storage lifecycle capture files<br>e2e:storage-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>retry-after header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:storage-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | 32 Blob/Queue data-plane expectations<br>e2e:storage-parity is wired into npm run smoke<br>official-emulator Queue data-plane create/peek/delete/auth plus GlobalStack normalization coverage<br>15 official-emulator data-plane hardening checks<br>8 normalization checks<br>no service-specific repeat caveat is currently recorded for this storage surface<br>parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete |  |  |
| Service-specific local facade/emulator integration | complete | 7 registry operations declared<br>backing engines: azurite, service-bus-emulator<br>dedicated parity pack passed against the local facade/runtime path |  |

## redis-cache

- Tier: 2
- AWS analogue: ElastiCache Redis
- Azure equivalent: Azure Cache for Redis
- Current status: 99-ready
- Resource types: Microsoft.Cache/redis, Microsoft.Cache/redisEnterprise

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>73 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 17 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-resource-name=1, invalid-sku=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2<br>service-specific negative variance ids: invalid-resource-name, invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=6, arm-surface=2, provider-accepted=4, provider-routing-or-parent-validation=2, subscription-or-provider-readiness=2, capture-infrastructure-gap=1<br>e2e:redis-parity asserts 20 status checks, 10 error-code checks, 1 header checks |  |
| Identity/RBAC behavior | complete | e2e:redis-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:redis-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:redis-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 7 registry operations declared<br>backing engines: local-redis<br>dedicated parity pack passed against the local facade/runtime path |  |

## logic-workflows

- Tier: 2
- AWS analogue: Step Functions
- Azure equivalent: Azure Logic Apps / Durable Functions
- Current status: 99-ready
- Resource types: Microsoft.Logic/workflows, Microsoft.Web/sites

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>425 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 20 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-state=1, invalid-tags-shape=1, missing-api-version=2, missing-location=1, null-properties=1, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2<br>service-specific negative variance ids: invalid-state |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=9, arm-surface=2, subscription-or-provider-readiness=2, provider-accepted=5, provider-routing-or-parent-validation=2<br>e2e:logic-workflows-parity asserts 98 status checks, 11 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:logic-workflows-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:logic-workflows-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:logic-workflows-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 36 registry operations declared<br>backing engines: globalstack-workflow-runner, functions-core-tools<br>dedicated parity pack passed against the local facade/runtime path |  |

## dns-zones

- Tier: 2
- AWS analogue: Route 53
- Azure equivalent: Azure DNS / Private DNS Zones
- Current status: 99-ready
- Resource types: Microsoft.Network/dnsZones, Microsoft.Network/dnsZones/A, Microsoft.Network/dnsZones/AAAA, Microsoft.Network/dnsZones/CAA, Microsoft.Network/dnsZones/CNAME, Microsoft.Network/dnsZones/MX, Microsoft.Network/dnsZones/NS, Microsoft.Network/dnsZones/PTR, Microsoft.Network/dnsZones/SOA, Microsoft.Network/dnsZones/SRV, Microsoft.Network/dnsZones/TXT, Microsoft.Network/privateDnsZones, Microsoft.Network/privateDnsZones/A, Microsoft.Network/privateDnsZones/AAAA, Microsoft.Network/privateDnsZones/CNAME, Microsoft.Network/privateDnsZones/MX, Microsoft.Network/privateDnsZones/PTR, Microsoft.Network/privateDnsZones/SOA, Microsoft.Network/privateDnsZones/SRV, Microsoft.Network/privateDnsZones/TXT, Microsoft.Network/privateDnsZones/virtualNetworkLinks

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 84 candidate catalog calls<br>136 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 168 live ARM captures<br>variance cases: empty-body=21, invalid-a-record=2, invalid-location=21, invalid-tags-shape=19, missing-api-version=21, null-properties=19, unsupported-api-version=19, valid-minimal=21, invalid-aaaa-record=2, invalid-caa-record=1, missing-cname=2, invalid-mx-record=2, invalid-ns-record=1, invalid-ptr-record=2, invalid-soa-record=2, invalid-srv-record=2, invalid-txt-record=2, not-found=4, empty-list=2, invalid-registration-enabled-type=1, missing-location=1, missing-virtual-network-id=1<br>service-specific negative variance ids: invalid-a-record, invalid-aaaa-record, invalid-caa-record, missing-cname, invalid-mx-record, invalid-ns-record, invalid-ptr-record, invalid-soa-record, invalid-srv-record, invalid-txt-record, invalid-registration-enabled-type, missing-virtual-network-id |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=137, arm-surface=21, provider-validation=4, provider-accepted=4, provider-routing-or-parent-validation=2<br>e2e:dns-zones-parity asserts 64 status checks, 32 error-code checks, 2 header checks |  |
| Identity/RBAC behavior | complete | e2e:dns-zones-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:dns-zones-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:dns-zones-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 17 registry operations declared<br>backing engines: globalstack-dns-registry<br>dedicated parity pack passed against the local facade/runtime path |  |

## load-balancing

- Tier: 2
- AWS analogue: ALB/NLB
- Azure equivalent: Azure Application Gateway / Load Balancer
- Current status: 99-ready
- Resource types: Microsoft.Network/applicationGateways, Microsoft.Network/loadBalancers, Microsoft.Network/publicIPAddresses

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>67 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 34 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-sku=3, invalid-tags-shape=3, missing-api-version=3, missing-location=3, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=4, empty-list=2, invalid-ip-version=1<br>service-specific negative variance ids: invalid-sku, invalid-ip-version |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=21, arm-surface=3, subscription-or-provider-readiness=3, provider-accepted=5, provider-routing-or-parent-validation=2<br>e2e:load-balancing-parity asserts 60 status checks, 29 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:load-balancing-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:load-balancing-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:load-balancing-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 14 registry operations declared<br>backing engines: globalstack-http-router<br>dedicated parity pack passed against the local facade/runtime path |  |

## front-door-cdn

- Tier: 2
- AWS analogue: CloudFront
- Azure equivalent: Azure Front Door / Azure CDN
- Current status: 99-ready
- Resource types: Microsoft.Cdn/profiles, Microsoft.Cdn/profiles/afdEndpoints, Microsoft.Cdn/profiles/endpoints, Microsoft.Cdn/profiles/originGroups, Microsoft.Cdn/profiles/originGroups/origins, Microsoft.Cdn/profiles/afdEndpoints/routes

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 12 candidate catalog calls<br>133 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 41 live ARM captures<br>variance cases: empty-body=4, invalid-location=4, invalid-tags-shape=3, missing-api-version=4, missing-location=4, null-properties=3, unsupported-api-version=4, valid-minimal=4, not-found=6, empty-list=3, invalid-profile-name=1, invalid-sku=1<br>service-specific negative variance ids: invalid-profile-name, invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=16, arm-surface=4, provider-routing-or-parent-validation=14, subscription-or-provider-readiness=3, provider-accepted=4<br>e2e:front-door-cdn-parity asserts 48 status checks, 17 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:front-door-cdn-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:front-door-cdn-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:front-door-cdn-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 24 registry operations declared<br>backing engines: globalstack-edge-router<br>dedicated parity pack passed against the local facade/runtime path |  |

## waf-policy

- Tier: 2
- AWS analogue: WAF
- Azure equivalent: Azure Web Application Firewall policy
- Current status: 99-ready
- Resource types: Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies, Microsoft.Network/FrontDoorWebApplicationFirewallPolicies, Microsoft.Cdn/profiles/securityPolicies

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>9 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 31 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-tags-shape=3, missing-api-version=3, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=4, empty-list=2, invalid-policy-mode=1, missing-location=2, invalid-sku=1<br>service-specific negative variance ids: invalid-policy-mode, invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-routing-or-parent-validation=6, provider-validation=14, arm-surface=3, subscription-or-provider-readiness=5, provider-accepted=3<br>e2e:waf-policy-parity asserts 43 status checks, 18 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:waf-policy-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:waf-policy-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:waf-policy-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 17 registry operations declared<br>backing engines: globalstack-waf-runtime, globalstack-edge-router<br>dedicated parity pack passed against the local facade/runtime path |  |

## activity-log-audit

- Tier: 2
- AWS analogue: CloudTrail
- Azure equivalent: Azure Activity Log / Diagnostic Settings
- Current status: 99-ready
- Resource types: Microsoft.Insights/diagnosticSettings, Microsoft.EventGrid/systemTopics

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>15 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 23 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-tags-shape=2, missing-api-version=2, missing-location=2, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-logs-shape=1<br>service-specific negative variance ids: invalid-logs-shape |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=16, arm-surface=2, subscription-or-provider-readiness=2, provider-accepted=2, provider-routing-or-parent-validation=1<br>e2e:activity-log-audit-parity asserts 21 status checks, 10 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:activity-log-audit-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:activity-log-audit-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:activity-log-audit-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 9 registry operations declared<br>backing engines: globalstack-audit-log<br>dedicated parity pack passed against the local facade/runtime path |  |

## azure-files

- Tier: 2
- AWS analogue: EFS
- Azure equivalent: Azure Files / Azure NetApp Files
- Current status: 99-ready
- Resource types: Microsoft.Storage/storageAccounts/fileServices/shares, Microsoft.NetApp/netAppAccounts/capacityPools/volumes

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>70 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 17 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, missing-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-enabled-protocols=1, invalid-share-quota=1, unsupported-api-version=1<br>service-specific negative variance ids: invalid-enabled-protocols, invalid-share-quota |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>2 storage lifecycle capture files exist<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=4, arm-surface=2, provider-routing-or-parent-validation=10, provider-accepted=1<br>e2e:azure-files-parity asserts 48 status checks, 25 error-code checks, 2 header checks |  |
| Identity/RBAC behavior | complete | e2e:azure-files-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | 2 storage lifecycle capture files<br>e2e:azure-files-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:azure-files-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 9 registry operations declared<br>backing engines: local-file-share<br>dedicated parity pack passed against the local facade/runtime path |  |

## event-hubs-streams

- Tier: 2
- AWS analogue: Kinesis Data Streams
- Azure equivalent: Azure Event Hubs
- Current status: 99-ready
- Resource types: Microsoft.EventHub/namespaces, Microsoft.EventHub/namespaces/eventhubs

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>93 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 31 live ARM captures<br>variance cases: empty-body=2, invalid-eventhub-name=1, invalid-location=2, invalid-message-retention-type=1, invalid-message-retention=1, invalid-partition-count-type=1, invalid-partition-count=1, invalid-sku=2, invalid-tags-shape=2, missing-api-version=2, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-capacity-type=1, invalid-capacity=1, invalid-namespace-name=1, missing-location=1<br>service-specific negative variance ids: invalid-eventhub-name, invalid-message-retention-type, invalid-message-retention, invalid-partition-count-type, invalid-partition-count, invalid-sku, invalid-capacity-type, invalid-capacity, invalid-namespace-name |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=22, provider-routing-or-parent-validation=5, arm-surface=2, provider-accepted=2<br>e2e:event-hubs-parity asserts 55 status checks, 24 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:event-hubs-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:event-hubs-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:event-hubs-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 11 registry operations declared<br>backing engines: event-hubs-emulator<br>dedicated parity pack passed against the local facade/runtime path |  |

## synapse-warehouse

- Tier: 2
- AWS analogue: Redshift
- Azure equivalent: Azure Synapse Analytics dedicated SQL pool
- Current status: 99-ready
- Resource types: Microsoft.Synapse/workspaces, Microsoft.Synapse/workspaces/sqlPools

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>244 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 23 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-tags-shape=2, missing-api-version=2, missing-location=2, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2, invalid-workspace-name=1<br>service-specific negative variance ids: invalid-workspace-name |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=11, arm-surface=2, provider-routing-or-parent-validation=5, subscription-or-provider-readiness=2, provider-accepted=3<br>e2e:synapse-warehouse-parity asserts 43 status checks, 13 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:synapse-warehouse-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:synapse-warehouse-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:synapse-warehouse-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 10 registry operations declared<br>backing engines: local-analytics-store<br>dedicated parity pack passed against the local facade/runtime path |  |

## app-configuration-parameters

- Tier: 2
- AWS analogue: SSM Parameter Store
- Azure equivalent: Azure App Configuration / Key Vault configuration values
- Current status: 99-ready
- Resource types: Microsoft.AppConfiguration/configurationStores, Microsoft.KeyVault/vaults/secrets

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>57 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 18 live ARM captures<br>variance cases: empty-body=2, invalid-disable-local-auth-type=1, invalid-location=2, invalid-public-network-access=1, invalid-sku=1, missing-api-version=2, unsupported-api-version=1, valid-minimal=2, not-found=4, empty-list=2<br>service-specific negative variance ids: invalid-disable-local-auth-type, invalid-public-network-access, invalid-sku |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=6, arm-surface=2, subscription-or-provider-readiness=1, provider-accepted=3, provider-routing-or-parent-validation=6<br>e2e:app-configuration-parity asserts 44 status checks, 9 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:app-configuration-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:app-configuration-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:app-configuration-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 7 registry operations declared<br>backing engines: app-configuration-emulator, globalstack-secret-store<br>dedicated parity pack passed against the local facade/runtime path |  |

## database-migration-service

- Tier: 2
- AWS analogue: DMS
- Azure equivalent: Azure Database Migration Service
- Current status: 99-ready
- Resource types: Microsoft.DataMigration/services, Microsoft.DataMigration/services/projects, Microsoft.DataMigration/services/projects/tasks

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 8 candidate catalog calls<br>34 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 23 live ARM captures<br>variance cases: empty-body=2, invalid-location=2, invalid-source-platform=1, invalid-tags-shape=2, missing-api-version=2, missing-location=2, null-properties=2, unsupported-api-version=2, valid-minimal=2, not-found=4, empty-list=2<br>service-specific negative variance ids: invalid-source-platform |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>async or transitional provisioning behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: provider-validation=10, provider-routing-or-parent-validation=6, arm-surface=2, subscription-or-provider-readiness=2, provider-accepted=3<br>e2e:database-migration-service-parity asserts 40 status checks, 9 error-code checks, 0 header checks |  |
| Identity/RBAC behavior | complete | e2e:database-migration-service-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:database-migration-service-parity is wired into npm run smoke<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers async/transitional and post-delete timing behavior |  |
| IaC-provider behavior | complete | e2e:database-migration-service-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 18 registry operations declared<br>backing engines: globalstack-migration-plan-store, local-postgres, local-mysql<br>dedicated parity pack passed against the local facade/runtime path |  |

## service-discovery

- Tier: 2
- AWS analogue: Service Discovery / Cloud Map
- Azure equivalent: Azure Private DNS / Container Apps service discovery
- Current status: 99-ready
- Resource types: Microsoft.Network/privateDnsZones, Microsoft.App/managedEnvironments, Microsoft.App/containerApps

| Dimension | Status | Evidence | Remaining Gaps |
|---|---|---|---|
| Complete live Azure API surface inventory | complete | 12 candidate catalog calls<br>131 provider operations matched<br>ARM/provider inventory is reconciled and any scoped data-plane inventory is present |  |
| Parameter variance captures | complete | 37 live ARM captures<br>variance cases: empty-body=3, invalid-location=3, invalid-scale=1, invalid-tags-shape=3, missing-api-version=3, missing-containers=1, missing-location=3, missing-managed-environment-id=1, missing-managed-environment-reference=1, null-properties=3, unsupported-api-version=3, valid-minimal=3, not-found=6, empty-list=3<br>service-specific negative variance ids: invalid-scale, missing-containers, missing-managed-environment-id, missing-managed-environment-reference |  |
| State transition captures | complete | create captured<br>get captured<br>list captured<br>delete captured<br>update behavior is asserted by the parity pack<br>post-delete behavior is asserted by the parity pack<br>synchronous create/get/list/delete lifecycle behavior is asserted by the parity pack<br>parent readiness and missing-parent behavior is asserted by the parity pack |  |
| Error-shape fidelity | complete | validation depths: capture-infrastructure-gap=26, arm-surface=3, provider-accepted=5, provider-routing-or-parent-validation=3<br>e2e:service-discovery-parity asserts 38 status checks, 11 error-code checks, 2 header checks |  |
| Identity/RBAC behavior | complete | e2e:service-discovery-parity is wired into npm run smoke<br>ARM InvalidAuthenticationToken rejection is asserted by the service parity pack<br>subscription-scope AuthorizationFailed rejection is asserted by the service parity pack |  |
| Retry/eventual consistency behavior | complete | e2e:service-discovery-parity is wired into npm run smoke<br>async-operation header behavior is asserted<br>transitional/provisioning state behavior is asserted<br>post-delete behavior is asserted<br>parity pack covers repeated stability and post-delete behavior for synchronous service paths |  |
| IaC-provider behavior | complete | e2e:service-discovery-parity is wired into npm run smoke<br>9 platform lifecycle runners: Terraform Azure HCL, OpenTofu Azure HCL, Pulumi Azure TypeScript, Pulumi Azure Python, Pulumi Azure YAML, Ansible Azure YAML, CLI REST Bash, Bicep, ARM JSON<br>all platform lifecycle runners passed provider lifecycle validation for this service |  |
| Data-plane behavior | complete | parity result sections: controlPlane, dataPlane |  |
| Repeat captures for ambiguous behavior | complete | parity pack asserts repeated or timing-sensitive behavior remains stable across reruns |  |
| Service-specific local facade/emulator integration | complete | 15 registry operations declared<br>backing engines: globalstack-service-registry, globalstack-dns-registry<br>dedicated parity pack passed against the local facade/runtime path |  |

## Operating Rule

GlobalStack must deploy resources locally only for modeled surfaces. A modeled surface should match real Azure for captured parameters and states. Unknown surfaces, unmodeled data-plane calls, and unreconciled Azure behavior must fail closed rather than return fabricated success.

