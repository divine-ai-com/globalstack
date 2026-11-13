# Scanner policy transition observations

Azure first rejected the temporary permitted pilot for six readiness attempts, then returned 200 about 36 seconds after the policy update. All three subsequent scanner requests returned 200 in both environments with the same clean/detected decisions, input hashes, engine versions and extraction results. Only engine durationMs is excluded from stable response comparison. No legacy-check removal was needed.

When restoring the worker-only policy, Azure continued returning 200 during the transition before returning 403 about 37 seconds later. GlobalStack changed its decisions immediately. These transient differences remain in the evidence; no fixed cloud delay is added to the emulator.

This is a component result under a temporary explicit pilot allowlist. It does not demonstrate a deployed worker calling the scanner, the complete document pipeline, or Portal evidence. Cleanup is recorded separately after resource absence is verified.
