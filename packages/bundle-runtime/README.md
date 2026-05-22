# Bundle Runtime

This package owns GlobalStack runtime helpers used by:

- platform image builds
- runtime artifact cleanup
- Docker janitor flows
- platform runner smoke orchestration
- runtime-oriented validation

These modules are invoked through stable script entrypoints under:

- `scripts/runtime/*.mjs`

Do not call files in this package by ad hoc paths from external automation. Keep the `scripts/runtime/*.mjs` entrypoints as the stable execution surface.
