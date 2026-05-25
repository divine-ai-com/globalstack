# Azure 99% Coverage Roadmap

This roadmap turns the parity checklist into an execution order. It does not mark any service complete; it identifies the next capture, implementation, and validation work needed for near-real Azure emulation.

Generated: 2026-05-25T11:25:00.990Z

## Guardrails

- Every real Azure run must be explicitly gated and followed by cleanup verification.
- A local pass is only meaningful when tied back to real Azure capture, official emulator behavior, or an explicit out-of-scope declaration.
- Unknown resource types, parameters, API versions, and data-plane calls must fail closed.
- IaC provider deploy, refresh, update, import, and destroy behavior must be tested before a service can approach 99%-ready.

## Dynamic Estimate Snapshot

- Overall 30-service Azure program: 84% (80-85%)
- Azure Functions / Durable cluster: 99% (95-100%)
- Azure Logic Apps cluster: 99% (95-100%)

Method:
- Overall program estimate is derived from roadmap status only: `complete = 100%`, `partial = 55%`, `not-started = 5%`, averaged across all services and dimensions.
- Service cluster estimates start from the same status-derived base, then add bounded evidence bonuses for a started local facade, started provider behavior, started data-plane behavior, and a passing parity pack with full platform matrix when present.

## Cross-Cutting Pending Backlog

These items remain open across the whole Azure program even when a service-specific parity pack is green.

| Pending Item | Why It Is Still Pending | Default Commands |
|---|---|---|
| More live Azure capture expansion per service | Turn candidate control-plane and data-plane calls into cleanup-verified real Azure fixtures for every high-value service surface. | `npm run providers:surface`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` |
| More parameter variance beyond generic invalid/missing cases | Add service-specific invalid names, parent references, enum values, mutually-exclusive fields, range checks, and schema-shape captures before normalizing local behavior. | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` |
| Provider refresh, diff/preview, update, import, drift, and destroy semantics | Extend each platform runner beyond create/destroy smoke so generated IaC behaves the same way against GlobalStack as it does against Azure provider tooling. | `npm run smoke:prompts`<br>`npm run smoke:deploy`<br>`GLOBALSTACK_AUTH_TOKEN=globalstack-local-token PIPELINE_STAGE_SCOPE=full npm run smoke:platform-runners` |
| Exact error-shape and header fidelity | Match Azure status codes, error codes, body structure, async-operation headers, retry headers, and request-id shaped responses for captured cases. | `npm run conformance:local -- --capability=<service>`<br>`npm run conformance:classify && npm run conformance:expectations` |
| Retry and eventual-consistency behavior | Capture poll cadence, transitional states, delayed reads, delete lag, and retryable failures before claiming timing fidelity. | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` |
| RBAC and authorization behavior | Expand allow/deny matrices for ARM and service data planes, including propagation lag and inherited-scope behavior where Azure actually enforces it. | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true`<br>`npm run conformance:local -- --capability=identity-rbac` |
| Repeat captures for timing-sensitive behavior | Re-capture ambiguous or unstable Azure behavior before encoding it into local expectations, especially delete/read races and async completion windows. | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` |
| Deeper service-specific data planes where applicable | Broaden bounded local facades and official-emulator integrations for services such as Cosmos, Files, Event Hubs, App Configuration, Key Vault, PostgreSQL, MySQL, and Redis. | `npm run hybrid:render`<br>`npm run smoke`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true` |

## Wave Summary

| Wave | Services | Work Items | Objective |
|---|---:|---:|---|
| Wave 1: official emulator and storage-family depth | 8 | 26 | Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests. |
| Wave 2: identity, security, secrets, and encryption | 5 | 18 | Make authorization, denial, audit, and secure configuration behavior credible across the emulator. |
| Wave 3: compute, API, containers, and edge routing | 8 | 29 | Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests. |
| Wave 4: relational, cache, migration, and analytics platforms | 5 | 17 | Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals. |
| Wave 5: networking, DNS, and observability | 4 | 13 | Harden cross-cutting dependencies that most other services reference during deployment. |

## Service Priority

