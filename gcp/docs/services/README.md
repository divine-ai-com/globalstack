# Service Notes

Per-service product notes live here once a GCP service has a real local engine
plan, captured API traces, and conformance tests.

Runtime code belongs in `gcp/src/services/<service>/`, not in shared folders.
Shared code is limited to provider-generic concerns such as auth, HTTP,
captures, cleanup, routing, and orchestration. Each service directory should own
its API wrapper, local routes, state, engine adapter, error mapping, and tests.
