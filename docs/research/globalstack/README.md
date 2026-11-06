# GlobalStack technical paper draft

[Read the PDF](paper.pdf) or edit [the LaTeX source](paper.tex). Author names and affiliations are intentionally unset. This draft has not been submitted to arXiv.

The draft describes a scoped local preview and a configuration-fault experiment. The new study applies 12 mutations to two first-party HTTP scenarios, with connected and restored controls in three fresh-state repetitions (108 episodes). It compares five checking layers on identical traces. The earlier eight-episode record, native matrix with one sample per platform, and three pinned upstream templates remain separate evidence. None establishes live Azure equivalence.

A separate [native claims case](claims/README.md) now connects Terraform provisioning to observed Event Grid, Blob, Queue and Table behavior. Three fresh runs contain 21 episodes, with all 12 positives passing and all nine deliberately faulty episodes rejected. The case also exposed a Table insert defect that was corrected and rerun; it remains local evidence. The [research collaboration brief](RESEARCH-SUPPORT.md) specifies the next experiments and support needs.

The current research gap is evidence breadth, not a larger compatibility claim. Read the [research readiness checklist](study/READINESS.md) before describing the draft as ready for submission.

## Evidence

- [Validation record](evidence/validation.json): native stages, observed versions, image identifiers, local suite results, execution scope, and limits.
- [Flow record](evidence/flows.json): synthetic inputs, correlated service requests, exact receiver payloads, negative controls, and cleanup.
- [Provider lifecycle operations](evidence/provider-lifecycles.json): individual operation checks, including repeated operations across platforms.
- [Complete pre-merge static-analysis report](evidence/codeql.sarif.gz) and [finding inventory](evidence/security-review.json).
- [Review record](REVIEW.md): manual review, CI and security evidence, remaining submission work.
- [Fault-study protocol](study/PROTOCOL.md) and [complete results](study/evidence/results.json): all 36 case executions, 108 episodes, source digests, observed faults, controls, and cleanup.
- [Upstream provenance](../../../fixtures/upstream/azure-quickstarts/provenance.json): unmodified template source revisions and digests.

The previous [preview-2 record](../../releases/v0.1.0-preview.2.md) remains unchanged. Its numbers and source revision must not be silently substituted for this draft's newer evidence. Test-suite counts overlap and are not an Azure coverage denominator. Broken-control outcomes are expected failures of the application, while the corresponding regression tests pass by detecting those failures.

## Rerun the local checks

From the repository root, with the documented Node.js and npm prerequisites:

```bash
npm ci
npm run check:local
npm run test:repository
npm run test:services:local
npm run test:flows
npm run demo
node scripts/e2e/run-flow-study.mjs
node docs/research/globalstack/render-study.mjs
```

The flow command writes a fresh report to `dist/cross-service-flows/results.json`. The study runner writes checkpointed attempts and results to `dist/flow-study/results.json`, including failures, and exits nonzero if any attempt is inconclusive. It does not overwrite the retained snapshot. The study renderer checks the retained snapshot, not a fresh run. No Azure account or model provider is used by these commands.

The protocol and runner were committed before the first study at `803603e21bd0f2ed052e9fcc0663921015f46dd7`. That record remains in `study/evidence/initial-results.json`. Review found that trigger observations appeared in the following setup interval; the corrected run separates these observations. Its exact revision is recorded in `study/evidence/results.json`, along with clean-tree status and five source digests verified by the renderer. The intermediate corrected run is also retained as `study/evidence/setup-corrected-results.json`; its only untracked entry was a dependency-directory symlink. The final run used an ignored dependency directory and reports a clean tree. All three records have identical check vectors and totals. They are reported separately, not pooled into a larger sample. The study needs Node and the existing workspace dependencies, not native-client Docker images. The corrected run used a separate clean checkout on the same host with the existing dependencies. This is not independent reproduction.

## Rerun the native matrix

Docker and network access for tool downloads are required. Use the recorded source revision for the retained snapshot. Build the runtime and shared validation images:

```bash
npm run render
docker build -t globalstack/azure-emulator:local -f templates/emulator/Dockerfile .
docker build -t globalstack/validation-runner:terraform-pinned dist/platform-images/azure-terraform-hcl
for tool in opentofu cli pulumi ansible; do
  docker build -t "globalstack/validation-runner:$tool-pinned" \
    -f "docs/research/globalstack/toolchains/Dockerfile.$tool-validation" \
    docs/research/globalstack/toolchains
done
```

For each platform below, set the corresponding shared image. A sequential run uses less disk and memory than the recorded three-group run.

```bash
PROVIDER=GlobalStack PIPELINE_STAGE_SCOPE=full \
GLOBALSTACK_IMAGE_BUILD_STRATEGY=reuse \
GLOBALSTACK_RUNNER_IMAGE=globalstack/validation-runner:terraform-pinned \
npm run smoke:platform-runners -- --platform=azure-terraform-hcl
```

| Platform | Shared image suffix |
|---|---|
| azure-terraform-hcl | terraform-pinned |
| azure-opentofu-hcl | opentofu-pinned |
| azure-pulumi-ts, azure-pulumi-py, azure-pulumi-yaml | pulumi-pinned |
| azure-bicep, azure-cli-rest, azure-arm-json | cli-pinned |
| azure-ansible-yaml | ansible-pinned |

Each invocation writes `dist/platform-lifecycle-smoke-results.json`. Preserve it before starting another invocation, together with the platform's `reports/provider-lifecycle-response.json`. Do not archive credentials, token response files, or raw task working directories. Verify cleanup exit status as well as all seven stage results. Keep at least 40 GiB free; the recorded run started jobs above 43 GiB and stopped them below 42 GiB.

These recipes pin principal tools and direct sample dependencies. Ubuntu and Node base tags, operating-system dependencies, downloaded installer scripts, and Python transitive dependencies are not fully frozen. Shared-image validation does not establish successful builds of all standalone Dockerfiles. Image identifiers in the record are local build identifiers, not published registry artifacts.

## Rebuild the paper

The manuscript uses vector diagrams and color, with Palatino text and blue headings. Tectonic 0.17.0 compiled the retained PDF. From the repository root:

```bash
node docs/research/globalstack/render-evidence.mjs
node docs/research/globalstack/render-study.mjs
node docs/research/globalstack/render-claims.mjs
cd docs/research/globalstack
tectonic paper.tex
```

The evidence renderers check the retained outcomes and generate table rows, numeric macros, and the fault-study figure. They do not execute the emulator, validate every prose claim, or substitute for manual review. The study renderer also verifies source digests and concrete fault witnesses, and rejects missing attempts, unexpected outcomes, or inconsistent repetitions. Tectonic may download TeX packages on its first run. A conventional LaTeX installation can also compile the source with `pdflatex` twice.

Before an arXiv submission, add author information, complete the submission checklist in the review record, and review the claims against the final retained artifact. Expanded live-cloud claims require new paired measurements and an updated artifact; changing the prose alone is insufficient.
