# Open-source release readiness

This checklist tracks the first public development release. Passing local checks does not establish complete Azure compatibility or production cloud equivalence.

## Repository and contribution workflow

- [x] Publish the source under Apache 2.0.
- [x] Provide a self-contained local quickstart and cleanup-verifying demo.
- [x] Add CI for Node.js 22 and 24 with a stable aggregate check.
- [x] Validate PR titles, branch conventions and required PR sections.
- [x] Add PR and issue templates, code ownership and dependency update configuration.
- [x] Define and synchronize 19 labels and release-note categories in versioned configuration.
- [x] Restore four command implementations that were replaced by self-import wrappers.
- [x] Check syntax in every module and reject direct self-imports.
- [x] Update compatible dependency versions to clear the observed audit advisories.
- [x] Verify hosted Node.js 22/24 checks, PR metadata validation and automatic labeling.
- [ ] Verify title-edit label reconciliation and external contributions after public release.
- [x] Enable public main-branch protection and required contribution checks.

## Runtime and compatibility

- [x] Keep the local management API available without product activation.
- [x] Retain Azure-shaped request authentication and unsupported operation rejection.
- [x] Run captured expectations as individually reported tests in isolated servers.
- [x] Prepare storage provisioning state explicitly for provisioning-dependent replays.
- [x] Separate quota and namespace provisioning capture gaps from parameter validation.
- [x] Label roadmap estimates as checklist progress rather than measured compatibility.
- [x] Rerun the affected local Key Vault, Event Grid and Logic Apps suites, including negative cases.
- [x] Pass all nine native sample lifecycles from clean checkouts on the reviewed runtime revision.
- [x] Validate the source and container quickstarts on Linux x86_64; document unmeasured resource minima and untested architectures.
- [x] Scope the preview to ephemeral management state.

## Public distribution

- [x] Define a source-only preview under the repository license.
- [ ] Confirm distribution terms before publishing optional external runtime images.
- [ ] Review tracked files and history for private capture data and credentials.
- [x] Select a runnable ARM example that does not depend on a private verification repository.
- [x] Confirm a source archive works without Git metadata.
- [x] Prepare the native matrix evidence, preview release notes and source distribution assets.
- [x] Publish the repository as a development preview after the initial credential review.

The verification corpus remains separate from the core quickstart. Optional third-party runtimes retain their own licensing and acceptance requirements.

Preview evidence and support boundaries are recorded in [the release notes](../releases/v0.1.0-preview.1.md). Published tags and assets are tracked in [GitHub Releases](https://github.com/divine-ai-com/globalstack/releases).

Security and research release gaps are tracked in [SECURITY-REVIEW.md](SECURITY-REVIEW.md). Public source availability does not mark the remaining stable-release gates complete.
