# ADR 0004: Parent State Is Part Of The API Contract

## Status

Accepted

## Context

Live Azure storage lifecycle capture showed different behavior for different parent states:

- child call before the storage account exists,
- child call while the storage account exists but is not fully provisioned,
- child call after the parent reaches `Succeeded`,
- child read after the child was deleted.

These are easy to collapse into one local not-found or success path, but Azure does not treat them as the same state.

## Decision

GlobalStack will model parent state where captured. Storage account creation is represented as an async `202` followed by GET polling through provisioning states before child operations can succeed.

## Consequences

Tests may need to run call sequences instead of isolated requests. Lifecycle fixtures are required for behavior that depends on previous calls.
