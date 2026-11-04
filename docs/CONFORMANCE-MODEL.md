# Conformance Model

This repo uses conformance evidence to decide what the local Azure emulator may claim. Passing local tests is not enough. A response shape is trustworthy only when its source and limitations are explicit.

## Evidence Types

### `provider-validation`

Azure returned a provider-level validation response that can be normalized into local behavior. Examples include missing `location`, invalid location strings, missing required properties, or provider-specific malformed request errors.

This is strong evidence for the tested invalid request shape. It does not prove success-path parity.

### `arm-surface`

Azure Resource Manager returned a general platform response before service-provider semantics were reached. Examples include missing `api-version`.

This is evidence for ARM routing and request envelope behavior. It does not prove service-specific behavior.

### `provider-accepted`

Azure accepted the request shape in the captured context or returned a safe empty/missing-resource response.

This is useful but limited. It does not prove defaults, async operations, side effects, eventual state, RBAC, networking, or data-plane behavior unless those were separately captured.

### `provider-routing-or-parent-validation`

Azure returned behavior tied to parent routing, missing parents, nested resources, or resource hierarchy validation.

This is evidence for the captured route and parent condition. It must not be generalized across different parent states.

### `capture-infrastructure-gap`

The capture was blocked by setup conditions such as subscription, provider readiness, or another capture-environment artifact.

This is not service behavior and must not be converted into a local parity claim.

## Lifecycle Evidence

Some Azure behavior only appears across a sequence of calls. Storage account creation is the current example:

- storage account `PUT` returns `202`,
- immediate child operations can return `409 StorageAccountIsNotProvisioned`,
- polling `GET` eventually reaches `Succeeded`,
- child create/get/list/delete behavior changes after the parent is ready,
- post-delete child reads return child-specific Azure errors such as `ContainerNotFound`.

Those sequences live in `fixtures/azure-lifecycle-captures/` and are normalized into `fixtures/local-expectations/azure-lifecycle-local-expectations.json`.

## Local Pass Rules

A local response can be treated as a pass when one of these is true:

- it exactly matches an Azure-derived expectation for status and error code,
- it matches a captured lifecycle expectation for the same sequence state,
- it is backed by an official emulator test for that data-plane path,
- it fails closed for unsupported behavior with an explicit GlobalStack error.

A local response must not be treated as a pass when it succeeds only because the emulator accepted an unvalidated shape.

## Local Identity Rules

GlobalStack Azure does not validate credentials against Microsoft Entra ID, but protected ARM calls must still use Azure-shaped authentication. This keeps missing credentials, wrong bearer tokens, and wrong subscription IDs from becoming false-positive deployments.

The default local identity is:

- subscription ID: `00000000-0000-0000-0000-000000000000`
- tenant ID: `00000000-0000-0000-0000-000000000000`
- client ID: `11111111-1111-1111-1111-111111111111`
- client secret: `globalstack`

The local token endpoint issues the deterministic bearer token `globalstack-local-token` for that identity. Protected resource and deployment calls must send it as `Authorization: Bearer globalstack-local-token`.

Auth conformance expectations:

- public metadata and health routes remain unauthenticated,
- missing or invalid bearer tokens return Azure-shaped `401 InvalidAuthenticationToken`,
- a subscription path that does not match the configured local subscription returns Azure-shaped `403 AuthorizationFailed`,
- tests must not bypass the ARM facade's auth checks just to make a deployment pass.

## Cloud Validation Rules

`cloudValidated: false` remains the default.

Do not change it to `true` unless all of these are true for the capability scope being claimed:

- success path was captured through real Azure or an official emulator-backed conformance suite,
- negative parameter variance was captured,
- parent/child routing behavior was captured,
- async or eventual state was captured where applicable,
- cleanup was verified,
- known gaps for that claimed scope are empty or explicitly outside the scope being claimed.

## Gaps Are Product State

An explicit gap is not a failure of the project. It is a correctness boundary. Removing a gap without evidence is worse than leaving it visible.

