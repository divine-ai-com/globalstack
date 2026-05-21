# Azure IaC Principles

This document defines the non-negotiable rules for dataset-visible Azure IaC tasks and bundles.

The short version:

- task artifacts must teach Azure, not GlobalStack
- GlobalStack is only the hidden deployment and test replacement layer
- no bundle is training-grade unless prompt, IaC, tests, and runtime behavior all align to the real Azure contract being claimed

## Scope

These rules apply to any dataset-visible artifact, including:

- `prompt.txt`
- model response files
- Terraform, OpenTofu, Pulumi, Bicep, ARM, or Ansible IaC source
- unit tests
- integration tests
- task READMEs or human-facing task notes

These rules do not prevent GlobalStack-specific runtime wiring in:

- runner entrypoints
- platform images
- hidden execution metadata
- local auth shims
- endpoint routing layers
- internal smoke or conformance harness code

One explicit exception is allowed in task metadata:

- `provider: GlobalStack`

That field is the deployment-routing toggle between real Azure and GlobalStack. It is allowed only in metadata, not in prompts, IaC, unit tests, or integration tests.

## 1. Azure-Only Training Surface

Anything a model could learn from must describe normal Azure deployment behavior.

Allowed:

- Azure service names
- Azure resource types
- Azure API versions
- Azure provider semantics
- Azure naming rules
- Azure outputs
- Azure failure modes

Forbidden in dataset-visible artifacts:

- `GlobalStack`
- emulator or emulation wording
- `LocalStack`
- `localhost`
- local endpoint URLs
- custom local auth tokens
- harness-only environment variables
- hidden runner implementation details

Allowed exception:

- `provider: GlobalStack` in task metadata only

## 2. Hidden Routing Principle

Routing to GlobalStack must happen outside the task itself.

The bundle should look like a normal Azure deployment bundle. The harness is responsible for redirecting native Azure tooling and Azure-shaped API calls to GlobalStack.

Do not hardcode emulator-specific behavior into:

- prompts
- IaC
- tests

Allowed routing exception:

- task metadata may carry `provider: GlobalStack` or `provider: Azure` as the deployment target selector

## 3. Prompt Rules

Prompts must request real Azure infrastructure and real Azure outcomes.

Prompts must:

- be written in an imperative, human delivery style
- describe the intended workload clearly
- request real Azure resources and constraints
- specify exact names, SKUs, outputs, and scope when needed
- stay compatible with production Azure deployment expectations

Prompts should sound like a real engineer or operator asking for a system, similar to the verified AWS prompts. They should focus on:

- the business problem
- the runtime behavior that must happen
- the infrastructure constraints that matter
- the file and output contract

Prompts should avoid teaching the model how to implement the solution in unnecessary detail. Avoid stuffing prompts with low-level framework instructions such as exact import paths, helper-resource construction patterns, SDK object-shape coaching, or other generator-side implementation hints unless that detail is genuinely part of the user-visible contract.

Prompts must not:

- mention GlobalStack
- mention emulation
- explain that deployment is local or cheaper
- tell the model to avoid unsupported behavior because of the emulator

## 4. IaC Quality Rules

Generated IaC must be production-grade Azure IaC.

It must use:

- real Azure providers and SDKs only
- real Azure resource hierarchies
- real parent-child relationships
- real output shapes
- deterministic naming only when the task requires it
- platform-native structure and conventions

It must not use:

- fake resource types
- custom providers invented for GlobalStack
- synthetic helper wrappers that exist only for local emulation
- relaxed schemas added just to satisfy tests
- made-up success paths

## 5. Unit Test Rules

Unit tests must validate Azure structure, not harness implementation details.

Unit tests are the place to prove configuration, structure, and semantic intent from the prompt specification. They should answer: "Did we build the right thing, and is it configured the way the prompt asked?"

They should check:

- required files
- resource types
- parent-child topology
- required properties
- outputs
- platform-native conventions
- exact resource names where the prompt fixes them
- explicit security and configuration settings named in the prompt
- structural and semantic validations in source code when the prompt requires behavior, such as route names, required fields, validation branches, payload shapes, or output-key contracts
- absence of prompt-forbidden or out-of-scope services where practical

