# ADR 0001: Conformance-Led Emulation

## Status

Accepted

## Context

Azure services have many control-plane, data-plane, async, validation, parent/child, RBAC, and regional behaviors. A local emulator that returns success for unverified calls creates false confidence for generated infrastructure datasets.

## Decision

GlobalStack Azure will be conformance-led:

- unknown behavior fails closed,
- captured Azure behavior can be normalized into local expectations,
- official emulators are used where available,
- gaps remain visible until evidence exists,
- `cloudValidated` stays false by default.

## Consequences

This makes early support narrower, but more trustworthy. It also means the repo must preserve capture fixtures, expectation generators, and tests as first-class artifacts rather than treating them as temporary test data.
