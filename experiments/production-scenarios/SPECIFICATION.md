# Production scenario differential testing specification

Status: application experiments in progress, with bounded live Azure component captures and local runtime diagnostics. No complete deployment or end-to-end pass is claimed for either scenario. See [current execution status](STATUS.md) for measured work and remaining gates. The earlier nine-platform resource-group results are a separate experiment.

The objective is to run unchanged IaC and unchanged application artifacts on Azure and GlobalStack, preserve every attempted revision, and measure where their deployment and runtime contracts differ. The application must not inspect an emulator flag or change its business behavior by environment. Credentials, subscription, DNS, certificate trust, network routing and instance names are supplied externally. Every difference in those inputs must be recorded.

## Decisions and source material

The two user-supplied architectural blueprints are requirements references, not validated implementations. Their hashes are retained in `requirements.json`. On 2026-11-07 the owner selected ClamAV and YARA, delegated explicit pilot targets, authorized a USD 150 total Azure ceiling, and prohibited purchasing licenses or paid trials. The owner raised the ceiling to USD 200 on 2026-11-08, then USD 225 and USD 300 on 2026-11-09. Replace the Power BI display with an application audit dashboard backed by Cosmos DB; Power BI compatibility is explicitly excluded, rather than marked passed.

Use Bicep first for each scenario, compiling one immutable template per attempted revision and submitting the identical template to both targets with native Azure CLI commands. Complete scenario 1 before executing scenario 2. Subsequent Terraform, OpenTofu, Pulumi and Ansible ports are separate runs of the same application contract. A Bicep pass never stands in for those clients.

A managed architecture is not an administration-free architecture. PostgreSQL and Search retain capacity, maintenance, security and cost decisions. A small pilot cannot demonstrate unbounded scalability, regulatory compliance or universal Azure equivalence.

## Scenario 1: document processing and search

### Business flow

1. An authenticated client uploads through an App Service ingress/query application. Use the App Service option in the supplied VM/App Service alternative, avoiding a managed VM fleet. Assign a correlation ID and tenant identity. Validate file size and content type before accepting bytes.
2. Persist the upload in the private landing Blob container. Its blob version, ETag, tenant and content hash identify the processing revision. Never treat a fresh random UUID per delivery as deduplication.
3. BlobCreated reaches Event Grid. The subscription filters the correct storage account and container prefix, including the `/blobs/` segment, and starts a Durable Functions orchestration through a real Event Grid trigger. Do not also install an independent Blob trigger that double-processes the same file.
4. The deterministic orchestrator calls activities with bounded retries. Activities obtain the referenced blob version and invoke independent ClamAV and YARA scanners. Package the engines and pinned signature/rule versions in containerized workers. Azure Functions remains responsible for orchestration, scan decisions and relational writes; Container Apps supplies the native scanner binaries and resource limits. No always-clean simulation is permitted.
5. Both engines must finish successfully before a document is considered clean. Detection sends the file to a private quarantine container; an engine timeout, unavailable signature database or unreadable file leaves the document unresolved and excluded from search. Parser failures are distinct from malware findings. Never execute uploaded files.
6. Extract actual text from TXT, text PDF and DOCX. Use an OCR worker for image-only PDFs, preserving page provenance. Limits apply to pages, decompressed size and processing time. The text must be tied to the same bytes that were scanned.
7. In one PostgreSQL transaction, upsert the metadata revision, per-engine findings and extraction result, and insert an outbox change. Use UTC timestamps, unique tenant/blob-version keys and version checks. PostgreSQL is the selected relational database, not a silent substitution with Azure SQL.
8. A Function drains committed outbox events through the Search indexing SDK/API. It marks delivery complete only after per-document success, retries failures and reconciles interruptions. No built-in PostgreSQL Search indexer is assumed. A separate Blob projection of committed clean metadata exercises a supported Blob indexer and reconciliation path. It must not ingest raw quarantined content. Push freshness and indexer freshness are measured separately.
9. The query application searches the clean-document index, enforces tenant/ACL filtering and returns file name, document revision, scan status, extracted-text snippets and provenance. Fuzzy queries use the full Lucene parser and explicit fuzzy operators. A substring lookup is insufficient.
10. Updates create a new processing revision; stale events cannot overwrite newer results. Deletion propagates a tombstone through metadata and both indexing paths. Permanent processing failures reach a Service Bus failure queue, whose receiver explicitly dead-letters failed messages. An operator can inspect and replay safely. Event Grid delivery failures have their own dead-letter Blob destination.

