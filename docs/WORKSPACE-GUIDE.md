# GlobalStack

GlobalStack is a product workspace for Azure emulation, conformance capture, platform runners, and verified Azure IaC bundle execution.

## Start here

Future agents should read these in order before changing behavior:

1. `docs/README.md`
2. `docs/START-HERE.md`
3. `docs/CONFORMANCE-MODEL.md`
4. `docs/ARCHITECTURE.md`
5. `docs/SERVICE-SCOPE.md`
6. `docs/AGENT-RUNBOOK.md`
7. `docs/ARTIFACT-REGISTRY.md`
8. `docs/REPO-MAP.md`
9. `docs/product/PRODUCT-REPO-BOUNDARIES.md`

Repo governance:

- `CONTRIBUTING.md`
- `DEVELOPMENT.md`
- `SECURITY.md`

Regenerate the generated navigation docs with:

```bash
npm run docs:nav
```

Package-owned structural validation is available through workspace scripts:

```bash
npm run workspace:build
npm run workspace:test
npm run workspace:validate
```

## What is included

- Azure platform template definitions for Terraform, OpenTofu, Pulumi, Ansible, Azure CLI REST, Bicep, and ARM JSON.
- Docker runner templates that share the GlobalStack Azure sidecar network.
- A GlobalStack Azure compose file that uses local defaults without product activation.
- Metadata-driven provider routing: task `metadata.json` can select `provider=GlobalStack` for local emulation or `provider=Azure` for real Azure execution.
- A smoke prompt generator that creates Azure deployment prompts for every supported platform.
- A deploy-smoke generator for AI/MLOps, robotics, and GenAI use cases that exercises supported Azure control-plane resources against GlobalStack.
- A platform runner lifecycle matrix for Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON.
- A hybrid Azure emulator foundation that prefers official Microsoft emulators, fills control-plane gaps with a GlobalStack ARM facade, and reserves real Azure for conformance capture.
- Tier 1 and Tier 2 AWS-to-Azure capability mappings with explicit backing engines, known gaps, and cloud-validation status.
- A generated artifact registry in `docs/ARTIFACT-REGISTRY.md` that records file ownership, source-of-truth boundaries, generator commands, and edit policy.
- Product repo boundaries in `docs/product/PRODUCT-REPO-BOUNDARIES.md` so runtime noise stays out of git.
- A split between the core product repo and the sibling verification repo at `../globalstack-verification`, with an optional `GLOBALSTACK_VERIFIED_ROOT` override.

## Support boundary

This workspace must fail closed. It must not return successful Azure-shaped responses for unregistered resource types, missing `api-version` provider calls, or behavior that has not been bound to an official emulator, a GlobalStack metadata facade, or a real Azure capture fixture.

Current support is not complete live Azure API parity. Most services are metadata-only control-plane facades. Services backed by official local emulators are marked `official-emulator-backed-local`, and even those remain `realAzureApiComplete: false` until every relevant live Azure behavior is covered by conformance tests.

The tracked 30-service parity program is closed, but the product is not treated as “finished.” The default continuation lane now lives in `docs/conformance/azure-99-roadmap.md` and is organized into:

- platform breadth pressure across Terraform, OpenTofu, Bicep, ARM, Pulumi Python, Pulumi YAML, and Ansible,
- mutation and lifecycle depth,
- runtime and orchestration fidelity,
- multi-region, network, and policy stress,
- and narrow real-Azure canary reruns.

## Commands

```bash
npm run smoke
```

This renders generated templates into `dist/platform-images/`, writes smoke prompts into `dist/smoke-prompts/`, runs the GlobalStack deploy smoke, runs the Azurite-backed storage E2E, and validates that no generated template points at the HAAWK repo.

Render the hybrid emulator coverage registry and official-emulator compose file:

```bash
npm run hybrid:render
```

Run the conformance tests for the hybrid Tier 1/Tier 2 registry and ARM facade:

```bash
npm run hybrid:test
```

Render the filtered live Azure API call catalog and run the local parameter-variance pass:

```bash
npm run conformance:catalog
npm run conformance:local
```

The catalog is written to `docs/conformance/azure-live-api-catalog.json`. Local conformance verifies strict routing and records which parameter-variance cases still need real Azure capture.

Real Azure captures are classified by validation depth:

```bash
npm run conformance:classify
npm run conformance:checklist
```

