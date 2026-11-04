# GlobalStack technical paper draft

[Read the PDF](paper.pdf) or edit [the LaTeX source](paper.tex). Author names and affiliations are intentionally unset. This draft has not been submitted to arXiv.

The draft describes a scoped local preview. Its new evidence consists of two first-party HTTP scenarios with eight episodes, a native matrix with one sample per platform, and cleanup checks. The three pinned upstream templates are a separate source of fixtures. Neither group establishes live Azure equivalence.

## Evidence

- [Validation record](evidence/validation.json): native stages, observed versions, image identifiers, local suite results, execution scope, and limits.
- [Flow record](evidence/flows.json): synthetic inputs, correlated service requests, exact receiver payloads, negative controls, and cleanup.
- [Provider lifecycle operations](evidence/provider-lifecycles.json): individual operation checks, including repeated operations across platforms.
- [Complete pre-merge static-analysis report](evidence/codeql.sarif.gz) and [finding inventory](evidence/security-review.json).
- [Review record](REVIEW.md): manual review, CI and security evidence, remaining submission work.
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
```

The flow command writes a fresh report to `dist/cross-service-flows/results.json`. It does not overwrite the retained paper snapshot. No Azure account or model provider is used by these commands.

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
cd docs/research/globalstack
tectonic paper.tex
```

The evidence renderer checks the retained outcomes and generates table rows and numeric macros. It does not execute the emulator, validate every prose claim, or substitute for manual review. Tectonic may download TeX packages on its first run. A conventional LaTeX installation can also compile the source with `pdflatex` twice.

Before an arXiv submission, add author information, complete the submission checklist in the review record, and review the claims against the final retained artifact. Expanded live-cloud claims require new paired measurements and an updated artifact; changing the prose alone is insufficient.
