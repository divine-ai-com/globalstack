# Security and research release review

This document records the scope of the November 4, 2026 review. It is a release checklist, not a compliance certification or penetration-test report.

## Correction: November 4 security gate

The post-merge alert inventory exposed a defect in the original SARIF checker. CodeQL puts rule metadata in query-pack extensions, while the checker read only the driver's rules. The reported zero high or critical findings was incorrect. The actual report for `44807cbad6be7acdf50fe400788e8eab34d28b80` contained 41 open findings: 18 high, one critical and 22 medium. These findings require individual review; their presence is not itself proof that every reported path is exploitable.

The `v0.1.0-preview.1` release was moved back to draft. Its local functional results remain evidence for the recorded revision, but the release must not be presented as having cleared security review. The existing Git tag is retained for provenance.

PR 15 corrects metadata lookup, fails closed when rule metadata is missing or malformed, and verifies the parser against the actual CodeQL report. The corrected checker identifies all 19 high or critical findings. The full branch scan at runtime revision `42a6072e9ebb7e6669fa17fd2e1cc3a7c4f07bf1` reports zero high or critical findings and 19 medium findings, including the previously dismissed fixture-replay finding. The [individual review record](SECURITY-FINDINGS-2026-11-04.md) documents fixes and the remaining intentional data flows. No severity threshold was lowered and no scanner rule or directory was excluded. Post-merge validation is still required before publishing the replacement preview.

## Completed review and changes

- Scanned the restored Git history with Gitleaks 8.30.1. Reviewed 137 initial matches as synthetic resource names, code expressions, or the public Azurite development key. Recorded exact historical fingerprints rather than broad exclusions.
- Enabled GitHub secret scanning, push protection, vulnerability alerts, automated security updates, and private vulnerability reporting.
- Changed the full host emulator and generated optional backend port mappings to loopback defaults. Container-internal listeners remain configurable for Docker networking.
- Added an 8 MiB ARM body limit, request/header timeouts, malformed-URL responses, and generic internal-error responses. Regression tests cover limits, recovery after malformed URLs, and generated port bindings.
- Redacted subscription identifiers from two current lifecycle captures and corrected lifecycle sanitization. Historical commits retain the original identifiers; these are account identifiers, not authentication credentials. No additional history rewrite was performed.
- Improved the generic Azure capture command to redact structured secrets, account identifiers, cookies, email addresses, and common URL credentials. Unstructured CLI diagnostics and non-JSON bodies are omitted. Other capture paths are not covered by this change.
- Added Gitleaks, CodeQL security-extended analysis, dependency review, full dependency audit, and CycloneDX inventory generation to CI. The stable Security gate requires all component checks to pass.
- Added Apache-2.0 metadata to first-party package manifests. The source license does not replace third-party dependency or runtime-image terms.

## Validation evidence

The initial hosted security run passed secret scanning, dependency review/audit, and CodeQL security-extended analysis. The original severity summary was invalid because of the metadata-reading defect described above. PR-only alert views did not include the existing main-branch inventory. Future reviews must reconcile both views.

Local validation also exercised all ten full-emulator listener bindings, built the container, and deployed/read/deleted the ARM demo through the container. The test-owned container was removed. The dependency inventory is retained as a CI artifact for 14 days; retain a release-specific inventory alongside a future published release.

## PR 14 review follow-up

The CodeQL `js/file-access-to-http` finding [42](https://github.com/divine-ai-com/globalstack/security/code-scanning/42) was traced through the upstream-template test. The source is a pinned public Microsoft template whose SHA-256 digest is checked before use. The destination is the test-owned server bound to `127.0.0.1` on an ephemeral port. The test supplies synthetic values and a local development bearer token. Redirects are explicitly rejected. This is intentional local fixture replay, not disclosure of private files; the finding is classified as a false positive for this path only. No scanner rule or directory is excluded.

Manual event-flow review also found that deleting a scoped Event Grid subscription removed its management resource without unregistering runtime delivery. The PR now synchronizes scoped subscription creation, updates and deletion with the runtime. Regression tests prove correct delivery, non-delivery after deletion, delivery to a deliberately wrong destination, and recovery after restoring the correct destination.

A further manual regression check found that nested deployments could inherit the parent group's location when their target group differed. Location lookup now uses the target group, including groups declared later in the template, and a regression test covers both existing and newly declared groups.

Copilot could not complete its requested review because of quota limits. It is not counted as a completed review. The pre-merge procedure requires manual diff review and inspection of bot comments and code-scanning alerts on the final revision.

## Research and release gates

| Area | Evidence needed before a stable release or a corresponding paper claim |
|---|---|
| Runtime isolation | Test all parser limits, outbound URL handling, container privileges, Docker socket access, and cleanup ownership. Current emulation is for trusted workloads on isolated development hosts. |
| Privacy | Review every capture generator and fixture family. Confirm provenance, permission to redistribute, and removal of account identifiers, credentials, personal data, and proprietary payloads. Automated secret detection cannot establish this. |
| Dependencies | Review the generated SBOM and third-party license texts. Optional native dependencies may lack license metadata in the lockfile; do not treat an empty field as license approval. |
| Container distribution | Review each optional image's redistribution and EULA conditions. A source release does not establish permission to redistribute every referenced image. Pin and scan release images before publication. |
| Compatibility | Rerun the native IaC matrix and affected service packs. Local conformance results do not establish full Azure behavior. |
| Security evidence | Review CodeQL findings, including lower-severity alerts, and reproduce fixes. Record the exact code revision, tool versions, exclusions, and test scope in release evidence. |
| Research reproducibility | Publish task provenance, scenario counts, exact model identifiers, run configuration, scoring definitions, failures, and infrastructure limits. Separate measured results from planned evaluations. |
| Governance | Keep required checks active. Review CI, scanner exceptions, licensing changes, and credentials independently when another maintainer is available. |

The project does not claim SOC 2, ISO 27001, GDPR, or other regulatory certification. An arXiv submission is not a security audit. Publication claims must be limited to evidence actually collected.
