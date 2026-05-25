# Azure 99% Coverage Roadmap

This roadmap turns the parity checklist into an execution order. It does not mark any service complete; it identifies the next capture, implementation, and validation work needed for near-real Azure emulation.

Generated: 2026-05-25T12:03:38.628Z

## Guardrails

- Every real Azure run must be explicitly gated and followed by cleanup verification.
- A local pass is only meaningful when tied back to real Azure capture, official emulator behavior, or an explicit out-of-scope declaration.
- Unknown resource types, parameters, API versions, and data-plane calls must fail closed.
- IaC provider deploy, refresh, update, import, and destroy behavior must be tested before a service can approach 99%-ready.

## Dynamic Estimate Snapshot

- Overall 30-service Azure program: 96.8% (95-100%)
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
| Wave 1: official emulator and storage-family depth | 8 | 4 | Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests. |
| Wave 2: identity, security, secrets, and encryption | 5 | 4 | Make authorization, denial, audit, and secure configuration behavior credible across the emulator. |
| Wave 3: compute, API, containers, and edge routing | 8 | 6 | Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests. |
| Wave 4: relational, cache, migration, and analytics platforms | 5 | 3 | Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals. |
| Wave 5: networking, DNS, and observability | 4 | 1 | Harden cross-cutting dependencies that most other services reference during deployment. |

## Service Priority

| Rank | Service | Tier | Wave | Score | Priority | Complete | Partial | Not Started | Next Dimensions |
|---:|---|---:|---|---:|---:|---:|---:|---:|---|
| 1 | azure-functions | 1 | wave-3-compute-api-and-edge | 0.9508 | 49 | 9 | 0 | 1 | ambiguousRepeatCaptures |
| 2 | event-grid | 1 | wave-1-official-emulator-and-storage-family | 0.9459 | 46 | 9 | 1 | 0 | parameterVarianceCaptures |
| 3 | cosmos-nosql-table | 1 | wave-1-official-emulator-and-storage-family | 1 | 44 | 10 | 0 | 0 |  |
| 4 | key-vault-keys | 1 | wave-2-identity-security-and-secrets | 0.9459 | 44 | 9 | 1 | 0 | parameterVarianceCaptures |
| 5 | aks-metadata | 1 | wave-3-compute-api-and-edge | 0.9459 | 44 | 9 | 1 | 0 | parameterVarianceCaptures |
| 6 | blob-storage | 1 | wave-1-official-emulator-and-storage-family | 1 | 43 | 10 | 0 | 0 |  |
| 7 | key-vault-secrets | 1 | wave-2-identity-security-and-secrets | 0.9459 | 43 | 9 | 1 | 0 | parameterVarianceCaptures |
| 8 | service-bus-topics | 1 | wave-1-official-emulator-and-storage-family | 1 | 42 | 10 | 0 | 0 |  |
| 9 | container-registry | 1 | wave-3-compute-api-and-edge | 0.9459 | 41 | 9 | 1 | 0 | parameterVarianceCaptures |
| 10 | api-management | 1 | wave-3-compute-api-and-edge | 1 | 40 | 10 | 0 | 0 |  |
| 11 | azure-files | 2 | wave-1-official-emulator-and-storage-family | 0.9508 | 39 | 9 | 0 | 1 | ambiguousRepeatCaptures |
| 12 | monitor-logs | 1 | wave-5-networking-observability-and-dns | 1 | 39 | 10 | 0 | 0 |  |
| 13 | identity-rbac | 1 | wave-2-identity-security-and-secrets | 1 | 38 | 10 | 0 | 0 |  |
| 14 | queue-storage | 2 | wave-1-official-emulator-and-storage-family | 0.9189 | 37 | 8 | 2 | 0 | parameterVarianceCaptures<br>ambiguousRepeatCaptures |
| 15 | monitor-metrics-alerts | 1 | wave-5-networking-observability-and-dns | 0.9459 | 34 | 9 | 1 | 0 | parameterVarianceCaptures |
| 16 | logic-workflows | 2 | wave-3-compute-api-and-edge | 0.9459 | 32 | 9 | 1 | 0 | parameterVarianceCaptures |
| 17 | postgresql-flexible-server | 1 | wave-4-data-platforms | 1 | 32 | 10 | 0 | 0 |  |
| 18 | waf-policy | 2 | wave-2-identity-security-and-secrets | 0.9459 | 31 | 9 | 1 | 0 | parameterVarianceCaptures |
| 19 | activity-log-audit | 2 | wave-2-identity-security-and-secrets | 0.9459 | 31 | 9 | 1 | 0 | parameterVarianceCaptures |
| 20 | redis-cache | 2 | wave-4-data-platforms | 0.9508 | 30 | 9 | 0 | 1 | ambiguousRepeatCaptures |
| 21 | virtual-network | 1 | wave-5-networking-observability-and-dns | 1 | 30 | 10 | 0 | 0 |  |
| 22 | event-hubs-streams | 2 | wave-1-official-emulator-and-storage-family | 1 | 29 | 10 | 0 | 0 |  |
| 23 | app-configuration-parameters | 2 | wave-1-official-emulator-and-storage-family | 1 | 29 | 10 | 0 | 0 |  |
| 24 | front-door-cdn | 2 | wave-3-compute-api-and-edge | 0.9459 | 29 | 9 | 1 | 0 | parameterVarianceCaptures |
| 25 | load-balancing | 2 | wave-3-compute-api-and-edge | 0.9459 | 28 | 9 | 1 | 0 | parameterVarianceCaptures |
| 26 | synapse-warehouse | 2 | wave-4-data-platforms | 0.9459 | 27 | 9 | 1 | 0 | parameterVarianceCaptures |
| 27 | database-migration-service | 2 | wave-4-data-platforms | 0.9459 | 25 | 9 | 1 | 0 | parameterVarianceCaptures |
| 28 | service-discovery | 2 | wave-3-compute-api-and-edge | 1 | 24 | 10 | 0 | 0 |  |
| 29 | mysql-flexible-server | 2 | wave-4-data-platforms | 1 | 20 | 10 | 0 | 0 |  |
| 30 | dns-zones | 2 | wave-5-networking-observability-and-dns | 1 | 18 | 10 | 0 | 0 |  |

