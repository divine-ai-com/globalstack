# Security and research release review

This document records the scope of the November 4, 2026 review. It is a release checklist, not a compliance certification or penetration-test report.

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

The initial hosted security run passed secret scanning, dependency review/audit, and CodeQL security-extended analysis. CodeQL reported zero high or critical findings; GitHub returned no code-scanning alerts for that analyzed PR revision. This is a scanner result, not proof that no vulnerabilities exist.

Local validation also exercised all ten full-emulator listener bindings, built the container, and deployed/read/deleted the ARM demo through the container. The test-owned container was removed. The dependency inventory is retained as a CI artifact for 14 days; retain a release-specific inventory alongside a future published release.

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
