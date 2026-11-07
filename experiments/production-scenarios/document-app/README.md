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
history but cannot overwrite current metadata. Transient scanner failures must
be retried by orchestration; this method refuses to commit them as clean.
Unresolved-attempt tracking and operator replay are still to be integrated.

`deliverNext` skips superseded outbox events and marks a delivery only after
per-document acknowledgement. A crash after delivery but before commit leaves
work pending, so downstream writes must be idempotent. This is at-least-once
delivery, not an exactly-once claim. Delivery has a five-second default deadline
and propagates an abort signal to the transport. An uncertain remote outcome
still requires idempotent replay and reconciliation.
`currentSearchResults` checks current tenant, clean state and revision in
PostgreSQL before returning authoritative content. This prevents stale search
results from becoming current application answers; it is not a replacement for
Search-side ACL filtering or service authentication.

The SQL file currently initializes a fresh experiment database. Upgrade
migrations, complete outbox reconciliation, the Functions host, ingress,
identity/network configuration and live paired flows remain required.

Run the repository tests with Docker available:

```sh
node --test experiments/production-scenarios/document-app/repository.test.mjs
```

The test creates a temporary PostgreSQL container with random credentials,
checks concurrency, atomic rollback, stale updates, deletes and result scoping,
and removes its container in cleanup. Scanner outcomes in that database test
are explicit repository fixtures. They are not scanner or cloud evidence.

Dependencies are locked for the forthcoming Node.js Functions package. Durable
Functions 3.6.0 depends on an older UUID package affected by
[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq).
The scoped override selects UUID 11.1.1, which retains CommonJS support. A
regression verifies that recorded deterministic Durable identifiers remain
unchanged. The package audit reports no known vulnerabilities at preparation
time; CI repeats the audit and fails on moderate or higher findings.
