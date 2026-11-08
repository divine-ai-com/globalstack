# Paired Functions to scanner component

Clean source revision `ead706e06da269e55f261b347d3d7a9372fedc1e` ran from
2026-11-08 12:09:04 to 12:43:40 UTC. The same five compiled Bicep templates
and two application image digests were used for Azure and GlobalStack.
Generated scanner endpoints were supplied through deployment outputs. The
deployment requests were sent to ARM directly; this run does not claim a
native Bicep CLI deployment trace.

| Check | Azure | GlobalStack |
| --- | --- | --- |
| Missing Functions host key | 401 | 401 |
| Actual Function to scanner, clean text | 200, clean | 200, clean |
| Harmless YARA marker | 200, detected | 200, detected |
| Harmless EICAR marker | 200, detected | 200, detected |
| Scanner policy revoked for worker | 403 after 37,057 ms and seven checks | 403 on first check |
| Scanner policy restored | 200 after 36,392 ms and seven checks | 200 on first check |

The scan responses matched after excluding `durationMs`. The actual Function
obtained a managed-identity token and called the scanner on both targets. The
different policy propagation times remain in the result and event trace.

Azure returned 202 for managed-environment deletion at 12:19:34 UTC and 404
on readback at 12:43:32 UTC. Final cleanup checks found every owned resource,
role assignment and deployment absent, with the operator resource group empty
and preserved. Local runtime cleanup passed. The experiment ledger records
USD 97 allocated under the USD 150 ceiling, with every allocation cleaned up.
These allocations are conservative reservations, not a statement of actual
Azure billing.

`result.json` and `events.ndjson` are copies with subscription, tenant, pilot
client, scanner audience and resource-group identifiers replaced. They contain
818 recorded events and passed a directory secret scan. The original 34-minute
terminal and API video remains in the operator workspace; its hash, size and
playback checks are in `recording.json`. It is not an Azure Portal recording.
The original video includes tenant, client and resource-group identifiers.
Its header overstates resource-group redaction, so only the separately
redacted event trace is suitable for public use.

This proves a component path. Blob ingestion, Event Grid, Durable Functions,
PostgreSQL, Search indexing, the full document workflow, the financial
workflow, Azure Portal screenshots and the other IaC platforms remain untested
by this run.
