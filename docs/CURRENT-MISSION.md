# Current Mission

This file is the durable handoff for future agents after chat compaction. Read it before continuing implementation.

## Goal

Build GlobalStack as a first-party Azure emulator and platform-runner harness comparable in ambition to LocalStack for AWS, but without using LocalStack for Azure as a runtime dependency.

The product goal is not "make tests green with friendly stubs." The goal is to let real Azure IaC and SDK clients deploy and run integration tests against GlobalStack with behavior that is as close to Azure as the evidence allows. Unknown or unverified behavior must fail closed.

## Dataset Constraint

Prompts and model responses must teach Azure, not GlobalStack. A generated task prompt should ask for normal Azure infrastructure. The routing to GlobalStack is only a deployment/test replacement controlled by the harness, for example `provider=GlobalStack` in task metadata or runner environment.

Do not add GlobalStack-specific instructions to customer-facing prompts or IaC unless the test is explicitly about the GlobalStack harness itself.

The full rules for dataset-visible bundles live in `docs/product/azure-iac-principals.md`. Treat that file as the source of truth for prompt wording, IaC hygiene, and unit/integration test boundaries. In particular: prompts should be written in an imperative human style, unit tests should validate configuration/structure/semantic contract from the prompt, and integration tests should first prove service existence for all prompt-listed services before checking the end-to-end flow. Dataset artifacts must not leak GlobalStack-specific terms or runtime wiring.

For bundle structure, keep metadata minimal and prefer platform-native layout plus runner-generated runtime artifacts such as `flat-outputs.json`, `execution.log`, and `execution-report.json`. See `docs/product/azure-bundle-structure.md`.

Verified bundles are part of the verification workspace, not the product core. Keep them addressable through `verified/`, but prefer storing the actual corpus outside the core repo and pointing `GLOBALSTACK_VERIFIED_ROOT` at that location when needed.

## Non-Negotiables

- Do not modify `/home/ubuntu/genex/haawk`.
- Do not claim Azure parity for behavior that is not backed by real Azure capture, official emulator behavior, or an explicit documented contract.
- Do not invent successful Azure responses just to make a platform deploy pass.
- Unknown resource types, unsupported methods, unsupported child routes, and incomplete data-plane calls must fail closed.
- `GLOBALSTACK_AUTH_TOKEN` is required for local GlobalStack API access, matching the LocalStack-style dedicated local auth pattern.
- Real Azure capture work must be opt-in, tracked, quickly deprovisioned, and followed by cleanup verification.
- Commit and push meaningful batches after implementation and validation. Do not add generated assistant signatures.

## Service Scope

The target is the 30 AWS-analogue Azure capabilities listed in `docs/SERVICE-SCOPE.md` and tracked by `docs/conformance/azure-99-roadmap.md`.

## Implementation Strategy Classes

The 30-service Azure scope is not one uniform implementation style. Future work must treat these classes explicitly instead of flattening them into one parity number.

### Class A: facade + official emulator or official local runtime

These are the strongest current surfaces and the preferred shape where Microsoft provides a usable local runtime:

- `blob-storage`
- `azure-functions`
- `cosmos-nosql-table`
- `service-bus-topics`
- `queue-storage`
- `event-hubs-streams`
- `app-configuration-parameters`

### Class B: facade + concrete local backend/runtime

These use a real local engine or runtime behind Azure-shaped APIs, but not an official Microsoft emulator:

- `identity-rbac`
- `key-vault-secrets`
- `key-vault-keys`
- `postgresql-flexible-server`
- `mysql-flexible-server`
- `redis-cache`
- `container-registry`
- `monitor-logs`
- `monitor-metrics-alerts`
- `azure-files`
- `synapse-warehouse`
- `service-discovery`

### Class C: facade + bounded router/model runtime

These have executable local behavior, but the runtime is still bounded and not close enough to call a full service backend:

- `api-management`
- `event-grid`
- `aks-metadata`
- `virtual-network`
- `logic-workflows`
- `dns-zones`
- `load-balancing`
- `front-door-cdn`
- `activity-log-audit`

### Class D: mostly metadata / validation only

These are the weakest current surfaces and should be treated as transitional, not end-state emulation:

- `waf-policy`
- `database-migration-service`

## Real Emulation Priority

When the user says "go for it" on parity expansion, the default objective is to move services toward real emulation, not to add more metadata-only acceptance.

Priority order:

1. Class D -> Class C
2. Class C -> Class B
3. Class B -> Class A where an official emulator exists, otherwise deepen the concrete local backend/runtime

This means:

- prefer facade plus a concrete local backend/runtime over façade-only success
- prefer official Microsoft emulators where they are good enough to anchor the runtime
- treat pure metadata/control-plane facades as temporary scaffolding
- do not count another route or validation patch as “good enough” when the exposed gap really needs executable local runtime behavior
- if a workload is supposed to deploy and actually run, GlobalStack must aim to let that mix of services execute locally, not merely provision Azure-shaped metadata

