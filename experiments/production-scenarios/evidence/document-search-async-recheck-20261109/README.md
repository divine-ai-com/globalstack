# Document Search recheck after local async-indexer change

The [summary](summary.json) and [redacted HTTP trace](trace.json) record a clean-source Azure-first rerun of the document Search component. The same compiled identity, storage and Search templates reached `Succeeded` on Azure and GlobalStack. Both targets accepted the managed-identity Blob data source and indexer, indexed a harmless clean projection, excluded a harmless quarantine probe, and removed the clean document after a soft-delete marker. Both rejected a wrong-container indexer with HTTP 401 at creation. The indexer run requests returned HTTP 202 on both targets, and the later status reads reported `success`.

The runner did not read indexer status immediately after the HTTP 202 responses. This trace therefore does not establish parity of the intermediate `inProgress` state or indexing latency. It also does not prove an internal Search-to-Blob network hop. The full document workflow, worker/scanner path and financial scenario remain open.

The cleanup watchdog removed every owned Azure resource and deployment record. A separate Azure CLI readback found zero resources and zero deployments in the preserved pilot group. The USD 12 run envelope brought the conservative allocation ledger to USD 301 of the authorized USD 350 ceiling. These allocations are not measured Azure charges.

The private original trace is retained in the operator run directory. Its SHA-256 is in the summary. The published trace keeps request order, statuses and resource states while replacing account identifiers, the runner IP and remaining UUIDs with stable opaque aliases. No production credential or document was used.
