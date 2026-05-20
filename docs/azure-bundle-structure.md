# Azure Bundle Structure

This document defines the preferred structure for training-grade Azure IaC bundles.

The goal is to keep bundles platform-native and Azure-shaped, while keeping execution wiring in the runner layer.

## Core Rule

Do not use `metadata.json` as a side oracle for the deployment contract.

If a value can be derived from:

- the IaC source,
- the deployed outputs, or
- live Azure-shaped readbacks,

then tests should use those sources instead of copying the same contract into metadata.

## What Should Not Live In `metadata.json`

Avoid storing deployment expectations such as:

- `expectedOutputKeys`
- `expectedOutputs`
- `integrationChecks`
- scenario-specific resource-name maps used only by tests
- duplicated resource topology already present in the IaC

Why:

- it duplicates the IaC contract outside the IaC
- it makes tests depend on a generator-side oracle
- it is not how real Azure repos are structured
- it makes bundles look harness-driven rather than platform-native

## What `metadata.json` Should Contain

Keep `metadata.json` minimal.

Allowed examples:

- `platform`
- `language`
- `provider`
- task descriptors
- stage command wiring when the runner still needs it

The one allowed dataset-visible GlobalStack reference remains:

- `provider: "GlobalStack"`

That field is the deployment-routing toggle and is allowed only in metadata.

## Output Contract

Integration tests should read deployed outputs from a runtime artifact such as:

- `flat-outputs.json`

The runner should generate that file after deploy. Tests should consume it instead of hardcoded expected-output maps in metadata.

## Test Inputs

Integration tests should use:

- `flat-outputs.json`
- Azure-shaped environment variables from the runner

Examples:

- `AZURE_RESOURCE_MANAGER_ENDPOINT` or `ARM_ENDPOINT`
- `ARM_SUBSCRIPTION_ID`
- `AZURE_ACCESS_TOKEN_PATH`
- `AZURE_LOCATION`
- `AZURE_RESOURCE_GROUP_NAME`

Integration tests should then:

1. load deployed outputs from `flat-outputs.json`
2. call live Azure-shaped APIs against the deployed resources
3. validate the real deployed contract from those outputs

## Unit Test Principle

Unit tests should read the source files directly, not metadata copies of those source facts.

Examples:

- Bicep unit tests should read `main.bicep`, modules, and parameter files
- Terraform unit tests should read `main.tf`, `variables.tf`, `outputs.tf`, and provider files
- Pulumi unit tests should read `Pulumi.yaml`, `package.json`, and source files such as `bin/` and `lib/`

## Preferred Platform-Native Layout

### Bicep

Prefer a structure closer to:

- `main.bicep`
- `modules/...`
- `main.<env>.bicepparam` or `parameters/...`
- `test/...`

### Terraform

Prefer a structure closer to:

- `main.tf`
- `variables.tf`
- `outputs.tf`
- `providers.tf` or `versions.tf`
- `test/...`

### Pulumi

Prefer a structure closer to:

- `Pulumi.yaml`
- `package.json`
- `bin/...`
- `lib/...` or `src/...`
- `test/...`

## Runner Responsibilities

The runner should generate runtime artifacts, not embed expectations into the bundle.

Preferred runtime artifacts:

- `flat-outputs.json`
- `execution.log`
- `execution-report.json`

Those are runtime products of deployment and validation. They are a better boundary than metadata-encoded expectations.

## Acceptance Rule

A bundle is closer to the intended design when:

1. source structure follows the native platform convention
2. unit tests read source files directly
3. integration tests read `flat-outputs.json` and Azure-shaped env
4. metadata stays minimal
5. deployment expectations are not duplicated in metadata