Use `docs/conformance/provider-validation-implementation-checklist.md` to track which captured behaviors have been normalized into the local emulator.

## Application Event-Flow Evidence

Deployment success and resource readback are prerequisites, not proof that an application works. For each claimed cross-service scenario, integration tests must:

1. Deploy through the normal management or IaC interface.
2. Submit a unique event through the application's entry point. Do not seed intermediate or destination state directly.
3. Verify the same event or its specified transformation at each observable boundary and at the final destination. Check the business outcome, not only a success status or log line.
4. Use bounded requests and polling for asynchronous operations. Record timeouts as failures, never as successful delivery.
5. Include a negative control that removes a required connection or points it at a wrong destination. The normal success assertion must reject that outcome even when deployment and publication succeed.
6. Restore the connection and verify delivery resumes. Verify resource cleanup separately.

State what was observed directly and what remains unobserved. A local HTTP receiver is real execution of that receiver; it is not a live Azure service. A mocked transport or an internal event collection alone cannot establish end-to-end delivery.

The upstream Event Grid test in `packages/conformance/src/upstream-templates.test.mjs` deploys Microsoft's pinned template, publishes uniquely identified events over HTTP, and checks their payloads at a local webhook. It tests deleted subscriptions, wrong destinations and restored delivery. The Key Vault case reads the deployed secret through the data plane. The storage case currently checks management behavior only. These cases do not cover all service combinations.

Local Event Grid currently awaits webhook delivery before acknowledging publication. Its tests therefore check receiver state after that response. This does not establish Azure's asynchronous delivery, retries, filtering, ordering or dead-letter behavior.

## Differential Conformance and Specification Drift

A differential conformance run executes the same scenario against GlobalStack and Azure, then compares the observable results. A first run establishes a baseline. Repeated runs detect behavior changes; a one-time run cannot establish continuing compatibility.

The current differential harness covers selected AKS cases and compares status and error code. It does not yet compare complete response bodies, application outcomes, timing or all supported capabilities. Azure targets require explicit opt-in before account discovery or cloud calls. Provisioning cases require a separate provisioning option. See [the AKS runbook](coverage/aks-real-azure-differential.md).

Future coverage should use small per-capability scenarios plus representative cross-service flows. Each result should record the source revision, client and API versions, region, test case, observed outcome, allowed normalization and cleanup result. Normalize only reviewed volatile fields such as generated identifiers and timestamps. Do not normalize away delivery failures, missing resources or incorrect business state.

Report separately:

- Coverage: cases exercised divided by the declared versioned inventory.
- Agreement: matching executed cases divided by comparable executed cases.
- Failures, blocked cases, skips and untested cases, with their counts and reasons.

These are case-level measurements. Neither is a percentage of all Azure behavior, and neither justifies an unqualified compatibility claim.

The read-only `Azure specification watch` workflow runs weekly and on manual dispatch. It compares directory tree hashes from Microsoft's [Azure API specifications](https://github.com/Azure/azure-rest-api-specs) with `docs/conformance/azure-spec-baseline.json`. That baseline maps the 30 registered capabilities to reviewed upstream service directories, plus the shared Resource Manager directory.

Run the watcher locally with:

```bash
node scripts/conformance/check-azure-spec-drift.mjs
```

The JSON and Markdown reports under `dist/spec-drift/` record both revisions and affected capabilities. Changed or missing directories require review and fail the workflow. Fetch failures also fail, without a drift conclusion. Reports are retained as CI artifacts for 90 days. A directory change may concern documentation, examples or unrelated API versions, so it is a review signal rather than proof of a runtime incompatibility. Unchanged specifications do not prove unchanged Azure behavior.

For each change, inspect the upstream diff and the relevant [stable or preview API-version directories](https://github.com/Azure/azure-rest-api-specs/blob/main/documentation/directory-structure.md), update affected tests and support boundaries, and review the baseline update in a PR. Do not advance the baseline automatically to silence an alert. Approved live Azure canaries remain a separate future check; this workflow does not provision cloud resources.
