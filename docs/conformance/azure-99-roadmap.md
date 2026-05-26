# Azure 99% Coverage Roadmap

This roadmap turns the parity checklist into an execution order. It does not mark any service complete; it identifies the next capture, implementation, and validation work needed for near-real Azure emulation.

Generated: 2026-05-26T15:45:34.201Z

## Guardrails

- Every real Azure run must be explicitly gated and followed by cleanup verification.
- A local pass is only meaningful when tied back to real Azure capture, official emulator behavior, or an explicit out-of-scope declaration.
- Unknown resource types, parameters, API versions, and data-plane calls must fail closed.
- IaC provider deploy, refresh, update, import, and destroy behavior must be tested before a service can approach 99%-ready.

## Dynamic Estimate Snapshot

- Overall 30-service Azure program: 100% (95-100%)
- Azure Functions / Durable cluster: 99% (95-100%)
- Azure Logic Apps cluster: 99% (95-100%)

Method:
- Overall program estimate is derived from roadmap status only: `complete = 100%`, `partial = 55%`, `not-started = 5%`, averaged across all services and dimensions.
- Service cluster estimates start from the same status-derived base, then add bounded evidence bonuses for a started local facade, started provider behavior, started data-plane behavior, and a passing parity pack with full platform matrix when present.

## Stress Verification Snapshot

- Source: `dist/complex-pulumi-bundles/latest-results.json`
- Generated: 2026-05-26T15:45:26.976Z
- Bundles in latest adversarial wave: 15
- Passing bundles in latest adversarial wave: 15/15

| Bundle | Scenario | Overall | Final Stage |
|---|---|---|---|
| Pr91239 | multiregion-claims-event-mesh | PASS | destroy |
| Pr91240 | cache-coordinated-casework-ring | PASS | destroy |
| Pr91236 | internal-partner-runtime-mesh | PASS | destroy |
| Pr91237 | industrial-telemetry-lakehouse-thread | PASS | destroy |
| Pr91238 | regulated-cutover-governance-fabric | PASS | destroy |
| Pr91241 | multiregion-replenishment-balancing-ring | PASS | destroy |
| Pr91242 | regulated-migration-command-center | PASS | destroy |
| Pr91243 | industrial-command-digital-thread | PASS | destroy |
| Pr91244 | active-active-release-control-ring | PASS | destroy |
| Pr91245 | investigation-lakehouse-response-fabric | PASS | destroy |
| Pr91246 | policy-appeals-decision-fabric | PASS | destroy |
| Pr91247 | regional-catalog-sync-ring | PASS | destroy |
| Pr91248 | case-orchestration-evidence-fabric | PASS | destroy |
| Pr91249 | global-release-governance-ring | PASS | destroy |
| Pr91250 | cutover-telemetry-command-fabric | PASS | destroy |

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
| Adversarial new task waves | Keep generating new ultra-expert Azure IaC bundles that were not explicitly optimized for the current parity set, then run them through the shipment lifecycle and treat the first surviving mismatch as the next engineering target. | `OPENAI_MODEL=gpt-5.5 node scripts/verified/run-openai-azure-complex-pulumi-bundles.mjs`<br>`npm run shipment:export -- --po-id=<po-id> --pr-id=<Pr...>` |
| Real-Azure differential reruns | Re-run the same deployment and inspection flows against real Azure and GlobalStack so the parity claim is continuously challenged instead of frozen at one historical capture set. | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true`<br>`npm run conformance:classify && npm run conformance:expectations` |
| Conformance runner completion determinism | Harden the real-Azure conformance runner so it exits deterministically after capture and cleanup. Some scoped reruns still write fresh fixtures and then go quiet instead of finishing cleanly. | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true`<br>`npm run conformance:classify && npm run conformance:expectations`<br>`npm run validate` |
| Repeated timing and drift checks | Keep rerunning timing-sensitive delete/read, async polling, and propagation windows so eventual-consistency assumptions stay tied to current Azure behavior instead of stale fixtures. | `GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=<service> --all=true`<br>`npm run conformance:parity && npm run conformance:roadmap` |
| Treat every surviving mismatch as a product gap | Classify each new failure as bundle-generation defect, provider defect, or emulator/runtime parity defect, then convert every true Azure mismatch into an explicit product work item instead of a one-off workaround. | `npm run validate`<br>`git diff --check` |

## Wave Summary

| Wave | Services | Work Items | Objective |
|---|---:|---:|---|
| Wave 1: official emulator and storage-family depth | 8 | 0 | Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests. |
| Wave 2: identity, security, secrets, and encryption | 5 | 0 | Make authorization, denial, audit, and secure configuration behavior credible across the emulator. |
| Wave 3: compute, API, containers, and edge routing | 8 | 0 | Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests. |
| Wave 4: relational, cache, migration, and analytics platforms | 5 | 0 | Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals. |
| Wave 5: networking, DNS, and observability | 4 | 0 | Harden cross-cutting dependencies that most other services reference during deployment. |

## Service Priority

