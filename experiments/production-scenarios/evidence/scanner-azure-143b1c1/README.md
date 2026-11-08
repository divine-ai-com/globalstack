# Paired scanner component result

The run used clean source `143b1c1` and the same frozen scanner image and compiled
Bicep templates on both targets. The three initial denial controls matched in
status and body. The three real scans returned matching decisions, input hashes,
engine versions and extracted content. Only engine durationMs is excluded from
the response comparison; original values remain in the trace.

Azure policy activation took about 36 seconds and restoration about 37 seconds.
GlobalStack changed its decision immediately. The trace retains all transient
403/200 differences. This is stable scanner behavior parity for the tested
inputs, not complete protocol, timing, worker-access or workflow equivalence.
The allowed caller during scanning was the explicit pilot client, not the worker.

The original cleanup returned recoveryRequired after an Azure 503. The watchdog
also reached its bound. The first recovery observed provider 404 while the group
inventory still listed the environment. The final recovery verifies resources,
roles and deployment history absent and the retained group empty. Each earlier
result is preserved separately; final proof is in cleanup-recovery.json.

The original 7-minute-32-second video records the live sanitized HTTP stream,
including the first cleanup failure. Its hash and capture metadata are in
recording.json. The 205 MiB original remains in the operator workspace, not this
Git directory. Recovery is a separate HTTP trace. No Portal screenshot or full
application workflow is asserted. Account identifiers are redacted after the
requests; angle-bracket values were not sent to Azure.
