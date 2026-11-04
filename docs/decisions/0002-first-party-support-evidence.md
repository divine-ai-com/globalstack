# ADR 0002: First-party support evidence

## Status

Accepted

## Decision

GlobalStack support claims come from its own implementation and reproducible evidence:

- captured Azure behavior replayed through conformance tests,
- official Microsoft emulator integration tests,
- explicitly bounded local runtime tests.

A resource type registration or another product's coverage list does not establish compatibility. Unsupported operations must return an explicit error.
