# Production comparison status

Updated 2026-11-09. This is an execution checklist, not a paper result or release certification.

## Completion gate

Complete the two full business scenarios on Azure and GlobalStack with the same
IaC and application revision per attempt, external environment configuration,
recorded failures and fixes, actual event traversal, negative wiring controls,
lifecycle observations, Portal evidence, and verified cleanup. Repeat for every
requested platform. A component pass does not fill a full-workflow assertion.
Passing this finite suite would not prove universal Azure compatibility.

The requirements ledger currently contains 50 document-scenario assertions and
51 financial-scenario assertions. All 101 remain `not-run` for the full
applications on both targets. The earlier nine-platform empty-resource-group
runs are separate experiments. The complete scenario ports for Terraform,
OpenTofu, Pulumi TypeScript/Python/YAML, Ansible, Azure CLI, Bicep and ARM JSON
remain outstanding.

The first document data and eventing Bicep modules now compile with the pinned
CLI image. The data module now includes scoped pilot and worker Blob grants.
The paired runner has an ownership-checked watchdog for the document account,
topic, subscription, roles and deployments, with a USD 12 envelope. In the first
document-module deployment attempt, Azure accepted both modules; GlobalStack accepted
the data module but returned 501 for identity-based Event Grid dead lettering.
The [redacted comparison](evidence/document-event-azure-40e5521/) retains the
same compiled template hash. After the local fix, a clean-source replay with a
synthetic Function discovery adapter accepted both modules. The paired run's
automatic cleanup failed, then ownership-checked manual recovery and a fresh
Azure inventory verified the group empty. Actual Blob delivery on the corrected
revision remains untested. The local
[native Event Grid probe](evidence/native-event-discovery-d61025d/) discovered
the deployed Function without a manually written Function child resource and
observed its expected application failure. The complete document application
settings and downstream infrastructure remain unconnected. The corrected
dead-letter path has local role and persistence tests, but no Azure runtime
capture of dead-letter blob contents or timing.

