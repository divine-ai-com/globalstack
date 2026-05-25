# Azure 99% Coverage Roadmap

This roadmap turns the parity checklist into an execution order. It does not mark any service complete; it identifies the next capture, implementation, and validation work needed for near-real Azure emulation.

Generated: 2026-05-25T10:36:55.194Z

## Guardrails

- Every real Azure run must be explicitly gated and followed by cleanup verification.
- A local pass is only meaningful when tied back to real Azure capture, official emulator behavior, or an explicit out-of-scope declaration.
- Unknown resource types, parameters, API versions, and data-plane calls must fail closed.
- IaC provider deploy, refresh, update, import, and destroy behavior must be tested before a service can approach 99%-ready.

## Dynamic Estimate Snapshot

- Overall 30-service Azure program: 76.2% (75-80%)
- Azure Functions / Durable cluster: 92.5% (90-95%)
- Azure Logic Apps cluster: 97.5% (95-100%)

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
| Wave 1: official emulator and storage-family depth | 8 | 42 | Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests. |
| Wave 2: identity, security, secrets, and encryption | 5 | 25 | Make authorization, denial, audit, and secure configuration behavior credible across the emulator. |
| Wave 3: compute, API, containers, and edge routing | 8 | 39 | Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests. |
| Wave 4: relational, cache, migration, and analytics platforms | 5 | 25 | Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals. |
| Wave 5: networking, DNS, and observability | 4 | 20 | Harden cross-cutting dependencies that most other services reference during deployment. |

## Service Priority

| Rank | Service | Tier | Wave | Score | Priority | Complete | Partial | Not Started | Next Dimensions |
|---:|---|---:|---|---:|---:|---:|---:|---:|---|
| 1 | cosmos-nosql-table | 1 | wave-1-official-emulator-and-storage-family | 0.7434 | 75 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 2 | blob-storage | 1 | wave-1-official-emulator-and-storage-family | 0.7025 | 73 | 4 | 6 | 0 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 3 | service-bus-topics | 1 | wave-1-official-emulator-and-storage-family | 0.7434 | 73 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 4 | api-management | 1 | wave-3-compute-api-and-edge | 0.7434 | 71 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 5 | azure-functions | 1 | wave-3-compute-api-and-edge | 0.7434 | 70 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 6 | identity-rbac | 1 | wave-2-identity-security-and-secrets | 0.7525 | 68 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 7 | event-grid | 1 | wave-1-official-emulator-and-storage-family | 0.7475 | 66 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 8 | key-vault-keys | 1 | wave-2-identity-security-and-secrets | 0.7475 | 64 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 9 | monitor-logs | 1 | wave-5-networking-observability-and-dns | 0.7475 | 64 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 10 | key-vault-secrets | 1 | wave-2-identity-security-and-secrets | 0.7475 | 63 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 11 | container-registry | 1 | wave-3-compute-api-and-edge | 0.7475 | 61 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 12 | azure-files | 2 | wave-1-official-emulator-and-storage-family | 0.7434 | 60 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 13 | aks-metadata | 1 | wave-3-compute-api-and-edge | 0.7926 | 60 | 6 | 4 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 14 | queue-storage | 2 | wave-1-official-emulator-and-storage-family | 0.7025 | 59 | 4 | 6 | 0 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 15 | postgresql-flexible-server | 1 | wave-4-data-platforms | 0.7475 | 57 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 16 | virtual-network | 1 | wave-5-networking-observability-and-dns | 0.7475 | 55 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 17 | event-hubs-streams | 2 | wave-1-official-emulator-and-storage-family | 0.7475 | 54 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 18 | app-configuration-parameters | 2 | wave-1-official-emulator-and-storage-family | 0.7475 | 54 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 19 | monitor-metrics-alerts | 1 | wave-5-networking-observability-and-dns | 0.7475 | 54 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 20 | logic-workflows | 2 | wave-3-compute-api-and-edge | 0.7475 | 52 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 21 | waf-policy | 2 | wave-2-identity-security-and-secrets | 0.7475 | 51 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 22 | activity-log-audit | 2 | wave-2-identity-security-and-secrets | 0.7475 | 51 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 23 | redis-cache | 2 | wave-4-data-platforms | 0.7434 | 51 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 24 | front-door-cdn | 2 | wave-3-compute-api-and-edge | 0.7475 | 49 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 25 | service-discovery | 2 | wave-3-compute-api-and-edge | 0.7475 | 49 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 26 | load-balancing | 2 | wave-3-compute-api-and-edge | 0.7475 | 48 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 27 | synapse-warehouse | 2 | wave-4-data-platforms | 0.7475 | 47 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 28 | mysql-flexible-server | 2 | wave-4-data-platforms | 0.7475 | 45 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 29 | database-migration-service | 2 | wave-4-data-platforms | 0.7475 | 45 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 30 | dns-zones | 2 | wave-5-networking-observability-and-dns | 0.7475 | 43 | 5 | 5 | 0 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |

## Wave 1: official emulator and storage-family depth

Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests.

### cosmos-nosql-table

Priority: 75; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=cosmos-nosql-table --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=cosmos-nosql-table` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=cosmos-nosql-table --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### blob-storage

Priority: 73; current score: 0.7025; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | partial | complete | `npm run e2e:storage-hardening`<br>`npm run e2e:storage-normalizer`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=blob-storage --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=blob-storage` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### service-bus-topics

Priority: 73; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-bus-topics --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=service-bus-topics` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-bus-topics --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### event-grid

Priority: 66; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=event-grid` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### azure-files

Priority: 60; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=azure-files` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### queue-storage

Priority: 59; current score: 0.7025; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | partial | complete | `npm run e2e:storage-hardening`<br>`npm run e2e:storage-normalizer`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=queue-storage --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=queue-storage` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### event-hubs-streams

Priority: 54; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=event-hubs-streams` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### app-configuration-parameters

Priority: 54; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=app-configuration-parameters` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 2: identity, security, secrets, and encryption

Make authorization, denial, audit, and secure configuration behavior credible across the emulator.

### identity-rbac

Priority: 68; current score: 0.7525; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=identity-rbac` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### key-vault-keys

Priority: 64; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=key-vault-keys` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### key-vault-secrets

Priority: 63; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=key-vault-secrets` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### waf-policy

Priority: 51; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=waf-policy` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### activity-log-audit

Priority: 51; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=activity-log-audit` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 3: compute, API, containers, and edge routing

Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests.

### api-management

Priority: 71; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=api-management` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### azure-functions

Priority: 70; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=azure-functions` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

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

### logic-workflows

Priority: 52; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=logic-workflows` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### front-door-cdn

Priority: 49; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=front-door-cdn` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### service-discovery

Priority: 49; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=service-discovery` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### load-balancing

Priority: 48; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=load-balancing` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 4: relational, cache, migration, and analytics platforms

Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals.

### postgresql-flexible-server

Priority: 57; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=postgresql-flexible-server` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### redis-cache

Priority: 51; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=redis-cache` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### synapse-warehouse

Priority: 47; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=synapse-warehouse` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### mysql-flexible-server

Priority: 45; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=mysql-flexible-server` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### database-migration-service

Priority: 45; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=database-migration-service` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |


## Wave 5: networking, DNS, and observability

Harden cross-cutting dependencies that most other services reference during deployment.

### monitor-logs

Priority: 64; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=monitor-logs` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### virtual-network

Priority: 55; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=virtual-network` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### monitor-metrics-alerts

Priority: 54; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=monitor-metrics-alerts` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |

### dns-zones

Priority: 43; current score: 0.7475; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=dns-zones --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=dns-zones` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
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

