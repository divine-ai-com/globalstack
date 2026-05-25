# Azure 99% Coverage Roadmap

This roadmap turns the parity checklist into an execution order. It does not mark any service complete; it identifies the next capture, implementation, and validation work needed for near-real Azure emulation.

Generated: 2026-05-25T04:30:03.782Z

## Guardrails

- Every real Azure run must be explicitly gated and followed by cleanup verification.
- A local pass is only meaningful when tied back to real Azure capture, official emulator behavior, or an explicit out-of-scope declaration.
- Unknown resource types, parameters, API versions, and data-plane calls must fail closed.
- IaC provider deploy, refresh, update, import, and destroy behavior must be tested before a service can approach 99%-ready.

## Dynamic Estimate Snapshot

- Overall 30-service Azure program: 66.7% (65-70%)
- Azure Functions / Durable cluster: 92.5% (90-95%)
- Azure Logic Apps cluster: 88% (85-90%)

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
| Wave 1: official emulator and storage-family depth | 8 | 45 | Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests. |
| Wave 2: identity, security, secrets, and encryption | 5 | 31 | Make authorization, denial, audit, and secure configuration behavior credible across the emulator. |
| Wave 3: compute, API, containers, and edge routing | 8 | 47 | Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests. |
| Wave 4: relational, cache, migration, and analytics platforms | 5 | 31 | Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals. |
| Wave 5: networking, DNS, and observability | 4 | 27 | Harden cross-cutting dependencies that most other services reference during deployment. |

## Service Priority

| Rank | Service | Tier | Wave | Score | Priority | Complete | Partial | Not Started | Next Dimensions |
|---:|---|---:|---|---:|---:|---:|---:|---:|---|
| 1 | aks-metadata | 1 | wave-3-compute-api-and-edge | 0.6287 | 86 | 4 | 4 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 2 | virtual-network | 1 | wave-5-networking-observability-and-dns | 0.5836 | 82 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 3 | monitor-metrics-alerts | 1 | wave-5-networking-observability-and-dns | 0.5836 | 81 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 4 | waf-policy | 2 | wave-2-identity-security-and-secrets | 0.5836 | 78 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 5 | activity-log-audit | 2 | wave-2-identity-security-and-secrets | 0.5836 | 78 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 6 | event-grid | 1 | wave-1-official-emulator-and-storage-family | 0.6984 | 76 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 7 | front-door-cdn | 2 | wave-3-compute-api-and-edge | 0.5836 | 76 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 8 | cosmos-nosql-table | 1 | wave-1-official-emulator-and-storage-family | 0.7434 | 75 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 9 | key-vault-keys | 1 | wave-2-identity-security-and-secrets | 0.6984 | 74 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 10 | synapse-warehouse | 2 | wave-4-data-platforms | 0.5836 | 74 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 11 | monitor-logs | 1 | wave-5-networking-observability-and-dns | 0.6984 | 74 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 12 | blob-storage | 1 | wave-1-official-emulator-and-storage-family | 0.7025 | 73 | 4 | 6 | 0 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 13 | service-bus-topics | 1 | wave-1-official-emulator-and-storage-family | 0.7434 | 73 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 14 | key-vault-secrets | 1 | wave-2-identity-security-and-secrets | 0.6984 | 73 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 15 | database-migration-service | 2 | wave-4-data-platforms | 0.5836 | 72 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 16 | api-management | 1 | wave-3-compute-api-and-edge | 0.7434 | 71 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 17 | container-registry | 1 | wave-3-compute-api-and-edge | 0.6984 | 71 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 18 | azure-functions | 1 | wave-3-compute-api-and-edge | 0.7434 | 70 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 19 | dns-zones | 2 | wave-5-networking-observability-and-dns | 0.5836 | 70 | 3 | 5 | 2 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 20 | identity-rbac | 1 | wave-2-identity-security-and-secrets | 0.7525 | 68 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>liveApiSurfaceInventory<br>retryEventualConsistency |
| 21 | postgresql-flexible-server | 1 | wave-4-data-platforms | 0.6984 | 67 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 22 | event-hubs-streams | 2 | wave-1-official-emulator-and-storage-family | 0.6984 | 64 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 23 | app-configuration-parameters | 2 | wave-1-official-emulator-and-storage-family | 0.6984 | 64 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 24 | logic-workflows | 2 | wave-3-compute-api-and-edge | 0.6984 | 62 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 25 | azure-files | 2 | wave-1-official-emulator-and-storage-family | 0.7434 | 60 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 26 | queue-storage | 2 | wave-1-official-emulator-and-storage-family | 0.7025 | 59 | 4 | 6 | 0 | dataPlaneBehavior<br>parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior |
| 27 | service-discovery | 2 | wave-3-compute-api-and-edge | 0.6984 | 59 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 28 | load-balancing | 2 | wave-3-compute-api-and-edge | 0.6984 | 58 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 29 | mysql-flexible-server | 2 | wave-4-data-platforms | 0.6984 | 55 | 4 | 5 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |
| 30 | redis-cache | 2 | wave-4-data-platforms | 0.7434 | 51 | 5 | 4 | 1 | parameterVarianceCaptures<br>errorShapeFidelity<br>identityRbacBehavior<br>liveApiSurfaceInventory |

