# Open-source release readiness

This checklist tracks the first public development release. Passing local checks does not establish complete Azure compatibility or production cloud equivalence.

## Repository and contribution workflow

- [x] Prepare an Apache 2.0 license for owner review.
- [x] Provide a self-contained local quickstart and cleanup-verifying demo.
- [x] Add CI for Node.js 22 and 24 with a stable aggregate check.
- [x] Validate PR titles, branch conventions and required PR sections.
- [x] Add PR and issue templates, code ownership and dependency update configuration.
- [x] Define and synchronize 19 labels and release-note categories in versioned configuration.
- [x] Restore four command implementations that were replaced by self-import wrappers.
- [x] Check syntax in every module and reject direct self-imports.
- [x] Update compatible dependency versions to clear the observed audit advisories.
- [ ] Verify the new workflows on GitHub, including title edits and external contributions.
- [ ] Enable required checks and review rules before public release. The private repository plan currently blocks branch protection.

## Runtime and compatibility

- [x] Keep the local management API available without product activation.
- [x] Retain Azure-shaped request authentication and unsupported operation rejection.
- [x] Run captured expectations as individually reported tests in isolated servers.
- [x] Prepare storage provisioning state explicitly for provisioning-dependent replays.
- [x] Separate quota and namespace provisioning capture gaps from parameter validation.
- [x] Label roadmap estimates as checklist progress rather than measured compatibility.
- [ ] Rerun affected service E2E packs after validation changes, including valid and invalid alternatives.
- [ ] Rerun the full IaC platform matrix from a clean checkout.
- [ ] Validate the container image and document supported host architectures and resource requirements.
- [ ] Add durable management state or explicitly ship an ephemeral-only preview.

## Public distribution

- [ ] Approve the proposed license and confirm distribution terms for optional external runtime images.
- [ ] Review tracked files and history for private capture data and credentials.
- [x] Select a runnable ARM example that does not depend on a private verification repository.
- [x] Confirm a source archive works without Git metadata.
- [ ] Publish a tagged preview with exact supported operations and known limitations.
- [ ] Change repository visibility only after reviewing this checklist.

The verification corpus remains separate from the core quickstart. Optional third-party runtimes retain their own licensing and acceptance requirements.
