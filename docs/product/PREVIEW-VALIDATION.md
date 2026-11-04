# Preview validation

Validated locally on 4 November 2026 with Node.js 22.23.3 and npm 10.9.9. These results describe the tested source snapshot, not complete Azure compatibility.

| Check | Result |
|---|---|
| Workspace build | Every declared JavaScript module checked for syntax; direct self-imports rejected |
| Local conformance suite | 541 passed; one Kubernetes runtime test skipped by explicit default policy |
| Docker-enabled conformance suite | 542 passed, zero failures or skips |
| Existing GCP unit tests | 16 passed |
| Repository policy regressions | 5 passed |
| Restored Azure deploy smoke | 5 of 5 cases passed |
| ARM quickstart | Template deployment, resource ID output, identity readback, unsupported resource rejection and verified cleanup passed |
| Container | Image built and the ARM quickstart passed against its management endpoint |
| Source archive | Extracted without Git metadata; ARM quickstart and deploy smoke passed without the optional verification corpus |
| Workflow lint | All workflows passed actionlint 1.7.12 |
| Dependency audit | Zero reported vulnerabilities after compatible lockfile updates |
| Hosted CI | Node.js 22 and 24 passed on main and the first PR; PR policy and automatic labeling passed |
| Labels | 19 maintained labels synchronized; three unused defaults removed |
| History recovery | Complete 248-commit development history preserved in a verified private Git bundle |

The default CI lints workflow definitions with a checksum-pinned actionlint binary and runs the local suite on Node.js 22 and 24, the GCP unit tests, repository policy regressions, dependency audit and ARM quickstart. Container build, real Kubernetes execution, service E2E packs and the complete native IaC platform matrix are separate checks.

The Kubernetes test creates local containers and was rerun explicitly for this validation. Ordinary PR checks do not download Kubernetes images. All test-owned containers were removed after the runs. Shared workspace free space remained above the 40 GiB floor.

The complete native provider matrix and affected service E2E packs have not been rerun for the release preparation changes. Public release readiness is tracked in `docs/product/OPEN-SOURCE-READINESS.md`. Model API calls and paid Azure resources were not used for these checks.
