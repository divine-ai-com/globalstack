# Current Mission

This file is the durable handoff for future agents after chat compaction. Read it before continuing implementation.

## Goal

Build GlobalStack as a first-party Azure emulator and platform-runner harness comparable in ambition to LocalStack for AWS, but without using LocalStack for Azure as a runtime dependency.

The product goal is not "make tests green with friendly stubs." The goal is to let real Azure IaC and SDK clients deploy and run integration tests against GlobalStack with behavior that is as close to Azure as the evidence allows. Unknown or unverified behavior must fail closed.

## Dataset Constraint

Prompts and model responses must teach Azure, not GlobalStack. A generated task prompt should ask for normal Azure infrastructure. The routing to GlobalStack is only a deployment/test replacement controlled by the harness, for example `provider=GlobalStack` in task metadata or runner environment.

Do not add GlobalStack-specific instructions to customer-facing prompts or IaC unless the test is explicitly about the GlobalStack harness itself.

The full rules for dataset-visible bundles live in `docs/azure-iac-principals.md`. Treat that file as the source of truth for prompt wording, IaC hygiene, unit/integration test boundaries, and the rule that dataset artifacts must not leak GlobalStack-specific terms or runtime wiring.

For bundle structure, keep metadata minimal and prefer platform-native layout plus runner-generated runtime artifacts such as `flat-outputs.json`, `execution.log`, and `execution-report.json`. See `docs/azure-bundle-structure.md`.

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
