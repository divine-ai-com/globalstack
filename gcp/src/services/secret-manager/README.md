# Secret Manager Module

This module owns Secret Manager behavior. The implementation must keep the
versioned secret store, Google API wrapper, service routes, error shapes, and
tests inside this directory.

Implemented files:

- `service.mjs`: service registration and route wiring
- `store.mjs`: executable versioned secret state
- `routes.mjs`: Google-shaped Secret Manager REST routes
- `google-api.mjs`: REST API wrapper used by local runtime and future
  differential tests

Current scope is bounded to secret CRUD plus version add/access/destroy. IAM,
replication policy fidelity, etags, annotations, and real-GCP differential
captures remain pending.

Client gates:

- `gcp/scripts/e2e/rest-secret-manager.mjs` validates the local Google-shaped
  REST lifecycle and error envelopes end to end.
