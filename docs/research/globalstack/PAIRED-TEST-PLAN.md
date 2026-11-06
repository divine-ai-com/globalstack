# Paired Azure lifecycle testing plan

The acceptance target is an unchanged Azure IaC configuration and application artifact operating against Azure and GlobalStack through external target configuration. A successful deployment is one observation; protocol behavior, resource state, business outcomes and destruction are separate observations. This plan extends the released local study and does not change its recorded results.

## Source and environment contract

Freeze the IaC source, application source, provider lockfile, tool image, test contract and normalization rules before each pair. Record their hashes and the product revision. The two targets use identical files and tool versions. Credentials, subscription, resource names, region, endpoint routing and trust configuration belong to the external runner. No emulator-specific branches, disabled schema validation, substitute resources or target-specific application logic are allowed in the paired fixture.

Capture native provider requests through an external transport observer. Preserve Azure response bytes delivered to the provider. Capture method, API version, path, non-secret headers, bodies, status, timing and phase. Identity credentials are not research data. Record authentication mechanism and outcome separately without storing bearer tokens, account keys or tenant user details. State files and unfiltered diagnostic logs remain private and temporary.

## Test matrix

| Area | Tests and observations | Completion evidence |
|---|---|---|
| Identity and discovery | Target selection, token audience, expiry, missing credentials, tenant/subscription context, provider registration and API discovery | Native-client outcome and sanitized discovery trace; local synthetic identity is reported separately from Entra authentication |
| Source and tools | Identical source hashes, provider versions, schema validation, formatting and initialization | Manifest and lockfile equality before and after execution |
| Creation | Missing-resource read, dependency ordering, PUT/POST validation, resource IDs, defaults, headers and outputs | Native plan/apply plus full observed management exchanges |
| Asynchronous operations | Accepted responses, operation URLs, provisioning states, Retry-After, terminal failure and polling | State transitions and terminal result; polling counts and elapsed times retained |
| Read and stability | GET/HEAD, output values, refresh, no-change plan, collection listing and pagination | Observed state and no unintended replacement or drift |
| Update | Mutable properties, immutable-property rejection, preservation of unrelated properties, tags and child dependencies | Before/after state and native update trace |
| Drift and import | External modification, detection, repair, state removal and import, subsequent no-change plan | Native plan exit codes, imported state and repaired read-back |
| Negative behavior | Invalid values, missing parents, unavailable API versions, invalid identity, forbidden scope, missing resources | Status, structured error and absence of unintended effects |
| Concurrency and retries | Repeated create/delete, duplicate submission, conditional writes, throttling, retry deadlines and partial failures | Bounded fault injection with operation and side-effect counts; no deliberate load against Azure |
| Data plane | SDK/protocol calls, serialization, metadata, conditional requests, duplicate keys, visibility and pagination | Correlated payloads and persisted state, not just management existence |
| Cross-service flow | Producer, trigger/subscription, worker, queue/stream, destination and ledger | Correlation ID followed through every declared boundary and final business effect |
| Broken wiring | Missing connection, wrong destination, extra subscription, invalid access | Explicit fault witness, failed business contract and successful restoration |
| Deletion | Native destroy, child ordering, async completion, repeat deletion, resource and endpoint absence | Verified absence plus empty ownership ledger; destroy exit code alone is insufficient |
| Recovery | Failed apply, assertion failure, timeout, interrupted runner and expired run | Independent cleanup attempt, retained recovery manifest and verified final inventory |

An unexercised matrix cell is untested. A service that accepts resource creation but lacks its data plane is not behaviorally validated. Negative identity tests and performance/scale testing require their own scoped adapters and are not implied by synthetic local credentials.

## Execution order

