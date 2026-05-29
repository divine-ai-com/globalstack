# Cloud KMS Module

This module owns Cloud KMS behavior. The implementation must keep the local key
engine, Google API wrapper, service routes, stores, error shapes, and tests
inside this directory.

Implemented files:

- `service.mjs`: service registration and route wiring
- `store.mjs`: executable AES-GCM key engine for bounded symmetric crypto
- `routes.mjs`: Google-shaped Cloud KMS REST routes
- `google-api.mjs`: REST API wrapper used by local runtime and future
  differential tests

Current scope is bounded to key ring create/get, symmetric crypto key
create/get, encrypt, decrypt, and AAD validation. Asymmetric signing, key
versions beyond the primary version, rotation, import jobs, IAM, and real-GCP
differential captures remain pending.

Client gates:

- `gcp/scripts/e2e/rest-kms.mjs` validates the local Google-shaped REST
  lifecycle, crypto side effects, and AAD error envelope end to end.