The subsequent [paired document-infrastructure run](evidence/document-event-azure-ada3cf8/)
used the same frozen document template hashes with the actual native Functions
worker and scanner. Azure and GlobalStack both reached `Succeeded` for the
document data and Event Grid modules. The clean, harmless YARA and harmless
EICAR scanner calls matched. Azure scanner-policy changes took 42 and 37 seconds
to propagate; GlobalStack reflected each on the first check. Automatic teardown
and an independent Azure readback found the preserved group empty. This closes
the observed deployment 501 for that configuration, while actual Blob delivery,
dead-letter timing and the full document workflow remain untested. The next
paired run deployed the document modules on both targets but did not reach its
Blob upload. After an application-settings update, Azure retained the old
Function route list, then rejected fresh host keys with 401. A separate manual
check observed the health route available while the new upload route returned
404. The [bounded paired capture](evidence/document-upload-azure-0ac25f3/)
records the failure. Automatic cleanup and an independent Azure inventory both
confirmed zero pilot resources and deployment records. See [issue #67](https://github.com/divine-ai-com/globalstack/issues/67).
The runner now deploys document data before the worker app and supplies all
settings at first creation. The worker template uses Blob-backed Functions keys,
and the local provisioner verifies those keys against the native host. A
[clean-source local capture](evidence/document-upload-local-77d7294/) proved
the revised deployment order, managed-identity Blob upload, Event Grid match
and Function delivery attempt. The Function returned HTTP 500; the component
fixture lacks downstream application settings. This is not a paired
Azure runtime result or a full document workflow pass. The subsequent
[paired run](evidence/document-upload-azure-9a3a78a/) passed component checks
on the revised deployment order. Azure and GlobalStack both discovered the
document Functions and returned HTTP 201 for managed-identity Blob uploads.
GlobalStack matched the BlobCreated event and attempted native Function delivery,
which returned HTTP 500. Azure event metrics were unavailable, so actual Azure
event delivery was not established. Both targets matched the scanner decisions,
host-key denial, and scanner-policy revoke and restore outcomes. Automatic
cleanup and an independent Azure readback found zero resources and deployment
records. The full document workflow remains untested.
The next [clean local capture](evidence/document-event-diagnostic-b64dcfd/)
kept the production subscription and added a separate diagnostic subscription.
It observed BlobCreated delivery to a native Function and an ETag-correlated
marker written through managed-identity Blob access. The production handler
still returned HTTP 500. The subsequent [paired capture](evidence/document-event-paired-a21fb51/)
replayed the same diagnostic module on Azure and GlobalStack. Both targets
accepted the managed-identity Blob upload and recorded a diagnostic marker through
the native Event Grid Function. Azure system-topic metrics reported two matched
deliveries, one success and one failed attempt. Those metrics aggregate both
subscriptions and do not identify the failing endpoint. GlobalStack recorded
delivery to the diagnostic subscription and an HTTP 500 retry on the unchanged
production subscription. The production workflow remains incomplete, and no
full-workflow assertion is promoted from `not-run`. The detached runner stopped
while Azure deleted its managed environment, before writing its final result.
Independent Azure inventory later found zero resources and deployment records;
local managed containers were absent. The cleanup ledger was reconciled manually.
The authorized total was raised to USD 200 on 2026-11-08. The conservative
allocation ledger at that checkpoint totaled USD 169. A later PostgreSQL run raised it to USD 181. The first Search pilot reserved another USD 12. The owner then raised the ceiling to USD 225 on 2026-11-09. The second and third Search pilots each reserved USD 12. The owner then raised the ceiling to USD 300, leaving USD 83 unallocated. A read-only Cost Management query for the pilot group returned no current
usage rows; a subscription-wide query was denied to the pilot identity. Actual
Azure charges are therefore unmeasured, and the allocation ledger remains the
run gate.

The document Search and failure-queue templates now compile and deploy through
the local ARM runtime with scoped identity roles. A local Search regression
found that the application's tenant, clean-state, owner and group filter
returned HTTP 501. A bounded general filter evaluator now passes the clean,
unresolved, cross-tenant and denied-reader cases. The failure queue has not
yet been deployed to Azure as part of this scenario.
The document Search paired pilot ran Azure-first on 2026-11-09. Its identity
and data Bicep modules reached `Succeeded` on Azure and GlobalStack. Azure
rejected the Search module with `InvalidTemplateDeployment` because the pilot's
conditional delegation omitted the built-in Storage Blob Data Reader role for
the projection container. GlobalStack reported `Succeeded` for that same
template. A read-only check confirmed the missing role in the installed Azure
condition, and the [redacted summary](evidence/document-search-paired-20261109/summary.json)
records the stage outcomes. This is an operator setup error and a caller-specific
authorization mismatch, not a complete Search deployment comparison. The
delegated-role catalog now includes the missing role, and the operator updated
the existing Azure assignment. A read-only preflight now checks that condition
before the runner reserves budget or creates resources. See
[issue #78](https://github.com/divine-ai-com/globalstack/issues/78).
The subsequent [paired Search run](evidence/document-search-paired-20261109-retry/summary.json)
reached `Succeeded` for all three compiled infrastructure modules on both
targets. Azure returned HTTP 201 for both indexes, the managed-identity Blob
data source and the scheduled indexer. GlobalStack returned HTTP 201 for both
indexes and HTTP 501 for the data source. No Blob was uploaded or indexed, so
this proves object provisioning, not indexer execution or document flow. The
runner verified cleanup, and an independent Azure readback found zero pilot
resources and deployment records.
The [third paired attempt](evidence/document-search-paired-20261109-traversal-attempt/summary.json)
used a revised Search module that granted the pilot identity read-only query
access. All three compiled infrastructure modules reached `Succeeded` on Azure
and GlobalStack. Azure's first Search data-plane readiness request then returned
HTTP 401 with an empty body. No Search object or Blob was created through the
data plane, and no indexer ran. The cause of the 401 is not established. The
runner now refreshes workload tokens and allows a bounded retry of 401 during
readiness. Cleanup and an independent Azure resource inventory found zero
remaining test resources. The ledger is at USD 217 of the USD 300 ceiling;
actual Azure charges remain unmeasured.
The [fourth paired attempt](evidence/document-search-paired-20261109-token-guard/summary.json)
again reached `Succeeded` for the same three compiled modules on Azure and
GlobalStack. Search provisioning took long enough that the cached Search token
had nine minutes remaining. The pilot runner required more than fifteen
minutes, so it stopped before sending a Search data-plane request. This was a
runner guard error, not a measured GlobalStack divergence. The guard now accepts
a token with more than two minutes remaining and refreshes tokens before five
minutes remain. Tests cover this observed timing. Cleanup and an independent
Azure inventory found zero resources. The conservative ledger is now USD 229
of USD 300, with USD 71 unallocated; actual charges remain unmeasured.
The [fifth paired attempt](evidence/document-search-paired-20261109-traversal/summary.json)
passed the bounded document Search slice. All three compiled infrastructure
modules reached `Succeeded` on Azure and GlobalStack with matching template
hashes. Both targets returned HTTP 201 for two indexes, the managed-identity
Blob data source and the indexer. Both accepted clean and quarantine Blob
uploads, ran the indexer, returned the clean document in a query while excluding
the quarantined document, and removed the clean document after its soft-delete
marker was indexed. Both indexer status reads reported `success`. The
[redacted request trace](evidence/document-search-paired-20261109-traversal/data-plane-trace.json)
contains 29 Search and Blob calls. Automatic cleanup and a separate Azure
inventory check found zero task resources and deployment records. The run
reserved USD 12, bringing the conservative ledger to USD 241 of USD 300.
Actual Azure charges are unmeasured. This does not cover the document worker,
malware scanners, PostgreSQL metadata or the complete business flow.
The [sixth paired Search run](evidence/document-search-paired-20261109-wrong-container/summary.json)
repeated the positive projection path, then deliberately pointed a new indexer
at the quarantine container, where the Search service identity had no Blob
read grant. Azure accepted the data source (HTTP 201) but rejected indexer
creation (HTTP 401) with a managed-identity container-access message.
GlobalStack accepted both objects, then reported `transientFailure` after
indexer execution. Neither target indexed quarantine content. This is a
measured failure-stage mismatch. The local indexer now checks its Blob grant
when created and returns HTTP 401 for this case; a new paired run is required
to verify the correction against Azure. Cleanup and independent Azure inventory
were empty. The ledger rose to USD 253 of USD 300, with actual charges unmeasured.
The [seventh paired Search run](evidence/document-search-paired-20261109-wrong-container-retry/summary.json)
verified the correction. The normal indexing, quarantine exclusion and
soft-delete path passed again. For the deliberate wrong-container source, both
targets returned HTTP 201 when creating the data source and HTTP 401 with an
empty error code when creating the indexer. Both clean-index queries excluded
the quarantine document. The [redacted trace](evidence/document-search-paired-20261109-wrong-container-retry/data-plane-trace.json)
contains 36 Search and Blob requests. The Azure response appended a documentation
link absent from GlobalStack at the captured revision. The local response was
updated after capture to match this observed message; a later paired recheck
matched the HTTP 401 code and full message. Cleanup and independent Azure inventory
found zero resources. The ledger is USD 265 of USD 300, leaving USD 35;
actual Azure charges remain unmeasured.
The owner subsequently raised the total ceiling to USD 350 on 2026-11-09.
At that checkpoint, USD 85 was unallocated. Subsequent paid runs are recorded
below. Across the earlier three paired Search runs with live indexer execution, the clean
document was first observed after 14.397 to 14.634 seconds on Azure and
0.005 seconds on GlobalStack. Queries were polled at roughly five-second
intervals, so these are first-observation times, not exact indexing latency.
The [per-poll timing evidence](evidence/document-search-visibility-timing.json)
also records the delete observations. At the captured revisions, GlobalStack
executed the indexer synchronously when `search.run` was called. This measured timing gap
does not establish latency parity or scheduled-run timing; see
[issue #84](https://github.com/divine-ai-com/globalstack/issues/84).
The local runtime now accepts the run and executes the job on a later
event-loop turn. A deterministic local test holds
the job to verify that the document remains absent before execution. This
changes lifecycle ordering but is not a calibrated Azure delay. The subsequent
paired first-read probe below shows that the local job can still complete before
the first client status request.
The [paired async recheck](evidence/document-search-async-recheck-20261109/)
used the changed local runtime. Both targets accepted `search.run` with HTTP
202, later reported indexer `success`, indexed the clean projection, excluded
quarantine, removed a soft-deleted document and rejected a wrong-container
indexer at creation with the same HTTP 401 code and message. The runner did
not read status immediately after HTTP 202, so it cannot establish parity
for the intermediate `inProgress` state or indexing latency. Automatic cleanup
and an independent Azure readback found zero resources and deployment records.
The conservative ledger is now USD 301 of USD 350, with actual charges
unmeasured and USD 49 of allowance unallocated.
The paired Search runner now records the first status response immediately
after each accepted index and delete run, with the elapsed time to that read.
The [first immediate-status pair](evidence/document-search-immediate-status-20261109/)
found a narrower lifecycle mismatch. Azure's first indexing status read, about
1,033 ms after run acceptance, returned top-level `running` with no
`lastResult` or history. GlobalStack's first read, about 3 ms after acceptance,
returned top-level `running` but already had a completed `lastResult` and
history entry. Both targets eventually indexed, deleted and rejected the
wrong-container probe as expected. The first delete status read showed a
successful result on both targets, but that result could describe an earlier
run; it is not proof of immediate delete completion. This one pair does not
define an Azure latency distribution or justify a fixed local delay.
Automatic cleanup and independent Azure inventory found zero resources and
deployment records. The conservative ledger is now USD 313 of USD 350,
with USD 37 unallocated and actual charges unmeasured.
The local status model now leaves `lastResult` and history empty until the first
job finishes, then retains the previous completed result while a new job is
pending. A deterministic local test covers both states. This corrects the field
semantics seen in the Azure capture; it does not close the observed timing gap,
and no paid paired rerun has verified this revision.
The local Search indexer reads Blob state through an in-process store call.
The paired HTTP trace does not measure the internal Search-to-Blob request path
or token exchange on Azure, so it cannot support an internal wire-level parity
claim; see [issue #83](https://github.com/divine-ai-com/globalstack/issues/83).
The pilot runner records each Azure and local deployment stage, provisions
both Search indexes and the Blob data source/indexer, and attempts projection
upload, indexing, quarantine exclusion and soft deletion. It
reserves a USD 12 envelope within the authorized USD 350 ceiling. It refuses
a nonempty Azure inventory and retains a cleanup watchdog. The Azure pilot
session is restored in this workspace. Automatic cleanup verified zero
task-owned resources and deployment records; actual Azure charges remain
unmeasured. The former local data-source HTTP 501 has an implementation,
regression test and paired Azure traversal result for this bounded slice.
The local deployment readback omitted its submitted parameters, which kept
the ownership-checked cleanup from identifying the run. That response now
includes nonsecure parameter values and omits secure values; a local lifecycle
test verifies both cleanup and secret omission. Azure readback comparison is
still pending.
The Search module now gives its system-assigned identity Blob Data Reader only
on the clean-projection container. A shared provisioner defines separate push
and projection indexes, a managed-identity Blob data source with a tombstone
policy, explicit document-ID mapping, and a five-minute scheduled indexer.
Deletion markers contain no extracted text. The second paired Azure run
accepted those Search objects, while the local router then returned HTTP 501
for the data source. The local router now implements the bounded projection
path and passes indexing, deletion, quarantine exclusion and revoked-reader
tests. A local integration test deploys the compiled modules, sends signed
workload tokens through the Blob and Search HTTP handlers, and observes clean
indexing, quarantine exclusion and soft deletion. Paired Azure execution remains
open ([#75](https://github.com/divine-ai-com/globalstack/issues/75)).
The document ingress also emits multiword fuzzy queries as an all-`AND` Lucene
chain. The local evaluator previously rejected that valid application shape;
the bounded parser now returns the expected authorized hit and rejects other
Boolean forms explicitly. Live Azure comparison remains pending.
Key-disabled deployed Search services now refuse local requests when no
workload-token verifier is configured. A synthetic API key cannot authorize
the service in that configuration.
Native Service Bus AMQP message delivery remains missing ([#71](https://github.com/divine-ai-com/globalstack/issues/71)).

An [Azure-first Entra-only PostgreSQL validation](evidence/document-postgres-validation-3ee3c25/)
returned HTTP 200 while GlobalStack returned 501. The
[follow-up validation](evidence/document-postgres-validation-38e1f19/)
returned HTTP 200 on both targets without creating Azure resources. The
[paid deployment pair](evidence/document-postgres-paired-efb90ad/) then
reached `Succeeded` on Azure but failed on GlobalStack with
`MissingRequiredParameter`, because the local server PUT required a password
administrator. After a bounded creation fix, a
[local replay of the original Azure request](evidence/document-postgres-local-replay-f10ee8a/)
returned HTTP 201 and `Succeeded`; the server, administrator and database were
readable and local cleanup passed. Azure first-pass cleanup reported a stale
child inventory, but separate recovery verified zero resources and the
deployment record absent. The USD 12 allocation is cleanup-verified; actual
billing remains unmeasured. PostgreSQL TLS/Entra data-plane access, schema
initialization and the document worker path remain open ([#74](https://github.com/divine-ai-com/globalstack/issues/74)).
The database ARM template makes the pilot service principal an administrator,
but it does not create SQL roles for the worker and ingress identities. A
bootstrap procedure now prepares separate nonadmin Entra roles and grants only
the current application tables and operations. A local PostgreSQL privilege
test passes, including denied access for an unrelated role. The procedure has
not run against Azure or GlobalStack's PostgreSQL data plane, so the full
application remains blocked on that paired validation.

The [bounded SQL pilot](evidence/document-postgres-sql-paired-20261109/)
replayed the same frozen PostgreSQL Bicep template on both targets. Both ARM
deployments succeeded. A temporary single-IP firewall rule returned 202 on
Azure and 501 (`GlobalStackResourceTypeNotEmulated`) locally. Azure then
accepted the service-principal administrator's Entra SQL login over verified
TLS, ran the document schema migration, and returned all four expected table
names. The local in-memory ARM runner does not expose equivalent PostgreSQL
wire-protocol or Entra SQL access, so local SQL remains untested. Automatic
cleanup and an independent Azure readback found zero resources and deployment
records. The conservative allocation ledger is now USD 277 of the USD 350
authorized ceiling; actual Azure charges remain unmeasured. Worker and ingress
SQL roles, application document flow, and private networking are still open.
The local firewall gap is tracked in [#85](https://github.com/divine-ai-com/globalstack/issues/85),
while the broader PostgreSQL data-plane gap remains in [#74](https://github.com/divine-ai-com/globalstack/issues/74).
The [follow-up role pilot](evidence/document-postgres-roles-paired-20261109/)
deployed the same PostgreSQL and two managed-identity resources on both targets.
Azure created separate nonadmin SQL roles for the worker and ingress identities,
applied the document schema and verified the intended grants and ingress outbox
denial. GlobalStack again returned 501 for the temporary firewall rule, so its
SQL path was not attempted and the paired runner correctly exited nonzero.
Automatic cleanup and independent Azure inventory found zero resources and
deployment records. The conservative ledger is USD 289 of the USD 350 ceiling,
with actual charges still unmeasured. No application process used these roles.

## Latest scanner and worker checkpoint

The [completed paired Functions-to-scanner capture](evidence/worker-scanner-azure-ead706e/)
uses the actual deployed Functions handler and scanner on both targets. Missing
host-key calls returned 401. Clean text, a harmless YARA marker and a harmless
EICAR marker produced matching scan decisions and hashes. The worker's managed
identity reached scanner ingress on both targets. Revoking and restoring its
access took 37 and 36 seconds to affect Azure, respectively; local effects
were visible on the first check. The exact timings and traces are retained.
Azure cleanup verified the operator group empty after a roughly 24-minute
managed-environment deletion; the recording and replay completed. The video is
operator-only and contains identifiers, while the public event trace is
further redacted. It is a terminal/API view, not a Portal capture. This is a
component result, with all 101 full-application assertions still not run.

The [paired scanner capture](evidence/scanner-azure-143b1c1/) records matching
stable outcomes for three denial controls and three real ClamAV/YARA scan
requests. Azure took about 36 seconds to activate the temporary pilot policy and
37 seconds to restore the worker-only policy. Local policy changes were immediate;
those transition differences are retained. The Azure caller was the pilot, not
the deployed worker.

The [clean local worker capture](evidence/worker-scanner-95ddc68/) executes Azure
SDK commands inside the ARM-deployed native Functions container. Five checks
cover scanning, policy denial/restoration and TLS trust failure. This is not a
Functions event invocation or an Azure worker-to-scanner result.

Final Azure cleanup is verified in the separate scanner recovery trace. The
original 503 failure, watchdog timeout and provider/inventory inconsistency
remain visible. The conservative allocated total at that checkpoint was USD 97
of USD 150, not measured billing. Public video distribution and Azure Portal screenshots
remain outstanding.

The [local handler capture](evidence/function-scanner-08aabdd/) now also verifies
four actual Functions HTTP calls: unauthenticated denial, successful scanning
with matching input hashes, downstream denial, and access restoration. Cleanup
passed. This adds no full-workflow assertions.

The [first paired handler capture](evidence/worker-scanner-azure-8707add/) records
Azure scan success and local failure caused by inconsistent external tenant
configuration. The interrupted recording and separate verified cleanup remain
visible. The [non-default-tenant regression](evidence/function-scanner-df5b4fe/)
and the completed paired capture pass with the same application image after
correcting that configuration. Observation checkpoints and early local cleanup
preserve evidence during long cloud teardown.

Next: complete the Blob, Event Grid, Durable Functions, PostgreSQL and Search
path and its failure controls, then the financial workflow. The 101 full
scenario assertions and the full-scenario platform ports remain outstanding.

## Work verified in this session

- Certificate-authenticated service principal can access the dedicated test
  resource group through ARM and native Azure CLI. Credentials are outside the
  repository. Contributor is scoped to that group; it does not authorize
  deployment of role assignments or grant data access.
- Resource-group deployment validation now reaches the shared validator.
  [Before](evidence/scoped-preflight-before-14e4f4a/) and
  [after](evidence/scoped-preflight-after-73b25e3/) captures retain Azure-first
  responses for identical templates. Both targets accept the bounded hosting
  shape after the fix; no plan deployment follows from that result alone.
- The [scoped hosting attempt](evidence/scoped-hosting-throttled-8b3eece/)
  reached actual Azure creation and retained provider 429 for both plans.
  Cancellation and individual-resource cleanup verified both plans and the
  deployment record absent while preserving the operator group.
- The [authorized pay-as-you-go retry](evidence/scoped-hosting-success-c135f08/)
  provisioned both P0v3 and EP1 successfully on 2026-11-08. Both targets returned
  200 for reads, unchanged PUTs and tag updates, and identical 400 error bodies
  for invalid SKUs. The valid SKU and updated tag survived rejection. Azure
  cleanup verified both plans and the deployment absent. This clears the observed
  hosting creation blocker for this attempt, not the full application gate.
- Signed Key Vault secret reads enforce the implemented tenant, audience,
  signature and role scopes. The [native database diagnostic](evidence/functions-native-database-14e4f4a/)
  verifies secret access, PostgreSQL TLS, schema migration, certificate rejection
  and denial after removing the secret role.
- Search workload mode distinguishes schema management, document writes and
  reads. Tests cover index scope, wrong credentials and role removal. The
  [native SDK diagnostic](evidence/functions-native-search-efc981d/) retains
  write, read-only and revoked phases over verified TLS.
- Native SDK diagnostics execute inside the actual Functions image through
  `docker exec`. They do not prove a deployed Event Grid handler executed the
  full application. Native PostgreSQL is a fixture, not an ARM-created database.
- The CodeQL finding in the Key Vault challenge test was fixed with an exact
  comparison. No security threshold was reduced. Every pushed change remains
  subject to the PR's current checks.

## Fresh paired native worker result

The [paired worker run](evidence/document-worker-paired-4cb7a2e/) at revision
`4cb7a2e` deployed identical compiled host/app templates and the same application
image digest to Azure and GlobalStack. Both returned 200 with `worker: ready`
from the actual Functions application. GlobalStack resolved the ARM-created
user-assigned identity, storage and role assignments and provisioned its native
worker. The trace includes 156 local storage requests from the native host.

Azure cleanup verified resources, six scoped role assignments and both deployment
histories absent, while preserving the operator resource group. Local container,
network and private credential cleanup also completed. The conservative
cumulative budget envelopes are USD 57, all marked cleanup-verified. These are
not measured Azure billing totals.

The [local template diagnostic](evidence/worker-template-4cb7a2e/) independently
checks the deployment-driven identity/storage adapter. The paired result closes
the earlier Azure-200/GlobalStack-404 health mismatch. It does not establish
registry authentication fidelity, downstream service behavior, private-network
isolation, Portal screenshots or a completed business workflow.

## Native worker lifecycle evidence

At revision `75a2a62`, two clean-source local diagnostics passed:

- [Identity-based host storage](evidence/functions-host-identity-75a2a62/): the
  actual Node Functions image starts its Durable worker, acquires the host lease,
  accepts an orchestration and persists the expected application failure. Host
  storage requests use bearer tokens over verified TLS. The diagnostic omits
  downstream business settings, so no completed workflow is claimed.
- [Automatic worker lifecycle](evidence/functions-auto-worker-75a2a62/): an ARM
  site update starts the approved native container; health transitions from 503
  to 200. Native Event Grid discovery finds the actual handler and captures its
  expected 500/missing-configuration failure. Tags preserve the process,
  application settings replace it, an unapproved image fails closed, valid
  configuration recovers, and deletion removes the worker and returns 404.

Both diagnostics verified container/network cleanup. The lifecycle diagnostic
prepares identity and storage transport separately. General deployment-driven
transport is being validated next. These results do not complete the 101
business-workflow assertions or substitute for a fresh paired Azure run.

## Native worker storage authentication follow-up

Local regression tests now cover signed workload tokens for the implemented
Queue operations and Table operations. Queue Data Contributor is evaluated at
queue scope or an ancestor. Table Data Contributor currently requires service
scope or an ancestor, including for batches. Table-scoped grants and additional
Queue/Table data roles remain unsupported. Blob permissions do not grant Queue
or Table access. Tests exercise wrong signatures/audiences, wrong roles,
cross-account denial, conditional grants and immediate role revocation.

Storage account PUTs now propagate `allowSharedKeyAccess` to the data plane.
When false, signed Shared Key requests to Blob, Queue and Table return 403
`KeyBasedAuthenticationNotPermitted`; supported bearer access remains usable.
Blob account-key SAS is also rejected. User-delegation SAS is not implemented.
This follows the [Azure authorization setting](https://learn.microsoft.com/en-us/azure/storage/common/shared-key-authorization-prevent).
The regression checks disable and re-enable key access through ARM PUTs.
Storage account PATCH still returns `GlobalStackRouteNotImplemented` and needs
separate control-plane work.

These are local authorization results. They do not establish native Functions
host startup with identity-based host storage, automatic worker provisioning,
or either completed business workflow. No additional Azure deployment was run
for this change.

## External prerequisites

1. Hosting creation succeeded in the latest authorized retry. Earlier 429
   observations remain retained. Availability for other SKUs, regions and future
   attempts is not established by this bounded result.
2. The operator applied the conditional resource-group delegation. The live
   condition matches the approved 13-role/service-principal restriction. The
   [paired role catalog](evidence/workload-role-catalog/) verifies Azure creation,
   readback and cleanup for all 13 roles. GlobalStack initially rejected six
   valid role IDs; after correction, all 13 assignment round trips pass locally
   too. A separate group-role GET bug is fixed with independent-name tests.
   This clears the assignment prerequisite, not downstream data-plane
   authorization or directory application-registration permissions.
3. The operator completed the document API registration and role grants after
   the [directory preflight](evidence/directory-prerequisite/) rejected application
   creation by the pilot. A [live API token check](evidence/document-api-auth/) passed the unchanged application's
   read, upload and delete role checks. Wrong-audience and ungranted-role checks
   were rejected. This is authentication evidence, not a deployed HTTP workflow.
   The operator also completed the separate scanner audience registration. Its
   [live token diagnostic](evidence/scanner-api-auth/) passes signature and
   negative checks. Scanner ingress on Azure and delegated-user cases remain
   unverified. Local native scanner execution is under implementation in #55.
4. Establish a usable authenticated Portal capture channel. A logged-in tab URL
   is not a screenshot or browser-control capability. None of this session's
   HTTP replays is Portal evidence.

## Remaining implementation and measurement

The current paired worker supplies Storage and scanner settings for the
component probe. Code inspection of `document-app/adapters.mjs` shows that the
production handler also needs quarantine and projection container settings,
PostgreSQL connection and authentication settings, a Search endpoint and index,
and a Service Bus namespace and failure queue. The containers exist, but their
settings are absent from this component deployment. PostgreSQL, Search and
Service Bus are not provisioned by the current document modules. This explains
why the probe cannot be promoted to a full workflow; the exact exception behind
the production handler's HTTP 500 has not yet been captured. The next full
document run must provision those services, migrate the schema, configure
worker identity and data access, then observe a clean document from upload
through committed metadata and both Search paths before testing failure cases.

1. Finish the document scenario Bicep stack, package publishing and independent
   application probes, including scanner deployment, private networking, identity
   configuration, Key Vault, PostgreSQL, Event Grid, Service Bus and both Search
   delivery paths. Existing source components are not a complete deployed stack.
2. Complete GlobalStack runtime provisioning and reconciliation for the actual
   worker and downstream services. Operator-bound containers are not equivalent
   to IaC-managed worker lifecycle. Complete the unsupported token, AMQP,
   indexer and network paths without replacing them with always-success stubs.
3. Run the complete document lifecycle on Azure first, preserving every attempt,
   and replay each revision on GlobalStack. Include actual clean/malicious files,
   retries, duplicate/stale events, engine failures, isolation, update/delete,
   restart recovery, bad wiring, and cleanup. Measure pilot targets from traces.
4. Implement and deploy the financial RAG application and its complete IaC.
   Validate APIM-to-Container-Apps execution, ingestion, retrieval, model calls,
   Content Safety decisions, durable Cosmos audit and the agreed application
   dashboard. Use no purchased dashboard license. Quotas, model availability and
   model usage costs must be checked before reservation and provisioning.
5. Port the complete application deployments to the remaining requested
   platforms and capture each platform's real lifecycle, including idempotency,
   update, rejected changes and destruction. Preserve all platform-specific gaps.
6. Publish sanitized artifacts with source/tool/image versions, hashes, request
   and event traces, replayable observations and explicit missing evidence.
   Distinguish measured results from local regressions and future work in the paper.

## Budget and storage

The private cumulative ledger currently records USD 313 in conservative envelopes
against the USD 350 authorization, including the initial allowance for earlier
work. This is not measured billing or a provider-enforced spending cap. All ledger
allocations have verified cleanup, including independent reconciliation after the
interrupted paired event run. USD 37 remains unallocated under this conservative ledger.
The scoped hosting plans were removed. The operator's empty group is intentionally
retained for subsequent scoped runs.

The workspace had approximately 55 GiB free at the last check, above the 40 GiB
minimum. Diagnostic containers, internal networks and temporary private TLS files
are removed after each probe. Shared caches and unrelated workloads are retained.

## Document foundation comparison

The first native Azure CLI deployment created three managed identities and the
VNet with five subnets. The same compiled template returned local success but
all three identity reads returned 404. Selected VNet fields matched. The
[first comparison](evidence/document-foundation-before-c85eeea/) retains this
false-success observation and confirmed Azure cleanup. Resource and output copy
loops now have independent regression tests. Serial loops remain explicitly
unsupported, and the validation endpoint still reports copy validation as
unsupported. The [fresh paired run](evidence/document-foundation-after-53b8218/)
passes all four selected resource checks and confirms Azure cleanup. Deployment
output type casing differed (Azure capitalizes types). The serializer now
matches the observed String and Array types, with a regression test against
the retained Azure response. This latter correction has not had a fresh live run. No application traffic or effective network isolation is
established by this foundation test.

## Document worker runtime comparison

The [clean worker attempt](evidence/document-worker-runtime-0c09247/) published the
actual application image to a private registry and deployed it on one EP1 instance
with identity-based host storage. Azure returned `200 {"worker":"ready"}` from the
package's health route. Both local ARM deployments returned `Succeeded`, but the
local application route returned `404 FunctionNotFound`. No native container was
provisioned by the local deployment. Resources, six scoped roles and both deployment
records were removed from Azure; the operator group was preserved.

The preceding [subscription setup failure](evidence/document-worker-setup-c0940fc/)
and [transport failure](evidence/document-worker-transport-5f12442/) remain retained
as harness failures. Subscription setup is now checked before cloud mutation, and
capture requests use fresh sockets after blocking native CLI commands. The fresh
worker attempt passed both earlier failure points.

The ARM evaluator now resolves expression-based object keys used by Bicep identity
maps. An unprovisioned container Function App now fails explicitly instead of
serving simulated HTTP/SCM execution or generated host keys. These corrections have
local regression coverage. They do not implement automatic worker provisioning or
establish a live paired pass. Container lifecycle, native function discovery,
managed host-storage execution, event traversal and downstream services remain
required. No full-workflow assertion has been promoted from `not-run`.

## Scanner ingress comparison and cleanup recovery

The [scanner run at revision 2738c71](evidence/scanner-azure-2738c71/) deployed the
same compiled templates and frozen image to Azure and the native local runtime.
Missing tokens and wrong audiences returned 401 in both. The unlisted pilot
returned 403 in both. After an accepted policy update allowing the pilot client
and principal, Azure returned 403 for all three scanner requests while local
returned 200. This remains an unresolved mismatch tracked in
[#58](https://github.com/divine-ai-com/globalstack/issues/58).

Azure environment deletion exceeded the original 15-minute cleanup window.
The original report retains that failure. An ownership-checked recovery pass
removed the registry, identities and deployment records while waiting for the
remaining environment. Recovery verified the environment absent and the group
empty at 10:44:56 UTC. The original timeout is retained separately from recovery.
The next recorded comparison has started with cumulative conservative allocations
of USD 75, not measured Azure charges.
The full-workflow ledger remains unchanged.
