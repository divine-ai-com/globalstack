# Cloud Tasks Module

This module owns Cloud Tasks behavior. The implementation must keep the
scheduler, HTTP dispatcher, retry runtime, Google API wrapper, service routes,
stores, error shapes, and tests inside this directory.

Implemented files:

- `service.mjs`: service registration and route wiring
- `store.mjs`: executable queue/task state plus HTTP dispatcher
- `routes.mjs`: Google-shaped Cloud Tasks REST routes
- `google-api.mjs`: REST API wrapper used by local runtime and future
  differential tests

Current scope is bounded to queue create/get/delete, HTTP task create/get, and
explicit `tasks.run` dispatch to a real HTTP endpoint. Schedule-time execution,
retry backoff, rate limiting, leasing, auth headers, App Engine targets, IAM,
and real-GCP differential captures remain pending.

Client gates:

- `gcp/scripts/e2e/rest-cloud-tasks.mjs` validates the local Google-shaped REST
  queue/task lifecycle and dispatches to a real local HTTP receiver end to end.
- `gcp/scripts/e2e/terraform-cloud-tasks.mjs` and
  `gcp/scripts/e2e/opentofu-cloud-tasks.mjs` validate Google provider queue
  create/read/no-drift/destroy behavior plus HTTP task dispatch side effects.
