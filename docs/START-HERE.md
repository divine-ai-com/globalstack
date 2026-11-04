# Start Here

This workspace is the GlobalStack product repo. It exists to build Azure deployment platform templates and a first-party Azure emulator strategy without modifying `/home/ubuntu/genex/haawk`.

## Vision

GlobalStack should let agents generate, validate, and smoke-test Azure infrastructure templates for AWS-equivalent services while preserving a strict line between:

- behavior captured from real Azure,
- behavior covered by an official Microsoft emulator,
- local metadata/control-plane behavior implemented by GlobalStack, and
- explicit gaps that must not be hidden.

The goal is not to make Azure calls "work" by returning friendly local success. The goal is to build a conformance-led emulator surface that fails closed unless the behavior is backed by a real source.

## Non-Negotiables

- Do not write to `/home/ubuntu/genex/haawk` from this workspace.
- Do not invent Azure success responses to make tests pass.
- Do not mark a capability as live Azure parity unless exact behavior has been captured or otherwise conformance-tested against a real source.
- Keep unknown Azure resource types and incomplete ARM calls fail-closed.
- Keep real Azure captures gated behind explicit environment variables.
- Deprovision every real Azure resource created for capture or smoke testing.
- Treat official Microsoft emulators as useful local data planes, not proof of full Azure management-plane parity.
- For any Azure surface we claim to support, the target is the same externally observable behavior as real Azure. If Azure and GlobalStack differ, that is a product gap.
- Keep dataset-visible Azure IaC artifacts Azure-only. Prompts, IaC, unit tests, and integration tests must not mention GlobalStack, local endpoints, or emulator-only runtime details. See `docs/product/azure-iac-principals.md`.
- For runtime-heavy services, do not settle for a facade-only success path. The intended shape is an Azure-shaped facade backed by a real local engine, backend, broker, database, workflow runtime, registry, Kubernetes substrate, or equivalent executable local system.

## Current Scope

The repo covers 30 AWS-analogue capabilities:

- 15 Tier 1 capabilities used for the first Azure platform support surface.
- 15 Tier 2 capabilities used for the expansion surface.

The local implementation is a hybrid:

- generated Azure platform runner templates,
- a GlobalStack ARM facade for management-plane resources,
- official or local emulators where available,
- Azure capture fixtures for exact error/status/body behavior,
- conformance tests that replay captured expectations.

See `docs/SERVICE-SCOPE.md` for the generated capability matrix.
See `docs/CURRENT-MISSION.md` for the current implementation classes and the standing rule that parity expansion must prefer real local backend/runtime depth over metadata-only façade growth.

## What Is Real Today

- Real Azure capture fixtures live in `fixtures/azure-captures/`.
- Real Azure lifecycle fixtures live in `fixtures/azure-lifecycle-captures/`.
- Azure-derived local expectations live in `fixtures/local-expectations/`.
- Capture classification lives in `docs/conformance/azure-capture-classification.json`.
- The 99%-parity checklist lives in `docs/conformance/azure-99-parity-checklist.md`.
- The prioritized execution roadmap lives in `docs/conformance/azure-99-roadmap.md`.
- The same roadmap now also carries the post-checklist continuation phases for platform breadth, mutation depth, runtime fidelity, multi-region stress, and real-Azure canary reruns.
- The platform runner lifecycle checklist lives in `docs/runbooks/PLATFORM-RUNNER-LIFECYCLE.md`.
- The local ARM facade lives in `packages/azure-control-plane/src/server.mjs`.
- Storage data-plane E2E uses Azurite through `scripts/e2e/e2e-azure-storage.mjs`.

Current capture counts are recorded in `docs/conformance/azure-capture-classification.json`. Local replay expectations live in `fixtures/local-expectations/azure-derived-local-expectations.json`.

Checklist completion records implementation work. It does not establish a measured percentage of Azure compatibility. New workloads, provider changes and live Azure drift remain open validation work.

## First Files To Read

0. `docs/README.md`
1. `docs/CURRENT-MISSION.md`
2. `docs/CONFORMANCE-MODEL.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SERVICE-SCOPE.md`
5. `docs/AGENT-RUNBOOK.md`
6. `docs/ARTIFACT-REGISTRY.md`
7. `docs/REPO-MAP.md`

## Fast Sanity Commands

```bash
npm run docs:nav
npm run docs:artifacts
npm run conformance:parity
npm run conformance:roadmap
npm run smoke
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:platform-runners
npm run providers:gaps
az group list --query "[?starts_with(name, 'rg-gs-life-') || starts_with(name, 'rg-gs-conf-') || tags.purpose == 'globalstack-conformance' || tags.purpose == 'globalstack-lifecycle'].name" --output json
```

The Azure resource group query should return `[]` after live capture or lifecycle testing.