1. **Transport and resource-group pilot.** One Terraform/AzAPI configuration creates an empty resource group, checks no-change behavior, updates tags, detects and repairs tag drift, removes/imports state and destroys the group. Observe actual provider HTTP traffic against both targets. Confirm trace capture, cleanup and source identity before provisioning billable services.
2. **Storage lifecycle.** Add a small Standard LRS StorageV2 account and Blob, Queue and Table children. Test native lifecycle and a bounded producer/consumer path using synthetic payloads. Include table duplicate conflicts, queue acknowledgement, missing objects, metadata and post-delete checks. No file shares, logs, private endpoints or paid messaging namespaces are needed for this pilot.
3. **Event-driven reference case.** Refine the released claims case for genuine Azure webhook validation, authentication, asynchronous delivery and idempotent business processing. The same application must run on both targets. Freeze the endpoint-hosting choice and cost estimate before deployment. Observe blob content, published event, worker invocation, queue receipt and ledger outcome, including broken-wiring and restoration controls.
4. **Platform expansion.** Freeze two selected cases per platform using cross-service edges, state transitions, fault paths and architectural diversity. The audited private corpus currently has five platforms; the older native-client matrix has nine. Keep scenario count separate from platform implementations. Do not label structurally similar naming variants independent architectures.
5. **Independent assessment.** Publish reproducible source and sanitized traces for every counted case, including failures. Obtain independent workload selection and reproduction before claiming either. Revisit API versions and drift periodically, with every revision separately recorded.

Each expansion follows a completed cleanup check and an inspection of the previous pair. Repetition follows resolution or classification of instrumentation failures. Product mismatches remain in the evidence even after correction; corrected reruns are separate samples.

## Comparison rules

Compare operation semantics, not a single global byte-equality score. Match exchanges by lifecycle phase, method, canonical resource path, API version and occurrence. Retain unmatched operations, polling counts and ordering differences. A differing request sequence can be legitimate for asynchronous operations, but requires a documented explanation.

Replace only declared deployment identity values with stable placeholders. Preserve property names, types, defaults, error codes, status codes, semantic headers, unexpected fields and side effects. Timestamp/request-ID values may vary; field presence and format still matter. Do not drop entire error objects or all fields containing the word `key`. Public sanitization and semantic comparison are distinct operations.

Report lifecycle success, behavioral success, trace coverage, protocol differences, cleanup and unsupported checks separately. Missing capture, permission failures and harness crashes are inconclusive for service fidelity. Never count a missing Azure observation as a match. Do not compute a universal Azure-accuracy percentage from this selected suite.

## Cost and cleanup controls

For the current operator pilot, the authorized total is USD 100, replacing the earlier USD 50 limit. This is an execution constraint, not a spending target or a cloud-enforced cutoff. Start in East US, matching the existing scenario; record any region change before running. Keep one live scenario active at a time and reserve most of the allowance until the first paired results are understood.

Each run needs a unique resource group, an ownership tag and an expiry. Check that the group does not already exist. Maintain a private recovery manifest before the first write. Limit permitted resource types, SKUs, payload sizes, request count, run duration and attempts. A research runner must never delete pre-existing or unrelated resources.

Always attempt native destruction in a finally path, including failed validation. If native destruction fails, use the recorded ownership scope for fallback cleanup, verify absence and report the native-destroy failure. Run an independent timeout cleanup process. A host outage still requires recovery from the saved manifest; do not claim that an in-process finally block survives a host failure. Block further provisioning while any owned resource remains.

Use delayed Azure cost reporting for reconciliation, not as the only live guard. Pricing estimates need headroom for minimum billing increments, operations, retained data and tax. A short successful deployment is not necessarily free. Budget alerts do not stop resources automatically. Keep at least 40 GiB free locally and remove run-specific providers, certificates, credentials and state after verified cleanup while preserving sanitized evidence and shared tool caches.

## Evidence and review

Retain a protocol revision, source manifest, target context, sanitized native trace, stage outcomes, comparison report, timing and cleanup result for each attempt. Report expected failures separately from harness failures. Retain original observations when fixing GlobalStack; a later pass must not erase the initial disagreement. Before publishing, review secret handling, license/provenance, all bot findings, source identity and claims against the frozen evidence.

The first pilot covers management operations for an empty resource group only. Storage, event delivery, Entra parity, retries, broad service coverage and the two-per-platform study remain separate milestones until executed.

## References

- [Azure resource-group REST contract](https://learn.microsoft.com/en-us/rest/api/resources/resource-groups/create-or-update)
- [Azure budget behavior and reporting delay](https://learn.microsoft.com/en-us/azure/cost-management-billing/costs/tutorial-acm-create-budgets)
- [Azure billing periods](https://learn.microsoft.com/en-us/azure/cost-management-billing/understand/mca-understand-your-invoice)
