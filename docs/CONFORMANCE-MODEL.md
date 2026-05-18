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
