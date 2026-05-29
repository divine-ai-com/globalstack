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
create/get, label preservation, primary crypto key version listing and destroy,
encrypt, decrypt, and AAD validation. Asymmetric signing, key versions beyond
the primary version, rotation, import jobs, IAM, and real-GCP differential
captures remain pending.

Client gates:

- `gcp/scripts/e2e/rest-kms.mjs` validates the local Google-shaped REST
  lifecycle, crypto side effects, and AAD error envelope end to end.
- `gcp/scripts/e2e/terraform-kms.mjs` and `gcp/scripts/e2e/opentofu-kms.mjs`
  validate Google provider create/read/no-drift/destroy behavior plus local
  encrypt/decrypt side effects.
