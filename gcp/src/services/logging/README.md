# Cloud Logging Module

This module owns Cloud Logging behavior. The implementation must keep the local
log store, query behavior, Google API wrapper, service routes, error shapes, and
tests inside this directory.

Implemented files:

- `service.mjs`: service registration and route wiring
- `store.mjs`: executable in-memory log entry store
- `routes.mjs`: Google-shaped Cloud Logging REST routes
- `google-api.mjs`: REST API wrapper used by local runtime and future
  differential tests

Current scope is bounded to `entries.write` and `entries.list` with project,
`logName`, and severity filtering. Sinks, metrics, exclusions, log buckets,
views, pagination, ordering, advanced filters, IAM, and real-GCP differential
captures remain pending.