### Services and configuration

| Service | Required configuration and evidence |
| --- | --- |
| App Service plan and ingress/query app | Managed identity, HTTPS only, Entra authentication, authorized upload/query endpoints, file limits, health probe, request correlation; backend bypass denied. Plan cost and limits recorded. |
| Storage account | TLS 1.2+, private containers for landing, clean projection, quarantine and Event Grid dead letters; encryption, versioning, scoped data roles, bounded retention, public blob access disabled; separate host-storage needs documented. |
| Event Grid | Storage system topic, BlobCreated and BlobDeleted subscriptions, exact container filters, endpoint validation, retry policy, dead-letter destination and identity permissions. Delivery duplicates are expected. |
| Azure Functions and Durable Functions | Supported hosting plan and runtime, actual published package hash, deterministic orchestrator, actual activities, task hub/storage permissions, retry limits, timeouts, concurrency bounds and restart recovery. EP1 is the selected candidate for the pinned custom container. A hosting-only Azure capture created it after the subscription upgrade; the next attempt hit provider throttling. North Europe validation still rejects quota. These component observations do not establish application execution. Flex Consumption cannot host this custom container. |
| Container Apps scanner/OCR workers | Pinned container digests, isolated execution, CPU/memory/timeout limits, non-root processes, read-only filesystem where supported, restricted ingress/egress, managed identity, ClamAV database and YARA rule provenance, bounded replicas. |
| Container Registry | Private registry, managed-identity pull and pinned image digest; no public publication of source or corpus. |
| PostgreSQL Flexible Server | Supported region/version/SKU, TLS verification, private network/DNS, Entra principal where supported, least-privilege schema role, parameterized SQL, migrations, unique constraints, outbox and tombstone records, backup policy. No embedded admin password. |
| Azure AI Search | Explicit SKU/API version, RBAC, private access, searchable/filterable/retrievable field schema, tenant/ACL fields, clean-state filters, fuzzy query mode, supported Blob data source/indexer and separate indexes for push/indexer comparisons. Record asynchronous indexing visibility. |
| Service Bus | Failure queue, receiver role, lock/TTL/delivery count, real dead-letter settlement, replay identifiers and independent counts; do not send directly to a DLQ. |
| Key Vault and identity/RBAC | Managed identities per application role, narrowly scoped grants, secret references only where unavoidable, rotation/denial tests, no long-lived credentials in code or recordings. |
| Networking | VNet/subnets, private endpoints/DNS, restricted ingress and service-to-service access. Verify effective reachability and denied paths, not only deployed properties. |
| Monitor, Application Insights, Log Analytics | Correlated traces across upload/event/activity/SQL/index/query, sampling disabled for test traffic, bounded log ingestion and retention, failure alerts without notifying external recipients. |

The supplied schema is expanded with tenant ID, blob version/ETag, content hash, per-engine results, extraction status, logical version and outbox records. The original fields remain. Using a managed-identity comment while authenticating with static environment keys is not accepted as managed-identity validation.

### Pilot targets and success

Use a generated, non-sensitive corpus of 24 documents covering TXT, text PDF, DOCX and scanned PDF, plus bounded malformed, empty, encrypted, oversized and harmless detection fixtures. Maximum upload is 10 MiB, 20 pages and 50 MiB expanded content. Accepting unsupported types is a failure, not a reason to skip a test. Use 5 concurrent uploads and 5 concurrent queries, with 100 warmed queries. This measures a pilot, not enterprise load capacity.

Proposed targets: at least 95% of clean text documents visible within 60 seconds of BlobCreated; scanned PDF within 120 seconds; warmed query p95 below 1 second; source updates/deletions visible within 60 seconds through the push path. Indexer freshness uses its separately recorded configured schedule and must never be described as instantaneous. Include all timeouts and failed requests in the report. Record cold starts separately. Three repeated batches are required before reporting stable latency; the cost ledger may prevent completion and must then mark the performance result incomplete.

