# Paired worker/scanner preflight failures

Both attempts used clean source `cffb8d6`. Neither reserved a deployment budget
or submitted a resource mutation to Azure. The first supplied a worker build
digest that was not a locally addressable image ID. The second used the verified
image ID but instantiated the Functions provisioner before publishing its image
catalog. Commit `8707add` defers that provisioner initialization until the
workload starts. These are harness failures, not Azure compatibility findings.

Original results, read-only Azure traces, and recording metadata are retained.
Videos remain in the operator workspace. A later attempt must establish whether
the corrected paired component works.
