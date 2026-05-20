# Azure 99% Coverage Roadmap

This roadmap turns the parity checklist into an execution order. It does not mark any service complete; it identifies the next capture, implementation, and validation work needed for near-real Azure emulation.

Generated: 2026-05-20T15:15:53.528Z

## Guardrails

- Every real Azure run must be explicitly gated and followed by cleanup verification.
- A local pass is only meaningful when tied back to real Azure capture, official emulator behavior, or an explicit out-of-scope declaration.
- Unknown resource types, parameters, API versions, and data-plane calls must fail closed.
- IaC provider deploy, refresh, update, import, and destroy behavior must be tested before a service can approach 99%-ready.

## Wave Summary

| Wave | Services | Work Items | Objective |
|---|---:|---:|---|
| Wave 1: official emulator and storage-family depth | 8 | 80 | Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests. |
| Wave 2: identity, security, secrets, and encryption | 5 | 50 | Make authorization, denial, audit, and secure configuration behavior credible across the emulator. |
| Wave 3: compute, API, containers, and edge routing | 8 | 80 | Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests. |
| Wave 4: relational, cache, migration, and analytics platforms | 5 | 50 | Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals. |
| Wave 5: networking, DNS, and observability | 4 | 40 | Harden cross-cutting dependencies that most other services reference during deployment. |

## Service Priority

| Rank | Service | Tier | Wave | Score | Priority | Complete | Partial | Not Started | Next Dimensions |
|---:|---|---:|---|---:|---:|---:|---:|---:|---|
| 1 | cosmos-nosql-table | 1 | wave-1-official-emulator-and-storage-family | 0.3762 | 116 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 2 | aks-metadata | 1 | wave-3-compute-api-and-edge | 0.3762 | 111 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 3 | monitor-logs | 1 | wave-5-networking-observability-and-dns | 0.3762 | 111 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 4 | identity-rbac | 1 | wave-2-identity-security-and-secrets | 0.3762 | 110 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 5 | service-bus-topics | 1 | wave-1-official-emulator-and-storage-family | 0.4279 | 104 | 0 | 9 | 1 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 6 | postgresql-flexible-server | 1 | wave-4-data-platforms | 0.3762 | 104 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 7 | event-grid | 1 | wave-1-official-emulator-and-storage-family | 0.4279 | 103 | 0 | 9 | 1 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 8 | api-management | 1 | wave-3-compute-api-and-edge | 0.4279 | 102 | 0 | 9 | 1 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 9 | virtual-network | 1 | wave-5-networking-observability-and-dns | 0.3762 | 102 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 10 | azure-files | 2 | wave-1-official-emulator-and-storage-family | 0.3762 | 101 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 11 | event-hubs-streams | 2 | wave-1-official-emulator-and-storage-family | 0.3762 | 101 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 12 | app-configuration-parameters | 2 | wave-1-official-emulator-and-storage-family | 0.3762 | 101 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 13 | key-vault-keys | 1 | wave-2-identity-security-and-secrets | 0.4279 | 101 | 0 | 9 | 1 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 14 | azure-functions | 1 | wave-3-compute-api-and-edge | 0.4279 | 101 | 0 | 9 | 1 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 15 | monitor-metrics-alerts | 1 | wave-5-networking-observability-and-dns | 0.3762 | 101 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 16 | key-vault-secrets | 1 | wave-2-identity-security-and-secrets | 0.4279 | 100 | 0 | 9 | 1 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 17 | logic-workflows | 2 | wave-3-compute-api-and-edge | 0.3762 | 99 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 18 | blob-storage | 1 | wave-1-official-emulator-and-storage-family | 0.45 | 98 | 0 | 10 | 0 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 19 | waf-policy | 2 | wave-2-identity-security-and-secrets | 0.3762 | 98 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 20 | activity-log-audit | 2 | wave-2-identity-security-and-secrets | 0.3762 | 98 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 21 | container-registry | 1 | wave-3-compute-api-and-edge | 0.4279 | 98 | 0 | 9 | 1 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 22 | front-door-cdn | 2 | wave-3-compute-api-and-edge | 0.3762 | 96 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 23 | service-discovery | 2 | wave-3-compute-api-and-edge | 0.3762 | 96 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 24 | load-balancing | 2 | wave-3-compute-api-and-edge | 0.3762 | 95 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 25 | synapse-warehouse | 2 | wave-4-data-platforms | 0.3762 | 94 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 26 | mysql-flexible-server | 2 | wave-4-data-platforms | 0.3762 | 92 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 27 | redis-cache | 2 | wave-4-data-platforms | 0.3762 | 92 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 28 | database-migration-service | 2 | wave-4-data-platforms | 0.3762 | 92 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 29 | dns-zones | 2 | wave-5-networking-observability-and-dns | 0.3762 | 90 | 0 | 8 | 2 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |
| 30 | queue-storage | 2 | wave-1-official-emulator-and-storage-family | 0.45 | 84 | 0 | 10 | 0 | iacProviderBehavior<br>serviceSpecificFacade<br>stateTransitionCaptures<br>dataPlaneBehavior |

## Wave 1: official emulator and storage-family depth

Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests.

### cosmos-nosql-table