Success requires the same input correlation ID to appear at every expected hop, actual PostgreSQL row values and Search results to match the uploaded content/version, and negative cases to remain absent from clean search. Retry/replay must not duplicate logical records. A deliberate wrong-container filter, missing role, wrong database reference and unavailable index must break the expected path and be detected. Recovering each fault must restore that path without manually inserting the expected final output.

## Scenario 2: financial research and RAG

### Business flow

1. An authenticated analyst submits a document or financial question over HTTPS, or opens a WSS session, through an explicit WAF/edge layer and API Management. Validate Entra issuer, audience, expiry and required scope/role using OpenID metadata. The sample inline signing-key placeholder is not usable authentication.
2. APIM applies authorization, body limits, per-principal throttling and correlation. It forwards to a private Container Apps backend using managed identity. An APIM route metadata response is not evidence that the backend executed.
3. The ingestion worker stores source filings and parses text, tables and page references. Add Blob Storage for source artifacts and bounded Container Apps jobs for extraction/OCR. Document ACLs, issuer, filing period, currency, units, content hash and chunk IDs accompany every chunk.
4. A pinned Azure OpenAI embedding deployment generates vectors of the declared dimensions. Index chunks in Azure AI Search with keyword fields, vector profiles, semantic configuration and mandatory tenant/ACL filters. Reject wrong vector dimensions and incomplete batches. Source changes and deletes update all relevant chunks.
5. Distinct research, calculation and synthesis agents run in Container Apps with recorded tool calls and bounded step/token budgets. Retrieval uses real hybrid vector/keyword search and semantic ranking. The calculation tool uses decimal arithmetic and explicit period/unit/currency rules. The language model explains verified calculations and cites retrieved source pages. It must abstain when evidence is missing.
6. Call Azure AI Content Safety text moderation and Prompt Shields for their distinct purposes, both on user input and untrusted retrieved text as appropriate. Run output moderation and independent citation/numeric checks before returning a response. A generic text-category moderation call is neither prompt-injection detection nor proof of factual correctness.
7. Commit session state, agent/tool trace, source citations, safety decisions, model/deployment versions, latency, usage and an immutable logical audit identifier to Cosmos DB for NoSQL. Keep tenant-scoped partition keys and roles. Do not log access tokens or unnecessary personal data. If durable audit fails, do not acknowledge an unaudited successful financial answer.
8. Return a structured answer or stream audited events over WSS. Handle cancellation, timeouts, expired credentials and bounded retries without duplicate audit or repeated unbounded model charges. The audit dashboard reads authorized aggregates from Cosmos DB. It replaces Power BI for this pilot only.

### Services and configuration

| Service | Required configuration and evidence |
| --- | --- |
| Edge/WAF | Explicit Front Door/Application Gateway choice, TLS, managed/custom rules, backend origin restrictions, benign and blocked probes. APIM is not itself a WAF. Price and tier must be settled before creation. |
| API Management | Tier supporting required WSS and network topology; JWT policy with real metadata/audience/claims, throttling, backend identity, CORS/body limits, diagnostics and WebSocket handshake policies. Consumption cannot stand in for a required WSS test. |
| Entra ID | API registration, test-client registration, scopes/roles, valid/wrong-audience/expired/unauthorized clients. Subscription Owner alone does not establish directory privileges. Remove task-owned registrations after testing. |
| Container Apps and Registry | Pinned images for ingestion and agent runtime, separate tool roles, private backend, revision health, concurrency/replica bounds, managed identity, egress allowlist, health checks and deployment rollback. |
| Blob Storage | Private source corpus and parsed-artifact storage, content hashes, version/ACL metadata and deletion propagation. |
| Azure OpenAI | Region, available quota, pinned chat and embedding model versions and deployment types, managed identity, request/token caps and recorded usage. Do not silently substitute an older/unavailable model or use paid external model accounts. |
| Azure AI Search | Matching embedding dimensions and vector profile, hybrid and semantic queries, ACL filter, chunk/page references, indexing status, negative dimension/schema tests and deletion assertions. |
| Azure AI Content Safety | Supported region/API, separate text moderation and Prompt Shields calls, explicit decision thresholds, output checks and outage behavior. No certification or guarantee of detecting every injection/hallucination. |
| Cosmos DB for NoSQL | Bounded capacity mode, tenant partition key, session/audit containers, TTL/retention, unique logical request IDs, optimistic concurrency, scoped data roles, audit-failure behavior and pagination/query tests. |
| Key Vault, network and observability | Same least-privilege/private-network controls as scenario 1; correlation through every agent/tool/service call. Diagnostic settings cannot substitute for observed application audit writes. |
| Audit dashboard | Existing application runtime and Cosmos-backed aggregates; authenticated access and tenant filtering. No Power BI license/trial purchase; no Power BI compatibility claim. |

