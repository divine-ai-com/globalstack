# Document Search immediate-status comparison

The [summary](summary.json) and [redacted HTTP trace](trace.json) record an Azure-first paired run of the same compiled document Search infrastructure templates. Both targets deployed the identity, storage and Search modules, indexed a harmless clean projection, excluded quarantine content, processed a soft-delete marker, and rejected a wrong-container indexer with HTTP 401. These are bounded component outcomes, not a completed document-processing scenario.

The runner read indexer status immediately after each accepted HTTP 202 `search.run` response. For the first indexing run, Azure returned HTTP 200 with top-level `running`, `lastResult: null` and an empty execution history. The read completed about 1,033 ms after run acceptance. GlobalStack returned HTTP 200 with top-level `running` but `lastResult.status: success` and one completed history entry after about 3 ms. The local job had finished before the first remote status read, so the asynchronous handoff change did not match this observed intermediate state.

For the delete run, the first reads showed a successful `lastResult` on both targets. That field can describe a prior run, so this observation alone does not establish immediate delete completion. The later query and status checks confirmed eventual deletion and indexer success on both targets. The measured first-read gap does not define a general Azure timing distribution or justify hardcoding a one-second delay.

The cleanup watchdog removed all owned Azure resources and deployment records. A separate Azure CLI readback found zero resources and zero deployments in the preserved pilot group. The USD 12 run envelope brought the conservative allocation ledger to USD 313 of the authorized USD 350 ceiling. These allocations are not measured Azure charges.

The private original trace is retained in the operator run directory. Its SHA-256 is in the summary. The published trace keeps request order, statuses and resource states while replacing account identifiers, the runner IP and remaining UUIDs with stable opaque aliases. No production credential or document was used.
