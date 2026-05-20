# GlobalStack Docs Index

Use this file as the routing table for the repo. If you are not sure which document applies, start here, then follow the row that matches the task.

## Default Reading Order

1. `START-HERE.md`
2. `CURRENT-MISSION.md`
3. `CONFORMANCE-MODEL.md`
4. `ARCHITECTURE.md`
5. `SERVICE-SCOPE.md`
6. `AGENT-RUNBOOK.md`
7. `ARTIFACT-REGISTRY.md`
8. `REPO-MAP.md`

## Task Routing

| Task | Read First | Then Read | Source Of Truth |
|---|---|---|---|
| Understand the project vision | `START-HERE.md` | `CURRENT-MISSION.md`, `ARCHITECTURE.md` | `CURRENT-MISSION.md` |
| Understand what is safe to claim | `CONFORMANCE-MODEL.md` | `SERVICE-SCOPE.md` | Azure captures, lifecycle captures, and conformance tests |
| Check current Tier 1/Tier 2 service scope | `SERVICE-SCOPE.md` | `docs/hybrid/README.md` | `packages/core/src/azure-tier1-capabilities.mjs` |
| Harden Azure Storage coverage | `docs/coverage/storage-hardening.md` | `docs/coverage/storage-parity-pack.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | Storage captures, parity pack, Azurite E2E, and real Azure capture backlog |
| Harden Azure Service Bus coverage | `docs/coverage/service-bus-parity-pack.md` | `docs/hybrid/README.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | Service Bus captures, official emulator E2E, parity pack, and real Azure capture backlog |
| Harden Azure Event Grid coverage | `docs/coverage/event-grid-parity-pack.md` | `docs/hybrid/README.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | Event Grid captures, parity pack, local event router, and real Azure capture backlog |
| Harden Azure API Management coverage | `docs/coverage/api-management-parity-pack.md` | `docs/hybrid/README.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | API Management captures, parity pack, local gateway router, and real Azure capture backlog |
| Harden Azure Functions coverage | `docs/coverage/azure-functions-parity-pack.md` | `docs/hybrid/README.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | Azure Functions captures, parity pack, local HTTP-trigger router, and real Azure capture backlog |
| Harden Azure Key Vault coverage | `docs/coverage/key-vault-parity-pack.md` | `docs/hybrid/README.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | Key Vault captures, parity pack, local secret/key data-plane router, and real Azure capture backlog |
| Harden Azure Container Registry coverage | `docs/coverage/container-registry-parity-pack.md` | `docs/hybrid/README.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | Container Registry captures, parity pack, local ACR/Docker Registry router, and real Azure capture backlog |
| Harden Azure Kubernetes Service coverage | `docs/coverage/aks-metadata-parity-pack.md` | `docs/hybrid/README.md`, `CONFORMANCE-MODEL.md`, `AGENT-RUNBOOK.md` | AKS captures, metadata parity pack, kubeconfig action metadata, and real Azure capture backlog |
| Change emulator behavior | `CONFORMANCE-MODEL.md` | `AGENT-RUNBOOK.md`, `ARCHITECTURE.md` | Capture fixtures and replay tests |
| Add or update provider validation | `CONFORMANCE-MODEL.md` | `docs/conformance/provider-validation-implementation-checklist.md` | `fixtures/azure-captures/` |
| Add a real Azure capture | `AGENT-RUNBOOK.md` | `CONFORMANCE-MODEL.md` | `fixtures/azure-captures/` and cleanup proof |
| Add lifecycle behavior | `CONFORMANCE-MODEL.md` | `AGENT-RUNBOOK.md` | `fixtures/azure-lifecycle-captures/` |
| Add a Tier 1 or Tier 2 capability | `SERVICE-SCOPE.md` | `ARCHITECTURE.md`, `AGENT-RUNBOOK.md` | Capability registry |
| Work on platform images | `PLATFORM-RUNNER-LIFECYCLE.md` | `ARCHITECTURE.md`, `REPO-MAP.md` | `scripts/render-platform-templates.mjs`, `templates/runner/stages/`, and generated `dist/platform-images/` |
| Work on dataset-visible Azure IaC bundles, prompts, or tests | `azure-iac-principals.md` | `CURRENT-MISSION.md`, `AGENT-RUNBOOK.md`, `PLATFORM-RUNNER-LIFECYCLE.md` | Azure-only task artifacts plus the hidden runner/runtime layer |
| Work on Azure bundle layout, outputs, or test structure | `azure-bundle-structure.md` | `azure-iac-principals.md`, `CURRENT-MISSION.md`, `AGENT-RUNBOOK.md` | Platform-native source layout plus runner-generated runtime artifacts |
| Work on generated prompts or smoke deploys | `AGENT-RUNBOOK.md` | `REPO-MAP.md` | `scripts/generate-azure-smoke-prompts.mjs` and `scripts/smoke-deploy-azure-usecases.mjs` |
| Understand repo layout or file ownership | `ARTIFACT-REGISTRY.md` | `REPO-MAP.md`, `ARCHITECTURE.md` | Artifact registry plus generated repo map |
| Add new files or product surfaces | `ARTIFACT-REGISTRY.md` | `CONFORMANCE-MODEL.md`, `ARCHITECTURE.md` | Existing ownership model and source-of-truth order |
| Review design decisions | `docs/decisions/` | `CONFORMANCE-MODEL.md` | ADRs |
| Check archived third-party landscape input | `docs/localstack-azure/README.md` | `SERVICE-SCOPE.md` | Historical reference only, not active GlobalStack runtime support |
| Check official/local emulator options | `docs/hybrid/README.md` | `SERVICE-SCOPE.md` | Capability registry and generated hybrid coverage |

## Source Of Truth Order

When files disagree, use this order:

1. Real Azure captures and lifecycle fixtures.
2. Official emulator tests.
3. Conformance tests and generated local expectations.
4. Capability registry.
5. Generated docs.
6. Hand-written architecture and runbook docs.

If generated docs disagree with source files, regenerate docs.

If hand-written docs disagree with captures, tests, or the capability registry, update the hand-written docs.

## Regeneration Commands

```bash
npm run docs:nav
npm run docs:artifacts
npm run conformance:classify
npm run conformance:expectations
npm run lifecycle:expectations
GLOBALSTACK_AUTH_TOKEN=... npm run smoke:platform-runners
```

## Validation Commands

```bash
npm run smoke
npm run providers:gaps
```

After real Azure work, confirm cleanup:

```bash
az group list --query "[?starts_with(name, 'rg-gs-life-') || starts_with(name, 'rg-gs-conf-') || tags.purpose == 'globalstack-conformance' || tags.purpose == 'globalstack-lifecycle'].{name:name,provisioningState:properties.provisioningState,location:location,tags:tags}" --output json
```

Expected result after cleanup is `[]`.