## Wave 1: official emulator and storage-family depth

Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests.

### event-grid

Priority: 76; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=event-grid` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

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

### event-hubs-streams

Priority: 64; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=event-hubs-streams` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-hubs-streams --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### app-configuration-parameters

Priority: 64; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=app-configuration-parameters` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=app-configuration-parameters --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

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


## Wave 2: identity, security, secrets, and encryption

Make authorization, denial, audit, and secure configuration behavior credible across the emulator.

### waf-policy

Priority: 78; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=waf-policy` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### activity-log-audit

Priority: 78; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=activity-log-audit` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### key-vault-keys

Priority: 74; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=key-vault-keys` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### key-vault-secrets

Priority: 73; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=key-vault-secrets` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### identity-rbac

Priority: 68; current score: 0.7525; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=identity-rbac` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |


## Wave 3: compute, API, containers, and edge routing

Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests.

### aks-metadata

Priority: 86; current score: 0.6287; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=aks-metadata` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### front-door-cdn

Priority: 76; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=front-door-cdn` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### api-management

Priority: 71; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=api-management` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=api-management --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### container-registry

Priority: 71; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=container-registry` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### azure-functions

Priority: 70; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=azure-functions` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### logic-workflows

Priority: 62; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=logic-workflows` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### service-discovery

Priority: 59; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=service-discovery` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=service-discovery --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### load-balancing

Priority: 58; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=load-balancing` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |


## Wave 4: relational, cache, migration, and analytics platforms

Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals.

### synapse-warehouse

Priority: 74; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=synapse-warehouse` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### database-migration-service

Priority: 72; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=database-migration-service` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### postgresql-flexible-server

Priority: 67; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=postgresql-flexible-server` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=postgresql-flexible-server --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### mysql-flexible-server

Priority: 55; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=mysql-flexible-server` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=mysql-flexible-server --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### redis-cache

Priority: 51; current score: 0.7434; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=redis-cache` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |


## Wave 5: networking, DNS, and observability

Harden cross-cutting dependencies that most other services reference during deployment.

### virtual-network

Priority: 82; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=virtual-network` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=virtual-network --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### monitor-metrics-alerts

Priority: 81; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Data-plane behavior | not-started | start | `npm run hybrid:render`<br>`GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true` | Official emulator or GlobalStack facade behavior is tested against real Azure captures for request success, rejection, auth, side effects, and payload semantics. |
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=monitor-metrics-alerts` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### monitor-logs

Priority: 74; current score: 0.6984; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Error-shape fidelity | partial | complete | `npm run conformance:local -- --capability=monitor-logs` | Status, Azure error code, response body shape, headers, request IDs, async-operation headers, and retry headers match captured Azure behavior. |
| Identity/RBAC behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=identity-rbac --all=true` | Allowed and denied cases are captured for ARM, local token facade, and service data-plane authorization where applicable. |
| Complete live Azure API surface inventory | partial | complete | `npm run providers:surface`<br>`npm run conformance:catalog` | Provider operations, ARM REST specs, SDK/IaC provider calls, and data-plane APIs are reconciled for the capability. |
| Retry/eventual consistency behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true` | Poll intervals, transitional states, eventual read/list behavior, delete timing, and retryable failures are captured or explicitly out of scope. |
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-logs --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### dns-zones

Priority: 70; current score: 0.5836; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
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

