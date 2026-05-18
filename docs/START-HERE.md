# Start Here

This workspace is a standalone GlobalStack Azure prototype. It exists to build Azure deployment platform templates and a first-party Azure emulator strategy without modifying `/home/ubuntu/genex/haawk`.

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
- Do not use LocalStack for Azure as a runtime dependency. GlobalStack must own the emulator surface it claims.
- Treat official Microsoft emulators as useful local data planes, not proof of full Azure management-plane parity.

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

## What Is Real Today

- Real Azure capture fixtures live in `fixtures/azure-captures/`.
- Real Azure lifecycle fixtures live in `fixtures/azure-lifecycle-captures/`.
- Azure-derived local expectations live in `fixtures/local-expectations/`.
- Capture classification lives in `docs/conformance/azure-capture-classification.json`.
- The 99%-parity checklist lives in `docs/conformance/azure-99-parity-checklist.md`.
- The prioritized execution roadmap lives in `docs/conformance/azure-99-roadmap.md`.
- The platform runner lifecycle checklist lives in `docs/PLATFORM-RUNNER-LIFECYCLE.md`.
- The local ARM facade lives in `packages/azure-control-plane/src/server.mjs`.
- Storage data-plane E2E uses Azurite through `scripts/e2e-azure-storage.mjs`.

As of the latest validated run:

- 448 Azure captures were classified.
- 448 Azure captures had cleanup verified.
- 382 Azure-derived local expectations were generated from captures.
- 53 Azure lifecycle expectations were generated from storage lifecycle captures.
- 262 local conformance cases passed.

These numbers are evidence for the current test set only. They are not a statement of full Azure API parity.

## First Files To Read

0. `docs/README.md`
1. `docs/CONFORMANCE-MODEL.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SERVICE-SCOPE.md`
4. `docs/AGENT-RUNBOOK.md`
5. `docs/ARTIFACT-REGISTRY.md`
6. `docs/REPO-MAP.md`

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