## What We Were Doing Wrong

These are the recurring mistakes that future work must not repeat:

- flattening all service coverage into one parity number without separating metadata-only surfaces from executable local runtimes
- treating a passing parity pack as if it proved full service emulation, even when the service was still backed only by metadata, validation, or a bounded router
- accepting control-plane success for services whose real value is runtime behavior
- adding narrow route patches or validation relaxations when the real missing piece was a concrete local backend/runtime
- letting “bounded local subset” implementations linger as if they were acceptable end-state emulation
- using façade-only success to make complex tasks pass instead of deepening the runtime that the task actually needed
- speaking too loosely about parity when the repo itself still documented bounded or metadata-only behavior

## What We Must Not Do

- do not call a metadata-only or validation-only surface “real emulation”
- do not present bounded router/model behavior as equivalent to a real service backend
- do not prefer another ARM route addition over building the executable substrate when the workload needs one
- do not count task success as sufficient if the service mix would not really function as a deployed local system
- do not let convenience, speed, or checklist progress justify façade-only implementations for runtime-heavy services
- do not hide this distinction in docs, summaries, or roadmap language; the implementation class must stay explicit
- do not default to “make the next task green” if that means avoiding the deeper runtime work the service actually requires

Parity-hardening packs are expected to cover, at minimum:

- authenticated and unauthenticated ARM behavior,
- lifecycle create, update, get, list, delete, and post-delete behavior,
- parent readiness and missing-parent failures,
- negative parameter variance,
- unsupported route fail-closed behavior,
- ARM template deployment,
- all eight platform runners where applicable: Terraform HCL, OpenTofu HCL, Pulumi TS, Pulumi Python, Pulumi YAML, Ansible YAML, Bicep, and ARM JSON.

Passing a parity pack is a baseline, not a 99% parity claim.

## 99% Parity Roadmap

After each service has a dedicated parity pack, continue hardening each capability across these dimensions:

1. Complete live Azure API surface inventory for the service.
2. Parameter variance captures, not only happy paths.
3. State transition captures: create, update, get, list, delete, async provisioning, failed provisioning, parent readiness, and post-delete reads.
4. Error-shape fidelity: status codes, Azure error codes, body structure, request IDs, async headers, retry headers, and provider-visible messages.
5. Identity and RBAC behavior for allowed and denied calls.
6. Retry and eventual consistency behavior.
7. IaC-provider behavior against Terraform, OpenTofu, Pulumi, Ansible, Bicep, and ARM, including deploy, refresh, diff/preview, update, import where relevant, and destroy.
8. Data-plane behavior where applicable, preferably through official Microsoft emulators or real Azure captures.
9. Repeat captures for timing-sensitive or ambiguous behavior before normalizing local expectations.
10. Service-specific local facade or official emulator integration for any behavior beyond generic ARM metadata.

The tracked checklist is now closed. The next engineering work is not “add more green boxes” but keep challenging the claim through the continuation phases in `docs/conformance/azure-99-roadmap.md`:

1. Platform breadth pressure across Terraform, OpenTofu, Bicep, ARM JSON, Pulumi Python, Pulumi YAML, and Ansible YAML.
2. Mutation and lifecycle depth: updates, replacements, imports, drift, rollback, and delete/recreate races.
3. Runtime and orchestration fidelity under behavior-first integration tests.
4. Multi-region, network, DNS, edge, identity, and policy-heavy stress.
5. Narrow real-Azure canary reruns and drift checks that turn every surviving semantic mismatch into a product gap.

## Development Loop

Use the fast loop while changing a service:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:<service>-parity -- --skip-platforms
```

Before committing that service batch, run the full service pack once:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run e2e:<service>-parity
```

For shared behavior, auth, provider routing, generated docs, or platform-runner changes, run the full gate:

```bash
GLOBALSTACK_AUTH_TOKEN=... npm run smoke
npm run validate
```

Then run hygiene checks, inspect `git status`, commit a meaningful batch, and push `main`.

## Current Continuation Rule

If a future agent resumes mid-run, first check for an existing long-running smoke or platform process before starting another one:

```bash
ps -eo pid,ppid,etime,cmd | rg 'npm run smoke|node scripts/e2e|smoke-platform-runner|docker compose'
sudo -n docker ps -a --format '{{.Names}} {{.Image}} {{.Status}}' | rg 'globalstack-azure|azure-(terraform|opentofu|pulumi|ansible|bicep|arm)' || true
```

If the full smoke is still running, let it finish. After it passes, clean any GlobalStack smoke containers, run hygiene checks, commit, push, then continue the next roadmap dimension from `docs/conformance/azure-99-roadmap.md`.
