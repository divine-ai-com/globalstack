# Extensions Boundary

GlobalStack follows a core-versus-extension split similar to mature product repos:

- core runtime and conformance logic stay in `apps/` and `packages/`
- optional integrations and add-ons live under `extensions/`

This boundary exists to keep the product core small, testable, and auditable.

## Core

- `apps/emulator`
- `packages/core`
- `packages/azure-control-plane`
- `packages/azure-data-plane`
- `packages/conformance`
- `packages/platform-registry`
- `packages/bundle-runtime`
- `packages/bundle-generator`
- `packages/workspace-utils`

## Extension Surface

- `extensions/`

Extension code must not silently patch core behavior. Any core hook or extension contract change must be documented in the product docs and validated through the normal repo gates.
