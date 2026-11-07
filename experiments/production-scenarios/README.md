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

Set `STORAGE_PROBE_VERSIONS=1` to additionally configure Blob versioning through
ARM and record immutable writes, historical reads, invalid selectors, attempted
historical updates, listing and deletion. The same sequence runs Azure first
and then locally, using version IDs returned by each target. Inspect
`versionObservations` and individual responses; completing the diagnostic is
not a claim that the responses match. It uses the same USD 1 run envelope and
ownership-checked account cleanup. It does not enable soft delete or retention.

The runner permits one Standard_LRS StorageV2 account, a USD 1 run envelope within
the existing USD 150 total, a 20-minute runtime and 10-minute cleanup reserve. It
rejects nonempty Azure inventory, restricts access to the runner IPv4 address,
keeps service keys in memory and installs an ownership-checked cleanup watchdog.
No paid add-on features are enabled. A completed capture can still contain
mismatches; inspect the responses rather than treating exit status as parity.

`STORAGE_PROBE_EVENTS=1` adds an Event Grid system topic, subscription and a
queue-scoped Storage Queue Data Message Sender role. One compiled Bicep template
and deployment body are used on both targets. The account retains its runner-IP
firewall and enables the trusted Azure services exception for managed-identity
delivery. This is a component configuration, not proof of full private-network
or authorization parity. The run remains within USD 1, including at most 100
event operations at the observed USD 0.60 per million rate, and creates no
Event Grid namespace or reserved throughput. Cleanup verifies the role, topic,
subscription, deployment, account and group are absent. Azure Retail Prices
API rates were checked on 2026-11-07; the free event grant is not needed for the
envelope. [Identity delivery requirements](https://learn.microsoft.com/en-us/azure/event-grid/deliver-events-using-managed-identity)
and [Storage event schema](https://learn.microsoft.com/en-us/azure/event-grid/event-schema-blob-storage)
define the intended route. A Storage Queue destination does not replace the
required real Functions destination in the complete document scenario.

The [first paired eventing attempt](evidence/blob-events-c806558/) failed before
upload: Azure returned a managed-identity delivery authorization error, while
GlobalStack rejected the queue-scoped role assignment. Cleanup verified every
owned cloud resource absent. The next runner retains deployment-operation
errors and permits at most three unchanged submissions, with a two-minute delay
only after this specific authorization error and verification that the topic
identity has the expected sender role at the exact queue scope. It does not
broaden permissions or classify propagation as established before a successful
repeat. Azure documents [delayed role visibility](https://learn.microsoft.com/en-us/azure/role-based-access-control/troubleshooting#role-assignment-changes-are-not-being-detected);
that is a hypothesis for this capture, not its measured cause.

The first Storage capture still lacked Table batch transactions. Remaining
limitations include bounded Table queries and Blob version operations, application identity/private
networking, real application deployment, and durable recovery across emulator
restarts. Both full scenarios remain unexecuted.

A later [local diagnostic](evidence/version-selection-368fc33/) found that
`versionid` selectors were ignored: reading a nonexistent version returned
current content, and deleting it removed the current blob. An initial guard
rejected version and snapshot selectors with HTTP 501. The subsequent
[Azure baseline](evidence/version-baseline-97a7821/) records version retention,
selection, listing and deletion, including rejection of historical mutations
and deletion of the current version by ID. Local version activation failed in
that baseline; its successful Azure operations are not paired passes.

The router now applies ARM's boolean versioning setting to its data plane.
It retains immutable versions on BlockBlob writes and metadata changes,
supports historical GET/HEAD/DELETE and flat listing with prefix, versions,
metadata and scoped pagination. Deleting the root retains its history.
Account refresh preserves versions; container deletion removes them. Snapshot,
soft-delete, retention-policy and restart-durability parity are not established.
Snapshots and unsupported listing options remain explicit failures. Local
regressions replay the captured Azure decisions with new identifiers, and the
native Blob SDK exercises the document adapter against the router. The
[fresh paired capture](evidence/versions-after-2d66061/comparison.json) matches
22 selected version contracts: status, logical error code, retained bytes,
ETag/version relationships and selected listing fields. One error-header
difference remains in that recording. Both targets completed the sequence and
Azure account/group absence was verified. Full messages, other listing fields,
timing and broader protocol parity are not included in this count. Reproduce
the comparison with `compare-blob-versions.py CAPTURE OUTPUT`; a deliberately
wrong revision, missing operation or malformed listing must fail comparison.
The full live application flow and Portal evidence remain outstanding.

The Blob event component retains three distinct revisions. The
[queue-scoped role capture](evidence/blob-events-92b05a7/) failed Azure
managed-identity destination authorization on three unchanged submissions.
The [account-scoped role capture](evidence/blob-events-fc6c225/) succeeded on
Azure and delivered a correlated BlobCreated event into Storage Queue.
GlobalStack still rejected the unsupported child subscription in that capture.
All six cloud cleanup assertions passed. These are component observations,
not completed document processing scenarios. Account scope changes only the
Sender role on the temporary experiment account; it is not a broader role.
The failed queue-only runs do not establish a universal Azure rule. Setup with
only a queue-scoped role remains explicitly unsupported locally until that
case is resolved; delivery can use a queue-scoped grant after setup.

The [fresh comparison after implementation](evidence/blob-events-after-2ee7731/comparison.json)
checks the recorded deployment inputs, configured identity/source/destination
references and actual queue event correlations on both targets. Both delivered
the event and all cloud resources were removed. Azure's first attempt failed
authorization and its unchanged retry succeeded. GlobalStack returned immediate
success. The observed queue polling windows were 4376 ms and 4 ms respectively;
these are single observations, not latency distributions. Deployment lifecycle,
retry timing and role-propagation parity remain unresolved. Reproduce the
selected comparison with `node compare-blob-events.mjs RESULT_JSON OUTPUT_JSON`.
Its tests reject missing queue events, changed bytes/templates/identities,
nonterminal deployment state and incomplete cleanup even if a summary says pass.

The local implementation now uses the deployed system topic, subscription,
role assignment and queue state to route PutBlob/DeleteBlob events. Tests
exercise actual signed Blob and Queue HTTP requests, filtered and rejected
writes, ETag/size correlations, role revocation/restoration, firewall denial,
retry exhaustion and subscription removal. Queue messages use the base64
Event Grid representation observed on Azure. Basic type and subject filters
are supported. Advanced filters, other destinations, dead-letter destinations
and expiring subscriptions fail explicitly. Retry state is in memory, uses a
bounded local schedule and does not establish Azure timing or restart parity.
This component contains only a Storage account and its event path;
Functions, scanning, SQL and Search are still separate outstanding stages.

Encoded queue payloads are decoded for identifier redaction and re-encoded in
public evidence. Capture indexes distinguish these public copies from original
operator-held streams and video hashes. No recording is labeled as Portal
evidence unless it was captured from the actual Azure Portal.

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

## App Service quota preflight

The [recorded provider validation](evidence/web-validation-4a4ee94/) submits the
same Bicep-compiled hosting plan request to Azure first, then GlobalStack, in
West US 2, East US 2 and Canada Central. Azure returns HTTP 400 with nested
`SubscriptionIsOverQuotaForSku` for both P0v3 and EP1. Each regional limit is zero
and the requested capacity is one. GlobalStack returns HTTP 501 with
`GlobalStackValidationNotImplemented` for `Microsoft.Web/serverfarms`.
Neither target created a resource group or deployment record.

This blocks the selected Azure hosting configuration. A subscription quota
constraint is separate from a general IaC validation rule; the emulator must
not reject all otherwise valid plans merely to reproduce this account's limit.
A configurable quota model and Web provider validation remain separate gaps.
The application and local-runtime work can continue while quota is resolved.

To repeat this no-provisioning probe, set `VALIDATION_COMPONENT=web` with the
existing validation environment and run the walkthrough with `--validation-only`.
A successful runner exit means the capture and absence checks completed. It does
not mean Azure accepted the plans or that either application passed.

A request to Microsoft, if authorized separately, should ask for **one Linux
P0v3 App Service instance and one Linux EP1 Functions Premium instance in West US
2**, with no support-plan purchase or paid commitment. Explain that the account
has zero current usage and zero limit, and attach the sanitized validation
responses. These are short-lived document-processing research deployments under
the existing USD 150 total experiment limit. Requesting quota does not authorize
additional spending. The later request outcomes are recorded below; the proposed limits were not approved.

## Function App refresh regression

A local lifecycle regression found that repeating `PUT Microsoft.Web/sites`
replaced the Function router's application object. A previously available HTTP
route returned 404 and the same reset also discarded trigger registrations,
Durable instances and deployment records. The fix preserves the existing
application object while refreshing host metadata; explicit deletion still
removes it. The regression exercises unchanged PUT, a tag update, retained
running-instance history, deletion and recreation through the ARM/data-plane
servers with independent names.

This checks the existing metadata router. It does not establish native worker
execution or Azure-host parity. Web site PATCH remains unsupported, and the
local plan validator still supports only the bounded Y1 Dynamic configuration.
The required P0v3/EP1 plans must not be advertised as supported on the basis of
this lifecycle fix. Live Azure Web comparison remains blocked by subscription
quota. See issues #26 and #27.

## Quota request outcome

The owner authorized the free quota requests after the failed hosting preflight.
Microsoft.Quota API `2023-02-01` accepted both requests asynchronously, then
returned terminal `ResourceNotAvailableForOffer` for a new limit of one P0v3 and
one EP1 instance in West US 2. The Support API attempt separately failed with
`InvalidSupportPlan`; no ticket was created. No plan was purchased or upgraded,
and the USD 150 spending ceiling is unchanged. The sanitized
[operation outcomes](evidence/web-quota-requests-20261107.json) retain the request
IDs. Manual free quota review or an eligible subscription is still needed.
Newer quota API versions returned a misleading missing-registration error even
after provider registration; the supported older version exposed the real
quota records and terminal decisions.

### Hosting validation after subscription upgrade

The owner upgraded the subscription. The [fresh paired validation](evidence/web-validation-upgraded-998c058/)
now records Azure accepting the unchanged template in West US 2. East US 2 and
Canada Central still report zero quota. GlobalStack continues to reject provider
validation for `Microsoft.Web/serverfarms` with HTTP 501. All group/deployment
absence checks passed. This is validation evidence, not resource provisioning.

`node experiments/platform-lifecycle/walkthrough.mjs --web-component` captures
one Linux P0v3 and one EP1 hosting plan in West US 2, using the same external
Azure/Playwright settings as the other recordings. It compares creation, reads,
unchanged PUT, tag update, an explicitly invalid SKU update, state preservation
and cleanup. No Function App or ingress application is deployed by this probe.

The hosting run envelope is USD 1 within the authorized USD 150 total. The shared
ledger described below retains a conservative USD 20 allowance for earlier work
plus every subsequent component reservation. These allocations are not measured
billing. West US 2 retail rates checked on 2026-11-07 are USD 0.0775/hour for
Linux P0v3 and USD 0.16/vCPU-hour plus USD 0.0114/GiB-hour for Premium Functions.
One EP1 has one vCPU and 3.5 GiB. The runner limits both plans to one instance,
permits 20 minutes of execution and 10 minutes of cleanup, and starts only with
empty Azure resource inventory and at least 40 GiB of local free space.
A detached watchdog checks exact resource IDs and ownership before deleting the
owned group; normal cleanup verifies both plans and deployment history absent.
No quota increase, account upgrade or application success is inferred from the
component runner's completion.

The [first actual hosting capture](evidence/web-hosting-abf979f/) successfully
creates both plans on Azure, repeats each PUT, updates tags and rejects an
invalid SKU without changing the accepted plan. GlobalStack originally returns
501 for valid plans and the invalid SKU. Both targets verify group and plan
absence after cleanup; Azure also verifies deployment-history deletion.

The subsequent local fix accepts the bounded single-instance Linux shapes,
normalizes the captured SKU fields, and returns the captured invalid-SKU error
without mutating existing state. Replay tests use independent resource names and
a second invalid SKU string. Wider plan configurations remain explicitly
unsupported. No native application execution or full protocol parity is claimed.

The [fresh attempt after the hosting fix](evidence/web-hosting-throttled-4cabc7d/)
was blocked by Azure provider throttling. One plan succeeded; the other returned
an App Service creation error 429 while ARM still reported the parent and nested
operation as Running. The operator recorded the nested failure and canceled the
owned deployment. Both plan IDs, group and deployment history were subsequently
verified absent. The unchanged template was replayed locally, but this is not a
successful fresh paired validation of the fix.

The runner now inspects nested provider operations every 15 seconds and stops
on this throttling response so ordinary cleanup can cancel outstanding work.
Tests cover the actual retained nested response and ownership-checked teardown.
A [subsequent live retry](evidence/web-throttle-guard-7638f46/) verifies the
automatic path: Azure throttles creation again, the runner detects the nested
response, cancels the owned deployment with HTTP 204, and verifies the group,
both plans and deployment history absent. This attempt consumes its conservative
USD 1 allocation and leaves no unresolved cleanup hold. It is a verified failure
handling path, not a successful paired hosting or application run.
The account constraint and its proof are tracked in [#36](https://github.com/divine-ai-com/globalstack/issues/36);
the bounded emulator fix is tracked separately in [#35](https://github.com/divine-ai-com/globalstack/issues/35).

A [later hosting recheck](evidence/web-throttle-a2ec5ef/) at 14:29 UTC on
2026-11-07 again returned nested provider 429 for EP1. Automatic cancellation
and all cleanup checks completed. Further paid hosting retries are deferred
pending resolution of the subscription limit. The earlier authorization for a
free quota review still covers one P0v3 and one EP1 instance in West US 2;
it does not authorize paid support or a higher experiment allowance.
The [post-upgrade free-request follow-up](evidence/web-limit-followup-20261107.json)
was accepted asynchronously by the Support API, then failed with
`InvalidSupportPlan`. A final lookup returned 404, so no support ticket was
created. The artifact retains the contact-free request text for the Portal's
free quota route. No support plan was purchased.

Set `PAIRED_WEB_REGION=northeurope` to test the alternative region. Its quota
listing conflicts with provider validation, as documented below. The [retained retail prices](evidence/hosting-prices-20261107.json)
are USD 0.084/hour for P0v3, and USD 0.167/vCPU-hour plus USD 0.0119/GiB-hour for
EP1 in North Europe. Both targets receive the same region parameter. Regional
availability and quotas do not guarantee deployment success.

New hosting, Search and Storage runs reserve their respective USD 1, USD 2 and
USD 1 envelopes in the same private
`reports/production-scenarios/budget-ledger.json` before provisioning. The ledger
starts with a conservative USD 20 allowance for earlier work, enforces the
USD 150 aggregate ceiling, blocks overlapping allocations until cleanup is
verified, and never refunds an envelope automatically from delayed billing.
It is an execution guard, not an Azure spending limit or a measured invoice.
If a watchdog performs cleanup after the runner exits, reconcile its verified
absence evidence before marking the ledger allocation cleaned up. Never delete
the ledger to bypass an exhausted allowance or unresolved cleanup.
Run paid comparisons from this one checkout. The file lock coordinates local
processes, not separate clones or machines. Cloud charges can outlive a run if
Azure delays deletion; the ledger is not a provider-enforced billing cap.

North Europe's quota API reported 30 instances for each SKU, but [provider
validation](evidence/web-validation-northeurope-6478043/) rejected both plans
with `SubscriptionIsOverQuotaForSku` and an effective limit of zero. Treat the
provider result as authoritative for this attempted deployment; the quota listing
alone does not authorize a run.

An [interrupted follow-up](evidence/web-interrupted-6478043/) was started before
that separate validation result had been inspected. The operator stopped it,
the watchdog verified cleanup, and a second ownership-scoped check confirmed
all resource and deployment IDs absent. The budget allocation remains retained.
This interrupted attempt is not a completed deployment comparison. The runner
now performs provider validation inside its own execution path, before allocating
budget or starting provisioning, and refuses rejected or incomplete validation.

The [live guard verification](evidence/web-preflight-guard-af998e5/) subsequently
records Azure rejecting the same North Europe provider-validation request and
GlobalStack accepting its bounded local shape. The runner makes no Azure PUT or
DELETE request and reserves no additional budget. All four Azure resource/group/
deployment absence checks return 404. This verifies the execution guard on an
actual rejection; it does not complete either application or resolve Azure's
account constraints.

The [Blob range comparison](evidence/blob-ranges-after-f35ea4f/) retains 21
Azure-first HTTP phases and their GlobalStack counterparts. Statuses match in
all 21 phases, with successful bytes and selected range/checksum headers checked.
One oversized-range error envelope still differs. The earlier
[capture](evidence/blob-ranges-before-d3e3ead/) preserves the original incorrect
full-body responses. Both cloud resource groups were removed and their absence
verified. These are bounded Storage contracts, not completed application runs.

The [native Event Grid capture](evidence/functions-native-events-3f4300f/)
records a Blob-generated event reaching the actual Functions trigger. The
trigger returns a visible failure because downstream settings are missing.
The worker, network and temporary management credential were removed. No Azure
Functions comparison or completed document workflow is claimed by this capture.

### Resource-group scoped automation

`scoped-preflight.mjs` checks access to an existing dedicated resource group,
inventories it, and compares provider validation of the same compiled Bicep
hosting template on Azure and GlobalStack. It never creates or deletes cloud
resources. An accepted validation is not a deployment or workflow pass.
Use `PAIRED_AZURE_CONFIG_DIR`, `PAIRED_SUBSCRIPTION_ID`, `PAIRED_RESOURCE_GROUP`
and an explicit private `PAIRED_RUN_DIR`. For certificate-based service-principal
sessions, set `PAIRED_AZURE_CERTIFICATE_FILE` to an absolute owner-private PEM
file containing the certificate and private key. The Docker CLI mounts it
read-only at `/credential/pilot-login.pem`, matching the path used at login.
Keep credentials and Azure CLI profiles outside this repository.

The older component runners create subscription-level deployments and disposable
resource groups. They require broader permissions and must not be used with a
resource-group-scoped identity. Their group-deletion cleanup must not be applied
to the persistent operator-created group. Resource-group scoped deployment and
ownership-checked individual resource cleanup are separate work still required.

`scoped-hosting.mjs` performs the next bounded lifecycle step using the same
certificate/session variables and existing group. It compiles
`fixtures/scoped-web-plans.bicep`, validates with Azure before reserving a USD 1
envelope, and records deployment, reads, repeated writes, tag updates and an
invalid-SKU attempt on both targets. It uses direct ARM deployment requests after
native Bicep compilation, not a native CLI deployment invocation. A detached
watchdog cancels active owned deployment work and deletes only the two plans
whose run/project tags match, then removes the owned deployment record. The
operator-created group is preserved. The runner requires an empty group before
starting and never treats provider validation as deployment success.

The [fresh scoped validation comparison](evidence/scoped-preflight-after-73b25e3/)
records HTTP 200 from both targets after fixing the missing resource-group action
route. The [original 501](evidence/scoped-preflight-before-14e4f4a/) is retained.
Both observations leave the cloud group empty. The
[native database adapter capture](evidence/functions-native-database-14e4f4a/)
verifies signed secret access, native PostgreSQL TLS and the negative certificate
and role-removal checks. It is a local adapter diagnostic, not a full workflow.

The [scoped live hosting attempt](evidence/scoped-hosting-throttled-8b3eece/)
passed Azure provider validation but both P0v3 and EP1 creation returned provider
429 with a subscription creation-throttling message. Cancellation completed;
both plan IDs and the deployment record returned 404, while the operator group
remained present. This uses a dedicated certificate-authenticated service
principal, so interactive sign-in is no longer the blocker. It does not resolve
the hosting restriction, prove plan deployment, or complete either workflow.

See [current execution status](STATUS.md) for the completion gate, blockers and
remaining full-scenario work. To inspect a retained HTTP comparison without
starting another run, execute `node experiments/production-scenarios/render-replay.mjs
<evidence-directory>`. Its `replay.html` embeds timestamped observations and labels
its scope and outcome. It is a replay, not a live recording or Portal screenshot.