Use the model catalog and subscription quota to select supported model versions before freeze. Stochastic generated wording cannot be required to match byte-for-byte across runs. Compare response schema, tool paths, citation validity, arithmetic, error contracts and safety decisions separately. GlobalStack forwarding requests to Azure is not independent local model emulation and must never be scored as such.

### Pilot targets and success

Use 12 generated regulatory-style filings from two synthetic companies across three years and two reporting periods, including tables with known exact ground truth, a revised filing, a conflicting unit, missing evidence and a harmless prompt-injection fixture. These are synthetic test documents, not claimed real SEC submissions. Keep embeddings under 100,000 input tokens and synthesis under 30,000 input/10,000 output tokens initially; the priced cost ledger must impose tighter caps if required.

Use 24 financial questions at concurrency 2 and a separately bounded WSS test. Proposed targets are at least 95% ingestion visibility within 120 seconds, warmed hybrid retrieval p95 below 2 seconds, completed non-streamed answer p95 below 30 seconds, and first audited WSS event within 5 seconds. Measure cold starts, throttling, abstentions and failures separately. A short test does not establish production throughput or tail-latency guarantees.

Success requires actual APIM-to-container forwarding, actual extraction/embedding/indexing, distinct agent steps, correct decimal calculations and citations to accessible pages, an enforced safety outcome, and the matching Cosmos audit record before success acknowledgement. Cross-tenant retrieval, invented unsupported financial facts and leaked credentials are failures. Faults in the APIM backend, Search index, embedding dimensions, managed-identity roles, Content Safety and Cosmos writes must be observable, contained and recoverable.

## Lifecycle and paired-attempt protocol

1. Preflight: verify signed-in subscription, owned-resource inventory, provider registration, API versions, SKU/region availability, quotas, model access, directory privileges, billing estimate and at least 40 GiB disk free. A model catalog entry is not proof of deployable quota. Do not register unrelated providers or alter subscription-wide policy silently.
2. Freeze source: retain Git revision and dirty patch if any, every IaC/application/corpus/container digest, tool/provider versions, normalized configuration and experiment manifest. Required assertions are registered before execution.
3. Azure first: record native compile/validate/what-if/deploy and SDK traffic with UTC and monotonic timestamps. Record genuine failures exactly; do not invent three failures to match the user's illustrative sequence. Intentional mutations receive separate IDs and are not pooled with accidental development errors.
4. Replay the same frozen revision against GlobalStack. Do not apply a local-only patch to make it succeed. Compare error status, provider code, target, nested details, retry headers, partial-resource effects and operation polling. Preserve raw sanitized messages and report any documented normalization. An Azure quota/account failure is an environment constraint, not a required universal emulator behavior.
5. Commit an IaC correction once, then rerun it on both. Product corrections to GlobalStack receive their own revision and tests using unrelated resource names. Preserve before/after evidence. A test expectation must not simply be changed to the emulator's current answer.
6. Successful deployment: verify resource existence, runtime health, unchanged repeat, outputs, roles, network reachability, secrets handling and package/container digest. A deployed resource with no functioning runtime is a failure.
7. Run every registered integration and denial/fault-recovery assertion. Observe each hop independently; do not use only the final HTTP response. Remove wiring deliberately and prove the test detects it. Exercise updates, stale/duplicate delivery, drift repair, restart, rollback, and state/import where the native platform supports them.
8. Capture actual Portal resource views at creation, configuration/update, activity/integration state where available, and deletion. Couple each image to resource ID, UTC timestamp, phase and SHA-256. Portal screenshots and CLI/API recordings are separate evidence types. No reconstructed dashboard can be labeled Azure Portal.
9. Record Azure then GlobalStack execution chronologically. Provide both original real-time recordings and an aligned side-by-side replay keyed to stage/attempt/correlation ID. Disclose idle trimming or accelerated playback. Video is evidence context; machine-readable contracts determine parity.
10. Tear down task-owned resources and out-of-group dependencies immediately in `finally`, with an independent expiry/cleanup process. Verify terminal deletion, resource inventory, managed resource groups, role assignments, registry artifacts, soft-deleted billable resources and owned Entra registrations as applicable. Preserve unresolved cleanup context and block the next scenario if cleanup is incomplete.

