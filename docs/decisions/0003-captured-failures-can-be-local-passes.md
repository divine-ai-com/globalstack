# ADR 0003: Captured Failures Can Be Local Passes

## Status

Accepted

## Context

A correct emulator must reject invalid Azure calls the same way Azure rejects them. Happy-path-only tests create false positives because invalid parameters can appear to work locally even though Azure would fail them.

## Decision

Captured Azure rejections are valid conformance expectations. A local test passes when the emulator returns the same status and error code for the same request shape and state.

Examples:

- missing `api-version` should remain an ARM-surface rejection,
- missing `location` should remain a provider-validation rejection where captured,
- missing storage parent and not-yet-ready storage parent must remain distinct states.

## Consequences

The test suite intentionally contains expected failures. Future agents must not "fix" these into successful local responses unless new Azure evidence proves the behavior changed for the same request shape.
