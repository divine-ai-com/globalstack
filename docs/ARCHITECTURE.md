# Architecture

GlobalStack Azure is organized around one rule: generated infrastructure and local emulation are useful only when their support boundaries are explicit.

## Main Components

| Component | Location | Role |
|---|---|---|
| Capability registry | `packages/core/src/azure-tier1-capabilities.mjs` | Defines Tier 1 and Tier 2 capabilities, AWS analogues, Azure resource types, backing engines, and known gaps. |
| Platform renderer | `scripts/render/render-platform-templates.mjs` | Renders Azure platform runner images, lifecycle stages, and sample tasks into `dist/platform-images/`. |
| Hybrid renderer | `scripts/render/render-hybrid-artifacts.mjs` | Renders support coverage docs and official emulator compose artifacts. |
| ARM facade | `packages/azure-control-plane/src/server.mjs` | Provides a local Azure management-plane HTTP surface. |
| Provider validation | `packages/azure-control-plane/src/provider-validation.mjs` | Encodes Azure-captured validation responses. |
| Resource store | `packages/core/src/resource-store.mjs` | Stores resource groups, resources, and selected lifecycle state in memory. |
| Data-plane adapters | `packages/azure-data-plane/src/` | Integrates official/local emulators such as Azurite. |
| Capture classifier | `packages/conformance/src/azure-capture-classification.mjs` | Classifies live Azure captures by validation depth. |
| Conformance tests | `packages/conformance/src/` | Verifies registry, local expectations, lifecycle behavior, and emulator integration. |

## Runtime Flow

1. A generated platform template or smoke test sends Azure-shaped ARM calls.
2. The ARM facade parses resource-group or provider routes.
3. Unknown resource types or missing `api-version` fail closed.
4. Known resource types map to a capability from the registry.
5. Captured provider validation is applied before local state mutation.
6. Local resources are stored with capability metadata and explicit support state.
7. Data-plane tests call official/local emulators separately where available.

## Capture-To-Test Flow

1. `npm run conformance:catalog` renders candidate Azure API calls.
2. `npm run conformance:azure` or a targeted capture script runs against real Azure only when explicitly enabled.
3. Capture fixtures are sanitized into `fixtures/azure-captures/` or `fixtures/azure-lifecycle-captures/`.
4. `npm run conformance:classify` labels capture evidence by validation depth.
5. `npm run conformance:expectations` and `npm run lifecycle:expectations` render local expectations.
6. Tests replay those expectations against the local ARM facade.

## Template Flow

1. The capability registry drives supported Azure platform surfaces.
2. `npm run render` writes platform runner templates under `dist/platform-images/`.
3. Task `metadata.json` selects `provider=GlobalStack` or `provider=Azure`; if metadata is absent, `PROVIDER` / `CLOUD_PROVIDER` can select the backend.
4. Platform runners share the `globalstack/azure-emulator:local` sidecar in GlobalStack mode and use platform-specific runner images for CLI/toolchain behavior.
5. Each platform runner executes `build`, `lint`, `unit-tests`, `deploy`, `integration-tests`, and `destroy`.
6. Bicep compiles Bicep and deploys the compiled ARM template through the selected Azure-shaped REST path.
7. Terraform and OpenTofu run native AzAPI provider `apply` / `destroy`; in GlobalStack mode the runner supplies a local Azure CLI token shim and TLS proxy to the sidecar.
8. Pulumi TypeScript, Pulumi Python, and Pulumi YAML run native Azure Native `pulumi up` / `destroy`; in GlobalStack mode the runner keeps the Pulumi program Azure-native and transparently routes Azure identity and management hostnames to the sidecar.
9. Ansible runs native `azure.azcollection` modules through the same transparent GlobalStack routing.
10. ARM JSON validates and deploys the shared ARM contract through the same Azure-shaped path.
11. `npm run smoke:prompts` writes prompt bundles for each platform.
12. `npm run smoke:deploy` exercises generated use cases against the local hybrid backend by default.
13. `npm run validate` checks generated templates do not depend on the HAAWK repo.

Run the Bicep lifecycle with:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:bicep-runner
```

Lifecycle reports are written to `dist/platform-images/azure-bicep/reports/`.

Run the full platform lifecycle matrix with:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:platform-runners
```

The matrix writes `dist/platform-lifecycle-smoke-results.json` plus per-platform reports under `dist/platform-images/<platform>/reports/`. See `docs/runbooks/PLATFORM-RUNNER-LIFECYCLE.md` for the platform checklist and current support boundary.

## Emulator Strategy

The project uses three local support modes:

- Official Microsoft emulator where available, such as Azurite.
- Local non-Azure backing engines for development smoke tests, such as PostgreSQL, MySQL, Redis, or an OCI registry.
- GlobalStack metadata/control-plane facade for ARM resources where no official emulator exists.

None of those modes automatically means full Azure parity. See `docs/CONFORMANCE-MODEL.md`.

## Generated Documentation

- `docs/SERVICE-SCOPE.md` is generated from the capability registry plus capture classifications.
- `docs/REPO-MAP.md` is generated from repo files, npm scripts, and registry counts.
- Rebuild them with:

```bash
npm run docs:nav
```