## Comparison and reporting rules

Separate provisioning, protocol, authorization, runtime, business, latency and cleanup results. Preserve missing/unmatched requests. Normalize only documented volatile fields (run identifiers, timestamps, request IDs and instance-specific names) using explicit maps; retain their presence/type and operation relationships. Do not erase error codes, topology, principal permissions, status codes, pagination, retry/poll sequences or data values.

For a named assertion set, report `evaluated = pass + fail` and `pass_fraction = pass / evaluated` only when evaluated is nonzero. Also report planned, not-run, blocked and unsupported counts. Neither absence of observation nor unsupported service behavior is a pass. Whole-scenario success requires every required assertion to pass in both targets, clean teardown, unchanged artifact identity and all required recording evidence. A denominator covering only easy evaluated assertions must never be presented as overall Azure accuracy.

Retain natural failures, deliberate invalid-input tests and successful attempts separately. Distinguish documentation-derived expectations, static code findings, local reproductions and Azure-paired observations. Publication requires accessible artifacts, redaction review and a statement of excluded authentication/provider/SDK surfaces.

## Cost, storage and external dependencies

The current total authorized ceiling is USD 300 including earlier pilot usage. No additional model-account credits, vendor subscriptions, licenses or paid trials. Azure service and Azure OpenAI consumption required by these scenarios must fit that ceiling. Cost Management reports arrive late and cannot act as a hard cap. Before paid provisioning, freeze region/SKUs and current rates, bounded runtime/requests/tokens/storage/logging and a teardown reserve. Start only if estimated worst-case cost plus recorded/estimated earlier usage and reserve fits the ceiling.

Use one live scenario at a time. The conservative ledger has allocated USD 241 of USD 300, leaving USD 59 for remaining paired work. That allocation is a run gate, not measured billing or permission to exceed the ceiling. Set replica, throughput, log and token caps, avoid provisioned model throughput/commitments, and account for resources that charge during creation and deletion. If required controls cannot fit, mark the run blocked and report the conflict rather than silently weakening its security configuration.

Keep run-specific state and raw credentials in mode-0700 temporary directories; remove them after verified cleanup. Keep sanitized logs, hashes and bounded recordings. Check free disk before each image pull/build/run; stop creating new artifacts below 40 GiB. Do not delete retained evidence or unrelated caches to hide storage use.

## Sources checked on 2026-11-07

- [Search supported indexers](https://learn.microsoft.com/en-us/azure/search/search-indexer-overview) and [data-source connectors/push API](https://learn.microsoft.com/en-us/azure/search/search-data-sources-gallery): no built-in PostgreSQL connector is assumed.
- [Fuzzy query syntax](https://learn.microsoft.com/en-us/azure/search/search-query-fuzzy): full parser and explicit operators are required.
- [Durable activity execution](https://learn.microsoft.com/en-us/azure/azure-functions/durable-functions-types-features-overview): at-least-once activity execution requires idempotent side effects.
- [Service Bus dead-letter semantics](https://learn.microsoft.com/en-us/azure/service-bus-messaging/service-bus-dead-letter-queues): use parent-entity dead-letter settlement.
- [Functions hosting choices](https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale): custom containers are not supported by Flex Consumption; native scanners run in separate container workers.
- [APIM WebSocket support](https://learn.microsoft.com/en-us/azure/api-management/websocket-api): Consumption does not support the required WSS API.
- [APIM Entra authorization](https://learn.microsoft.com/en-us/azure/api-management/api-management-howto-protect-backend-with-aad): application audience and claims must be enforced.
- [Prompt Shields](https://learn.microsoft.com/en-us/azure/ai-services/content-safety/concepts/jailbreak-detection): attack classification is separate from harmful-content, factuality and compliance checks.
- [APIM cost planning](https://learn.microsoft.com/en-us/azure/api-management/plan-manage-costs): tiers and dependencies have distinct billing behavior.