Priority: 116; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=cosmos-nosql-table`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=cosmos-nosql-table --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile cosmos-db-emulator up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile cosmos-db-emulator down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=cosmos-nosql-table --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=cosmos-nosql-table` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=cosmos-nosql-table --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=cosmos-nosql-table --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### service-bus-topics

Priority: 104; current score: 0.4279; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=service-bus-topics`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-bus-topics --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile service-bus-emulator up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile service-bus-emulator down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-bus-topics --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=service-bus-topics` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-bus-topics --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-bus-topics --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### event-grid

Priority: 103; current score: 0.4279; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=event-grid`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=event-grid` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### azure-files

Priority: 101; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=azure-files`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=azure-files` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### event-hubs-streams

Priority: 101; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=event-hubs-streams`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile event-hubs-emulator up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile event-hubs-emulator down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=event-hubs-streams` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### app-configuration-parameters

Priority: 101; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=app-configuration-parameters`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile app-configuration-emulator up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile app-configuration-emulator down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=app-configuration-parameters` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### blob-storage

Priority: 98; current score: 0.45; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=blob-storage`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=blob-storage --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run e2e:storage-hardening`<br>`npm run e2e:storage-normalizer`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=blob-storage --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=blob-storage` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=blob-storage --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### queue-storage

Priority: 84; current score: 0.45; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=queue-storage`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=queue-storage --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run e2e:storage-hardening`<br>`npm run e2e:storage-normalizer`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=queue-storage --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=queue-storage` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=queue-storage --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |


## Wave 2: identity, security, secrets, and encryption

Make authorization, denial, audit, and secure configuration behavior credible across the emulator.

### identity-rbac

Priority: 110; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=identity-rbac`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=identity-rbac` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### key-vault-keys

Priority: 101; current score: 0.4279; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=key-vault-keys`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=key-vault-keys` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### key-vault-secrets

Priority: 100; current score: 0.4279; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=key-vault-secrets`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=key-vault-secrets` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### waf-policy

Priority: 98; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=waf-policy`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=waf-policy` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### activity-log-audit

Priority: 98; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=activity-log-audit`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=activity-log-audit` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |


## Wave 3: compute, API, containers, and edge routing

Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests.

### aks-metadata

Priority: 111; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=aks-metadata`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=aks-metadata` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### api-management

Priority: 102; current score: 0.4279; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=api-management`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=api-management` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### azure-functions

Priority: 101; current score: 0.4279; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=azure-functions`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=azure-functions` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### logic-workflows

Priority: 99; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=logic-workflows`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=logic-workflows` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### container-registry

Priority: 98; current score: 0.4279; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=container-registry`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | partial | complete | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-oci-registry up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-oci-registry down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=container-registry` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### front-door-cdn

Priority: 96; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=front-door-cdn`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=front-door-cdn` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### service-discovery

Priority: 96; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=service-discovery`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=service-discovery` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### load-balancing

Priority: 95; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=load-balancing`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=load-balancing` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |


## Wave 4: relational, cache, migration, and analytics platforms

Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals.

### postgresql-flexible-server

Priority: 104; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=postgresql-flexible-server`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-postgres up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-postgres down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=postgresql-flexible-server` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### synapse-warehouse

Priority: 94; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=synapse-warehouse`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=synapse-warehouse` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### mysql-flexible-server

Priority: 92; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=mysql-flexible-server`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-mysql up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-mysql down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=mysql-flexible-server` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### redis-cache

Priority: 92; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=redis-cache`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-redis up -d`<br>`docker compose -f dist/hybrid/docker-compose.official-emulators.yml --profile local-redis down -v` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=redis-cache` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### database-migration-service

Priority: 92; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=database-migration-service`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=database-migration-service` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |


## Wave 5: networking, DNS, and observability

Harden cross-cutting dependencies that most other services reference during deployment.

### monitor-logs

Priority: 111; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=monitor-logs`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=monitor-logs` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### virtual-network

Priority: 102; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=virtual-network`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=virtual-network` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### monitor-metrics-alerts

Priority: 101; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=monitor-metrics-alerts`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=monitor-metrics-alerts` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### dns-zones

Priority: 90; current score: 0.3762; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| IaC-provider behavior | partial | complete | `npm run smoke:prompts`<br>`npm run smoke:deploy` | Terraform, OpenTofu, Pulumi, Bicep/ARM, and Ansible provider calls can deploy, refresh, diff, update, import where relevant, and destroy against GlobalStack. |
| Service-specific local facade/emulator integration | partial | complete | `npm run conformance:local -- --capability=dns-zones`<br>`npm run smoke` | The local service path is implemented, fail-closed for unknown surfaces, backed by official emulators where available, and covered by local replay tests. |
| State transition captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=dns-zones --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Create, update, get, list, delete, post-delete, async provisioning, failed provisioning, and parent readiness are captured and normalized. |
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=dns-zones --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=dns-zones --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=dns-zones` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=dns-zones --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=dns-zones --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

## Verification Loop

After each service batch:

```bash
npm run conformance:classify
npm run conformance:expectations
npm run conformance:parity
npm run conformance:roadmap
npm run validate
npm run smoke
az group list --query "[?starts_with(name, 'rg-gs-') || starts_with(name, 'globalstack-')].name" -o json
```

