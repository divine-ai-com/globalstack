# Document application components

These are shared application artifacts under development. Neither complete
scenario has been deployed or passed. Components use configuration supplied by
the deployment, without Azure-versus-emulator branches.

The [scanner](scanner/README.md) invokes actual native engines and extraction
tools. The PostgreSQL repository retains the original blueprint's document ID,
blob URL, filename, scan status, malware flag, extracted text and processing
timestamp. It adds tenant, immutable source revision, source ordering, engine
results, extraction provenance and signature provenance.

`commitRevision` locks the logical document and commits metadata, immutable
revision evidence and its outbox event in one transaction. Concurrent duplicate
deliveries cannot create extra outbox entries. Older events are retained as
history but cannot overwrite current metadata. Pending and unresolved revisions
exclude the document from clean query results and enqueue search removal. A
successful retry can resolve the same source revision; a late pending event
cannot replace an already clean outcome. Complete attempt auditing and
operator replay still need integration with the orchestration layer.

`deliverNext` skips superseded outbox events and marks a delivery only after
per-document acknowledgement. A crash after delivery but before commit leaves
work pending, so downstream writes must be idempotent. This is at-least-once
delivery, not an exactly-once claim. Delivery has a five-second default deadline
and propagates an abort signal to the transport. An uncertain remote outcome
still requires idempotent replay and reconciliation.
`currentSearchResults` checks current tenant, owner/group access, clean state and revision in
PostgreSQL before returning authoritative content. An access row registered by ingress is required; a processed document with no access row is not returned. This prevents stale search
results from becoming current application answers; it is not a replacement for
Search-side ACL filtering or service authentication.

The Functions package registers an Event Grid entrypoint, Durable orchestration,
real SDK-backed scanning/storage activities, outbox retries and explicit Service
Bus dead-letter settlement. Its image pins Microsoft's Node 22 host and the
bundled extension version. The initial local host probe executed HTTP health but failed Durable storage
initialization. After paired Storage comparisons and fixes, the clean
[host-startup capture](../evidence/functions-storage-2fb0e55/) shows the native
Durable task hub worker starting and acquiring its host lease. Timer functions
invoke the application and fail on missing service settings in this storage-only
probe. No document workflow completed. Package import outside the host only checks module loading; the
SDK's test mode is not a deployed worker test.

The SQL file currently initializes a fresh experiment database. Upgrade
migrations, complete outbox reconciliation, effective identity/network
configuration, real worker management in GlobalStack and live paired flows
remain required. The Functions pool enforces PostgreSQL TLS verification and
uses an Entra token or a Key Vault secret through managed credentials. No
authentication or private-network success is claimed before deployment tests.

Run the repository tests with Docker available:

```sh
node --test experiments/production-scenarios/document-app/repository.test.mjs
```

The test creates a temporary PostgreSQL container with random credentials,
checks concurrency, atomic rollback, stale updates, deletes and result scoping,
and removes its container in cleanup. Scanner outcomes in that database test
are explicit repository fixtures. They are not scanner or cloud evidence.

Dependencies are locked for the Node.js Functions package. Durable
Functions 3.6.0 depends on an older UUID package affected by
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
The scoped override selects UUID 11.1.1, which retains CommonJS support. A
regression verifies that recorded deterministic Durable identifiers remain
unchanged. The package audit reports no known vulnerabilities at preparation
time; CI repeats the audit and fails on moderate or higher findings.

The API authorization component verifies RS256 signatures against the configured
Entra tenant's keys, exact issuer/audience/tenant, validity times, approved client,
API role, and delegated scope or application-token claim. Group-overage tokens
are rejected until membership resolution is implemented. The application does
not trust a caller-supplied identity header or token payload without signature
verification. These are local signed-token tests, not live Entra evidence.

Document access rows bind a tenant, immutable owner, upload idempotency key and
initial read groups. Sharing is restricted to groups asserted in the verified
principal. Read-only group members cannot overwrite or delete another owner's
document. Query results are rechecked against PostgreSQL, even if Search returns
a stale or unauthorized hit. Search payloads carry owner and group fields for
an additional filter before retrieval. ACL modification and group-overage
resolution remain future work; neither is silently treated as permitted.

The [clean native failure-path capture](../evidence/functions-orchestration-bf66e7f/)
executes the real orchestrator and activity retries against GlobalStack Storage,
then persists `Failed` because downstream settings were intentionally omitted.
It does not complete scanning, SQL or indexing, and it is not a paired Azure-host
run. The capture pins the earlier image digest, before these access components.

`ingress.mjs` is the App Service application entrypoint. It accepts authenticated
uploads with an explicit idempotency key, queries with an owner/group Search
filter followed by a PostgreSQL recheck, and permits owner-only versioned updates
and deletion. The upload key is retained as the root correlation ID; the Durable
instance ID remains specific to the source revision and event sequence. Query
responses return bounded snippets and page provenance, not arbitrary Search
payloads. Search visibility and successful processing are never inferred from
the upload's HTTP 202 response.

The API uses `ENTRA_TENANT_ID`, `API_AUDIENCE` and `API_ALLOWED_CLIENTS` for token
validation. The application registration must issue v2 access tokens with the
`Documents.Read`, `Documents.Upload` or `Documents.Delete` role. Delegated tokens
also need `Documents.Access`; application tokens need `idtyp=app`. Initial read
groups come from verified membership. Group sharing cannot be changed by
replaying an upload key. Live role assignment, consent and managed-identity
behavior have not yet been tested.

The Dockerfile named `Dockerfile.ingress` pins the Node base image and runs as a
non-root user. Local HTTP tests use real signed test tokens, the Azure Blob SDK,
GlobalStack's Blob router and a temporary PostgreSQL database. They cover
upload, duplicate submission, owner/group access, stale ETags, update and
deletion. Their fixture uses an explicit Shared Key and local database password;
it does not count as managed identity, private networking or an Azure deployment.
The full Search/scanner flow is still required.
