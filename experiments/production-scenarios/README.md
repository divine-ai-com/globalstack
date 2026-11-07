# Production scenario comparison work

Neither application scenario has completed deployment or end-to-end testing. The [specification](SPECIFICATION.md) defines both business flows, services, configurations, failure cases, lifecycle, cost controls and evidence requirements. The [requirements manifest](requirements.json) registers 50 document-processing and 51 financial-RAG assertions. All remain unexecuted at the full-scenario level. Component probes do not mark those application assertions passed.

## Captured findings

| Finding | Evidence class | Tracker |
| --- | --- | --- |
| Full Lucene fuzzy search does not return a known matching document | Local synthetic request/response | [#21](https://github.com/divine-ai-com/globalstack/issues/21) |
| An undefined vector field is silently accepted | Local synthetic request/response | [#22](https://github.com/divine-ai-com/globalstack/issues/22) |
| An index with two key fields is accepted | Local synthetic request/response | [#23](https://github.com/divine-ai-com/globalstack/issues/23) |
| APIM returns route metadata without calling its configured backend | Local synthetic request/response; backend received zero requests | [#24](https://github.com/divine-ai-com/globalstack/issues/24) |
| Search authorization and tenant-isolation fidelity needs review | Private synthetic diagnostic evidence; no deployed-system compromise claim | [#25](https://github.com/divine-ai-com/globalstack/issues/25) |
| The Durable router synthesizes activity output rather than demonstrating a deployed worker executing the application | Static source finding, not an Azure-paired runtime result | [#26](https://github.com/divine-ai-com/globalstack/issues/26) |

[Local evidence](evidence/local-gaps.json) retains four public diagnostic checks. Authorization and isolation details are retained privately under SECURITY.md. These are required fidelity gaps for the proposed scenarios; the existing trusted-local-use documentation does not promise a production authentication boundary.

Run the public local diagnostics without Azure access:

```bash
node experiments/production-scenarios/local-gaps.mjs reports/production-scenarios/local-gaps
```

The diagnostic command intentionally exits nonzero while any checked capability is missing. CI verifies retained evidence and safety boundaries; it does not pretend these product gaps are passing tests.

## Recorded Azure-first validation comparison

One Bicep source compiles to a subscription template containing a resource group and a nested Search service. This is a foundation validation probe only. No resource creation, application deployment, inference or application integration is performed. Both targets receive identical compiled-template request bodies for each attempt. External emulator configuration supplies the matching subscription scope. Azure token acquisition is outside the comparison.

| Attempt | Azure observation | GlobalStack observation |
| --- | --- | --- |
| Required location parameter omitted, Template level | HTTP 400, `InvalidTemplate` | HTTP 404, `GlobalStackRouteNotImplemented` |
| Invalid Search name, Template level | HTTP 202 followed by a captured HTTP 200 completion | HTTP 404, `GlobalStackRouteNotImplemented` |
| Invalid Search name, Provider level | HTTP 400, `InvalidTemplateDeployment`, nested `InvalidServiceName` | HTTP 404, `GlobalStackRouteNotImplemented` |
| Corrected Search name, Provider level | HTTP 200, validation succeeded | HTTP 404, `GlobalStackRouteNotImplemented` |

These are four attempts exposing one absent validation operation, not four independent service-compatibility failures or a percentage of Azure coverage. Validation success does not establish deployment success. The invalid-name template-level success demonstrates why provider validation and actual provisioning must be distinguished.

[Final capture](evidence/validation.json), [timestamped events](evidence/validation-events.ndjson), [compiled template](evidence/compiled-template.json) and [video metadata](evidence/validation-recording.json) are retained with [digests and earlier attempts](evidence/index.json). Final source revision is recorded in the capture. Azure and local checks both verified that the proposed group and deployment record were absent. The original WebM and offline side-by-side replay remain in the operator workspace. No Azure Portal screenshot is present, and terminal recording is not Portal footage.

Earlier attempts remain separate: compiler invocation error, missing external subscription configuration, implicit validation levels, incomplete asynchronous observation, and a polling safety guard that rejected an observed subscription-level operation URL. Some earlier source is retained privately because it contained unresolved security diagnostics. Those attempts are diagnostic history, not final reproducible benchmark passes. Provider registration occurred between captures; do not attribute every historical change solely to code revisions.

To reproduce the live validation recording, supply the existing Azure CLI configuration, authorized subscription and an installed Playwright module/Chromium executable externally, then run:

```bash
node experiments/platform-lifecycle/walkthrough.mjs --validation-only
```

Required environment names are `PAIRED_AZURE_CONFIG_DIR`, `PAIRED_SUBSCRIPTION_ID`, `PAIRED_PLAYWRIGHT_MODULE` and `PAIRED_CHROMIUM_EXECUTABLE`. The validation runner requires a clean checkout and 40 GiB free. It uses `globalstack/validation-runner:cli-pinned`, records its image digest, and invokes the bundled Bicep compiler. ARM requests after compilation are direct HTTP observations, not a capture of native `az deployment` traffic. The runner does not create paid service resources. Never infer full scenario completion from its process exit code; inspect the separate status/code parity, terminal-state, absence and evidence fields.

## Preflight state and next work

Read-only preflight found no deployed resources and initially unregistered required providers. Registration requests were subsequently submitted for the twelve providers needed by scenario 1. A repeated Cost Management query returned no reported month-to-date rows after an initial HTTP 429. That is not proof of zero accrued charges or a real-time budget guarantee. Search Basic pricing was retrieved from Azure's retail API; the complete architecture still needs a bounded, SKU-specific cost sheet before paid provisioning. The total authorized ceiling is USD 150.

The following remain required: actual application code and container images, effective identity/network configuration, safe full-stack ownership/cleanup controls, Azure deployment and live event-flow captures, equivalent local runtime execution, fixes for measured gaps, Portal evidence, and subsequent scenario 2 execution. No paid license or trial will be purchased. The Cosmos-backed application dashboard replaces Power BI at the owner's instruction; Power BI is not evaluated.
