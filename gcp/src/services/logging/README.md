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

Current scope is bounded to `entries.write`, `entries.list` with project,
`logName`, and severity filtering, plus log-based metric create/get/list/delete
for provider lifecycle coverage. Sinks, exclusions, log buckets, views,
pagination, ordering, advanced filters, IAM, metric export/evaluation, and
real-GCP differential captures remain pending.

Client gates:

- `gcp/scripts/e2e/rest-logging.mjs` validates the local Google-shaped REST
  write/list/filter behavior end to end.
- `gcp/scripts/e2e/terraform-logging.mjs` and
  `gcp/scripts/e2e/opentofu-logging.mjs` validate Google provider metric
  create/read/no-drift/destroy behavior plus structured log filtering side
  effects.