| Rank | Service | Tier | Wave | Score | Priority | Complete | Partial | Not Started | Next Dimensions |
|---:|---|---:|---|---:|---:|---:|---:|---:|---|
| 1 | cosmos-nosql-table | 1 | wave-1-official-emulator-and-storage-family | 1 | 44 | 10 | 0 | 0 |  |
| 2 | blob-storage | 1 | wave-1-official-emulator-and-storage-family | 1 | 43 | 10 | 0 | 0 |  |
| 3 | service-bus-topics | 1 | wave-1-official-emulator-and-storage-family | 1 | 42 | 10 | 0 | 0 |  |
| 4 | event-grid | 1 | wave-1-official-emulator-and-storage-family | 1 | 41 | 10 | 0 | 0 |  |
| 5 | api-management | 1 | wave-3-compute-api-and-edge | 1 | 40 | 10 | 0 | 0 |  |
| 6 | key-vault-keys | 1 | wave-2-identity-security-and-secrets | 1 | 39 | 10 | 0 | 0 |  |
| 7 | azure-functions | 1 | wave-3-compute-api-and-edge | 1 | 39 | 10 | 0 | 0 |  |
| 8 | aks-metadata | 1 | wave-3-compute-api-and-edge | 1 | 39 | 10 | 0 | 0 |  |
| 9 | monitor-logs | 1 | wave-5-networking-observability-and-dns | 1 | 39 | 10 | 0 | 0 |  |
| 10 | identity-rbac | 1 | wave-2-identity-security-and-secrets | 1 | 38 | 10 | 0 | 0 |  |
| 11 | key-vault-secrets | 1 | wave-2-identity-security-and-secrets | 1 | 38 | 10 | 0 | 0 |  |
| 12 | container-registry | 1 | wave-3-compute-api-and-edge | 1 | 36 | 10 | 0 | 0 |  |
| 13 | postgresql-flexible-server | 1 | wave-4-data-platforms | 1 | 32 | 10 | 0 | 0 |  |
| 14 | virtual-network | 1 | wave-5-networking-observability-and-dns | 1 | 30 | 10 | 0 | 0 |  |
| 15 | queue-storage | 2 | wave-1-official-emulator-and-storage-family | 1 | 29 | 10 | 0 | 0 |  |
| 16 | azure-files | 2 | wave-1-official-emulator-and-storage-family | 1 | 29 | 10 | 0 | 0 |  |
| 17 | event-hubs-streams | 2 | wave-1-official-emulator-and-storage-family | 1 | 29 | 10 | 0 | 0 |  |
| 18 | app-configuration-parameters | 2 | wave-1-official-emulator-and-storage-family | 1 | 29 | 10 | 0 | 0 |  |
| 19 | monitor-metrics-alerts | 1 | wave-5-networking-observability-and-dns | 1 | 29 | 10 | 0 | 0 |  |
| 20 | logic-workflows | 2 | wave-3-compute-api-and-edge | 1 | 27 | 10 | 0 | 0 |  |
| 21 | waf-policy | 2 | wave-2-identity-security-and-secrets | 1 | 26 | 10 | 0 | 0 |  |
| 22 | activity-log-audit | 2 | wave-2-identity-security-and-secrets | 1 | 26 | 10 | 0 | 0 |  |
| 23 | front-door-cdn | 2 | wave-3-compute-api-and-edge | 1 | 24 | 10 | 0 | 0 |  |
| 24 | service-discovery | 2 | wave-3-compute-api-and-edge | 1 | 24 | 10 | 0 | 0 |  |
| 25 | load-balancing | 2 | wave-3-compute-api-and-edge | 1 | 23 | 10 | 0 | 0 |  |
| 26 | synapse-warehouse | 2 | wave-4-data-platforms | 1 | 22 | 10 | 0 | 0 |  |
| 27 | mysql-flexible-server | 2 | wave-4-data-platforms | 1 | 20 | 10 | 0 | 0 |  |
| 28 | redis-cache | 2 | wave-4-data-platforms | 1 | 20 | 10 | 0 | 0 |  |
| 29 | database-migration-service | 2 | wave-4-data-platforms | 1 | 20 | 10 | 0 | 0 |  |
| 30 | dns-zones | 2 | wave-5-networking-observability-and-dns | 1 | 18 | 10 | 0 | 0 |  |

## Wave 1: official emulator and storage-family depth

Finish the services with official emulator leverage or storage-like data-plane behavior first, because they give the fastest path to high-fidelity integration tests.

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

### event-grid

Priority: 41; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### queue-storage

Priority: 29; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### azure-files

Priority: 29; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

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

Priority: 39; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### identity-rbac

Priority: 38; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### key-vault-secrets

Priority: 38; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### waf-policy

Priority: 26; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### activity-log-audit

Priority: 26; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|


## Wave 3: compute, API, containers, and edge routing

Cover deployable app platforms and request routing surfaces used by generated IaC and integration tests.

### api-management

Priority: 40; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### azure-functions

Priority: 39; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### aks-metadata

Priority: 39; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### container-registry

Priority: 36; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### logic-workflows

Priority: 27; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### front-door-cdn

Priority: 24; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### service-discovery

Priority: 24; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### load-balancing

Priority: 23; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|


## Wave 4: relational, cache, migration, and analytics platforms

Validate managed-data-service control planes and wire local protocol engines without claiming Azure-managed-service internals.

### postgresql-flexible-server

Priority: 32; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### synapse-warehouse

Priority: 22; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### mysql-flexible-server

Priority: 20; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### redis-cache

Priority: 20; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### database-migration-service

Priority: 20; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|


## Wave 5: networking, DNS, and observability

Harden cross-cutting dependencies that most other services reference during deployment.

### monitor-logs

Priority: 39; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### virtual-network

Priority: 30; current score: 1; current status: 99-ready.

| Work Item | Status | Action | Commands | Acceptance Gate |
|---|---|---|---|---|

### monitor-metrics-alerts

Priority: 29; current score: 1; current status: 99-ready.

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