Captures blocked by subscription, provider readiness, or other capture-environment conditions are marked `capture-infrastructure-gap`. They are useful evidence for capture setup, but they do not prove service-level semantics and must not be used as cloud-validation claims.

Real Azure execution is intentionally gated:

```bash
GLOBALSTACK_REAL_AZURE_CONFORMANCE=1 npm run conformance:azure -- --capability=blob-storage --case=valid-minimal
```

Use `--all` only when the subscription, cost controls, and cleanup policy are ready. Captured Azure results must be normalized into conformance expectations before any operation is marked cloud-validated.

Start the GlobalStack Azure ARM facade:

```bash
npm run hybrid:emulator
```

The ARM facade listens on `http://127.0.0.1:4570` by default and exposes:

- `/_globalstack/health`
- `/_globalstack/capabilities`
- `/_globalstack/coverage`
- Azure-shaped resource group and generic resource CRUD routes under `/subscriptions/...`

Official Microsoft emulator compose artifacts are generated into `dist/hybrid/docker-compose.official-emulators.yml`. They are intentionally profile-gated so teams can start only the emulators needed for a scenario.

Generate and deploy the Azure use-case smoke prompts:

```bash
npm run smoke:deploy
```

The deploy smoke writes prompt bundles and results under `dist/deploy-smoke/`. By default it starts the in-process GlobalStack hybrid ARM facade, then creates short-lived resource groups and supported resources for MLOps feature intake, robotics telemetry buffering, and regulated GenAI ingestion.

To test the GlobalStack Azure sidecar instead of the in-process facade, run:

```bash
npm run smoke:deploy -- --backend=globalstack-sidecar
```

No product activation is required for the local sidecar. If the container cannot become healthy, the script records that startup failure in `dist/deploy-smoke/report.md`.

Build all Docker runner images:

```bash
npm run render
npm run build:images
```

Clean runtime artifacts without touching source files:

```bash
npm run repo:clean-runtime:dry-run
npm run repo:clean-runtime
```

Run the current Bicep reference lifecycle against the shared GlobalStack Azure sidecar:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:bicep-runner
```

The Bicep runner executes `build`, `lint`, `unit-tests`, `deploy`, `integration-tests`, and `destroy`. Reports are written under `dist/platform-images/azure-bicep/reports/`.

Run the complete platform runner lifecycle matrix against the shared GlobalStack Azure sidecar:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:platform-runners
```

This covers Terraform, OpenTofu, Pulumi TypeScript, Pulumi Python, Pulumi YAML, Ansible, Azure CLI REST, Bicep, and ARM JSON. Terraform and OpenTofu run native AzAPI provider apply/destroy through the selected provider endpoint; Pulumi TypeScript, Pulumi Python, and Pulumi YAML run native Pulumi Azure Native up/destroy through runner-transparent GlobalStack routing; Ansible runs native `azure.azcollection` modules through the same GlobalStack routing; Azure CLI REST runs task-owned `az rest` scripts; ARM JSON deploys the shared Azure ARM contract directly. Results are written to `dist/platform-lifecycle-smoke-results.json` and per-platform `reports/` folders.

The legacy sidecar token can optionally be overridden:

```bash
export GLOBALSTACK_AUTH_TOKEN=...
```

The templates pass that variable into the sidecar. The default is a local development value. Do not use real cloud credentials as a product token. Azure-shaped requests still use deterministic local Azure identity values such as `ARM_SUBSCRIPTION_ID`, `ARM_TENANT_ID`, and bearer token `globalstack-local-token`; the product token is not a replacement for Azure request authentication.

Platform runners resolve the target provider from task `metadata.json` first, then `PROVIDER` / `CLOUD_PROVIDER`, then default to `GlobalStack`. A task with `{"provider":"Azure"}` routes to real Azure and requires real Azure credentials plus a real `ARM_SUBSCRIPTION_ID`; a task with `{"provider":"GlobalStack"}` routes to the local sidecar and uses the deterministic local identity.

## Real Azure capture

For behavior that cannot be derived from public specs or local emulators, use real Azure capture intentionally:

```bash
GLOBALSTACK_REAL_AZURE_CAPTURE=1 npm run capture:azure -- <fixture-id> <request-json>
```

Captured fixtures are sanitized and written under `fixtures/azure-captures/`. A captured fixture must be normalized into a conformance test before a capability can be marked `cloudValidated`.
