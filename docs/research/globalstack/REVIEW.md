# Draft review and submission checklist

This is a scoped technical draft. Author names and affiliations will be supplied later. No arXiv submission has been made.

## Claims review

- Native coverage means one reference configuration in each of nine platforms. Terraform and OpenTofu use AzAPI. No AzureRM claim is made.
- The two new cross-service scenarios are first-party tests and share the workflow engine. They are not two independently authored external workloads.
- The three Microsoft Quickstart templates retain original bytes, pinned provenance, digests, and their MIT license.
- The flow assertions inspect actual loopback HTTP requests and receiver payloads. Hostname routing is adapted by the harness. The final receiver is a test application.
- Four deliberately broken episodes fail their intended application outcome. Three still report workflow success. This is a constructed demonstration, not an estimated real-world failure rate.
- Cleanup checks cover management disappearance and the addressed service data-plane endpoint. They do not establish cleanup for every backend or background task.
- Counts from overlapping test suites are not added into a compatibility percentage. There is no statistical confidence or population claim.
- Principal tools and direct SDK versions are pinned, and the TypeScript dependency tree is locked. Mutable base tags, OS packages, installers, and Python transitives prevent byte-identical rebuild claims.
- Live Azure parity, production isolation, durable state, broad expression coverage, delivery retries, load capacity, and the full historical 30-service validator remain outside the measured result.

## Code and dependency review

The workflow evaluator change preserves literal JSON values and confines numeric/string argument parsing to supported expression operators. The resource-group deletion change calls the existing runtime deletion hook for resources in child-first order. The new HTTP flows exercise both fixes and restoration after wrong-wiring controls.

Adding the TypeScript sample lockfile exposed vulnerable `glob` and `minimatch` transitives. The sample now overrides them with pinned patched versions, and routine security CI audits that sample as well as the root workspace. The vulnerability threshold is unchanged. The license policy now permits BlueOak-1.0.0 and Python-2.0 after reviewing their notice requirements, plus a version-specific exception for the CC-BY-3.0 SPDX identifier data package. See the [dependency notices](../../../THIRD_PARTY_NOTICES.md). The native TypeScript sample passed all seven stages and cleanup after this dependency change.

The complete intermediate PR CodeQL report contained the same 19 raw medium findings documented in the [security review](../../product/SECURITY-FINDINGS-2026-11-04.md), with zero high or critical findings. The final PR revision is checked again before merge, including the complete static-analysis report and all PR comments. A green CodeQL job alone does not mean the raw report has no findings.

## Before submission

- [ ] Add author names and affiliations, confirm contribution and publication consent, and select the paper license.
- [ ] Review the final manuscript and artifact with someone who did not implement the scenarios.
- [ ] Decide whether to submit this as a scoped systems/engineering paper or add an independent workload corpus and live differential experiment for stronger empirical claims.
- [ ] Select an appropriate category or venue and review its current submission requirements.
- [ ] Create a stable source archive or tagged artifact for the exact manuscript evidence and verify all links and checksums.

The authorship and publication decisions above are deliberately deferred. They do not prevent merging the tested implementation or circulating a clearly marked technical draft.

## Recorded validation

The retained matrix contains nine passing samples, all seven stages per sample, 50 provider operation checks across the matrix, and successful cleanup. Local conformance reports 559 passes and one explicit Docker-dependent skip; repository checks report 19 passes. All six selected service packs passed. Both new HTTP scenarios completed their eight episodes and cleanup. The patched TypeScript dependency tree and root workspace each report zero known vulnerabilities in the recorded npm audit. The minimum free disk recorded in the final native runs was 103.25 GiB. No live Azure deployments or paid model calls were made.

The paper compiled with Tectonic 0.17.0. All six pages were checked through extracted text and rendered page inspection. Tables and numeric macros are regenerated from the retained JSON records. Authors remain unset.

## Pre-merge review record

At source revision `8f905e417f7b3d2b7a96bb9b9a3fd93b6046f003`, all required checks passed. The [complete security report](evidence/codeql.sarif.gz) and [finding inventory](evidence/security-review.json) retain the full pre-merge scan: zero high or critical findings and 19 raw medium findings. These match the existing reviewed finding set; main has 18 open medium alerts and one previously dismissed fixture-replay finding. No new code-scanning finding was introduced.

The full change was reviewed, including runtime hooks, expression handling, HTTP controls, generated inputs, dependency pins, license notices, manuscript formulas, and evidence provenance. Every one of the 240 locked TypeScript packages has an npm registry origin and SHA-512 integrity metadata. The ambiguous `@logdna/tail-file` license metadata was checked against the downloaded package LICENSE and is MIT.

Dependency review also reports low OpenSSF scores for ten transitives: `@jridgewell/resolve-uri`, `@jridgewell/trace-mapping`, `@logdna/tail-file`, `buffer-from`, `color-name`, `cssesc`, `debug`, `escalade`, `get-caller-file`, and `http-cache-semantics`. These warnings remain visible. The pinned tree passes the vulnerability audit and the native sample, but those checks do not resolve upstream maintenance risks. No scorecard threshold was lowered.

Copilot reported that it could not review because its quota was exhausted. That is not counted as a completed automated review. No extra credits were requested. There were no inline PR review findings at this review. Manual review and the existing required gates remain the basis for merging; comments and checks are checked once more on the final revision.