## Wave 1: official emulator and storage-family depth

Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests.

### event-grid

Priority: 46; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=event-grid --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### cosmos-nosql-table

Priority: 44; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### blob-storage

Priority: 43; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### service-bus-topics

Priority: 42; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### azure-files

Priority: 39; current score: 0.9508; current status: not-started.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-files --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### queue-storage

Priority: 37; current score: 0.9189; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=queue-storage --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |
| Repeat captures for ambiguous behavior | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run storage:capture:data-plane`<br>`npm run storage:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### event-hubs-streams

Priority: 29; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### app-configuration-parameters

Priority: 29; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|


## Wave 2: identity, security, secrets, and encryption

Make authorization, denial, audit, and secure configuration behavior credible across the emulator.

### key-vault-keys

Priority: 44; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-keys --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### key-vault-secrets

Priority: 43; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=key-vault-secrets --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### identity-rbac

Priority: 38; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### waf-policy

Priority: 31; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=waf-policy --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### activity-log-audit

Priority: 31; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=activity-log-audit --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |


## Wave 3: compute, API, containers, and edge routing

Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests.

### azure-functions

Priority: 49; current score: 0.9508; current status: not-started.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=azure-functions --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### aks-metadata

Priority: 44; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=aks-metadata --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### container-registry

Priority: 41; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=container-registry --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### api-management

Priority: 40; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### logic-workflows

Priority: 32; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=logic-workflows --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### front-door-cdn

Priority: 29; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=front-door-cdn --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### load-balancing

Priority: 28; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=load-balancing --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### service-discovery

Priority: 24; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|


## Wave 4: relational, cache, migration, and analytics platforms

Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals.

### postgresql-flexible-server

Priority: 32; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### redis-cache

Priority: 30; current score: 0.9508; current status: not-started.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Repeat captures for ambiguous behavior | not-started | start | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=redis-cache --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` | Timing-sensitive or inconsistent captures have repeat evidence before normalization. |

### synapse-warehouse

Priority: 27; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=synapse-warehouse --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### database-migration-service

Priority: 25; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=database-migration-service --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### mysql-flexible-server

Priority: 20; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|


## Wave 5: networking, DNS, and observability

Harden cross-cutting dependencies that most other services reference during deployment.

### monitor-logs

Priority: 39; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### monitor-metrics-alerts

Priority: 34; current score: 0.9459; current status: in-progress.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|
| Parameter variance captures | partial | complete | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=monitor-metrics-alerts --limit=0`<br>`npm run conformance:classify && npm run conformance:expectations` | Live captures cover valid-minimal plus negative variations for required fields, api-version, location, SKU, names, parent references, auth, and service-specific constraints. |

### virtual-network

Priority: 30; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### dns-zones

Priority: 18; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

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