They must not check:

- hidden GlobalStack folders
- runner-only files
- internal sidecar behavior
- emulator-only metadata

When a prompt names a specific contract, the unit tests should assert that contract directly from the source files instead of relying on copied expectations in metadata.

## 6. Integration Test Rules

Integration tests must validate live Azure-shaped behavior against the deployed bundle.

Integration tests should be structured in two phases:

1. service existence and deployed contract checks for every service explicitly listed in the prompt
2. live end-to-end behavior checks for every workflow or side effect explicitly claimed in the prompt

This ordering is required. Do not jump straight to workflow tests without first proving that the requested services were actually deployed and are readable through Azure-shaped APIs.

They should:

- use Azure-shaped management-plane or data-plane calls
- assert exact output keys and exact output values where the task defines them
- read back deployed resources by Azure resource ID or Azure-shaped route
- assert exact `name`, `type`, and other contract fields where available
- fail when the deployment contract is wrong
- start with service existence checks for every prompt-listed service
- check exact deployed contract details for those services where the prompt fixes names or properties
- then execute the live end-to-end flow and verify every claimed side effect
- verify negative-path behavior when the prompt claims failures such as `400`, `401`, or "must not create side effects"

They must not:

- use mocked outputs
- silently weaken assertions
- pass on partial deployment success
- replace exact checks with loose substring checks when the exact contract is available

If a prompt claims a sequence like "request comes in, resource A is written, resource B gets a message, workflow C runs," then the integration suite is not complete until it proves both the deployed service inventory and that full live sequence.

## 7. No Silent Relaxations

Do not make failing IaC look acceptable by weakening the test.

If a task fails, fix one of the real causes:

- the prompt
- the generated IaC
- the task-authored test
- the runner
- the emulator parity

Do not accept:

- mocked deployment outputs
- hidden fallbacks
- ignored stage failures
- broad catch-all assertions that stop checking the claimed behavior

## 8. Generic Parity, Not Task-Specific Hacks

If a task exposes a GlobalStack gap, the fix must improve shared Azure parity or shared runner behavior.

Acceptable reasons to change GlobalStack:

- the bundle exposed a real Azure parity gap
- the bundle exposed a runner or routing bug
- the bundle exposed a provider integration bug

Unacceptable fixes:

- per-task backend special cases
- scenario-specific success paths
- bundle-specific hidden mutations in the emulator

## 9. Dataset Hygiene

Before treating a bundle as training-grade, confirm that dataset-visible files do not leak runtime-only terms or wiring.

At minimum, scan for:

- `GlobalStack`
- `LocalStack`
- `localhost`
- `127.0.0.1`
- `4566`
- `4570`
- `GLOBALSTACK_`
- hidden token names

If those appear in prompt, IaC, tests, or task-facing docs, the bundle is not ready.

Allowed exception:

- `provider: GlobalStack` in metadata only

## 10. Acceptance Bar

A bundle is acceptable only if all of the following are true:

1. The prompt is Azure-only.
2. The model response is Azure-only.
3. The IaC is production-grade and uses real Azure semantics.
4. Unit tests check the real Azure structure claimed by the task.
5. Integration tests check live deployed Azure-shaped behavior.
6. The deploy uses native platform tooling.
7. No GlobalStack-specific terms leak into dataset-visible artifacts except `provider: GlobalStack` in metadata.
8. Any emulator or runner changes made to support the bundle are generic and reusable.

## Review Checklist

Use this checklist before accepting a new Azure IaC bundle:

- Is the bundle Azure-only from the model's point of view?
- Does the prompt ask for real Azure behavior?
- Does the IaC use only real Azure providers, resources, and relationships?
- Do unit tests validate structure without depending on harness internals?
- Do integration tests use live Azure-shaped calls and exact assertions?
- Did any fix improve shared parity or shared runner behavior rather than this one bundle only?
- Is there any trace of GlobalStack outside the allowed metadata provider flag?

If any answer is no, the bundle is not finished.
