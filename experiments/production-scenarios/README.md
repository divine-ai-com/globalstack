# Production scenario comparison work

Neither application scenario has completed deployment or end-to-end testing. The [specification](SPECIFICATION.md) defines both business flows, services, configurations, failure cases, lifecycle, cost controls and evidence requirements. The [requirements manifest](requirements.json) registers 50 document-processing and 51 financial-RAG assertions. All remain unexecuted at the full-scenario level. Component probes do not mark those application assertions passed.

Execution tracker: [#28](https://github.com/divine-ai-com/globalstack/issues/28). The [nine-platform resource-group matrix](../platform-lifecycle/LIVE.md) is background evidence for a different scenario.

## Captured baseline findings

| Finding | Evidence class | Tracker |
| --- | --- | --- |
| ARM subscription deployment validation is absent | Azure-first paired requests with template/provider validation and completion polling | [#27](https://github.com/divine-ai-com/globalstack/issues/27) |
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

## Partial fixes and retained comparison

Revision `4b40af6` adds side-effect-free subscription validation for inline
templates and Search service names. The [new paired capture](evidence/validation-after-4b40af6/validation.json)
preserves the same source fixtures and Azure-first request order:

| Attempt | Azure | GlobalStack |
| --- | --- | --- |
| Missing location parameter | 400 `InvalidTemplate`, parameter path supplied | 400 `InvalidTemplate`, same parameter path |
| Invalid Search name, Template | 202, then 200 completion | 200, synchronous completion |
| Invalid Search name, Provider | 400 `InvalidTemplateDeployment`, nested `InvalidServiceName` | Same status and error codes |
| Corrected Search name, Provider | 200 | 200 |

Both targets again confirmed that no group or deployment record was created.
This is matching validation decisions in four attempts, with an initial-status
difference in one attempt. It is not full protocol parity. Local asynchronous
completion, broader provider rules, quota and RBAC checks remain unsupported;
see the [implementation scope](../../packages/azure-control-plane/README.md).
Issue #27 stays open. The original baseline evidence is retained above and below.

Revision `c42af2e` rejects indexes with zero or multiple key fields and preserves
an existing index when an invalid update is rejected. Independent local
regressions cover both failure and corrected-input behavior. The
[repeated diagnostic](evidence/validation-after-4b40af6/local-gaps.json) now passes
the key-field check; fuzzy search, invalid vector queries and APIM forwarding
still fail. Issue #23 stays open until a live Azure data-plane comparison and the
affected application flow have been rerun. Neither application assertion set
has changed to passed.

[Updated events](evidence/validation-after-4b40af6/validation-events.ndjson),
[recording metadata](evidence/validation-after-4b40af6/validation-recording.json)
and [artifact digests](evidence/validation-after-4b40af6/index.json) accompany the
comparison. The recording contains live terminal/API observations, not Portal
screenshots.

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

### Runtime wiring and backend forwarding

Revision `905f53b` connects Search and API Management to the full emulator
entrypoint, synchronizes their ARM lifecycle and forwards APIM requests to an
actual backend for configured operations. Process-level tests cover correlated
delivery, a deliberately broken backend URL, recovery and deletion. The
[repeated local diagnostic](evidence/runtime-after-905f53b/local-gaps.json) passes
APIM forwarding and index-key checks. Fuzzy search and vector-field validation
still fail. These local results do not establish live Azure or full application
parity. The revised gateway fixture explicitly registers its GET operation.

### Bounded live Search component capture

`node experiments/platform-lifecycle/walkthrough.mjs --search-component` uses
the same environment variables as the validation recording. This command can
create a paid Basic Search service. Its USD 2 run allowance is part of the
owner-authorized USD 150 total, not an additional authorization. The recorded
Basic meter is USD 0.101/hour in East US 2 and West US 2, verified on 2026-11-07.
West US 2 is the default after a captured East US 2 capacity rejection; set
`PAIRED_SEARCH_REGION` to either verified region. The run permits 30 minutes plus a
10-minute cleanup reserve, one replica/partition, small synthetic documents and
bounded requests. It refuses to overlap an existing resource inventory.

The fixture temporarily permits only the runner's IPv4 address on the public
Search endpoint and uses service admin keys held in memory. This is a component
diagnostic configuration, not the final private-network/managed-identity
application architecture. Credentials and the runner address are removed from
recorded evidence. The complete architecture still needs its own priced plan.

A detached watchdog can cancel the owned deployment and remove its Search-only
resource group if the runner exits or exceeds its deadline. Both ordinary
cleanup and the watchdog verify ownership, reject unexpected resources and
verify resource/group/deployment-history absence. The private recovery manifest
contains the CLI config path and owned resource names, not an access token. Keep
that manifest if cleanup is incomplete; do not start another paid experiment.

The native Bicep compiler produces one template for direct ARM submission to
Azure first and GlobalStack second, including rejected Azure attempts. This is
not a recording of native `az deployment` traffic. Data-plane probes cover
invalid/corrected index schemas, indexing, fuzzy and vector queries, and index
deletion. Component results and videos cannot mark the 101 application
assertions complete or substitute for Portal screenshots.

Read-only preflight found no deployed resources and initially unregistered required providers. Registration requests were subsequently submitted for the twelve providers needed by scenario 1. A repeated Cost Management query returned no reported month-to-date rows after an initial HTTP 429. That is not proof of zero accrued charges or a real-time budget guarantee. Search Basic pricing was retrieved from Azure's retail API; the complete architecture still needs a bounded, SKU-specific cost sheet before paid provisioning. The total authorized ceiling is USD 150.

The following remain required: actual application code and container images, effective identity/network configuration, safe full-stack ownership/cleanup controls, Azure deployment and live event-flow captures, equivalent local runtime execution, fixes for measured gaps, Portal evidence, and subsequent scenario 2 execution. No paid license or trial will be purchased. The Cosmos-backed application dashboard replaces Power BI at the owner's instruction; Power BI is not evaluated.

## Native Functions storage and paired contracts

The pinned official Functions host executed the document application's HTTP health
function, then exposed missing Storage operations during Durable startup. The
[clean baseline trace](evidence/functions-storage-a813520/) retains its image ID,
source revision, request trace, sanitized host log and cleanup outcome. Worker
health is not orchestration or application success.

The [Azure-first Storage capture](evidence/storage-contracts-ecb7026/) records 25
paired data-plane requests. Container creation and duplicate rejection matched.
Conditional writes and leases did not preserve protected content locally; Table
Shared Key requests and queue creation also failed locally. The account and its
resource group were deleted and both absence checks passed. This is a direct API
diagnostic, not a native IaC lifecycle or Portal capture.

Subsequent local replay tests check the captured Blob status/error codes, lease
headers and protected content; Table create/duplicate/insert/query decisions;
and queue text, dequeue count and visibility behavior. Additional tests cover
competing conditional writers, lease expiry/break/release, invalid Table keys,
foreign partition filtering and stale queue receipts. They do not constitute a
second live Azure capture. Native-host diagnostics continue under
[issue #33](https://github.com/divine-ai-com/globalstack/issues/33).

To reproduce the live component recording with the previously described external
Azure/Playwright configuration:

```bash
node experiments/platform-lifecycle/walkthrough.mjs --storage-component
```

The runner permits one Standard_LRS StorageV2 account, a USD 1 run envelope within
the existing USD 150 total, a 20-minute runtime and 10-minute cleanup reserve. It
rejects nonempty Azure inventory, restricts access to the runner IPv4 address,
keeps service keys in memory and installs an ownership-checked cleanup watchdog.
No paid add-on features are enabled. A completed capture can still contain
mismatches; inspect the responses rather than treating exit status as parity.

Current limitations include bounded Table query support, missing Table batch
transactions, incomplete blob listing/versioning, application identity/private
networking, real application deployment, and durable recovery across emulator
restarts. Both full scenarios remain unexecuted.

The [second Storage capture](evidence/storage-updates-d16a469/) adds leased blob metadata and conditional Table replacement/merge, with 30 paired requests and verified cleanup. It confirms the earlier condition/lease/Table/queue fixes in a fresh Azure-first run and preserves the remaining update gaps before their correction. The subsequent [clean native-host probe](evidence/functions-storage-2fb0e55/) starts the Durable worker and acquires its host lease. Timer invocation then exposes missing application configuration in this deliberately storage-only probe. Neither a complete orchestration nor a document business flow is claimed.

### Native Durable Storage transactions

The [third Storage capture](evidence/storage-durable-92c1e82/) retains 39 paired
requests, including projected queries, atomic two-entity batches, rollback on a
conflict and rejection of mixed partitions. Two diagnostic requests omitted
JSON `Accept` and failed on Azure with `AtomFormatNotSupported`. Those failures
remain in the capture. Account and group deletion were verified.

The local Table implementation now supports a single JSON changeset with up to
100 operations and a 4 MiB body limit, conditional writes, transactional rollback,
projection, and bounded string-equality filters with `and`, `or` and parentheses.
Tests replay the Azure decisions and verify that concurrent stale writers cannot
both commit. Other filter operators, multiple changesets,
read batches and complete OData type/metadata fidelity remain unsupported.
These changes do not establish complete Table compatibility.

Run `FUNCTIONS_PROBE_ORCHESTRATION=1 node experiments/production-scenarios/functions-storage-probe.mjs`
to exercise the official Functions container against local Storage. This mode
intentionally omits downstream application settings and expects the real
orchestration to persist a failure after activity retries. Its success is a
failure-path runtime check, not a completed document pipeline. Host-only mode
remains available without that environment variable. Neither mode deploys the
Function App to Azure or supplies Portal screenshots.

The [fourth capture](evidence/storage-batches-b19f5cb/) confirms batch commit,
rollback, compound filtering, merge and deletion in a fresh Azure-first run.
It exposes two remaining query differences: `$top=0` and continuation after a
bounded page. The subsequent local implementation supports both. Local
continuation tokens have their own documented opaque encoding; exact token
bytes are not an Azure compatibility claim. Pagination tests follow the issued
token, preserve the filter/projection and check exhaustion and malformed tokens.
