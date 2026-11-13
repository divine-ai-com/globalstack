# Interrupted paired Functions-to-scanner run

Clean source `8707add` deployed the same compiled modules and image digests on
Azure and GlobalStack, with each scanner endpoint supplied from deployed outputs.
Both rejected missing host authentication with 401. Azure executed a real clean
scan through the Function's managed identity; the local handler returned 502.
The separate tenant diagnostic identifies inconsistent external tenant settings.
The loop stopped at that mismatch; the YARA-marker call did not run.

During cleanup, the interactive recording process exited 143. Its independent
Azure cleanup watchdog survived. The original final result file was never
written. `recovered-summary.json` is explicitly reconstructed from the original
events, not presented as an original completed result. Local containers, networks
and private runtime files were removed through verified recovery.

At this snapshot, the last Azure readback lists only the managed environment in
ScheduledForDelete. Final absence proof must be supplied separately before a new
paid run. The original 20-minute partial video is playable at sampled initial
and final positions; its bytes and hash are retained. It is not a complete
recording or Portal footage. No full business workflow passed.