| Rank | Service | Tier | Wave | Score | Priority | Complete | Partial | Not Started | Next Dimensions |
|---:|---|---:|---|---:|---:|---:|---:|---:|---|
| 1 | blob-storage | 1 | wave-1-official-emulator-and-storage-family | 0.8107 | 62 | 6 | 4 | 0 | dataPlaneBehavior<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>ambiguousRepeatCaptures |
| 2 | event-grid | 1 | wave-1-official-emulator-and-storage-family | 0.8016 | 61 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 3 | container-registry | 1 | wave-3-compute-api-and-edge | 0.7475 | 61 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 4 | aks-metadata | 1 | wave-3-compute-api-and-edge | 0.7926 | 60 | 6 | 4 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 5 | key-vault-keys | 1 | wave-2-identity-security-and-secrets | 0.8016 | 59 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 6 | azure-functions | 1 | wave-3-compute-api-and-edge | 0.8516 | 59 | 7 | 2 | 1 | identityRbacBehavior<br>liveApiSurfaceInventory<br>ambiguousRepeatCaptures |
| 7 | key-vault-secrets | 1 | wave-2-identity-security-and-secrets | 0.8016 | 58 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 8 | cosmos-nosql-table | 1 | wave-1-official-emulator-and-storage-family | 0.9008 | 54 | 8 | 2 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory |
| 9 | queue-storage | 2 | wave-1-official-emulator-and-storage-family | 0.7566 | 53 | 5 | 5 | 0 | dataPlaneBehavior<br>parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 10 | monitor-logs | 1 | wave-5-networking-observability-and-dns | 0.8557 | 53 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 11 | service-bus-topics | 1 | wave-1-official-emulator-and-storage-family | 0.9008 | 52 | 8 | 2 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory |
| 12 | api-management | 1 | wave-3-compute-api-and-edge | 0.9008 | 50 | 8 | 2 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory |
| 13 | azure-files | 2 | wave-1-official-emulator-and-storage-family | 0.8516 | 49 | 7 | 2 | 1 | identityRbacBehavior<br>liveApiSurfaceInventory<br>ambiguousRepeatCaptures |
| 14 | monitor-metrics-alerts | 1 | wave-5-networking-observability-and-dns | 0.8016 | 49 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 15 | identity-rbac | 1 | wave-2-identity-security-and-secrets | 0.9098 | 47 | 8 | 2 | 0 | liveApiSurfaceInventory<br>retryEventualConsistency |
| 16 | logic-workflows | 2 | wave-3-compute-api-and-edge | 0.8016 | 47 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 17 | waf-policy | 2 | wave-2-identity-security-and-secrets | 0.8016 | 46 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 18 | activity-log-audit | 2 | wave-2-identity-security-and-secrets | 0.8016 | 46 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 19 | postgresql-flexible-server | 1 | wave-4-data-platforms | 0.8557 | 46 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 20 | front-door-cdn | 2 | wave-3-compute-api-and-edge | 0.8016 | 44 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 21 | virtual-network | 1 | wave-5-networking-observability-and-dns | 0.8557 | 44 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 22 | event-hubs-streams | 2 | wave-1-official-emulator-and-storage-family | 0.8557 | 43 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 23 | app-configuration-parameters | 2 | wave-1-official-emulator-and-storage-family | 0.8557 | 43 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 24 | load-balancing | 2 | wave-3-compute-api-and-edge | 0.8016 | 43 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 25 | synapse-warehouse | 2 | wave-4-data-platforms | 0.8016 | 42 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 26 | redis-cache | 2 | wave-4-data-platforms | 0.8516 | 40 | 7 | 2 | 1 | identityRbacBehavior<br>liveApiSurfaceInventory<br>ambiguousRepeatCaptures |
| 27 | database-migration-service | 2 | wave-4-data-platforms | 0.8016 | 40 | 6 | 4 | 0 | parameterVarianceCaptures<br>identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 28 | service-discovery | 2 | wave-3-compute-api-and-edge | 0.8557 | 38 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 29 | mysql-flexible-server | 2 | wave-4-data-platforms | 0.8557 | 34 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 30 | dns-zones | 2 | wave-5-networking-observability-and-dns | 0.8557 | 32 | 7 | 3 | 0 | identityRbacBehavior<br>liveApiSurfaceInventory<br>retryEventualConsistency |

## Wave 1: official emulator and storage-family depth

Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests.

### blob-storage

Priority: 62; current score: 0.8107; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | partial | complete | `npm run e2e:storage-hardening`<br>`npm run e2e:storage-normalizer`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### event-grid

Priority: 61; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### cosmos-nosql-table

Priority: 54; current score: 0.9008; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |

### queue-storage

Priority: 53; current score: 0.7566; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | partial | complete | `npm run e2e:storage-hardening`<br>`npm run e2e:storage-normalizer`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=queue-storage --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### service-bus-topics

Priority: 52; current score: 0.9008; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |

### azure-files

Priority: 49; current score: 0.8516; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### event-hubs-streams

Priority: 43; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### app-configuration-parameters

Priority: 43; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 2: identity, security, secrets, and encryption

Make authorization, denial, audit, and secure configuration behavior credible across the emulator.

### key-vault-keys

Priority: 59; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### key-vault-secrets

Priority: 58; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### identity-rbac

Priority: 47; current score: 0.9098; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### waf-policy

Priority: 46; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### activity-log-audit

Priority: 46; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 3: compute, API, containers, and edge routing

Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests.

### container-registry

Priority: 61; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=container-registry` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### aks-metadata

Priority: 60; current score: 0.7926; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=aks-metadata` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |

### azure-functions

Priority: 59; current score: 0.8516; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### api-management

Priority: 50; current score: 0.9008; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |

### logic-workflows

Priority: 47; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### front-door-cdn

Priority: 44; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### load-balancing

Priority: 43; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### service-discovery

Priority: 38; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 4: relational, cache, migration, and analytics platforms

Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals.

### postgresql-flexible-server

Priority: 46; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### synapse-warehouse

Priority: 42; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### redis-cache

Priority: 40; current score: 0.8516; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### database-migration-service

Priority: 40; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### mysql-flexible-server

Priority: 34; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 5: networking, DNS, and observability

Harden cross-cutting dependencies that most other services reference during deployment.

### monitor-logs

Priority: 53; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### monitor-metrics-alerts

Priority: 49; current score: 0.8016; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### virtual-network

Priority: 44; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### dns-zones

Priority: 32; current score: 0.8557; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=dns-zones --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

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

