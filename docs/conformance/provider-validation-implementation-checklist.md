# Provider Validation Implementation Checklist

This checklist tracks the move from raw Azure captures to local emulator correctness.

- [x] Separate provider-registration/readiness gaps from real provider-validation evidence.
- [x] Correct fake Table Storage provider mapping to the real ARM resource type.
- [x] Exclude `SubscriptionNotFound` capture artifacts from local provider-parity expectations.
- [x] Include Azure top-level error bodies, not only `{ error: ... }` envelopes.
- [x] Generate local expectations from provider-validation fixtures.
- [x] Enforce common Azure provider-validation responses in the local ARM facade.
- [x] Add expectation tests that replay Azure-derived request shapes against the local emulator.
- [x] Keep provider-accepted captures out of local parity claims until a stronger success-state model exists.
- [x] Normalize safe provider-accepted captures: empty collection lists and idempotent missing-resource deletes.
- [x] Keep subscription-populated RBAC list captures out of local success expectations.
- [x] Add lifecycle tests for parent-required child creates, idempotent `PUT`, `GET`, `LIST`, `DELETE`, and post-delete not-found behavior.
- [x] Run full smoke validation and cleanup audits.
